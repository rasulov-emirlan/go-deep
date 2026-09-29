# os-scheduling — Processes, threads, scheduling & CPU limits

Environment: Firecracker microVM, kernel 6.18.44 (`CONFIG_HZ=250`, `NO_HZ_IDLE`, `PREEMPT_DYNAMIC` default `none`, `CFS_BANDWIDTH=y`), 4 vCPU, **cgroup v1 (hybrid)** writable, so CPU quota experiments are real. Go 1.26 not installed: read `go1.26.0` tag source; experiments ran on go1.25.1 (same GOMAXPROCS logic: `runtime/cgroup_linux.go` identical in structure). Code: /tmp/research/os-scheduling/.

## 1. Mechanism (whiteboard order)

**Process vs thread = one syscall, different sharing flags.** Linux has one kernel object, `task_struct`. `clone(flags)` decides what the child shares with the parent: `CLONE_VM` (address space), `CLONE_FILES` (fd table), `CLONE_FS`, `CLONE_SIGHAND`, `CLONE_THREAD` (same thread group = same PID/TGID as seen by user space). A "thread" = clone with all of those; a "process" (`fork`) = none of them (copy, with COW pages). Go's runtime creates its Ms with exactly `CLONE_VM|FS|FILES|SIGHAND|SYSVSEM|THREAD` (`runtime/os_linux.go cloneFlags`); `os/exec` uses `CLONE_VFORK|CLONE_VM` then `exec` (`syscall/exec_linux.go`). The scheduler only sees tasks; `ps -L` / `/proc/PID/task/TID`.

**fork/exec.** `fork` = new task with copied page tables, pages COW (see os-memory). `exec` replaces the address space with a new program; fds without `O_CLOEXEC` survive (Go sets CLOEXEC by default). Parent must `wait4` the child: until then the exited child stays as a **zombie** (`Z`): only its `task_struct`/exit status remain (no memory). If the parent dies first, children are **orphans**, re-parented to init (or the nearest "subreaper"). Measured: forked child exit + no wait -> `ps` shows `Z` (`STAT Z`, comm python3); after `waitpid` it is gone.

**Why a scheduler.** More runnable tasks than CPUs. Goals: fairness, low latency for interactive/wake-up tasks, throughput, honour priorities. Naive: fixed round robin with fixed quantum - bad for mixed workloads. Linux: per-CPU **run queues** (each CPU picks from its own queue; no global lock), plus **load balancing** (periodic + idle-pull + wake-up placement) between queues and cache/NUMA topology (sched domains).

**CFS -> EEVDF.** CFS (2.6.23-6.5) tracked `vruntime` (weighted CPU time consumed) and always ran the leftmost task of an rbtree. **EEVDF (Earliest Eligible Virtual Deadline First) replaced it starting kernel 6.6** (kernel doc `sched-eevdf.rst`: "began transitioning to EEVDF in version 6.6"; this box, 6.18, runs it). Concepts: each task has a **lag** (positive = it is owed CPU, negative = it got more than its share); only tasks with lag >= 0 are **eligible**; each gets a **virtual deadline = eligible time + slice/weight**; scheduler picks the earliest deadline among eligible. Shorter requested slice (`sched_setattr`) => earlier deadlines => better latency without more share. Sleeping tasks keep their lag decaying over virtual time ("deferred dequeue") so short sleeps can't reset negative lag. `sysctl_sched_base_slice = 700000 ns` normalized, scaled by `1 + ilog2(min(ncpus,8))` (`get_update_sysctl_factor`; = 2.1 ms on 4 CPUs).
- **Weights (nice)**: nice 0 = 1024, each nice step ~1.25x; nice 10 = 110, nice 19 = 15. CPU share ~ weight ratio. Measured (two spinners pinned to one CPU, 5 s): nice 0 vs 10 -> **8.8:1** (expected 1024/110 = 9.3); nice 0 vs 19 -> **61.6:1** (expected 68).
- **Preemption**: the **timer tick** (`HZ`=250 -> 4 ms here, `NO_HZ_IDLE` only stops it on idle CPUs) checks whether the running task exhausted its slice or a newly woken task has an earlier deadline; if so it sets `TIF_NEED_RESCHED`, and the switch happens at the next safe point (interrupt/syscall exit; in-kernel preemption points depending on `PREEMPT_*` model). Measured: two CPU-bound processes sharing one CPU for 2 s: **243 involuntary switches each** (~8 ms period per task = slice noticed at tick granularity: 2.1 ms slice rounded up to a 4 ms tick x 2 tasks).
- **Voluntary vs involuntary context switches** (`/proc/PID/status`: `voluntary_ctxt_switches`, `nonvoluntary_ctxt_switches`): voluntary = task blocked/yielded (I/O, futex, sleep); involuntary = preempted while runnable. Measured: `sleep 3` -> 1 voluntary, 0 involuntary; spinner competing for a CPU -> 243 involuntary, 1 voluntary. Many voluntary = I/O- or lock-bound; many involuntary = CPU contention (run-queue length > CPUs) or throttling.

