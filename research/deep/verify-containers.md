# verify: containers (page src/topics/containers)
Env: cgroup v1 hybrid container (root), Go 1.24.7 / 1.25.1. Scratch: /tmp/verify/containers/.

## Claims checked
- Page cache charged to the cgroup: 50 MB memcg, `dd` 30 MB -> `cache 31531008, dirty 31457280, rss 180224` -> OK (re-run). RSS caption said 168 KB (earlier run) -> FIXED to "under 200 KB".
- Dirty cache + 30 MB allocation in a 50 MB cgroup -> no kill; allocation succeeded after reclaim (cache 31.5 -> 17.9 MB, failcnt rose, 112 ms vs ~60 ms baseline) -> OK; caption softened to "usually not a kill" (not guaranteed on all kernels).
- Allocation beyond limit with nothing reclaimable -> exit 137, `oom_kill 1`, dmesg `oom-kill:constraint=CONSTRAINT_MEMCG` -> OK (re-run).
- CPU throttle, 0.5 CPU quota, 4-goroutine spin, Go 1.24 (GOMAXPROCS 4): 0.49 s unconstrained vs 2.59 s limited, `nr_periods 28 nr_throttled 26` -> figures FIXED (were 28/31, 2.81 s vs 0.73 s; run-to-run variation, ratio ~5x here vs ~3.9x before).
- Go 1.25.1 under the same quota: GOMAXPROCS = 2 (rounded up, minimum 2; runtime/cgroup_linux.go uses ceil), still throttled 51/53 periods -> caption now says "rounded up, minimum 2"; also works on cgroup v1 here.
- Go PID 1 gets SIGTERM from host ns and exits with status 2 (Go 1.24.7 and 1.25.1; `unshare --pid --fork ./t1`, NSpid 3369/1) -> OK. (My first attempt signalled the wrong pid and showed 143, ignore.)
- Shell PID 1: `sh -c` is dash here and does NOT exec the single command (sh stays parent); `bash -c "sleep"` DOES exec. Page stated shell stays PID 1 unconditionally -> HEDGED ("With dash"), stop card adds the bash/dash difference.
- pid_namespaces(7): signals from inside/ancestors reach init only if it installed a handler (SIGKILL/SIGSTOP forced from ancestor) -> OK; PID 1 death kills namespace -> OK.
- Namespaces: 8 types (cgroup ipc mnt net pid time user uts), time ns = monotonic/boottime only, Linux 5.6 -> OK per namespaces(7)/research; 3+5 split on the page adds up.
- cgroup v2 memory.high "never invokes the OOM killer" -> OK (cgroup-v2.rst fetched); page already says only v1 was run.
- K8s QoS/eviction (kubernetes/website main): Guaranteed criteria, oom_score_adj -997/1000/min(max(2,1000-1000*req/mem),999) -> OK. Eviction order: "BestEffort or Burstable pods where usage exceeds requests" first; Guaranteed and Burstable within requests last; QoS not used directly -> OK. Node-level OOM kernel picks by oom_score = memory% + adj, not adj alone -> caption FIXED. Diagram box "any QoS class" for evicted-first -> FIXED to "BestEffort/Burstable using more than requested".
- Firecracker used by Lambda and Fargate (README) -> OK; Kata "lightweight VM" (README) -> OK; removed leftover "(not re-checked here)" from a caption; gVisor "application kernel ... written in Go" -> OK (README).
- Scheduling arithmetic 3+3+1=7 of 8 Gi, D 2 Gi pending -> OK. 4 threads x 12.5 ms = 50 ms, 8 threads on limit 2 = 25 ms -> OK.
- Docker grace 10 s, k8s 30 s defaults -> OK (docs, research).

## Not verifiable here
cgroup v2 files (host is v1); Kata specifics beyond README; exact SIGKILL-from-inside-ns behaviour; "hundreds of syscalls" surface figure.

## Changes (src/topics/containers/flows.tsx)
RSS number; CPU throttle numbers/caption; GOMAXPROCS caption; shell-form caption + stop card; QoS OOM caption; eviction box text; Kata caption; "usually not a kill". Illustration: memory step 5 cache box text overflowed its 88 px box -> shortened text.

## Bank corrections
None found in this pass (bank answers for gomaxprocs "floor of 2" now confirmed empirically on Go 1.25.1).
