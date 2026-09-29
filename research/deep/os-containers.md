# os-containers — namespaces & cgroups

Env note: experiments in `/tmp/research/os-containers/`. Container is root, has `unshare` and can create pid/user/net/mount/uts/ipc/cgroup/time namespaces (**permitted**). It runs a **cgroup v1 hybrid** layout (`/sys/fs/cgroup/{memory,cpu,pids,...}` v1 hierarchies; `unified` v2 mount exists but exposes only `hugetlb`), so **cgroup v2 files (`memory.max`, `cpu.max`, `io.max`) could NOT be exercised**; I used the v1 equivalents (`memory.limit_in_bytes`, `cpu.cfs_quota_us`) and quote v2 semantics from kernel docs. Go here is go1.24.7 (before container-aware GOMAXPROCS).

## 1. Mechanism (whiteboard order)

**A container is just a process** (tree) that the kernel has been told to (a) *show a restricted view* of the system (namespaces), (b) *limit/account* resources for (cgroups), plus (c) drop privileges (capabilities, seccomp filter, LSM profile like AppArmor/SELinux), (d) run on a different root filesystem (mount ns + `pivot_root` into an overlayfs of image layers). There is no "container" object in the kernel. `docker run` = runc calling `clone(CLONE_NEW*)`/`unshare` + cgroup setup + `execve` of your binary.

**Namespaces — what each isolates** (namespaces(7); `readlink /proc/self/ns/*` shows one inode per type — 8 types on this kernel: cgroup, ipc, mnt, net, pid, time, user, uts):
- **pid**: separate PID numbering; first process is PID 1 ("init") of that ns; host sees it under a different PID. Nested.
- **net**: own interfaces, routing table, iptables, port space, `/proc/net`. Verified: `unshare --net` → only `lo` (host has `eth0`, `ifb0`). veth pairs + bridge connect it out.
- **mnt**: own mount table (each container sees its own `/`).
- **uts**: hostname/domainname.
- **ipc**: SysV IPC, POSIX message queues (not shared memory via files, not sockets).
- **user**: UID/GID mapping; "root" inside = unprivileged uid outside. Verified: `unshare -U -r` → `uid=0` inside, new `user:[…]` inode. Lets unprivileged users create the other namespaces; also a large attack surface (many kernel exploits need userns), some distros restrict it.
- **cgroup**: virtualizes the view of `/proc/self/cgroup` and the cgroup root (container sees `/` instead of `/kubepods/...`).
- **time** (Linux 5.6): per-ns offsets for `CLOCK_MONOTONIC`/`BOOTTIME` (lets checkpoint/restore keep clocks). **Not** wall-clock/`CLOCK_REALTIME`.
- Not namespaced: kernel version, kernel modules, `/sys` mostly, `dmesg`/kernel log, `sysctl` unless net/ipc/uts-specific, **the clock (realtime)**, `/proc/meminfo` and `/proc/cpuinfo` (show the *host* values unless lxcfs or the app reads cgroup files — why old JVM/Go sized heap/threads to host; see Go tie-ins).

**Syscalls.** `clone(flags)` creates a process directly in new namespaces (`CLONE_NEWPID|NEWNS|NEWNET|…`). `unshare(flags)` moves the *calling* process into new ones (for `CLONE_NEWPID` only its *children* enter the new pid ns — hence `unshare --pid --fork`). `setns(fd)` joins an existing ns (`docker exec`, `nsenter`, k8s sidecars sharing a pod net ns). Namespace lives as long as a process or a bind-mounted `/proc/PID/ns/x` refers to it.

**Experiment (permitted, ran):**
`unshare --pid --fork --mount-proc sh -c 'sleep 60 & ps'` → `sh` is PID 1, `sleep` PID 2, `ps` PID 4: view = new pid ns + fresh `/proc` mount (without `--mount-proc` `ps` would still show host PIDs, because `/proc` is a mount-namespace concern). `unshare --net` → only `lo`.