**Context switch: what is saved.** Kernel switches `rsp` to the next task's kernel stack, saves/restores callee-saved regs (`switch_to`), FPU/SIMD state lazily/eagerly (XSAVE), segment/TLS bases (`fs`), and if the next task has a different `mm`: load its `CR3` (with PCID no full TLB flush). **Direct cost** ~1-2 us. **Indirect cost** dominates: the new task finds cold L1/L2, cold TLB, cold branch predictor state (partly flushed by Spectre mitigations on cross-process switches: IBPB is "conditional" on this box).
Measured (pipe ping-pong, `write`+`read`, one-way hand-off): **same CPU (`taskset -c 0`): 1.8 us** for both threads and processes; **different CPUs: 12.5-12.8 us** (VM: waking the other vCPU needs an IPI/halt-exit). Threads vs processes: no measurable difference with PCID. Why cross-CPU is slower: wake-up of an idle CPU (idle exit latency, IPI), cache-line ping-pong; hence pinning/`wake_affine` heuristics.

**CPU affinity** (`sched_setaffinity`, `taskset`, cpuset cgroup): restricts which CPUs a task may run on; Go's `NumCPU`/default GOMAXPROCS honour it (`sched_getaffinity`).

**futex - how mutexes/parking are built.** A futex is a 32-bit word in user memory. Fast path entirely in user space: `CAS 0->1` to lock, `xchg`/`CAS` to unlock; **no syscall when uncontended**. On contention: set state "contended" then `futex(FUTEX_WAIT, addr, expected)` - kernel atomically checks `*addr==expected` and sleeps on a hash-bucket queue keyed by address (private futex: (mm, addr) key). Unlocker sees "contended" and `futex(FUTEX_WAKE, addr, 1)`. Kernel keeps no lock state; only wait queues. `FUTEX_*_PRIVATE` flag = process-local, skips mmap-sem/inode lookups. Priority inheritance variant (`FUTEX_LOCK_PI`) exists for RT.

**Priority inversion.** Low-priority L holds lock; high-priority H blocks on it; medium M preempts L so L can't release => H is effectively stalled by M (Mars Pathfinder 1997). Fix: priority inheritance (PI futex/`PTHREAD_PRIO_INHERIT`), priority ceiling. Not a real issue for all-`SCHED_OTHER` workloads (weights only, no strict priority), a real issue for `SCHED_FIFO/RR` and for lock holders being *descheduled* (lock-holder preemption; huge in VMs, mitigated by spinning limits, paravirt spinlocks).

