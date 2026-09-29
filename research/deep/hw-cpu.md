# hw-cpu — CPU caches, coherence, NUMA & memory ordering

Env: benchmarks in `/tmp/research/hw-cpu/` (`b_test.go`, `br_test.go`), go1.24.7 linux/amd64 (brief said 1.26; local is 1.24.7), **4 vCPU** Intel Xeon (Sapphire Rapids-class, family 6 model 207) @2.1 GHz under KVM, 1 socket, 1 NUMA node. `lscpu` reports L1d 48 KiB/core, L2 2 MiB/core (8 MiB / 4), "L3 260 MiB" (the host's shared L3, visible through the hypervisor). `getconf LEVEL1_DCACHE_LINESIZE`=64. Numbers are noisy (shared host); **only ratios are reported and each was reproduced in ≥2 runs.** Cross-socket / NUMA could not be measured (single node): NUMA numbers are cited.

## 1. Mechanism (whiteboard order)

**Why caches: the memory wall.** A core can retire several instructions per ns; DRAM answers in ~100 ns. So put small fast memories in between. Order-of-magnitude latency (Jeff Dean/Peter Norvig "latency numbers", the GitHub gist copy: L1 0.5 ns, branch mispredict 5 ns, L2 7 ns, mutex lock/unlock 25 ns, main memory 100 ns, SSD random read 150 µs, DC round trip 500 µs). Modern ballparks (cite as ranges, hardware-dependent): L1 ≈ 1 ns (4–5 cycles), L2 ≈ 3–5 ns (12–16 cycles), L3 ≈ 10–20 ns (30–70 cycles, more on big server meshes), local DRAM ≈ 70–100 ns, **remote-socket DRAM ≈ 1.5–2x local** (Intel community measurement quoted via search: Skylake Gold DDR4-2400 local 80 ns vs remote 138 ns = +72%; another source: crossing sockets adds ~90 ns). The Dean list's 0.5 ns L1 is dated; ratios (each level ≈ 3–10x) are the durable lesson.

**Measured here (pointer-chase over a random cycle of `[]int`, ns per dependent load, 4 vCPU Xeon @2.1GHz):**
16 KiB 1.9 ns → 256 KiB 5.3 → 4 MiB 28 → 64 MiB 149 → 512 MiB 204. Ratio L1-resident : big-working-set ≈ 1 : 80–110. (64 MiB is bigger than the per-core L2 and mostly not L1/L2; the step at 4 MiB reflects the 2 MiB L2 plus a big shared L3; the 149→204 step includes TLB misses and nested paging under KVM. Don't quote absolutes.)

**Cache line.** Transfers between levels are in 64-byte lines on x86 (verified via getconf). Apple M-series L1/L2 line is **128 B** (Apple silicon; secondary sources); Intel's L2 "adjacent cache line prefetcher" fetches lines in 128-byte aligned pairs, which is why some libraries pad to 128 on x86 too (UNVERIFIED for specific Intel generations). **Go's own constants** (`internal/cpu/cpu_*.go`, verified): `CacheLinePadSize` = 64 on x86/riscv64/loong64/wasm, **128 on arm64 and ppc64x**, 32 on arm/mips, 256 on s390x. Struct field access touches its whole line: touching 1 byte loads 64.

**Associativity / conflict misses.** A cache is `sets x ways x 64 B`. Address bits `[6..]` pick the set; e.g. 48 KiB / 12-way / 64 B → 64 sets, so addresses 4 KiB apart (64 sets x 64 B) map to the *same* set. Access a column of a matrix whose row length is a power of two (e.g. 4096 B) and every element lands in one set: only `ways` lines fit → conflict misses although the cache is mostly empty ("critical stride"). Fix: pad rows (e.g. +64 B) or block/tile. Capacity vs conflict vs compulsory misses = the 3 Cs.

**Hardware prefetching: why sequential beats pointer chasing.** The L1/L2 prefetchers detect constant strides/streams and issue loads ahead; DRAM bandwidth (tens of GB/s) is high, latency isn't. Also out-of-order cores overlap *independent* misses (memory-level parallelism, ~10+ outstanding line fills per core). A slice walk has independent addresses → prefetch + MLP hide latency; a linked list has each address depend on the previous load → strictly serial misses, each a full latency, and prefetchers can't guess `next`.
**Measured (Go, 2 M nodes x 64 B = 128 MiB, sum a field, per full traversal):**
- `[]node` slice: 6.1 ms (1.0x)
- linked list allocated contiguously in traversal order (`nodes[i].next=&nodes[i+1]`): 22.6 ms (**3.7x** slower — dependent-load chain even though the prefetcher can partly help)
- linked list with shuffled links: 348 ms (**57x** slower than slice, 15x slower than the in-order list).
Take-away: the cost is not "pointers" per se but *dependent misses* and lost prefetch; allocation order matters (Go's allocator hands sequential allocations adjacent addresses → lists built in a tight loop are "accidentally OK", long-lived shuffled ones are not).

**Branch prediction.** Pipelines are 15–20 stages deep; a mispredict flushes it (~15–20 cycles ≈ 5 ns at the Dean table's figure, ≥5–7 ns here). Predictors learn patterns/history; random data-dependent branches are ~50% mispredicted.
**Measured:** classic "sorted vs unsorted" needs care in Go: a naive `if v >= 128 { t += v }` is compiled to a **branchless CMOV**, so sorted/unsorted were equal (50.6 µs vs 61.2 µs, no win). Making the branch real (append + `//go:noinline` call in the taken path): unsorted **~415 µs vs sorted ~105 µs ≈ 4.0x** (3 runs each: 468/414/416 vs 113/105/105 µs, N=65536). Interview point: the compiler may have removed the branch; verify with `-gcflags=-S`/benchmarks, don't assume.

**Cache coherence (MESI) — why sharing is expensive.** Each core has private L1/L2, so the same line can live in several caches. The protocol keeps one *coherent* value per line. MESI per-line states in each cache:
- **M**odified: only copy, dirty. **E**xclusive: only copy, clean. **S**hared: clean, maybe others have it. **I**nvalid.
- Read miss: if some cache holds M, it supplies the line (and writes back, becomes S); else L3/memory supplies; a lone reader gets E.
- **Write** to an S line: must send an *invalidate* (RFO, read-for-ownership) to all sharers, wait for acks, then go M. Write to E: silent upgrade to M (no traffic). Write to I: RFO miss.
- Intel adds F(orward), AMD/AMD's MOESI adds O(wned) so dirty data can be shared without writing to memory. Intel server parts use snoop filters/directories in the L3 mesh instead of broadcasting to every core.
So a line that ping-pongs between cores in M state costs a cross-core transfer (~40–100+ ns; more across sockets) per handoff.

**False sharing mechanics** (padding basics live in `src/topics/memorylayout` — this goes beyond): two independent variables in one 64 B line, written by different cores → each write invalidates the other core's copy → line bounces M↔I. No data is actually shared, only its *granularity* is. Detect with `perf c2c`/`perf stat -e` cache-to-cache HITM events (UNVERIFIED tool detail; not available here).

**Atomic ops cost / cache-line bouncing on a shared counter.** `LOCK XADD` (Go `atomic.AddInt64`) needs the line in M state and, on x86, acts as a full barrier (drains the store buffer): ~20 cycles *uncontended* even when in L1. Contended: every increment must first pull the line from the previous owner core → throughput of one line is ~ one transfer per op regardless of core count, so **more cores = slower per op**, not faster.
**Measured (`RunParallel`, ns per op over all goroutines; -cpu 1/2/4):**
| bench | 1 | 2 | 4 |
|---|---|---|---|
| plain `c++` single goroutine | 0.36 | | |
| `atomic.Add` single goroutine | 6.8–10 | | |
| shared `atomic.Int64` (`AtomicShared`) | 10.3 | 19.2 | 22.6 |
| per-goroutine counters **padded to 64B** | 9.9–10.7 | 5.3 | 3.2–4.2 |
| per-goroutine counters **unpadded** (false sharing) | 9.8–10.1 | 18.5–20.3 | 22–24 |
| shared `sync.Mutex` lock/inc/unlock | 19 | 31–33 | 66–69 |
Ratios: uncontended atomic ≈ 20–28x a plain add; 4-core shared atomic is ~2.2x *slower per op* than 1-core; padding restores near-linear scaling (padded 4-core ≈ 5–6x faster than false-shared/shared); unpadded shards ≈ same as one shared counter (false sharing fully reproduces the shared-counter cost); mutex under 4-way contention ≈ 3.5x its single-thread cost and ≈ 3x the atomic. (The 1-core "atomic" figure is high vs. typical ~5 ns because of VM/frequency; ratio to plain add is the lesson.) The padded scaling is sub-linear (3.2–4.2 vs ideal 2.5 ns) — vCPUs may be SMT siblings/noisy; cannot tell inside a VM.
**Interview point:** sharding + padding (`sync.Pool`-like per-P, `runtime` per-P caches, striped counters like `atomic.Int64` per shard, `expvar`/Prometheus counters) is why the Go runtime keeps per-P state.

**Store buffers & memory reordering.** A core doesn't wait for a store to reach L1/coherence: it puts it in a **store buffer** and continues; loads may *forward* from it. So another core can observe the store late, while this core's *later load* executes early → **store→load reordering** (Dekker/Peterson breaks): T1: `x=1; r1=y`, T2: `y=1; r2=x` can yield `r1=r2=0`.
- **x86-TSO** (Sewell/Sarkar/Owens/Nardelli/Myreen, CACM 2010): stores are FIFO in the buffer, loads aren't reordered with older loads, stores aren't reordered with stores; the only architecturally visible reordering is **store→load** (plus fences `MFENCE`, and `LOCK`-prefixed ops that drain the buffer).
- **ARMv8/POWER/RISC-V (RVWMO):** weak — loads and stores can be reordered with each other unless ordered by dependencies or barriers (`DMB`, `LDAR/STLR` acquire/release, `LDAXR/STLXR`). Code with a data race that "works on x86" can break on Apple/Graviton. (ARMv8 acquire/release detail from general knowledge; UNVERIFIED here.)
- Compilers reorder too (independent of hardware).

**Fences / acquire-release.** Release store: earlier reads/writes can't move after it; acquire load: later ones can't move before it; producer `data=…; flag.Store(release)` ↔ consumer `if flag.Load(acquire) { use data }`. On x86 acquire/release loads/stores are plain `MOV` (TSO already gives it), seq_cst store needs `XCHG`/`MFENCE`; on ARM they're `LDAR/STLR`.

**Go: what's guaranteed.** Go memory model (local `/usr/local/go/doc/go_mem.html`, revised June 2022): DRF-SC — "data-race-free programs execute in a sequentially consistent manner"; sync ops (channels, mutex, `sync.Once`, WaitGroup, atomics) create *synchronized-before → happens-before*; **"All the atomic operations executed in a program behave as though executed in some sequentially consistent order"**, with "the same semantics as C++'s sequentially consistent atomics and Java's volatile". Go therefore offers **only seq-cst atomics** — no relaxed/acquire/release variants (unlike C++/Rust) — simple but on ARM each is a full-ish barrier. A racy program: reads of word-sized values observe *some* written value (no out-of-thin-air), but multiword values (strings, slices, interfaces) can tear; the implementation may terminate on detected races. Plain `bool` flag polling without sync may never terminate (compiler hoists the load).

**NUMA.** Multi-socket (or chiplet: AMD CCDs, Sapphire Rapids tiles with sub-NUMA clustering) machines attach memory controllers to each node. Access to local node memory ≈ 80 ns; remote (over UPI/Infinity Fabric) ≈ 1.5–2x, and cross-node bandwidth is lower and contended. Linux policy: pages are placed by **first touch** — the thread that first *writes* a page decides its node (default local policy; `numa_memory_policy.rst`), so a single init thread that zero-fills a 100 GB table places it all on node 0 while workers on node 1 all pay remote latency. Tools: `numactl --cpunodebind/--membind/--interleave`, `numastat`, `perf`. Automatic NUMA balancing migrates pages/threads, sometimes hurting tail latency. **Go runtime is not NUMA-aware:** Dmitry Vyukov's "NUMA-aware scheduler for Go" proposal (golang-dev, 2014–16) was never adopted — states the global free list/work-stealing aren't segregated by node; a recent issue (golang/go#78044 "runtime: degraded performance on multi-NUMA-node machines") reports ~2x memory-access penalty on node misses (found via WebSearch; issue body not fetched: UNVERIFIED). Workaround: run one process per node under `numactl`, or container/K8s CPU-manager+topology-manager (`static` policy, `single-numa-node`). Local container check: this VM has 1 node, so `numactl` effects were not measurable.

**SMT / hyperthreading, "a vCPU".** SMT gives each physical core 2 architectural threads sharing execution units, L1/L2, and store buffer/pipeline slots; it hides stalls (one thread runs while the other waits on memory) for ~10–30% throughput, but a busy sibling can slow you 30–40%, and two threads contending on the same core can *reduce* single-thread performance. **A cloud "vCPU" is usually one hardware thread** (AWS: "each vCPU is a thread of an Intel Xeon core except for [some] instance types", docs; a c6i.8xlarge has 32 vCPUs = 16 cores). So 4 vCPU = 2 cores on x86 AWS; `GOMAXPROCS=4` may mean 2 real cores' worth of throughput; latency-sensitive services disable SMT or request whole cores. Security: SMT enables cross-thread side channels (L1TF/MDS) → some clouds schedule VMs of one tenant per core. In this container `lscpu` says 1 thread/core, but that's the guest's (virtualized) topology, which need not reflect the host.

**Frequency/turbo/thermal & noisy neighbours.** Clock varies with load: single-core turbo (e.g. 3.5+ GHz) vs all-core lower; AVX-512/AMX heavy code may downclock (older Intel); thermal/power limits throttle; cloud burstable instances use credits. Neighbouring VMs share L3, memory bandwidth, SMT siblings and power budget → "noisy neighbour"; observable as **steal time** (`%st` in top, `/proc/stat` 8th field) and jittery benchmarks (my own runs vary ±10–30%). Benchmark practice: pin (`taskset`), repeat (`benchstat`), compare ratios, disable turbo if you control the host.

**SIMD & alignment (brief).** SSE/AVX/AVX-512/NEON process 16–64 B per instruction; requires contiguous data (slice-of-struct → struct-of-arrays). Go's compiler auto-vectorizes almost nothing; SIMD arrives via assembly in stdlib (`bytes.IndexByte`, `crypto`, `hash/crc32`, `math/bits` intrinsics) and, experimentally, `simd` package under `GOEXPERIMENT` in Go 1.26 (UNVERIFIED: I could not verify state; local go is 1.24.7). Alignment: natural alignment of a word never splits a cache line; a misaligned load spanning two lines costs 2x, and page-crossing worse; `sync/atomic` 64-bit ops on 32-bit platforms must be 8-byte aligned (typed `atomic.Int64` guarantees it).

## 2. Edge cases & gotchas

- **Padding to 64 isn't enough on arm64/ppc64:** Go uses 128 there. Why: 128-B lines (Apple) or adjacent-line prefetch; `golang.org/x/sys/cpu.CacheLinePad` picks per-GOARCH size.
- **Padding fixes false sharing but costs memory** — 56 extra bytes per counter; use only on proven-hot, per-P/per-goroutine structures; verify with a benchmark (here padded scaled ~5x better at 4 cores).
- **Sharded counters make reads expensive/inexact** (sum of shards, not atomic snapshot) — acceptable for metrics, not for limits.
- **`sync.Mutex` fast path is one CAS** (`internal/sync/mutex.go:63`), no syscall; the cost under contention is cache-line bouncing + parking (starvation mode after waiting >1 ms `starvationThresholdNs = 1e6`). 25 ns "mutex lock/unlock" from the Dean table matches order of magnitude of uncontended ~17–19 ns measured here.
- **`atomic.Load` on x86 is a plain MOV; `Store` is `XCHG`** — so "atomic reads are free, writes are ~20 cycles" on amd64, but both are barriers on ARM (LDAR/STLR).
- **x86 correctness masks bugs:** data races often pass on x86 (TSO) and fail on ARM (M1/Graviton). Always run `go test -race` and think in the Go memory model, not "x86 does what I expect".
- **`volatile`-style busy flag doesn't exist in Go:** `for !done {}` is UB-ish (races) — compiler may hoist. Use atomic/chan.
- **Benchmarks lie without controlling for dead-code elimination and cmov** (my sorted-branch case).
- **Bigger struct → fewer per line → more misses:** iterating a field over `[]struct{ big }` loads whole lines; SoA or hot/cold splitting helps (the 64 B node above = exactly 1 line per element).
- **Map/linked list/tree traversal = dependent loads** (pointer chasing) — why `container/list` is slow, why B-trees (wide nodes, few dependent hops) beat binary trees in memory.
- **TLB misses are the hidden cost of big working sets** (4 KiB pages; huge pages 2 MiB/1 GiB: THP `madvise/always`); a 64 MiB random walk misses the TLB every access.
- **Hyperthread siblings share L1/L2**: a noisy sibling evicts your data and takes execution ports, so latency is worse than "1 vCPU" suggests.
- **NUMA + GC:** Go GC worker threads run anywhere; heap pages first-touched by whichever thread; allocation-heavy service on a 2-socket box may see 30–100% remote access.
- **GOMAXPROCS > physical cores** (SMT counts) is normal but scaling stops at core count for CPU-bound code.
- **Atomic ops on a line owned by another core cost more than a mutex uncontended** — shows why "lock-free" ≠ "fast" under contention.

## 3. Common misconceptions

- "Cache = RAM speed-up for reads only." Writes participate too (write-allocate, RFO, dirty write-back, coherence invalidates).
- "Linked list insertion is O(1) so it's faster than slice insertion." For typical sizes, memmove of a slice (sequential, prefetched) beats chasing pointers; measured 3.7x–57x traversal gap.
- "Atomics are free / lock-free is always faster." Atomics are ≥20x a plain op even uncontended (measured ~20–28x) and *anti-scale* under contention; a striped counter beats one atomic.
- "False sharing only happens with adjacent int fields in structs." Also array elements, adjacent heap allocations from different goroutines (small allocs from the same size class are adjacent), struct + neighbour variable, mutex + protected data (some do want them on the same line).
- "x86 has strong memory ordering, so I don't need atomics." TSO still allows store→load reordering, and the *compiler* reorders; and code is ported to ARM.
- "Go atomics are acquire/release." They are sequentially consistent (stronger; Go memory model text).
- "A memory barrier flushes the cache." Barriers order operations (drain store buffer/order visibility); caches stay coherent via MESI independent of barriers.
- "Cache coherence means I don't need synchronization." Coherence gives one value per line; it doesn't order *multiple* variables or make read-modify-write atomic.
- "More cores/threads always speeds things up." Shared write lines, memory bandwidth, SMT and NUMA cap it.
- "Sorted data is faster because of caches." Sorting speeds the loop mostly via **branch prediction**, and in Go only when the branch isn't compiled to CMOV.
- "A vCPU is a core." Usually a hardware thread (SMT sibling) — half a core on x86 AWS.
- "Go is NUMA-aware / handles multi-socket." It isn't.
- "L1 is 0.5 ns" (2012 table). Modern L1 ≈ 1 ns (4–5 cycles), DRAM ≈ 80–100 ns; remote-socket ≈ 150 ns+.

## 4. Go tie-ins

- **Constants:** `internal/cpu.CacheLinePadSize` per GOARCH (verified table above); `x/sys/cpu.CacheLinePad`. The runtime pads hot per-P/global structures (e.g. `mheap.central [numSpanClasses]struct{ mcentral; pad [CacheLinePadSize - ...]byte }`, per-P `p` structs, `sched`/`timers`) — UNVERIFIED exact field names; grep `cpu.CacheLinePad` in `runtime/`.
- **Per-P design (GMP)** exists to avoid shared-line contention: per-P run queue, mcache, timers, `sync.Pool` per-P shards, `atomic` counters sharded (`runtime/metrics`), `sync.Mutex` spin only when multicore & GOMAXPROCS>1.
- **`sync/atomic`:** seq-cst; typed wrappers (Go 1.19) `atomic.Int64` etc.; `And/Or` (1.23). `atomic.Value`/`atomic.Pointer` for copy-on-write config (readers = plain MOV on x86).
- **`sync.Mutex`** state word CAS fast path, spins up to 4 times (`runtime_canSpin`) then parks; starvation mode after 1 ms; bank `sync-atomics-vs-mutex` says the same.
- **False sharing benchmark idiom:** `b.RunParallel` + per-goroutine slot; compare padded/unpadded (reproduced above). Use `benchstat` with `-count 10`; run with `-cpu 1,2,4,8` to see anti-scaling.
- **NUMA:** no runtime support; use `numactl` per process, or K8s topology manager; `GOMAXPROCS` doesn't bind to nodes; `runtime.LockOSThread` + `sched_setaffinity` (via `golang.org/x/sys/unix`) is the manual route.
- **Race detector** (`-race`) instruments plain accesses to find missing happens-before; it's the only reliable guard against "works on x86".
- **Data structures:** prefer `[]T` over `[]*T`/`list.List`; `slices.Sort` + binary search; open-addressing/Swiss maps (Go 1.24 `map` is a Swiss-table: cache-friendlier — UNVERIFIED in this session); struct field ordering (`fieldalignment`) for padding vs hot/cold split.
- **Profiling:** `perf stat -e cache-misses,branch-misses` and `pprof` don't show coherence traffic directly; `perf c2c` does (Linux) — not run here.

## 5. Illustration plan

### Scene A — "The memory staircase" (7 frames)
1. Core at top, five steps down: registers → L1 → L2 → L3 → DRAM → (other socket). Log-scaled bar per step (1, 4, 12–20, 80–100, 150+ ns) — scale it to "1 second per ns" as a human analogy (L1 1 s … DRAM ~ 1.5 min).
2. A load `x = a[i]` walks down until it hits; the line (64 B) rides back up and fills each level. Point: unit of transfer is the line.
3. Loop over `a[0..]`: next 7 ints hit in L1 (a "7 free hits per miss" counter).
4. **STOP:** stride 4096 — each access lands in the same cache set; the 12 ways fill, evictions flash (conflict misses) though cache is 95% empty.
5. Pointer-chase: each load's address hidden inside previous line → arrows show strictly serial waiting; prefetcher arrow blocked.
6. Slice: prefetcher lights ahead of loop; overlapping in-flight loads (MLP). Measured bars: slice 1x, ordered list 3.7x, shuffled list 57x.
7. Branch predictor aside: sorted vs unsorted (4x) with CMOV caveat in Go.

### Scene B — "MESI: what a write costs" (9 frames)
1. Two cores each with L1 + shared L3; line X (64 B) with two variables a,b.
2. Core 0 reads X: I→E. Core 1 reads X: both S.
3. Core 0 writes a: sends invalidate; Core 1's copy → I; Core 0 → M. Point: write to S costs a round trip.
4. Core 1 reads b (a different variable): miss, pulls line from Core 0 (M→S both) — false sharing begins.
5. Loop the ping-pong, with timeline showing each core mostly *waiting*. **STOP:** "different variables, no shared data — why slow?"
6. Pad to separate lines: each core keeps its own line in M, no traffic. Measured 4.5x faster at 4 cores.
7. Shared atomic counter: line "hot potato" passes among 4 cores; per-op cost rises with cores (10→19→23 ns).
8. `LOCK XADD` closeup: must hold line M + drain store buffer.
9. Mutex on the same line as data: one line, two roles; contended lock/unlock 66 ns vs 19.

### Scene C — "Store buffer: the only reordering x86 allows" (8 frames)
1. Two cores, each with a store buffer between core and L1. T1: `x=1; r1=y`; T2: `y=1; r2=x`.
2. T1 executes `x=1` → sits in T1's store buffer (not visible to T2). 
3. T1 executes `r1=y` reads L1: 0 (early).
4. Same in T2: both read 0 while both stores pending. **STOP:** "r1=r2=0 — is that a bug in the CPU?" No: store→load reordering, legal on x86-TSO.
5. Buffers drain later; both writes become visible.
6. Add fence (`MFENCE`/`LOCK` op/seq-cst atomic): drain first → outcome 0,0 impossible.
7. ARM: extra arrows show load-load and store-store reordering too; message-passing bug (`data`, `flag`) shows flag visible before data.
8. Go rule of thumb card: "Race-free ⇒ sequentially consistent; atomics are seq-cst; anything else: don't reason about hardware."

### Scene D — "NUMA and vCPUs" (6 frames)
1. Two sockets, each with its own DRAM; UPI link between; local 80 ns vs remote ~140 ns.
2. First-touch: init thread on node 0 zero-fills table → all pages in node 0's DRAM.
3. Workers on node 1 read them across the link (bandwidth-limited). **STOP:** "why 2x slower on a bigger machine?"
4. Go runtime: goroutines migrate between Ps/threads freely; heap not partitioned → no locality (not NUMA-aware).
5. Fix: one process per node with `numactl`, or interleave.
6. vCPU = hyperthread: 4 vCPU drawn as 2 cores x 2 threads sharing execution ports; noisy neighbour + frequency dial.

## 6. Existing interview questions

- `sync-atomics-vs-mutex` — accurate: says atomics are seq-cst, mutex uncontended = one CAS, "cache-line bouncing" mention. Misses quantified costs, per-P sharding, ARM vs x86 differences.
- `goroutines-scheduler-gomaxprocs` / `-1-threads` — CPU count semantics; add SMT/vCPU point (a vCPU is a hyperthread), not covered.
- `goroutines-scheduler-gomaxprocs-kubernetes` — cgroup CPU limit vs cores (covered in os-containers).
- Existing site topics: `src/topics/memorylayout` (padding, false sharing) and `src/topics/memorymodel` (happens-before). No bank question found for: cache hierarchy latency, cache lines, prefetching/pointer chasing, branch prediction, MESI, NUMA, x86-TSO vs ARM, SMT → **gaps**. (Bank grep for cache terms only returned application-cache questions.)

## 7. Sources

- Latency numbers (Dean/Norvig): https://gist.github.com/hellerbarde/2843375 (WebFetch 2026-09-29: L1 0.5 ns, branch mispredict 5 ns, L2 7 ns, mutex 25 ns, memory 100 ns…). Original talk: Jeff Dean, 2010 (via WebSearch listing; Colin Scott's updated trends page https://colin-scott.github.io/blog/2012/12/24/latency-trends/ not fetched). Dated hardware (2012): use for ratios.
- NUMA latency: Intel Community thread "Cross NUMA Latency in Xeon Skylake Gold" (local 80 ns, remote 138 ns; **numbers taken from WebSearch summary; page blocked**) and Intel VTune NUMA cookbook (not fetched); "crossing sockets adds ~92 ns" secondary snippet. Treat as UNVERIFIED-second-hand; cross-check with `numactl --hardware` distances on real hardware.
- x86-TSO: Sewell, Sarkar, Owens, Zappa Nardelli, Myreen, "x86-TSO: A Rigorous and Usable Programmer's Model for x86 Multiprocessors", CACM 53(7), 2010; https://www.cl.cam.ac.uk/~pes20/weakmemory/x86tso-paper.tphols.pdf (located via WebSearch; contents not fetched — the "only store→load" summary is standard and matches the abstract's write-buffer model).
- Go memory model: `/usr/local/go/doc/go_mem.html` (local, quotes on DRF-SC and "atomic operations … some sequentially consistent order … same semantics as C++'s sequentially consistent atomics and Java's volatile", lines ~54–62, 598–610); also mirrors https://raw.githubusercontent.com/golang/go/master/doc/go_mem.html.
- Go source (local go1.24.7): `internal/cpu/cpu_{x86,arm64,ppc64x,...}.go` (`CacheLinePadSize`), `internal/sync/mutex.go` (CAS fast path, `starvationThresholdNs = 1e6`).
- NUMA policy: https://raw.githubusercontent.com/torvalds/linux/master/Documentation/admin-guide/mm/numa_memory_policy.rst (default local/first-touch semantics; fetched, skimmed). Go NUMA: Vyukov "NUMA-aware scheduler for Go" (golang-dev, https://groups.google.com/g/golang-dev/c/URgnGRzo4HA, via WebSearch summary: global free list and stealing aren't node-aware) and golang/go#78044 (title only, UNVERIFIED body).
- Apple 128-B lines: WebSearch summaries (Wikipedia/7-cpu/HN); Go `arm64` `CacheLinePadSize = 128` is verified locally. Intel adjacent-line prefetch pairing: UNVERIFIED.
- vCPU = hyperthread: AWS EC2 CPU options docs https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-specify-cpu-options.html and AWS Compute blog on disabling HT (via WebSearch summary; not fetched).
- Experiments (this container, 4 vCPU Xeon @2.1 GHz KVM, go1.24.7): `/tmp/research/hw-cpu/{b_test.go,br_test.go}`; raw numbers in the tables above (repeatable: `go test -bench . -cpu 1,2,4`). Not measured: cross-socket latency, real L1/L2 sizes visible to the guest (lscpu says 48 KiB/2 MiB per core), `perf c2c`, ARM behaviour, SMT sibling effects. UNVERIFIED items flagged inline (MOESI/MESIF vendor details, ARM acquire/release, Go 1.26 SIMD, Swiss map internals).