**cgroups — the limiting half.** A cgroup is a tree node; processes are members; controllers attach per-resource accounting and limits, inherited down the tree. v2 (unified, one hierarchy, Linux 4.5 stable) key knobs (Documentation/admin-guide/cgroup-v2.rst):
- `memory.max`: hard limit. "If a cgroup's memory usage reaches this limit and can't be reduced, the OOM killer is invoked in the cgroup." Tries reclaim first.
- `memory.high`: throttle limit. "Going over the high limit never invokes the OOM killer" — tasks are throttled and forced into direct reclaim. (K8s MemoryQoS uses it for Burstable if `memoryThrottlingFactor` is set; default `nil` = not set.)
- `memory.min` / `memory.low`: protection from reclaim (hard/best-effort).
- `memory.oom.group`: kill the whole cgroup as one unit instead of a single process.
- `memory.events`: counters `high`, `max`, `oom`, `oom_kill`.
- `cpu.max`: `"$MAX $PERIOD"`, default `"max 100000"` — CFS bandwidth: may consume `MAX` µs of CPU per `PERIOD` µs *summed across all threads*; when exhausted, all its threads are **throttled** until the next period. `cpu.weight` (1–10000, default 100) = proportional share under contention (only matters when CPUs are busy); `cpu.max.burst` allows banked bursts.
- `io.max`: per-device `rbps/wbps/riops/wiops` caps; note writeback throttling only works well with the v2 memory+io controllers together (buffered writes are attributed via page-cache ownership).
- `pids.max`: cap on tasks (threads count!) — fork-bomb guard; `fork`/`clone` returns `EAGAIN` beyond it.
- `cpuset.cpus/mems`: pin to CPUs/NUMA nodes.

**Memory accounting includes page cache.** "Userland memory - page cache and anonymous memory" is charged to the cgroup (cgroup-v2 doc §Memory). So `memory.current`/`docker stats` includes file cache; the kernel reclaims clean cache before OOMing, but *dirty* pages must be written back first (throttling → latency). **Verified (v1):** in a 50 MB cgroup, `dd` of 30 MB produced `cache 31 531 008` and `dirty 31 457 280`, `rss` only 168 KB. Why it matters: "my container is at 95% memory" often means cache, not a leak; alert on working set (`memory.current − inactive_file`), which is what kubelet/cAdvisor use for eviction (working_set) — UNVERIFIED formula detail.

**OOM inside cgroup vs host.** cgroup limit hit → *cgroup-scoped* OOM killer picks victim inside that cgroup only, host is fine. Verified: 50 MB limit, Go program touching 200 MB → killed at ~41 MB tracked, `exit=137` (128+SIGKILL 9), `memory.failcnt` 50, `oom_kill 1`; `dmesg`: `oom-kill:constraint=CONSTRAINT_MEMCG,... oom_memcg=/t1 ... Memory cgroup out of memory: Killed process ... anon-rss:50688kB`. No SIGTERM, no defers, no final log line. Host-wide OOM (`constraint=CONSTRAINT_NONE`) chooses by `oom_score` (RSS-based) + `oom_score_adj`. Kubernetes shows `OOMKilled`, exit 137. Also OOM'd container can be killed *while the node has free memory* — the limit is per-cgroup, not per-node.

**CPU throttling (short; see scheduling topic).** Verified (v1 equivalent, 4 CPUs, quota 50 000 / period 100 000 = 0.5 CPU, Go 1.24 → GOMAXPROCS=4): the same 4-goroutine spin ran 728 ms unconstrained vs 2.81 s limited (≈3.9x slower), `cpu.stat`: `nr_periods 31, nr_throttled 28, throttled_time 6.5 s`. Why: 4 threads burn the whole 50 ms quota in ~12 ms of wall time, then all freeze for the remaining 88 ms — tail latency, not average, suffers. (Exact ratio depends on kernel/VM accounting; quote ratio + throttle counters, not absolute.) **Requests ≠ limits:** `requests.cpu` → `cpu.weight`/`shares` (only relative under contention, no throttling); `limits.cpu` → `cpu.max` (hard, throttles even when the node is idle).