**Load average.** `/proc/loadavg` = exponentially damped average (1/5/15 min, sampled every 5 s, `LOAD_FREQ = 5*HZ+1`, `EXP_1=1884/2048`) of **`nr_running + nr_uninterruptible`** (kernel `loadavg.c` comment: "exponentially decaying average of nr_running + nr_uninterruptible"). So on Linux, tasks stuck in **D state** (uninterruptible I/O wait: NFS, slow disk, some locks) inflate it although the CPU is idle - unlike classic BSD load. It is not normalised by CPU count. Use PSI (`/proc/pressure/cpu`, `memory`, `io`; here `cpu some avg10=4.01`) for "who is stalled" rather than load.

**cgroup v2 `cpu.max` and CFS bandwidth throttling.** `cpu.max = "$QUOTA $PERIOD"` (default `max 100000`; `cpu.max.burst` default 0) - v1 equivalent `cpu.cfs_quota_us/cpu.cfs_period_us`. Meaning: the *group's tasks combined* may use `QUOTA` us of CPU time per `PERIOD` (100 ms typical). Quota is handed to per-CPU run queues in **slices** (`sched_cfs_bandwidth_slice_us` = 5 ms). When the group's global pool is empty, its tasks are **throttled** (dequeued, cannot run at all) until the next period refill (`sched-bwc.rst`). So a limit of "2 CPUs" is not "at most 2 threads running"; it's "200 ms of CPU-time per 100 ms window, spend it however parallel you like". A 64-thread process burns 200 ms in ~3 ms and then **sleeps ~97 ms**: latency spike, regardless of the host having 62 idle cores. Not to be confused with `cpu.shares`/`cpu.weight` (Kubernetes *request*): only relative, only matters under contention, never throttles.

**Signals & PID 1.** SIGTERM (15) = polite, catchable, default action terminate; SIGKILL (9) and SIGSTOP cannot be caught/blocked/ignored. Container "PID 1 problem": (1) the kernel gives PID 1 of a PID namespace **special signal semantics: only signals for which init has established a handler can be sent to it, by namespace members or by ancestor namespaces, even by root** (pid_namespaces(7)); SIGKILL/SIGSTOP from an *ancestor* namespace are still forcibly delivered - so a naive shell-script/C entrypoint ignores `docker stop`'s SIGTERM and gets SIGKILLed after the grace period (K8s default `terminationGracePeriodSeconds` 30 s). (2) PID 1 is the reaper for orphans; if it doesn't `wait` they accumulate as zombies. Fix: `tini`/`dumb-init`/`--init`, or make the app handle SIGTERM and reap.

## 2. Edge cases & gotchas

- **Throttling with idle host, measured** (cgroup v1 quota 200000/period 100000 = "2 CPUs", 4-core VM, C threads spinning + a probe thread doing 1 ms `nanosleep` and recording oversleep):

| setup | probe p99 | probe max | probe wake-ups >10 ms late | throttled periods (of 40) |
|---|---|---|---|---|
| no quota, 3 spinners | 0.41 ms | 4.0 ms | 0 | 0 |
| quota 2 CPU, 2 spinners | 0.30 ms | 3.1 ms | 0 | 8 (31 ms total) |
| quota 2 CPU, 3 spinners | 2.1 ms | 35 ms | 18 | 40 (4.06 s) |
| quota 2 CPU, **4 spinners** | **49.6 ms** | 51.9 ms | 40 | 40 (7.4 s) |
| quota 2 CPU with **period 10 ms** (20000/10000), 3 spinners | 5.2 ms | 20 ms | 4 | 400 |

