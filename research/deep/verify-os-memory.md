# verify: virtual-memory (src/topics/virtual-memory)
Re-run 2026-09-29, same VM (16 GiB, no swap, overcommit 0, cgroup v1), Go 1.25.1; code in /tmp/verify/vm. VM shared with other agents.

## Claims checked
- 4-level walk 9+9+9+9+12, 512x8 B tables, 2 MiB PMD leaf, PCID, TLB miss = up to 4 reads -> OK (mm docs / note); 5-level caveat added to labels
- untouched make([]byte,1<<30): VSZ +1 GiB, RSS +1.3 MB -> OK (re-run: +1316 kB). Touched: RSS +1 GiB; faults measured 262,239 => wording changed from "262,144" to "about 262,000"
- zero page: read all pages of 256 MiB: RssAnon 640 kB, 65,538 faults; then write: 65,550 more -> OK (page said 65,549; now "~65,540 / ~65,550")
- COW fork (python cow.py): child RSS 262 / PSS 130 right after fork; after writing half: private 128, shared 130, 32,777 COW faults, parent RSS 264 -> OK; sum RSS 526 vs ~386 real -> OK
- cold vs warm mmap read: page said 102 vs 3 ms; re-run 136 vs 2 ms (1 major fault) -> FIXED to "~100-140 ms vs 2-3 ms, one VM"
- TLB shootdown: page said 6.5 us alone vs 24 us with 3 busy siblings, ~3 IPIs each. Re-run under load: 9-15 us vs 42 us; IPI counts 11k-26k per 20k munmap (not 59k). FIXED: caption now "3-5x slower (e.g. 9 vs 42 us)", removed "3 IPIs each"
- Overcommit mode 0: 15 GiB ok, 17 GiB ENOMEM, 1 TiB PROT_NONE ok -> OK (re-run). Modes 0/1/2 text and "swap + 50% RAM" -> OK (overcommit-accounting.rst v6.18)
- OOM in cgroup v1 (256 MiB): SIGKILL, exit 137, no output -> OK (re-run: killed at ~224-256 MiB held). oom_badness / oom_score_adj -1000 -> OK (note)
- GOMEMLIMIT experiment (200 MiB cgroup, 120 MiB live): none -> killed 137; 170 MiB -> survived, GC 5.2% CPU; 125 MiB -> survived, throughput 7x lower (was 5x) -> FIXED "5-7x"; caption says one VM
- MADV_DONTNEED default (go1.26.0 runtime1.go + mem_linux.go sysUnusedOS); madvdontneed=0 -> RSS 3.9 MB vs 1,052 MB after FreeOSMemory -> OK (re-run)
- Go 1.26 heap-base randomization (release notes go1.26.md, GOEXPERIMENT=norandomizedheapbase64) -> OK
- Hello world VSZ ~1.2 GB / RSS ~2 MB -> OK (1,225,708 kB / 2,132 kB)
- "Go maps 4 MiB at a time" -> hedged: 4 MiB is the granularity floor; large allocs map more ("chunks, 4 MiB at first")
- "Go never plain-forks": exec_linux.go adds CLONE_VFORK|CLONE_VM only when no CLONE_NEWUSER -> hedged with the user-namespace exception
- GC limiter ~50%, scavenger 1% -> OK (research note quotes mgclimit.go / mgcscavenge.go)

## Changes
Wording/number fixes above (shootdown, fault counts, mmap latency, GOMEMLIMIT, fork/clone caveat, heap map granularity).
Illustration fixes: worlds step 3 label "per-process table" overflowed its box -> "page table"; demand step 5 left the previous step's red frame/arrow red -> now ink. 8 figures re-shot at both sizes, no overflow.

## Unverified / notes
- Nested-paging "24 reads", THP behaviour, NUMA not on page or not re-tested.
- Bank: nothing wrong found in memory-gc-* answers; `memory-gc-lazy-allocation` MADV_DONTNEED default is correct.