**Containers vs VMs.** VM: hypervisor (KVM) virtualizes hardware, guest has its **own kernel**; attack surface = hypervisor + device models (small, well-audited VMM). Container: **shared host kernel**; attack surface = the entire syscall interface (~350+ syscalls, all kernel drivers reachable); one kernel bug = escape. Middle ground: **gVisor** ("application kernel" written in Go, userspace, intercepts syscalls; `runsc` OCI runtime; "not a syscall filter … not a VM" per its README) — reduces host kernel exposure at the cost of syscall/network/FS overhead and compatibility gaps; **Kata Containers** — each pod in a lightweight VM with its own kernel via OCI runtime (QEMU/Cloud Hypervisor/Firecracker backends); **Firecracker** — minimal KVM VMM (used by Lambda/Fargate) whose design doc claims microVMs "combine the security and workload isolation properties of traditional VMs with the speed, agility and resource efficiency of containers", ≤32 vCPU, 128 MiB minimal VM ~5 microVMs/host-core/s creation. Rule: multi-tenant untrusted code → VM boundary (or gVisor/Kata); trusted same-org services → plain containers.

**overlayfs.** Image = stack of read-only layers (`lowerdir=A:B:C`) + one writable `upperdir` + `workdir` → merged view. Lookup walks top-down; **whiteout** files (char device 0/0) represent deletions. **Copy-up:** first *write* (or chmod/chown/rename metadata change, or opening for write) to a file that lives in a lower layer copies the **entire file** to upperdir first (even 1 GB file for one-byte change; newer kernels do metadata-only copy-up for pure metadata changes — UNVERIFIED version). Consequences: write-heavy paths (DB data dirs, logs) belong on volumes/tmpfs, not in the image layer; deleting a file in a later Dockerfile layer doesn't shrink the image (lower layer keeps bytes); many layers = slower path lookup; container fs is discarded on removal.

**PID 1 semantics.** In a pid namespace PID 1 is special: (1) the kernel **does not deliver signals to it unless it installed a handler** — default-action signals (SIGTERM/SIGINT) are ignored for PID 1 (SIGKILL/SIGSTOP from *inside* the ns are also ignored; from the parent ns they work) — pid_namespaces(7)/signal semantics; (2) it **adopts orphans** and must `wait()` on them, or they stay zombies; (3) if PID 1 exits, kernel SIGKILLs everything in the ns ("If the 'init' process of a PID namespace terminates, the kernel terminates all of the processes in the namespace via a SIGKILL", pid_namespaces(7)).
- Verified signals: in a `unshare --pid --fork` ns, `kill -TERM 1` (from inside, target `sh` without handler) → shell **survived**.
- Verified zombies: Go program as PID 1 spawned `sleep 0` and never `Wait`ed; `ps` after 0.5 s showed `Z sleep` (defunct) alongside `zz` (PID 1).
- Why it bites: `docker stop` sends SIGTERM to PID 1, waits `--time` (default 10 s), then SIGKILL. A shell-form `CMD ./app` makes `/bin/sh -c` PID 1, which doesn't forward SIGTERM → your app is killed after 10 s without graceful shutdown. Use exec-form `CMD ["./app"]`, `exec ./app` in entrypoint scripts, or `docker run --init` (tini) / `shareProcessNamespace` in k8s.

**Docker `--memory` semantics** (docs.docker.com resource_constraints): `-m/--memory` = `memory.max` (min 6 MB); `--memory-swap` is *total* memory+swap (so `-m 300m --memory-swap 1g` → 700m swap; equal values → no swap; unset → typically swap up to same size as memory if host has swap — UNVERIFIED default wording in the doc part I read); `--memory-reservation` = soft limit (`memory.low`-like) only active under host contention; `--oom-kill-disable` only safe with `-m`. `--cpus=1.5` = `--cpu-period=100000 --cpu-quota=150000` (verified in doc). `--cpuset-cpus` pins.