Why: 4 threads x 50 ms = 200 ms quota gone in half the period; everything (including the tiny probe thread) freezes for the remaining ~50 ms. Smaller period => shorter freezes but 10x more throttle events. Throughput is capped either way.
- **Throttling bites even at low average utilisation**: bursty multi-threaded apps (GC, request bursts) exhaust quota early in the period. Watch `cpu.stat`: `nr_periods`, `nr_throttled`, `throttled_time` (v1 in ns; v2 `throttled_usec`) - the ratio `nr_throttled/nr_periods` is the KPI, not average CPU%.
- **Kernel history**: before 5.4 unused per-CPU slice was *expired* each period (commit 512ac999) causing needless throttling of many-thread apps (Indeed engineering, 2019); the fix removed expiration (5.4+): "burst limited to ~1 ms per CPU queue". Old-kernel folklore ("always disable limits") originates there. Kernel doc `sched-bwc.rst` documents the remaining corner case.
- **Go GOMAXPROCS**: on Go < 1.25 default = host CPU count -> **4 Ps under a 2-CPU quota: 40/40 periods throttled, 7.6 s throttled time in 4 s (Go test binary, `GOMAXPROCS=4`)**, vs `GOMAXPROCS=2`: 8/40 periods, 20 ms. Go-level probe max 88.8 ms vs 39.6 ms (noisy: Go's own 10 ms preemption also contributes; total work done was the same ~12M units: **more Ps gave zero extra throughput, only stalls**).
- **Go 1.25+ container-aware GOMAXPROCS** (verified in `runtime/debug.go` doc and by experiment on go1.25.1 with cgroup v1): default = `min(logical CPUs, affinity count, ceil(quota/period))` but **never below 2 unless CPU count < 2** ("limit less than 2 is rounded up to 2"); non-integer limits round **up**. Measured quotas 0.5/1.5/2.0 CPU -> 2; 3.2 and 4.0 -> 4 (= NumCPU). **Live-updated**: sysmon checks at most once per second (`updatemaxprocs`), changing the quota from 2 to 3.5 CPUs while running moved GOMAXPROCS 2 -> 4 within 2.5 s. Disabled by explicit `GOMAXPROCS` env or `runtime.GOMAXPROCS(n)` call (measured: `GOMAXPROCS=3` -> 3; `GODEBUG=containermaxprocs=0` -> 4). `runtime.SetDefaultGOMAXPROCS()` (new in 1.25) restores computed default. Works on cgroup **v1 and v2** (`internal/runtime/cgroup`). No 1.26 release-note change to this (go1.26.md has none).
- **The go.mod gate**: `containermaxprocs`/`updatemaxprocs` have `Changed: 25` (`internal/godebugs/table.go`), so a module whose `go.mod` says `go 1.24` **built with the Go 1.25 toolchain keeps the old behaviour**. Measured: same source, `go 1.24` in go.mod -> GOMAXPROCS=4 under a 2-CPU quota; `go 1.25` -> 2. Classic prod trap after "we upgraded Go".
- **Limits of the Go heuristic** (source comments `cgroup_linux.go`): reads only the *leaf* cgroup's limit (a tighter ancestor limit is ignored; open issue golang/go#81180 per search snippet), doesn't notice the process being moved to another cgroup, uses **limits not requests** (no limit => all CPUs). Floor of 2 means a 0.5-CPU pod still runs 2 Ps -> still throttled in bursts. Rounding up (e.g. 2.2 -> 3 Ps for 2.2 CPUs) still permits throttling.
- **`top` %CPU > 100%** = sum over threads (per-core scale; 400% on 4 cores); under a quota `top` shows ~limit (measured 130% for quota 1.5, 3 spinner threads). Per-thread view `top -H`; a Go process at 400% is not "broken".
- **Load average vs CPU%**: a loadavg of 8 on 8 cores can be 100% busy (fine) or 8 tasks in D state with 0% CPU. Loadavg counts threads, not processes.
- **Zombie vs orphan vs daemon**: zombie = dead, waiting to be reaped (`Z`, can't be killed, kill the parent or fix its `wait`); orphan = alive, parent gone (re-parented). `defunct` = zombie.
- **Signals**: SIGTERM vs SIGKILL semantics above. `kill -9` on a process in D state pends until it leaves D. SIGKILL gives no cleanup (no defers, exit 137). `docker stop` = SIGTERM, wait 10 s (Docker default), SIGKILL; K8s: SIGTERM at the same time as endpoint removal (race) -> `preStop` sleep pattern.
- **Go as PID 1 measured**: in a new PID namespace (`unshare --pid --fork --mount-proc`), a **C program that sleeps stays alive after SIGTERM** (kernel ignores default-action signal for PID 1), but a **Go binary without `signal.Notify` exits with status 2** on the same SIGTERM. Why: Go's runtime installs a handler for SIGTERM at startup, so the kernel's PID-1 filter lets it through; with no `Notify`, `dieFromSignal` resets to `SIG_DFL` and `raise`s - PID 1 ignores that - then falls through to `exit(2)` (`runtime/signal_unix.go` "If we are still somehow running, just exit with the wrong status"). So Go "works by accident", but exit code 2, no graceful shutdown, `defer`s skipped. Handle SIGTERM explicitly (`signal.NotifyContext`).
- **futex fast path, measured** (Go `sync.Mutex`): 2 M uncontended lock/unlock loops -> **9 futex calls total** (runtime housekeeping); 8 goroutines x 250k contended iterations on 4 Ps -> 1,346 futex calls (615 `FUTEX_WAIT_PRIVATE`, 612 `FUTEX_WAKE_PRIVATE`), 58 `sched_yield`, 1,015 `nanosleep`: nowhere near one per operation. Why: `sync.Mutex` spins briefly then parks the *goroutine* (runtime sema + `gopark`), not the thread; futex is only used when an **M** (thread) runs out of work and sleeps.
- **Direct measurement traps**: `strace` makes futex-heavy programs 50-200x slower; `perf sched`/`bpftrace` needed for scheduler latency (`perf` not installed here: UNVERIFIED on this box).
- **`SCHED_FIFO/RR/DEADLINE`** bypass EEVDF weights; RT throttling (`sched_rt_runtime_us=950000` of `sched_rt_period_us=1000000` here) prevents an RT task from starving the box.
- **Autogroup** (`sched_autogroup_enabled`) groups tasks per session for fairness on desktops; irrelevant in most containers.
- **CPU steal** (`st` in top) in VMs: hypervisor took the vCPU; explains cross-CPU wake-up cost above.

## 3. Common misconceptions

- "Threads and processes are different kernel objects." Both are tasks; flags decide sharing.
- "A thread context switch is free vs a process one is expensive." Direct cost is similar; a process switch adds an address-space switch (TLB/cache) - reduced by PCID; measured no difference here.
- "Context switch cost is ~1 us." That is the direct part; it depends on same-CPU vs cross-CPU (1.8 vs 12.5 us measured), cache state, mitigations.
- "CFS gives every task an equal time slice." Weighted virtual runtime; EEVDF (6.6+) uses lag + virtual deadlines and honours per-task slice requests.
- "CPU limit 2 = at most 2 cores." It is a time budget; parallelism is unlimited and burns the budget faster -> throttling. `cpuset`/`taskset` limit *cores*, quota limits *time*.
- "CPU request limits my container." Requests -> `cpu.weight`/shares: relative under contention only.
- "Go 1.25 fixes CPU throttling." It sets GOMAXPROCS to `ceil(limit)` (min 2): bursts still exceed quota (e.g. 2 Ps x 100% + GC assist + non-Go threads + cgo); throttling reduces, not disappears. Also needs `go 1.25` in go.mod.
- "Load average > core count = CPU saturated." Includes D-state tasks; also includes 1-min history damping.
- "Mutex lock = syscall." Only the contended slow path.
- "kill -9 always works / SIGTERM stops PID 1." No: D state; PID 1 signal semantics.
- "Zombie processes use resources." Just a process-table slot + PID; risk is PID exhaustion.
- "More GOMAXPROCS = more throughput." Measured: same throughput, 5x more throttling.

## 4. Go tie-ins

- **Runtime threads vs goroutines**: Ms (OS threads) run Gs on Ps; the Linux scheduler schedules Ms as ordinary tasks. Go's own scheduler adds run queues per P (256-slot local ring + global), work stealing; async preemption via `SIGURG` after 10 ms (`forcePreemptNS`, `retake`) - a *user-space* analogue of the timer tick. Kernel preempting an M mid-goroutine is invisible to Go (goroutine just looks slow); that is what throttling looks like from inside.
- **Thread parking = futex**: `runtime/lock_futex.go` (`notesleep/notewakeup`, `semasleep/semawakeup` on `futexsleep/futexwakeup` with `FUTEX_WAIT_PRIVATE/WAKE_PRIVATE`, `os_linux.go`). Runtime-internal `lock`/`unlock` (1.24+ default `lock_spinbit.go`, "spin bit" mutex with 8-bit fast path) sleeps via those futex-based semaphores. `sync.Mutex` is *not* a futex: it uses `runtime_SemacquireMutex` (goroutine-level park); the M underneath may futex-sleep when idle. `sync.Mutex` normal mode spins ~4 x 30 iterations (`active_spin`, `active_spin_cnt` in `lock_spinbit.go`) and switches to starvation mode after 1 ms wait.
- **GOMAXPROCS details**: `schedinit` reads env `GOMAXPROCS`, else `defaultGOMAXPROCS(numCPUStartup)`; `sched.customGOMAXPROCS` disables auto updates; `sysmonUpdateGOMAXPROCS` runs every >=1 s and does a stop-the-world procresize when the value changed. `debug.SetMaxThreads` default 10000. `GOMAXPROCS` ignores `cpu.weight` (requests).
- **Fixes for older Go / go.mod < 1.25**: `go.uber.org/automaxprocs`, or env `GOMAXPROCS` from `resourceFieldRef: limits.cpu`; combine with `GOMEMLIMIT`.
- **Observability**: `/sched/threads:threads`, `/sched/goroutines:*` (new in 1.26 runtime/metrics), `GODEBUG=schedtrace=1000`, `go tool trace` (P timelines show gaps when throttled: all Ps idle simultaneously though goroutines runnable), cgroup `cpu.stat` `nr_throttled`, `/proc/PID/status` ctxt switches, `/proc/PID/schedstat`.
- **Signals in Go**: `signal.NotifyContext(ctx, SIGTERM, SIGINT)`; runtime handler for SIGURG (preempt) is invisible to `Notify`; `os/exec` children get `Setpgid`/`Pdeathsig` options; `cmd.Wait()` reaps (else zombies: forgetting `Wait` leaves `Z`).
- **`runtime.LockOSThread`**: pins G<->M; needed for thread-affine syscalls (`setns`, `unshare`, OpenGL), each locked G costs a whole thread and handoff on block.
- **Affinity**: `NumCPU()` = affinity mask count; default GOMAXPROCS honours `taskset` but not cpu.weight.
- **Ping-pong demo** for Go vs kernel switch cost: goroutine channel ping-pong ~100-200 ns (bank claim; not re-measured here) vs measured 1.8 us pipe ping-pong with two OS threads on the same CPU.

## 5. Illustration plan

**Scene A - "Who runs next?" (EEVDF at work)**, run-queue lanes for one CPU
1. Three tasks A, B (nice 0) and C (nice 10) in a queue; each has a lag bar and weight badge (1024, 1024, 110). Point: share ~ weight.
2. Timeline pointer at "now"; eligible tasks highlighted (lag >= 0), each with virtual deadline flag. Point: pick earliest-deadline eligible task.
3. A runs; its lag drains; timer tick every 4 ms (HZ=250) checks slice. **STOP** "How does the kernel take the CPU from a spinning task?" (tick -> NEED_RESCHED -> switch at syscall/interrupt exit).
4. A preempted (involuntary switch counter ++). B runs, blocks on read (voluntary ++). Point: two counters in /proc/PID/status.
5. Wake-up of a sleeper with short slice preempts. Point: latency via slice/deadline, not bigger share.
6. Measured bars: 8.8:1 CPU split for nice 0 vs 10.

**Scene B - "What a switch costs" + futex fast path**
1. Two tasks ping-pong through a pipe on ONE CPU (1.8 us handoff) vs on TWO CPUs (12.5 us incl. IPI/idle wake). Point: cross-CPU wake is slower.
2. Break a switch into saved state (regs, rsp, FPU, CR3 with PCID) and cold-cache penalty after.
3. futex word in user memory: lock() CAS 0->1, no kernel (9 futex calls / 2 M lock ops). Point: syscall only on contention.
4. Contended: thread B sets state 2, `FUTEX_WAIT` -> kernel hash bucket queue; A unlocks, sees 2, `FUTEX_WAKE`. **STOP** "Why does FUTEX_WAIT take the expected value?" (atomic re-check avoids lost wakeup).
5. Priority inversion cartoon: L holds lock, M preempts L, H blocked. Fix: priority inheritance boosts L.
6. Go layer: `sync.Mutex` parks goroutine (no futex); idle M futex-sleeps.

**Scene C - "2 CPUs on a 64-core host" (CFS bandwidth timeline)**
1. Host with 64 cores mostly idle; container box with `cpu.max = 200000 100000`. Point: quota is time, not cores.
2. Period bar 0-100 ms with a 200 ms "CPU-time bucket". 64 Ps (old Go) all start running at t=0.
3. Bucket drains in ~3 ms (4 threads: 50 ms). **STOP** "What happens when the bucket is empty?" (throttle: threads dequeued until refill).
4. Frozen interval ~50-97 ms: a request arriving at t=10 ms waits; latency histogram spike (measured p99 49.6 ms).
5. `cpu.stat` counters increment (`nr_throttled`, `throttled_time`).
6. Fix A: GOMAXPROCS=2 -> bucket lasts the whole period (8/40 throttled vs 40/40, same work done).
7. Fix B: Go 1.25 auto (needs `go 1.25` in go.mod). **STOP** "Why is my pod still throttled after upgrading Go?" (go.mod gate, floor of 2, bursts, ancestors).
8. Side panel: request (`cpu.weight`) vs limit (`cpu.max`).

**Scene D - "Life and death of a process" (zombies, orphans, PID 1)**
1. Parent forks child; child runs, exits: state Z (slot + exit code remain). Point: only wait4 removes it.
2. Parent waits -> gone. Parent doesn't -> zombie counter grows.
3. Parent dies first: child re-parented to PID 1. Container: PID 1 = your app.
4. `docker stop`: SIGTERM to PID 1. C entrypoint ignores it (kernel rule); after 10/30 s SIGKILL (137). **STOP** "Why doesn't SIGTERM stop my container?"
5. Go as PID 1: runtime handler, no Notify -> exits with code 2, no defers (measured).
6. With `signal.NotifyContext` + `Shutdown` -> clean exit code 0; with `tini` orphans reaped.
7. Load average side panel: runnable + D-state tasks feed it.

## 6. Existing interview questions (src/bank/cats/*.json)

- `devops-top-and-load-average`: correct incl. D state; "on 10 cores LA ~10 is fully used, ~7 healthy" is a rule of thumb. Add: counts threads; PSI is better; loadavg formula/damping 5 s sampling.
- `devops-process-vs-thread`: correct (clone flags mentioned). "process switch flushes TLB" - true only without PCID (measured no difference).
- `devops-context-switch`: "direct ~1-5 us" plausible; measured 1.8 us same-CPU, 12.5 us cross-CPU in a VM. FPU/SIMD state saved: correct. Lacks voluntary/involuntary counters.
- `devops-cooperative-vs-preemptive-multitasking`: Go 1.14 async preemption correct (SIGURG, 10 ms, verified `forcePreemptNS`).
- `devops-fork`: right; add zombie/PID-1 measured behaviour.
- `goroutines-scheduler-gomaxprocs-kubernetes`: correct on 1.25 semantics (ceil, floor 2, periodic updates, env wins, opt-out GODEBUG names `containermaxprocs`/`updatemaxprocs` verified). **Missing the go.mod `go 1.25` gate** (measured) and cgroup v1 support; "limit CPU count rounded up, floor of 2 unless only 1 CPU available" matches doc. Also missing: ancestor-limit caveat.
- `goroutines-scheduler-gomaxprocs`, `-gomaxprocs-1-threads`, `-max-goroutines`, `-switch-cost`, `-preemption`: consistent with source. `switch-cost` (100-200 ns goroutine vs 1-2 us thread) not re-measured here (thread number consistent: 1.8 us).
- `concurrency-patterns-graceful-shutdown`: SIGTERM then SIGKILL after 30 s default correct (K8s); add PID 1 rule and Go-as-PID-1 exit 2.
- Nothing existing on: futex, priority inversion, EEVDF, cgroup throttling mechanics, zombies as a scheduling topic.

## 7. Sources

- Linux v6.18 (raw.githubusercontent.com/torvalds/linux/v6.18/...): `Documentation/scheduler/sched-eevdf.rst`, `Documentation/scheduler/sched-bwc.rst`, `Documentation/admin-guide/cgroup-v2.rst` (`cpu.max`, `cpu.max.burst`), `kernel/sched/loadavg.c`, `include/linux/sched/loadavg.h`, `kernel/sched/fair.c` (`sysctl_sched_base_slice`, `get_update_sysctl_factor`), `kernel/futex/waitwake.c`; man-pages (github.com/mkerrisk/man-pages master): `clone(2)`, `futex(2)`, `futex(7)`, `signal(7)`, `pid_namespaces(7)` (PID 1 semantics), `sched(7)`; read 2026-09-29. Kernel config from `/proc/config.gz` of this VM.
- Go 1.26.0 source: `runtime/debug.go` (GOMAXPROCS godoc: quota/period, floor 2, round up, once/second updates), `runtime/cgroup_linux.go`, `internal/runtime/cgroup/cgroup_linux.go` (v1 + v2 files), `runtime/proc.go` (`schedinit`, `sysmonUpdateGOMAXPROCS`, `retake`), `runtime/lock_futex.go`, `runtime/lock_spinbit.go`, `runtime/os_linux.go` (cloneFlags, futexsleep), `runtime/signal_unix.go` (`dieFromSignal`, `sigPreempt`), `api/go1.25.txt` (`runtime.SetDefaultGOMAXPROCS`); Go 1.25.1 local `internal/godebugs/table.go` (`containermaxprocs`/`updatemaxprocs` Changed 25); release notes `_content/doc/go1.26.md` (`/sched/threads:threads`; no GOMAXPROCS change). go.dev pages themselves blocked by the egress proxy.
- Go blog "Container-aware GOMAXPROCS" https://go.dev/blog/container-aware-gomaxprocs and issue golang/go#73193 (design), #81180 (ancestor cgroup) - search snippets only.
- CFS throttling history: Indeed Engineering "Unthrottled: How a Valid Fix Becomes a Regression" https://engineering.indeedblog.com/blog/2019/12/cpu-throttling-regression-fix/ and LWN https://lwn.net/Articles/792268/ (commit de53fd7 removes slice expiration, 5.4) - snippets only.
- Experiments: /tmp/research/os-scheduling/{spin.c, pp.c, thr.c, gmp/, old/, mu/, z.py, sig/, sl.c} on this VM. Not verified: `perf sched`, real 64-core host behaviour, cgroup v2 (this VM is v1; source shows identical quota/period logic), Go channel ping-pong numbers, lock-holder preemption effects, PSI thresholds, kubelet/CRI grace period defaults (30 s K8s, 10 s Docker from memory: UNVERIFIED).
