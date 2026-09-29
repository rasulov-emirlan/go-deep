# verify: os-scheduling (src/topics/os-scheduling)
Re-run 2026-09-29 on the shared VM (kernel 6.18.44, HZ=250, cgroup v1 with writable cpu controller); code in /tmp/verify/sched.

## Claims checked
- clone flags: Go M = VM|FS|FILES|SIGHAND|SYSVSEM|THREAD (os_linux.go 1.25.1) -> page omitted SYSVSEM: FIXED; "without cgo" added (cgo threads use pthread)
- fork = clone with no sharing; os/exec CLONE_VFORK|CLONE_VM (exec_linux.go) -> OK
- Go as PID 1 (unshare --pid --fork, re-run): C sleeper ignores SIGTERM; Go without Notify exits 2 with no deferred output; Go with NotifyContext exits 0 -> OK (all three reproduced)
- Pipe hand-off: page said 1.8 us same CPU / 12.5 us cross CPU. Re-run C: 1.4-1.7 us (threads ~ processes); cross 14-29 us (very noisy); Go: 2.3 / 15 us -> FIXED to "1.5-2 us" and "13-17 us, with noise". "Threads == processes" holds on one CPU (PCID); cross-CPU numbers too noisy to compare
- nice 0 vs 10: 8.8:1 -> re-run 9.2:1 (weights 1024/110=9.3) -> "about 9:1"; involuntary switches 243 -> 245-247 each in 2 s -> "~245"
- EEVDF: transitioning in 6.6 (sched-eevdf.rst v6.18) -> OK; lag/eligible/deadline -> OK. Per-task slice via sched_setattr: absent in v6.11, present in v6.12 (kernel/sched/core.c grep) => stop card and step 6 said "since 6.6": FIXED ("needs 6.12 or later"; "can preempt", not "preempts at once")
- Slice ~2 ms: base 0.7 ms x (1+ilog2(min(cpus,8))) = 2.1 ms on 4 CPUs (fair.c) and HZ=250 -> 4 ms tick are properties of THIS VM: caption now says "here"
- Load average = nr_running + nr_uninterruptible, damped (kernel/sched/loadavg.c v6.18) -> OK
- futex fast path: page said 9 futex calls for 2M uncontended ops and 1,346 for 8 goroutines. Re-run under strace: 14-21 and 92-424 (varies run to run) -> FIXED to "~10-20" and "~100-1,300"; point (far below one per op) stands
- CFS bandwidth (5 s runs, quota 200000/100000): 4 spinners -> 37/40 periods throttled, 3.9 s throttled, probe p99 25 ms / max 52 ms (page: 40/40, p99 49.6); 2 spinners 7/40; no quota p99 ~3 ms (page 0.4 ms, VM noisy) -> FIXED captions to ranges ("37-40 of 40", "p99 25-50 ms", "a few ms unthrottled")
- GOMAXPROCS (go1.25.1 in cgroup): quotas 0.5/1.5/2.0 -> 2; 2.5 -> 3; 3.2 and 4.0 -> 4; go.mod `go 1.24` -> 4 (same quota 2 CPUs); env GOMAXPROCS=3 -> 3; GODEBUG=containermaxprocs=0 -> 4; live change 2 -> 4 within one poll -> all OK. godebugs table `Changed: 25` for both settings -> OK. runtime/cgroup_linux.go comment: only the leaf cgroup is read, a tighter parent limit is ignored -> OK (supports "parent cgroup: limit unseen")

## Changes
See FIXED items; no structural changes. Illustrations: all 8 flows re-shot at 390 and 1280, no overflow, no overlap/clip found; no coordinate edits needed.

## Unverified / notes
- Docker 10 s / K8s 30 s grace-period defaults from memory (page says "typically 10 to 30 s").
- Context-switch direct cost "roughly 1-2 us" is folklore; hedged. `devops-context-switch` bank answer OK as order of magnitude.
- Bank: `goroutines-scheduler-gomaxprocs-kubernetes` should mention the go.mod `go 1.25` gate and leaf-cgroup-only limit.