**Kubernetes requests vs limits, QoS, eviction** (pod-qos & node-pressure-eviction docs):
- Scheduler places pods by **requests** (sum ≤ node allocatable). Limits are enforced by kernel: CPU → throttle, memory → OOM kill.
- QoS: **Guaranteed** — every container has CPU *and* memory limits==requests (>0). **Burstable** — not Guaranteed but ≥1 request/limit. **BestEffort** — none. (Init containers and pod-level resources have extra rules.)
- `oom_score_adj` (kubelet sets): Guaranteed −997, BestEffort 1000, Burstable `min(max(2, 1000 − 1000×memReq/machineMem), 999)`; system-node-critical −997. So under *node* OOM the kernel kills BestEffort first.
- **Kubelet eviction** (node pressure, before kernel OOM): ranks (1) BestEffort/Burstable whose *usage exceeds requests*, by Priority then by how much they exceed; (2) Guaranteed and Burstable within requests last, by Priority. QoS class alone doesn't decide — usage-over-request does. Hard eviction thresholds e.g. `memory.available<100Mi`; kubelet may be too slow and kernel OOM fires first.
- Memory limit == request avoids being over-request evictee; CPU limit removal (request only) avoids throttling but allows noisy neighbours to be bounded only by weight.

## 2. Edge cases & gotchas

- **Exit code 137 vs 143:** 137 = SIGKILL (OOM killer or `docker stop` timeout), 143 = SIGTERM handled/terminated. Why: 128+signal.
- **`OOMKilled` with low heap:** cgroup counts page cache, tmpfs/`emptyDir{medium:Memory}`, kernel memory (socket buffers, page tables), thread stacks, non-heap Go runtime memory. Why: limit is on *all* charged memory, `GOMEMLIMIT` only sees Go-managed memory.
- **`memory.high` doesn't kill but stalls:** service looks "hung" (heavy reclaim), no OOM event. Why: throttling by design.
- **Limits invisible to `free`/`/proc/meminfo`/`nproc`:** they show the host (lxcfs aside). Libraries sizing pools from `runtime.NumCPU()` overshoot. Why: procfs isn't cgroup-aware.
- **CFS quota is per-period across all threads:** 8 busy threads on `limit=2` are throttled after 25 ms of each 100 ms. Why: quota is a pooled budget.
- **Throttling with low average CPU:** average 30% but p99 latency spikes when bursts exceed quota in a period. Why: measurement at period granularity (100 ms); check `nr_throttled/nr_periods` and `throttled_time`.
- **PID 1 ignores SIGTERM** unless handler installed; `kill -9 1` from inside also ignored. Why: kernel protects init.
- **Zombies accumulate** when PID 1 doesn't reap (each holds a PID; `pids.max` eventually → `fork: retry: Resource temporarily unavailable`).
- **overlayfs copy-up latency** for large files; `rename` of a directory from a lower layer returns `EXDEV` unless `redirect_dir` on. (`EXDEV` detail: UNVERIFIED.)
- **`docker stop` grace default 10 s; k8s `terminationGracePeriodSeconds` default 30 s**; preStop hook + SIGTERM race with endpoint removal (readiness) → still receiving traffic after SIGTERM (mitigate by delaying shutdown/failing readiness first).
- **User-ns root ≠ real root** but many capability checks are against the *userns owner*; container "root" without `--privileged` lacks CAP_SYS_ADMIN etc. `--privileged` disables most isolation (all caps, all devices, no seccomp).
- **Shared kernel means shared kernel bugs and shared limits:** `vm.max_map_count`, `fs.file-max`, conntrack table, inotify watches are host-global (or per-userns only for some).
- **cgroup v1 vs v2:** v1 memory has separate `memory.limit_in_bytes`, `memsw`, `kmem` files; v2 has `memory.max` + `memory.swap.max`; v2 has one hierarchy and proper writeback/io accounting. Check with `stat -fc %T /sys/fs/cgroup` (`cgroup2fs` = v2). This container is v1/hybrid.
- **Time namespace ≠ wall clock**; containers can't set the host clock without CAP_SYS_TIME.

## 3. Common misconceptions

