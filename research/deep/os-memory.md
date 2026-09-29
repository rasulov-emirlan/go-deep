# os-memory — Virtual memory

Environment: Firecracker microVM, kernel 6.18.44, 16 GiB RAM, **no swap**, `vm.overcommit_memory=0`, THP `enabled=madvise` `defrag=madvise`, **cgroup v1** (writable, used for OOM experiments). Go 1.26 not installed: runtime claims read from `go1.26.0` tag source (raw.githubusercontent.com/golang/go/go1.26.0/src/runtime/...), experiments ran on go1.25.1. Code/output in /tmp/research/os-memory/.

## 1. Mechanism (whiteboard order)

**Naive: programs address physical RAM directly.** Failure modes: (1) one program can read/overwrite another's or the kernel's memory; (2) programs must be linked at non-overlapping physical addresses; (3) fragmentation: you need contiguous blocks; (4) total memory used can never exceed RAM.

**Real design: every process gets its own virtual address space; hardware (MMU) translates each access.**
- Memory is managed in **pages** (4 KiB). A virtual page maps to a physical frame, or to nothing.
- **x86-64 4-level page table**: 48-bit virtual address = 4 x 9-bit indexes (PGD -> PUD -> PMD -> PTE) + 12-bit page offset. Each table is one 4 KiB page of 512 x 8-byte entries; `CR3` points at the top. Canonical user range `0..0x00007fffffffffff` (~128 TB); kernel `ffff800000000000+` (kernel doc `x86_64/mm.rst`). 5-level (LA57, 57-bit) exists; this CPU has no `la57` flag.
- **Huge pages**: a PMD entry can map a 2 MiB page directly (skip the PTE level), a PUD entry a 1 GiB page (`pse`, `pdpe1gb` flags present here; `/sys/kernel/mm/hugepages/hugepages-{2048,1048576}kB`). Fewer TLB entries needed, shorter walks, bigger contiguous physical requirement.
- Each PTE has present, R/W, U/S (user/supervisor), NX, accessed, dirty bits. Not-present or protection violation -> **page fault** exception -> kernel decides.
- **TLB**: a per-core cache of recent translations. A hit costs ~nothing; a miss triggers a hardware page walk (up to 4 memory reads; under virtualization's nested paging up to ~24 - widely cited, not re-verified here). **PCID** tags TLB entries with an address-space id so switching CR3 (process switch, KPTI) need not flush everything (`pcid`, `invpcid` present).
- **TLB shootdown**: when a mapping changes (munmap, mprotect, madvise(DONTNEED), COW break) every *other CPU that may cache the old translation* must invalidate: kernel sends IPIs (`/proc/interrupts` row `TLB shootdowns`). Cost scales with the number of CPUs running threads of that process.

**Demand paging (lazy allocation).** `mmap` only creates a VMA (a range + permissions in the kernel's bookkeeping); no PTEs, no RAM. First access -> #PF -> kernel `handle_mm_fault`:
- *Anonymous, first touch:* `do_anonymous_page`. **Read** fault maps the shared **zero page** (read-only; no RAM consumed); **write** fault allocates and zeroes a frame. Kernel must zero pages so processes never see each other's data.
- *File-backed:* `do_fault` -> page cache lookup; if cached -> **minor fault** (just map it; fault-around maps neighbouring pages too); if not -> read from disk = **major fault**.
- *Swapped out:* `do_swap_page` -> major fault.
- *Write to read-only COW page:* `do_wp_page` copies the frame (see fork).
- *Invalid address / permission violation:* SIGSEGV. *File truncated under mmap / I/O error:* SIGBUS.

**fork + copy-on-write.** `fork` copies page tables (cost ~ O(mapped memory)) but marks all private pages read-only in both; first write by either side faults and copies just that page. `exec` throws it all away, hence `posix_spawn`/`vfork`.

**mmap taxonomy**: {anonymous | file-backed} x {private (COW) | shared (writes visible to others / written back)}. Private file mapping: reads from page cache, first write copies. Shared file mapping: dirty pages flushed by writeback (`msync`).

**Overcommit** (`vm.overcommit_memory`, kernel doc `mm/overcommit-accounting.rst`): 0 = heuristic, "obvious overcommits of address space are refused" (default); 1 = always; 2 = never beyond `swap + overcommit_ratio% (default 50) of RAM` (`CommitLimit`/`Committed_AS` in `/proc/meminfo`). Accounting is on *committed address space*: private-writable and anonymous-shared mappings count fully; `PROT_NONE` and read-only private don't.

**OOM killer.** When reclaim (drop page cache, swap) fails, `out_of_memory()` picks a victim by `oom_badness = rss(anon+file+shmem) + swapents + pagetables/4K + oom_score_adj * totalpages/1000` (`mm/oom_kill.c`); `oom_score_adj = -1000` = exempt. Kills with SIGKILL (exit 137 = 128+9). Two flavours: **global** (`constraint=CONSTRAINT_NONE`) and **cgroup** (`CONSTRAINT_MEMCG`: a container hit its own `memory.max`/`limit_in_bytes` even though the host has free RAM). cgroup v2: `memory.high` = soft throttle (reclaim pressure, no kill), `memory.max` = hard, `memory.oom.group` = kill the whole group.

**Swap & thrashing.** Anonymous pages have no file to go back to; swap gives them one. With little RAM the working set exceeds RAM and the kernel keeps evicting pages that will be needed immediately: CPU idle, disk busy, latency x1000 (thrashing). No swap (typical in K8s) means the OOM killer acts earlier and cleaner.

**Page cache** = all free RAM is used to cache files. `free`'s "free" column is misleading; look at `MemAvailable`. Measured: writing a 1 GiB file dropped `free` by ~1 GiB (12.3 -> 11.3 GB) and left `available` unchanged (14.8 GB); `drop_caches` gave it back.

## 2. Edge cases & gotchas

- **RSS vs VSZ vs PSS vs USS.** VSZ = all mapped address space (includes untouched, PROT_NONE reservations). RSS = resident pages incl. shared ones (double-counted across processes). PSS = private + shared/N. USS = private only. Measured (256 MiB private mapping, fork): parent RSS 263 MB; child right after fork **RSS 262 MB but PSS 130 MB**, Shared_Dirty 258; after child writes half: child Private_Dirty 128, Shared_Dirty 130, **32,776 COW page faults**. Sum of RSS (526 MB) >> real use (~386 MB). Why: RSS counts every mapped resident page in each process.
- **`make([]byte, 1<<30)` untouched**: Go 1.25.1: VSZ +1 GiB, **RSS +1.3 MB**, minflt +482. After touching one byte per 4 KiB: RSS +1.0 GiB, **262,144 minor faults** (1 GiB/4 KiB). Reading (not writing) every page of a fresh 256 MiB anon map: RssAnon 616 kB, 65,538 faults (zero page); then writing every page: RssAnon 262 MB, +65,549 faults (write-protect faults on the zero page). Why: demand paging + zero page; faults, not allocations, are the unit of cost.
- **Cold vs warm mmap read** (256 MiB file, read 1 byte/page): cold cache 102 ms vs warm 3 ms; only ~540 minor faults for 65,536 pages (fault-around/large folios map many pages per fault); `ru_majflt` stayed 0 even cold (reason not verified: UNVERIFIED).
- **Overcommit refusal is about single obvious cases**: heuristic mode on 16 GiB box: mmap 15 GiB anon RW ok, **17 GiB fails ENOMEM**; 1 TiB `PROT_NONE` mapping ok (not accounted). Why: heuristic compares one request with total RAM+swap; PROT_NONE is not chargeable. That is exactly why Go/ASan/JVM *reserve* with PROT_NONE and later commit.
- **Overcommit doesn't cause OOM at malloc time; it causes it at touch time.** The process that gets killed is chosen by score, not by who touched last (usually the biggest RSS).
- **cgroup OOM demo (v1)**: 256 MiB limit, Go program touching 32 MiB steps: killed at ~256 MiB, exit **137**, no Go panic/defer/log; `dmesg`: `oom-kill:constraint=CONSTRAINT_MEMCG,...oom_memcg=/rt1 ... Killed process ... total-vm:1488424kB, anon-rss:261248kB`. Note total-vm 1.4 GB vs anon-rss 261 MB: VSZ is irrelevant to the kill.
- **Page cache counts against the cgroup but is reclaimable**: usage near the limit is not automatically bad; kubelet's `container_memory_working_set_bytes` subtracts inactive file cache (from memory, UNVERIFIED here). Alerting on `usage_in_bytes` causes false alarms.
- **K8s oom_score_adj**: Guaranteed -997, BestEffort 1000, Burstable `min(max(2, 1000 - 1000*memRequest/nodeMem), 999)` (k8s docs via search snippet). Node-level OOM kills BestEffort/over-request pods first.
- **mmap + SIGBUS**: `Ftruncate` the file to 4096 after mapping 8192 and touch page 2 -> `SIGBUS`. In Go: `unexpected fault address 0x7f... fatal error: fault [signal SIGBUS: bus error code=0x2 ...]` (a crash); with `debug.SetPanicOnFault(true)` it becomes a recoverable runtime panic on that goroutine (the message printed was `invalid memory address or nil pointer dereference`, misleading). Why: page beyond EOF has no backing store. Also disk errors and NFS hiccups surface as SIGBUS, not `error` returns - why mmap I/O is dangerous for services.
- **mmap I/O pitfalls**: no error path for I/O failure; page faults are unbounded-latency stalls hidden inside a plain load (major fault = disk read); one thread's fault blocks only that thread but holds `mmap_lock` read side (contention with `mmap/munmap` from others); mapping huge files can pollute cache; `msync` needed for durability.
- **TLB shootdown cost, measured**: 20,000 x {mmap 1 MiB, touch, munmap}: alone 6.5 us each, 0 IPIs; with **3 other busy threads** in the process 24.0 us each (3.7x), **59,015 TLB-shootdown IPIs** (~3 per munmap). Why: every CPU running a sibling thread must invalidate. Relevance: Go's scavenger (`madvise`) and `munmap`-heavy code in multithreaded processes.
- **THP latency pitfalls** (kernel doc `admin-guide/mm/transhuge.rst`): `enabled=always` + `defrag=always` can stall page faults in direct compaction; khugepaged scans in background; RSS can jump by 2 MiB per touch (memory bloat) - which is why Redis/MongoDB/Postgres docs say disable THP. Here `enabled=madvise`; an explicit `madvise(MADV_HUGEPAGE)` on 512 MiB gave 257 faults and `AnonHugePages=526336 kB` but the touch took **1.7-2.5 s vs 0.26-0.43 s** with 4 KiB pages (no compaction stalls: `compact_stall 0`; likely 2 MiB zeroing + host-side backing of a microVM: UNVERIFIED). Lesson: huge pages cut faults/TLB misses but first-touch latency per fault is 512x larger.
- **Go and THP**: 1.21.0 used MADV_HUGEPAGE/COLLAPSE more aggressively and later versions dialed it back (issue 64332 is referenced from extern.go; history from memory: UNVERIFIED); `GODEBUG=disablethp=1` exists (deprecated; extern.go: "will be removed"). In 1.26 `mem_linux.go` still calls `madvise(MADV_HUGEPAGE)` only for runtime-internal metadata (`sysHugePageOS`), `MADV_NOHUGEPAGE` via `sysNoHugePageOS`.
- **NUMA**: memory is local to a socket; `numactl`/`mbind`; first-touch policy places pages on the touching thread's node; cross-node access ~1.5-2x latency (general knowledge; single-node VM here, not testable). Automatic NUMA balancing causes hint faults.
- **Stack**: OS thread stack = one VMA (`ulimit -s` 8 MiB), grows down on fault up to the limit, with a guard gap (`stack_guard_gap = 256 pages = 1 MiB`, `mm/mmap.c`); overflow -> SIGSEGV. Go goroutine stacks are **heap objects** (in the 0xc000... arena), start at 2 KiB, grow by copy; max 1 GB on 64-bit (`maxstacksize = 1000000000`, `proc.go`), exceed -> `fatal error: stack overflow` (not recoverable).
- **`vm.max_map_count` = 65530** (here): each mmap/mprotect split makes a VMA; exceeding -> ENOMEM even with free RAM (bites Elasticsearch, and programs doing many small `mmap`s).
- **Memory graphs**: "free" tiny is normal (cache). Container "usage" includes page cache and kernel memory (slab, page tables); Go `HeapInuse` + stacks + metadata + fragmentation != RSS.

## 3. Common misconceptions

- "malloc/make failing means out of memory." With overcommit it almost never fails; the kill comes later at touch.
- "RSS = memory my program uses." Includes shared file pages and page cache mapped in; RSS of forked children double-counts. Use PSS/USS or cgroup `memory.stat`.
- "Low `free` means memory leak/pressure." Page cache; check `MemAvailable`, PSI (`/proc/pressure/memory`), major fault rate, swap-in.
- "Freed Go memory shows up as lower RSS immediately." Go frees to its own heap; the scavenger returns pages later; with `madvdontneed=0` (MADV_FREE) RSS doesn't drop until kernel pressure.
- "fork copies the process's memory." It copies page tables; data copied lazily per page; with big heaps fork itself is slow (page-table copy, ~ms per GB scale; general) and COW causes latency spikes after (Redis BGSAVE).
- "The OOM killer kills the process that allocated last / the biggest VSZ." It kills the highest `oom_badness` (RSS+swap+page tables, adjusted). In a cgroup only tasks in that cgroup are candidates.
- "Swap is a memory extension for free." It converts OOM-kill into thrashing; for latency-sensitive services many disable it.
- "Huge pages always faster." Fewer TLB misses, but bloat, compaction stalls, slower first touch, hard to free.
- "Memory limit in container = Go heap limit." Go needs `GOMEMLIMIT`; it counts runtime-mapped memory only, not the cgroup, and not cgo/mmap'd files.

## 4. Go tie-ins (go1.26.0 source unless stated)

- **Reserve vs commit** (`runtime/mem_linux.go`): `sysReserveOS` = `mmap(PROT_NONE, MAP_ANON|MAP_PRIVATE)`; `sysMapOS` = `mmap(PROT_READ|PROT_WRITE, MAP_FIXED...)` over it ("Prepared -> Ready"); `sysUsedOS` (re-use), `sysUnusedOS` (release). Heap arenas are **64 MiB** on linux/64-bit (`logHeapArenaBytes = 26`), 48 address bits (`heapAddrBits=48`). Observed in `/proc/self/maps` of hello-world: `c000000000-c000400000 rw-p` (4 MiB committed) followed by `c000400000-c004000000 ---p` (rest of the 64 MiB arena reserved PROT_NONE), plus several `---p` reserved index/metadata regions - VSZ 1.2 GB at startup, RSS 2 MB. **1.26 change**: heap base address is randomized on 64-bit (`GOEXPERIMENT=norandomizedheapbase64` opts out; release notes) so `0xc000000000` is no longer fixed.
- **Scavenger returns memory**: `sysUnusedOS`: default on Linux is **`MADV_DONTNEED`** (since Go 1.16; `runtime1.go`: `debug.madvdontneed = 1` "Hence, default to MADV_DONTNEED" for monitoring tools); `GODEBUG=madvdontneed=0` switches to **`MADV_FREE`** (falls back to DONTNEED if unsupported). `MADV_FREE` = pages marked lazily freeable; RSS drops only under memory pressure. Measured (1 GiB touched then freed): default: RSS 1,052 MB -> `debug.FreeOSMemory()` -> **3.9 MB**; `madvdontneed=0`: RSS stays **1,052 MB** after FreeOSMemory. Bank answer `memory-gc-lazy-allocation` says MADV_DONTNEED: correct as default.
- **Background scavenger pacing** (`mgcscavenge.go`): `scavengePercent = 1` (target ~1% of mutator CPU), `retainExtraPercent = 10` (keep heap goal + 10%), releases in 64 KiB quanta; with a memory limit it also targets `limit * 0.95` (`reduceExtraPercent`) and works harder. `debug.FreeOSMemory` forces a full GC + release.
- **GOMEMLIMIT** (`debug.SetMemoryLimit`): soft limit on `Sys - HeapReleased` (`/memory/classes/total:bytes - /memory/classes/heap/released:bytes`) - runtime-managed memory only, excludes cgo/other mmaps; GC CPU limiter caps GC at ~50% (`mgclimit.go`: "very conservative limit of 50%"). Experiment (cgroup 200 MiB, live heap 120 MiB, 4 MiB garbage churn 3 s): **no GOMEMLIMIT -> OOM-killed (137)**; `GOMEMLIMIT=170MiB` -> survived, 11,750 allocs, 1,474 GCs, GC CPU 5%; `GOMEMLIMIT=125MiB` (just above live) -> survived but **5x lower throughput** (2,237 allocs, 1,676 GCs, 9% GC CPU). Rule of thumb: limit ~90% of container limit, and never near live heap. Go does not read the cgroup memory limit automatically (unlike GOMAXPROCS in 1.25).
- **`fatal error: runtime: out of memory`** when `mmap` returns ENOMEM (`sysMapOS`); `runtime: mmap: too much locked memory` for EAGAIN. Not recoverable. `MADV_HUGEPAGE`/`NOHUGEPAGE`/`COLLAPSE` helpers live in the same file.
- **Stacks**: min 2 KiB (`stackMin = 2048`), copy-on-grow doubling (addresses of locals change: recursion demo printed `&local` values jumping between 0xc0000b8..., 0xc00010f..., 0xc000130...); guard = `stackNosplit(800) + stackSmall(128) = 928` bytes on linux/amd64 (checked in prologue, not a guard page); can't hold pointers into stacks from heap. Max 1 GB (`SetMaxStack`).
- **Goroutine-related RSS**: goroutine stacks are in the Go heap; `StackInuse` in MemStats (800 KiB in the demo). Thread stacks (OS threads created by Go) are 8 MiB VSZ each but mostly untouched.
- **mmap in Go**: `syscall.Mmap` returns a `[]byte` over the mapping - GC does not manage it; SIGBUS on truncate (above); `golang.org/x/exp/mmap`; `bbolt`/`LMDB` rely on it. Large `make` allocations get fresh zeroed pages and skip zeroing (`needzero=false`); after scavenge with MADV_DONTNEED pages are again zero, with MADV_FREE Go must zero manually (`needZeroAfterSysUnusedOS`: `debug.madvdontneed == 0`).
- **Checking RSS in Go**: `runtime.ReadMemStats` (`Sys`, `HeapSys`, `HeapReleased`, `StackInuse`) vs `/proc/self/status` (`VmRSS`, `RssAnon`, `RssFile`) vs `/proc/self/smaps_rollup` (`Pss`, `Private_Dirty`, `AnonHugePages`).
- Fork: Go can't `fork()` without `exec` (multi-threaded runtime); `os/exec` uses `clone(CLONE_VFORK|CLONE_VM)` (no page table copy) - `syscall/exec_linux.go`.

## 5. Illustration plan

**Scene A - "One address, many worlds" (translation + page walk)**
1. Two processes each with the same virtual address 0x1000 mapping to different frames. Point: virtual != physical, isolation.
2. Address bits split 9|9|9|9|12; four table pages drawn as a tree from CR3. Point: 4-level walk.
3. TLB box in front: hit path (1 step) vs miss path (4 memory reads). **STOP** "What does a TLB miss cost / how do huge pages help?"
4. Same address with a PMD leaf: 2 MiB page, 3-level walk, 21-bit offset.
5. Context switch: CR3 changes; PCID tag lets entries survive. **STOP** "Why is a thread switch cheaper than a process switch?"
6. munmap in a 4-thread process: IPIs fan out to CPUs 1-3 (TLB shootdown, 59k IPIs measured).

**Scene B - "A page's first touch" (demand paging, zero page, COW)**
1. `mmap(1 GiB)`: VMA appears, page tables empty, RSS 0 (VSZ +1 GiB). 2. First read -> #PF -> shared zero page mapped, RSS still 0. 3. First write -> #PF -> frame allocated+zeroed, RSS +4 KiB (262,144 faults for 1 GiB). **STOP** "Why does `make([]byte,1<<30)` not increase RSS?" 4. `fork`: both page tables point to same frames, marked read-only. 5. Child writes -> `do_wp_page` copies one 4 KiB page: PSS split shown. **STOP** "Why did the parent's RSS not change but child memory grew?" 6. Page evicted to swap/file dropped; touch -> major fault (disk). 7. Truncated mmap file -> SIGBUS (**STOP** "why not an I/O error?").

**Scene C - "Who gets killed" (overcommit + OOM)**
1. Address space bar vs RAM bar: three processes have promised 40 GiB on a 16 GiB machine (mode 0/1). 2. Touches accumulate; free hits low watermark. 3. kswapd/direct reclaim: drop page cache (cheap), swap anon (if any). 4. Reclaim fails -> OOM killer computes `oom_badness` per task (bar chart: rss+pgtables+adj). **STOP** "Which process dies?" 5. Container variant: cgroup limit wall at 256 MiB while host has 12 GB free; only tasks in that cgroup are candidates; `dmesg` line `CONSTRAINT_MEMCG`. 6. Exit 137; process gets no chance to run defers. 7. Mode 2: `mmap` returns ENOMEM up-front instead.

**Scene D - "Go's memory on top of the kernel's" (arena lifecycle)**
1. Startup: `mmap(PROT_NONE)` reservations, VSZ jumps ~1.2 GB, RSS 2 MB. 2. Heap grows: 4 MiB `mmap(RW, MAP_FIXED)` inside the 64 MiB arena ("Prepared->Ready"); faults commit pages. 3. GC frees objects: Go heap free, RSS unchanged. **STOP** "Why didn't RSS drop after GC?" 4. Scavenger (1% CPU): `madvise(DONTNEED)` 64 KiB quanta, RSS falls (MADV_FREE variant: RSS stays, `LazyFree`). 5. Container limit line drawn at 256 MiB; GOMEMLIMIT line at ~90%; GC gets more aggressive as the heap nears it; GC CPU limiter 50%. **STOP** "GOMEMLIMIT set too close to live heap?" (death spiral, 5x slower). 6. Without GOMEMLIMIT: heap goal 2x live crosses the cgroup wall -> SIGKILL 137.

## 6. Existing interview questions (src/bank/cats/*.json)

- `memory-gc-lazy-allocation`: correct (lazy mmap, zero pages, 64 MB arenas, MADV_DONTNEED default verified). Misses: reserve-with-PROT_NONE vs commit, MADV_FREE variant, zero page on reads, `needzero`.
- `memory-gc-oom-behavior`: good. Verified: cgroup OOM = SIGKILL, 137, no defers. Misses: `oom_badness` uses RSS not VSZ; `memory.high` vs `memory.max`; "GC CPU capped ~50%" is correct (`mgclimit.go`); GOMEMLIMIT death spiral measured; `fatal error: runtime: out of memory` is for mmap failure (true).
- `memory-gc-goroutine-stack`: 2 KB, doubling copy, 1 GB max (64-bit) correct; "Go 1.19 average stack size initial" is right (adaptive stack init, not re-verified). Add: stacks live in the Go heap, guard is a prologue check (~928 B) not an MMU guard page.
- `memory-gc-arenas` (second meaning): 64 MB heap arena correct; 1.26 heap-base randomization is new.
- `memory-gc-leak-diagnosis`: "RSS grows but heap doesn't -> fragmentation/scavenger" ok; add MADV_FREE/`madvdontneed`, page-cache/mmap RSS, `smaps_rollup`.
- `devops-fork`: right (COW, zombie, PID 1); could add page-table-copy cost and `vfork/CLONE_VM` in `os/exec`.
- No existing question on: page tables/TLB, page faults, overcommit, THP, PSS/RSS, swap thrash, SIGBUS on mmap.

## 7. Sources

- Linux v6.18 (raw.githubusercontent.com/torvalds/linux/v6.18/...): `Documentation/mm/overcommit-accounting.rst`, `Documentation/admin-guide/mm/transhuge.rst`, `Documentation/arch/x86/x86_64/mm.rst`, `Documentation/admin-guide/cgroup-v2.rst` (memory.high/max/oom.group), `mm/oom_kill.c` (`oom_badness`), `mm/mmap.c` (`stack_guard_gap`), `mm/memory.c` (`do_anonymous_page`, `do_wp_page`, `do_swap_page`, `do_fault`); read 2026-09-29.
- Go 1.26.0 source: `runtime/mem_linux.go`, `runtime/malloc.go` (arena size, randomized heap base), `runtime/mgcscavenge.go`, `runtime/mgclimit.go`, `runtime/runtime1.go` (madvdontneed default), `runtime/extern.go` (GODEBUG docs incl. `madvdontneed`, `disablethp`), `runtime/debug/garbage.go` (SetMemoryLimit), `runtime/stack.go`, `runtime/proc.go` (maxstacksize); release notes `golang/website/_content/doc/go1.26.md` (heap base randomization).
- Kubernetes oom_score_adj values: kubernetes.io node-pressure-eviction doc + issue #131169 (search snippet, not fetched).
- Experiments (this VM): /tmp/research/os-memory/{rss,zp,thp,tlb.c,oom,churn,sigbus,oc,mf}; `cow.py` (Python fork/COW, `MAP_PRIVATE|MAP_ANONYMOUS` - note Python's default `mmap.mmap(-1,N)` is MAP_SHARED and shows no COW).
- Not verified: NUMA behaviour (single node), swap thrashing (no swap), THP compaction stalls (none reproduced), 5-level paging, kubelet working-set formula, nested-paging 24-reference figure, exact reason major faults read 0 on the cold mmap run.