- "A container is a lightweight VM." It's a process with restricted view + limits; shares the host kernel (`uname -r` inside = host).
- "Namespaces limit resources." Namespaces isolate *visibility*; **cgroups limit/account** resources.
- "Docker/containerd runs my process" — runc sets it up then exits; the process is a child of containerd-shim.
- "Memory limit counts only heap/RSS." Includes page cache, kernel memory, tmpfs.
- "CPU limit of 1 = one core pinned." It's 100 ms of CPU time per 100 ms across any cores (unless cpuset/static policy).
- "Requests are just hints." They drive scheduling, `cpu.weight`, OOM score, eviction order.
- "Guaranteed pods can't be evicted/killed." They're evicted last, and OOM-killed if they exceed their *own* limit.
- "If the app handles SIGTERM it's fine in Docker." Not if a shell wrapper is PID 1 or the app is PID 1 without a handler.
- "Containers are secure boundaries like VMs." Kernel shared; use seccomp/user-ns/gVisor/Kata for untrusted code.
- "`--memory=512m` = 512m of RAM guaranteed." It's a ceiling; guarantee is a scheduler request.

## 4. Go tie-ins

- **PID 1 / SIGTERM:** the Go runtime installs its own handler for (nearly) every signal at startup, so a Go binary as PID 1 *does* receive SIGTERM (the kernel's "drop if no handler" rule is satisfied). Verified: Go PID 1 (`unshare --pid --fork ./t1`), `kill -TERM` from the host ns → process died immediately with **exit status 2** (runtime re-raises with default action; as PID 1 that is ignored, so the runtime falls back to `exit(2)`), no defers, no graceful shutdown, and exit code is 2 not 143. So the bug for Go is "dies abruptly", while for `sh -c` wrappers / C programs without a handler it is "SIGTERM ignored until SIGKILL after 10 s". Fix: `signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)`, then `<-ctx.Done(); srv.Shutdown(shutdownCtx)` with timeout < `terminationGracePeriodSeconds`; call `stop()` after the first signal so a second signal kills by default. Go's `os/signal.NotifyContext` exists since 1.16 (`os/signal/signal.go:278`). Also: **Go binary as PID 1 doesn't reap orphans** — if it `exec.Command`s children it must `Wait()` (verified: zombie `Z sleep`), and grandchildren orphaned get reparented to it; use `--init`/tini if you spawn processes.
- **GOMAXPROCS:** Go ≤1.24 (local 1.24.7 verified: `GOMAXPROCS 4` inside 0.5-CPU cgroup) uses host CPU count (affinity-aware only) → throttling as measured above. **Go 1.25** added container-aware default: uses the cgroup CPU bandwidth limit if lower than logical CPUs; updates periodically; controlled by `GODEBUG=containermaxprocs=0`, `updatemaxprocs=0` (confirmed in `golang/go/master/doc/godebug.md` lines 268–277); disabled if `GOMAXPROCS` env/`runtime.GOMAXPROCS` set; `runtime.SetDefaultGOMAXPROCS()` restores default. Uses *limit*, not request. "Rounded up, min 2" detail from the bank answer — UNVERIFIED by me. Before 1.25: `go.uber.org/automaxprocs`.
- **GOMEMLIMIT:** soft target for Go-managed memory; set ~5–10% below cgroup `memory.max` since it excludes stacks/cgo/page cache; Go doesn't read the cgroup memory limit automatically.
- **Detect cgroup:** `/proc/self/cgroup`: v2 shows one line `0::/path`; v1 shows numbered controller lines (here: `4:memory:/process_api/…`, `1:cpu:/`). Limits at `/sys/fs/cgroup/memory.max` (v2) / `/sys/fs/cgroup/memory/memory.limit_in_bytes` (v1); `cpu.max` / `cpu.cfs_quota_us`. Inside a container with cgroup ns, the path appears as `/`.
- **Static binaries** (`CGO_ENABLED=0`) + `scratch`/distroless: tiny layers, less overlay copy-up/attack surface; no shell means no `sh -c` PID-1 trap but also no `/etc/ssl/certs` unless copied; no `/tmp` unless created.
- **Thread count vs `pids.max`:** Go threads (blocking syscalls, cgo) count as tasks; hitting `pids.max` yields `runtime: failed to create new OS thread`.
- Graceful shutdown question in bank (`concurrency-patterns-graceful-shutdown`) should tie to SIGTERM → PID 1 → grace period.

## 5. Illustration plan

### Scene A — "A container is a process with a costume" (8 frames)
1. Host process tree, a single `runc` fork. Point: nothing special yet.
2. `clone(CLONE_NEWPID)`: same process, now labelled PID 4123 (host) / PID 1 (inside). Two number badges.
3. Add `NEWNET`: NIC list shrinks to `lo`; veth pair drawn to host bridge.
4. Add `NEWNS` + pivot_root: filesystem tree swaps for the image's overlay.
5. Add `NEWUTS/IPC/USER/CGROUP/TIME` chips lighting up on a checklist with "what it hides" text each.
6. **STOP:** `uname -r` inside equals host → shared kernel (contrast with a VM box holding its own kernel).
7. cgroup wrapper drawn as a bucket around the process: memory.max / cpu.max / pids.max gauges.
8. `docker exec` = `setns` into the same namespaces (a second process enters the costume).

### Scene B — "Memory limit: who dies" (8 frames)
1. Bucket `memory.max=50M`; gauges anon/heap and page cache stacked.
2. App writes 30 MB file → cache and *dirty* grow inside the bucket (verified numbers).
3. App allocates: usage hits limit → kernel reclaims clean cache first (cache shrinks).
4. **STOP:** dirty pages can't be dropped → writeback throttle → latency spike (memory.high shown as throttle line, no kill).
5. Reclaim can't free enough → cgroup OOM killer; only processes inside picked; `SIGKILL`.
6. Exit 137, `OOMKilled`, no defer/log; dmesg line `CONSTRAINT_MEMCG`.
7. Contrast: node-level OOM → `oom_score_adj` ladder (BestEffort 1000 … Guaranteed −997).
8. Add `GOMEMLIMIT` line ~90% of limit: GC works harder before the wall.

### Scene C — "CPU limit: the 100 ms clock" (7 frames)
1. Timeline of one 100 ms period, quota bar = 50 ms (limit 0.5 CPU)... use 2 CPU = 200 ms budget in a 4-thread example.
2. 4 threads run in parallel; budget drains 4x speed.
3. Budget hits 0 at ~12–50 ms: all threads frozen (throttled) for the rest of the period.
4. **STOP:** average CPU 30% but p99 latency doubles — request arrives during freeze.
5. `cpu.stat` counters (nr_throttled 28 of 31 periods in experiment).
6. Fix A: GOMAXPROCS = limit (Go 1.25 automatic, earlier automaxprocs). Fix B: drop limit, keep request (weight).
7. Requests vs limits: weight bar (proportional) vs ceiling (hard).

### Scene D — "PID 1 and the SIGTERM that vanished" (8 frames)
1. `docker stop` sends SIGTERM to PID 1 = `/bin/sh -c ./app` (shell form); the app is PID 7.
2. Shell without handler: kernel drops signal (PID 1 protection). Signal bounces off.
3. 10 s timer runs; then SIGKILL to PID 1 → kernel SIGKILLs the ns. App dies with no cleanup. **STOP.**
4. Fix: exec form → app is PID 1; still dropped unless handler installed.
5. Go app: runtime handler delivers it but default action = abrupt exit(2) (verified). With `signal.NotifyContext` → `ctx.Done()` → `Shutdown(ctx)` drains.
6. Side track: child exits, PID 1 doesn't `Wait` → zombie `Z` accumulates (ps view).
7. `--init`/tini as PID 1 forwards signals & reaps.
8. Kubernetes timeline: preStop → SIGTERM → 30 s grace → SIGKILL.

## 6. Existing interview questions

- `devops-virtualization-vs-containers` — good, correct list of namespaces (misses `time`), mentions gVisor/Kata/Firecracker. Missing: PID 1, cgroup accounting, "container = process".
- `memory-gc-oom-behavior` — correct on cgroup OOM → SIGKILL/137, GOMEMLIMIT ~10% below. Misses: page-cache accounting, `memory.high` throttle vs kill, oom_score_adj/QoS.
- `goroutines-scheduler-gomaxprocs-kubernetes` — right on ≤1.24 behaviour (I reproduced: GOMAXPROCS=4 under a 0.5 CPU quota, 28/31 periods throttled) and 1.25 fix (godebug.md confirms `containermaxprocs`, `updatemaxprocs`). "Floor of 2" UNVERIFIED by me.
- `devops-sidecar-container` — pods share net ns (correct: pause container holds ns).
- `concurrency-patterns-graceful-shutdown` — should be checked for PID 1/SIGTERM link (not re-read in full).
- `devops-k8s-readiness-liveness`, `devops-kubernetes-objects` — no QoS/eviction coverage as far as titles indicate → **gap**: no existing question on requests vs limits/QoS/eviction, namespaces vs cgroups, overlayfs, PID 1.
- `devops-docker-multistage-go`, `devops-docker-volumes` — relate to layers/overlay; volumes answer should mention copy-up avoidance (not verified).

## 7. Sources

- namespaces(7), pid_namespaces(7), clone(2), cgroups(7): https://raw.githubusercontent.com/mkerrisk/man-pages/master/man7/namespaces.7 (+ `pid_namespaces.7`, `man2/clone.2`, `man7/cgroups.7`), fetched 2026-09-29. PID-1-terminates-SIGKILLs-namespace quote from pid_namespaces(7).
- cgroup v2: https://raw.githubusercontent.com/torvalds/linux/master/Documentation/admin-guide/cgroup-v2.rst (memory.max/high/min/oom.group, cpu.max default `max 100000`, io.max, pids.max, "page cache and anonymous memory" charged). CFS bandwidth: `Documentation/scheduler/sched-bwc.rst` (fetched, not deeply read).
- Kubernetes QoS & eviction: https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/workloads/pods/pod-qos.md and `.../scheduling-eviction/node-pressure-eviction.md` (eviction ranking, `oom_score_adj` table, MemoryQoS `memory.high` formula and default nil), 2026-09-29 main branch.
- Docker: https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/containers/resource_constraints.md (`--memory`, `--memory-swap`, `--cpus` = period/quota, `--oom-kill-disable`).
- gVisor README (application kernel in Go, runsc): https://raw.githubusercontent.com/google/gvisor/master/README.md; Firecracker design: https://raw.githubusercontent.com/firecracker-microvm/firecracker/main/docs/design.md. Kata Containers: **not fetched**, statement from general knowledge, UNVERIFIED.
- Go: `/usr/local/go/doc/godebug.md` (local) and master copy for `containermaxprocs`/`updatemaxprocs` (Go 1.25 additions); Go 1.25 release notes via WebSearch summary (go.dev blocked): "CPU bandwidth limit lower than logical CPUs → default GOMAXPROCS; periodic updates; disabled by manual setting; `SetDefaultGOMAXPROCS`".
- Experiments (this container, root, cgroup v1): `/tmp/research/os-containers/{hog,spin,p1,zz}.go`. Results quoted above: OOM `exit=137`, `oom_kill 1`, dmesg `CONSTRAINT_MEMCG`; page-cache `cache 31531008 dirty 31457280`; throttling `nr_periods 31 nr_throttled 28 throttled_time 6505449014`, 728 ms → 2.81 s; PID 1 zombie `Z sleep`; `kill -TERM 1` ignored by handler-less `sh`; `unshare --net` → `lo` only.
- **Could not verify:** any cgroup v2 file behaviour empirically (host is v1); overlayfs copy-up specifics and version-specific metacopy; Kata details; `docker --memory-swap` unset default; "working set" formula; exact `signal` semantics for SIGKILL sent from inside PID ns (only TERM tested).
