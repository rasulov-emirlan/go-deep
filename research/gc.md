# Go Garbage Collector — research notes (Go 1.26)

Verified against the local toolchain: `go1.26.4 linux/amd64`, source at `/usr/local/go/src/runtime`.
Line numbers are from that tree (they drift between releases, so use them as hints, not anchors).
Web sources are listed at the bottom as [S1]…[S12].

---

## 0. TL;DR (what a senior should be able to say in 30 s)

- **Concurrent, tri-color, mark-sweep. Precise (type-accurate). Non-generational. Non-moving/non-compacting.** The header comment of `runtime/mgc.go` says: "concurrent mark and sweep that uses a write barrier. It is non-generational and non-compacting."
- There are **two short STW pauses per cycle**: sweep termination (turn on the write barrier) and mark termination. Everything else runs concurrently: stack scanning (one goroutine at a time), marking and sweeping.
- **Hybrid write barrier** (Yuasa deletion + Dijkstra insertion, Go 1.8). Because of it, stacks are scanned once and **never re-scanned**. It is enabled only during mark.
- The **pacer** targets `heap_goal = live + (live + stacks + globals) * GOGC/100`. The background workers use a fixed **25%** of GOMAXPROCS. **Mark assists** make allocating goroutines pay their share.
- **GOMEMLIMIT** (Go 1.19) is a *soft* limit on `Sys - HeapReleased`. The **GC CPU limiter** caps GC at about **50% CPU** over a `2*GOMAXPROCS` CPU-second window, so a limit set too low slows you down instead of sending you into a death spiral.
- **Green Tea GC**: experiment in 1.25 and **default in 1.26** (opt out with `GOEXPERIMENT=nogreenteagc`, which is expected to be removed in 1.27). It scans **spans instead of objects** for small objects (16–512 B, one-page spans). Work is queued FIFO per span and uses two bitmaps, "marks" (seen) and "scans" (scanned). Reported gain: **10–40% less GC CPU**, plus about 10% more with AVX-512 on Ice Lake / Zen 4 or newer.

---

## 1. Algorithm & phases

### 1.1 Tri-color abstraction
- **White**: not yet reached; collected at the end of mark. **Grey**: reached but its pointers have not been scanned (it is on a work queue). **Black**: reached and scanned.
- Invariant to protect: **no black object may point to a white object** that isn't also reachable from some grey object. This is the *weak tri-color invariant*: every white object pointed to by a black one is "grey-protected".
- In the runtime, "grey" = mark bit set **and** the object is on a work queue (`gcWork`, `mgcwork.go`). "Black" = mark bit set and already dequeued and scanned. There is no explicit color field. `greyobject` (`mgcmark.go:1639`) sets the mark bit and enqueues. `shade` (`mgcmark.go:1623`) is the barrier's entry point.
- With Green Tea, small objects get an explicit second bit: `marks` ≈ grey-or-black and `scans` = black (see §6).

### 1.2 The cycle (from `mgc.go` header comment + functions)
| # | Phase | `gcphase` | STW? | What happens | Code |
|---|---|---|---|---|---|
| 1 | **Sweep termination** | `_GCoff` | **STW** | Stop the world. Finish sweeping any unswept spans (only happens if this GC was forced early). | `gcStart` `mgc.go:733` |
| 2a | **Mark setup** | → `_GCmark` | STW (same pause) | Enable the write barrier and assists, enqueue root jobs. "No objects may be scanned until all Ps have enabled the write barrier, which is accomplished using STW." | `setGCPhase` `mgc.go:257` |
| 2b | **Concurrent mark** | `_GCmark` | no | Start the world. Background mark workers + assists drain the grey queues. Roots are scanned: stacks (one goroutine paused at a time), globals (data/bss), finalizer/special roots. New allocations are **allocated black** (`gcmarknewobject`, `mgcmark.go:1748`). | `gcBgMarkWorker` `mgc.go:1750`, `markroot` `mgcmark.go:221`, `scanstack` `mgcmark.go:904`, `gcDrain` `mgcmark.go:1239` |
| 2c | Termination detection | | no | Distributed termination: no root jobs left and no grey objects in any local cache. Uses ragged barriers to flush per-P write-barrier buffers and gcWork. | `gcMarkDone` `mgc.go:1015` |
| 3 | **Mark termination** | `_GCmarktermination` | **STW** | Disable workers and assists, flush mcaches, housekeeping, compute stats, run `gcController.endCycle`. | `gcMarkTermination` `mgc.go:1344` |
| 4 | **Sweep** | → `_GCoff` | no (after STW) | Disable the write barrier and start the world. From here, new objects are white. Spans are swept lazily (an allocator sweeps a span before using it) and by the background `bgsweep` goroutine (`mgcsweep.go:272`), `sweepLocked.sweep` (`mgcsweep.go:505`). | `gcSweep` `mgc.go:2049` |

- **Sweeping ≠ marking**. Sweep swaps the span's `gcmarkBits` into `allocBits`, frees spans that became empty, and queues finalizers and cleanups. The finalizer goroutine only starts once all spans are swept.
- **Triggers** (`gcTriggerKind`, `mgc.go:~687`):
  - `gcTriggerHeap`: `heapLive` reaches the trigger.
  - `gcTriggerTime`: forced every **2 minutes** (`forcegcperiod = 2*60*1e9`, `proc.go:6476`) by sysmon/forcegc.
  - `gcTriggerCycle`: `runtime.GC()` (`mgc.go:522`), which blocks until a full cycle *and* sweep complete.
- **Oblets**: objects larger than `maxObletBytes = 128 KiB` (`mgcmark.go:35`) are scanned in 128 KiB chunks for parallelism and bounded latency (`scanObject`).

### 1.3 Why pauses are short and independent of heap size
- The STW phases do O(#P) work (flip flags, flush caches). They do **not** scan the heap or all stacks.
- Stack scanning is per-goroutine and concurrent: the goroutine is suspended at a safe point, its stack is scanned, and it resumes. Async preemption (1.14) means tight loops no longer delay the pause.
- Historical pauses (Hudson, ISMM 2018 [S5]): 300–400 ms (pre-1.5) → 30–40 ms (Aug 2015, 1.5) → 4–5 ms (Feb 2016) → sub-10 ms consistently (Aug 2016) → sub-ms (Mar 2017, 1.8 hybrid barrier) → 100–200 µs typical. The 2018 SLO was ≤500 µs STW per cycle and 25% CPU during GC.

---

## 2. Write barrier (`mbarrier.go`, `mwbbuf.go`)

Pseudocode, verbatim from the `mbarrier.go` header:
```
writePointer(slot, ptr):
    shade(*slot)                 // Yuasa deletion: shade the OLD referent
    if current stack is grey:
        shade(ptr)               // Dijkstra insertion: shade the NEW referent
    *slot = ptr
```
- **Deletion part** (`shade(*slot)`) stops a mutator from hiding an object by moving its only pointer from the heap to its own stack. Unlinking it from the heap shades it.
- **Insertion part** (`shade(ptr)`) stops hiding by moving the only pointer from a not-yet-scanned (grey) stack into a black heap object.
- Once a goroutine's stack has been scanned (it is black), the insertion part is no longer needed: "Immediately after a stack is scanned, it only points to shaded objects." In practice the implementation **shades both unconditionally**. The comment in mgc.go says "The write barrier shades both the overwritten pointer and the new pointer value". Checking stack color is not worth it, and making the barrier conditional on the slot's color would cost too much in memory ordering ("cost ... seems prohibitive").
- **Why stacks aren't re-scanned (Go 1.8, proposal 17503 "eliminate STW stack re-scanning")**:
  - Before 1.8, Go used a pure Dijkstra insertion barrier *on heap writes only*. Stack writes had no barrier because barriers there would be too expensive. So a stack could gain pointers to white objects after it was scanned, and mark termination had to **re-scan every stack under STW**. That rescan was the dominant pause (tens of ms with many goroutines).
  - The hybrid barrier's deletion half catches every pointer that "leaves" the heap. Together with allocate-black, a scanned stack stays black. Result: no rescan, and pauses dropped to under 1 ms.
- **Stack writes never have barriers**. Only heap and global pointer writes do. This is also why escape analysis helps GC twice: stack objects need neither scanning-as-heap nor barriers.
- **When is it on?** Only while `gcphase` is `_GCmark` or `_GCmarktermination` (`writeBarrier.enabled`). During `_GCoff`, every pointer write costs one predictable branch on a global flag.
- **Implementation**: the compiler emits `if writeBarrier.enabled { gcWriteBarrierN(...) }` around pointer stores. The fast path appends (old, new) pairs into a **per-P write-barrier buffer** (`p.wbBuf`, `mwbbuf.go`). `wbBufFlush` (`mwbbuf.go:166`) greys them in bulk. Bulk copies such as `typedmemmove` (`mbarrier.go:150`), `bulkBarrierPreWrite` (`mbitmap.go:388`), `copy()` and `append` apply the barrier per pointer slot.
- **Pointer-free (noscan) types**: stores of non-pointer data never need barriers, and the GC never scans such objects.

---

## 3. Pacer, GOGC, assists, workers (`mgcpacer.go`)

### 3.1 Heap goal
`commit()` (`mgcpacer.go:1276`):
```go
gcPercentHeapGoal = heapMarked + (heapMarked + lastStackScan + globalsScan) * GOGC / 100
if gcPercentHeapGoal < heapMinimum { gcPercentHeapGoal = heapMinimum }   // 4 MiB * GOGC/100
```
- The gc-guide [S3] states it as: **Target heap = Live heap + (Live heap + GC roots) × GOGC/100**. Roots (stacks + globals) have been counted **since Go 1.18**. Before that it was `live*(1+GOGC/100)`.
- `heapMinimum = defaultHeapMinimum * GOGC/100` with `defaultHeapMinimum = 4 MiB` (512 KiB only under `GOEXPERIMENT=heapminimum512kib`, `mgcpacer.go:59`, `setGCPercent` `:1345`). This is why tiny programs show `4 MB goal`.
- `GOGC=off` (or `debug.SetGCPercent(-1)`) makes `gcPercentHeapGoal = ^uint64(0)`, so only the memory limit can trigger GC.
- Effective goal = `min(gcPercentGoal, memoryLimitHeapGoal())` (`heapGoalInternal`, `:1002`). There is also a minimum sweep-distance adjustment and a 64 KiB minimum runway.
- Rule of thumb [S3]: **doubling GOGC roughly doubles heap overhead and halves GC CPU.**

### 3.2 Trigger (when the cycle *starts*)
- A cycle must start **before** the heap reaches the goal, because marking runs concurrently while the mutator keeps allocating. **Runway** = `consMark * (1-u)/u * (lastHeapScan + stackScan + globalsScan)` with u = 0.25 (`commit`, `:1329`). `consMark` is the measured allocation-rate / scan-rate ratio (the "cons/mark" ratio, Go 1.18 pacer redesign, proposal 44167).
- The trigger is clamped between **~0.7** and **~0.95** of the way from `heapMarked` to the goal: `minTriggerRatioNum=45/64`, `maxTriggerRatioNum=61/64` (`:1170–1180`, `trigger()` `:1190`).

### 3.3 CPU budget: dedicated / fractional / idle workers
- `gcBackgroundUtilization = 0.25` (`:39`), and `gcGoalUtilization` equals it.
- In `startCycle` (`:386`): `dedicated = round(GOMAXPROCS*0.25)`. If rounding is off by more than 30% (GOMAXPROCS ≤ 3 or = 6), the remainder runs as a **fractional** worker, a P that does GC for a fraction of its time.
- Worker modes: **dedicated** (runs until preempted and doesn't yield to goroutines), **fractional** (time-sliced), and **idle** (uses otherwise idle Ps; its CPU is "free" and shows as the third CPU number in gctrace).
- Example: GOMAXPROCS=8 → 2 dedicated workers.

### 3.4 Mark assists
- If the mutator allocates faster than the workers mark, a goroutine that allocates during mark goes into **debt** (`gp.gcAssistBytes`). `deductAssistCredit` (`malloc.go:1847`) → `gcAssistAlloc` (`mgcmark.go:499`) makes it **do scan work proportional to its allocation** before its `mallocgc` returns. The ratio is `assistWorkPerByte`, recalculated in `revise()` (`:492`).
- Background workers deposit credit that assisting goroutines can steal (`gcFlushBgCredit`), and an assist over-pays by `gcOverAssistWork = 64 KiB`.
- Assists are **the latency cost you actually feel**: allocation-heavy request paths slow down during GC. They show as the first mark-CPU term in gctrace.
- Assists are skipped while the CPU limiter is active (`if gcCPULimiter.limiting()` at `mgcmark.go:534`).

### 3.5 GOMEMLIMIT (Go 1.19, proposal 48409)
- `GOMEMLIMIT=…B/KiB/MiB/GiB/TiB` or `debug.SetMemoryLimit`. Default is `math.MaxInt64` (effectively off).
- What it counts: **`runtime.MemStats.Sys - HeapReleased`** = all memory the Go runtime has mapped and not returned: heap, stacks, runtime metadata, fragmentation. It does **not** count cgo/C allocations, mmap done by the program, or the binary's text. That is why the guide advises **5–10% headroom** [S3].
- `memoryLimitHeapGoal()` (`mgcpacer.go:1048`): `goal = limit - (nonHeapMemory + overage)`, minus headroom `max(3%, 1 MiB)` (`memoryLimitHeapGoalHeadroomPercent=3`, `memoryLimitMinHeapGoalHeadroom=1<<20`), and never below `heapMarked`.
- It is **soft**: if the live heap alone exceeds the limit, the GC can't do anything. It would collect continuously, and the CPU limiter stops that.
- **GOGC=off + GOMEMLIMIT=X**: "maximization of resource economy … the minimum GC frequency required to maintain some memory limit" [S3]. Right for a container with a known, dedicated memory budget and a live heap well below it. Wrong for CLI tools, desktop apps, or programs already near their limit, where it trades an OOM for severe slowdown [S3].

### 3.6 GC CPU limiter (`mgclimit.go`, Go 1.19)
- A leaky bucket that **fills with GC CPU time and drains with mutator time**. Because it is unweighted, the effective cap is **50%**. Capacity is `GOMAXPROCS × 1 s` (`capacityPerProc = 1e9`, `:313`). The guide describes this as "roughly 50%, with a 2 * GOMAXPROCS CPU-second window". It updates every 10 ms (`gcCPULimiterUpdatePeriod`).
- The bucket never goes negative, so an idle day can't bank credit for tomorrow's spiral.
- When limiting: **assists are disabled** (`mgcmark.go:534`, `gcDrainN` loop `:1404`) and the memory-limit scavenger path backs off (`mheap.go:1330,1379`). The program then exceeds the limit (memory grows) instead of stalling. Observable via `/gc/limiter/last-enabled:gc-cycle` in `runtime/metrics`.
- **Death spiral**: live heap ≈ limit → goal ≈ live → GC runs back-to-back → CPU goes entirely to GC, which slows request completion, which raises in-flight memory, and it gets worse. The limiter breaks the loop. With `GOGC=off` the risk is bigger because there's no GOGC-based ceiling on frequency either.

---

## 4. Allocator (`malloc.go`, `mcache.go`, `mcentral.go`, `mheap.go`, `internal/runtime/gc/sizeclasses.go`)

TCMalloc-derived, three levels, **size-segregated**. Size segregation is what makes a non-moving collector livable: fragmentation is bounded by size-class waste, not by arbitrary holes.

- **Page** = 8 KiB (`PageShift=13`). **Span** (`mspan`) = a run of pages holding objects of a single **span class**. Span class = size class × {scan, noscan}, giving 68×2 = 136 classes.
- **Size classes**: `NumSizeClasses=68` (class 0 = large), 8 B … `MaxSmallSize=32768`. Objects over 32 KiB are **large objects** that get their own span straight from mheap (`mallocgcLarge`, `malloc.go:1687`). The table in `sizeclasses.go` lists bytes/obj, bytes/span, objects, tail waste and max waste. For example class 1 = 8 B × 1024/span, class 26 = 512 B, class 67 = 32 KiB.
- **mcache** (per-P, lock-free): one cached span per span class. `mallocgc` (`malloc.go:1067`) bump-allocates from `allocCache` bits. When the span is full, `mcache.refill` (`mcache.go:160`) → `mcentral.cacheSpan` (`mcentral.go:82`).
- **mcentral** (one per span class): partial/full span sets, swept/unswept (`mspanset.go`). Grabbing an unswept span means **sweeping it first** (lazy sweep).
- **mheap** (global, locked): page allocator (radix-tree bitmap `mpagealloc.go`), arenas of 64 MiB on 64-bit, `mheap.alloc` (`mheap.go:1006`), `grow` (`:1553`) maps from the OS.
- **Allocation paths in 1.26** (`malloc.go`): `mallocgcTiny` (`:1202`), `mallocgcSmallNoscan` (`:1358`), `mallocgcSmallScanNoHeader` (`:1503`, ≤512 B, pointer bitmap stored at the **end of the span**), `mallocgcSmallScanHeader` (`:1594`, >512 B, 8-byte **malloc header** with the type pointer, Go 1.22), `mallocgcLarge`.
- **Tiny allocator**: `TinySize = 16`. It packs several **pointer-free** allocations under 16 B (small strings, escaping ints) into one 16-byte block per P (`c.tiny`, `c.tinyoffset`). The whole block stays alive while any sub-object is alive, which is a small but real "leak". Finalizers on tiny objects are unreliable (the doc says so).
- **noscan spans**: objects whose type has no pointers go into noscan span classes. The GC marks them but never scans them. Green Tea fast-tracks them: `tryDeferToSpanScan` sets the mark and returns without queuing. Senior takeaway: **`[]int64`, `[]byte`, structs of scalars are almost free to trace; `[]*T`, `map[string]*T`, `[]string` (strings contain pointers!) are not.** Replacing pointers with indices is a real GC optimization.
- Mark bits live out-of-line in `gcmarkBits` per span (swapped with `allocBits` at sweep). Under Green Tea, spans of 16–512 B objects keep them **inline** at the end of the span (§6).

---

## 5. Returning memory: scavenger (`mgcscavenge.go`)

- **Two scavengers**:
  1. **Background** `bgscavenge`: a goroutine soft-capped at `scavengePercent = 1%` of one CPU.
  2. **Synchronous**: runs at allocation time when the heap grows or an allocation would exceed the memory limit.
- **Goal without a limit**: RSS ≈ `(100+retainExtraPercent)/100 * (heapGoal/lastHeapGoal) * lastHeapInUse`, with `retainExtraPercent = 10`. **With a limit**: `(100 - reduceExtraPercent)/100 * memoryLimit`, with `reduceExtraPercent = 5` (95%).
- Released with `madvise(MADV_DONTNEED)` on Linux (the default since 1.16; `GODEBUG=madvdontneed=0` switches to MADV_FREE). Densely used chunks are skipped for one GC cycle to protect huge pages.
- `debug.FreeOSMemory()` forces a GC and a full scavenge.
- **Interview trap**: after freeing, RSS may not drop immediately, and `HeapIdle - HeapReleased` is retained on purpose. Watch `/memory/classes/heap/released:bytes`.

---

## 6. Green Tea GC (`mgcmark_greenteagc.go`, `internal/runtime/gc/scan/`)

### 6.1 Status by version (verified)
| Version | Status |
|---|---|
| Go 1.25 (Aug 2025) | Experiment, `GOEXPERIMENT=greenteagc`, no vector acceleration. "Expected 10–40% reduction in GC overhead" [S7]. Feedback issue #73581. |
| **Go 1.26 (Feb 2026)** | **Default**. `internal/buildcfg/exp.go:88` baseline has `GreenTeaGC: true`. Opt out with `GOEXPERIMENT=nogreenteagc` (build time), "expected to be removed in Go 1.27". AVX-512 span scanning on "Intel Ice Lake or AMD Zen 4 and newer" gives about another 10% [S6]. |
| Go 1.27 | Opt-out expected to be removed [S6]. |
- The old object-queue algorithm still exists as `mgcmark_nogreenteagc.go` behind `//go:build !goexperiment.greenteagc`.

### 6.2 Why: the graph-flood problem
- A classic mark phase is a **graph flood**. It pops an object pointer from a LIFO stack, reads its type/pointer bitmap, loads each pointee's span metadata and mark bits, and pushes the pointees. Consecutive pops jump all over the heap, so almost every step is a cache/TLB miss with no spatial locality, and the prefetcher can't help.
- Blog [S1]: **"at least 35%"** of mark time is spent stalled on memory. The trends make it worse: more cores sharing bandwidth, NUMA, and wide vector units sitting idle. Issue [S2]: cache misses were cut roughly in half in microbenchmarks.

### 6.3 How it works (code-accurate)
- **Scope**: `gcUsesSpanInlineMarkBits(size) = heapBitsInSpan(size) && size >= 16` (`mgcmark_greenteagc.go:258`). `heapBitsInSpan` means `size <= MinSizeForMallocHeader = PtrSize*PtrBits` = **512 B on 64-bit**. So Green Tea span scanning applies to **size classes 16 B … 512 B** (classes 2–26). All of them are single-page (8 KiB) spans. 8 B objects, objects over 512 B (header objects) and large objects still use the classic per-object path (`scanObject`, `:1187`, with oblets).
- **Inline metadata at the end of each 8 KiB span**, `spanInlineMarkBits` (`:67`), 128 B:
  ```go
  type spanInlineMarkBits struct {
      scans [63]uint8         // "scanned" bits (≈ black)
      owned spanScanOwnership // unowned / oneMark / manyMark
      marks [63]uint8         // "marks" = "seen" bits (grey-or-black)
      class spanClass
  }
  ```
  The blog calls these the **seen** and **scanned** bits. Issue #73581 calls them gray/black bits. Locating the span from a pointer is plain arithmetic: `alignDown(p, 8KiB)` + fixed offset (`spanInlineMarkBitsFromBase`). No `mspan` lookup is needed. A per-arena bitmap `pageUseSpanInlineMarkBits` says whether a page uses this layout.
- **Shade (discover a pointer)**: `tryDeferToSpanScan(p, gcw)` (`:264`):
  1. Compute the object index with the size-class div magic, then atomically set its `marks` bit (return if it was already set).
  2. If the span is noscan, count bytes marked and stop. There is nothing to scan.
  3. Otherwise `imb.tryAcquire()`: the first discoverer of an unqueued span moves `owned` to `spanScanOneMark` and **enqueues the span** (`gcw.spanq.put(makeObjPtr(base, objIndex))`). The enqueued `objptr` packs span base + a **representative object index**. Later discoverers just set their mark bit and bump `owned` to `ManyMark`, and **do not enqueue again**. The span "accumulates" work while it waits.
- **Queue policy**: per-P `spanQueue` of spans, **FIFO** (the classic `workbuf` is LIFO). FIFO "turned out to accumulate the highest average density of objects to scan on a span by the time it was dequeued" [S2]. Spill-over goes into SPMC ring buffers (`spanSPMC`) that other Ps steal from (`steal`, `tryStealSpan` `:797`, `work.spanqMask`). A span can be queued many times per cycle.
- **Scan a span**: `scanSpan(p, gcw)` (`:844`):
  1. `imb.release()`. If ownership was only `OneMark`, nobody else marked anything while it was queued, so **fast path**: scan just the representative object (`scanObjectSmall`). This is the single-object optimization that limits regressions on sparse graphs.
  2. Otherwise `spanSetScans` (`:936`) works word-at-a-time: `toGrey = marks &^ scans`, then `scans |= toGrey` atomically. The result is the set of objects that are marked but not yet scanned, so precision is preserved.
  3. **Density check**: if fewer than `nelems/8` objects are ready (or there is no SIMD), use `scanObjectsSmall`, a per-object loop over the span with prefetch. If dense enough and AVX-512 is present, use **`scan.ScanSpanPacked`**. It takes the object mask and the span's pointer bitmap and emits all non-nil pointer values from the whole span in one vectorized pass (`internal/runtime/gc/scan/scan_amd64.s`, `FilterNilAVX512`).
  4. Each discovered pointer goes back through `tryDeferToSpanScan`, or falls back to `greyobject` for non-Green-Tea spans.
- **SIMD requirements** (`scan_amd64.go:37`): AVX512VL + AVX512BW + GFNI + AVX512BITALG + AVX512VBMI. Everywhere else (arm64, older x86) `HasFastScanSpanPacked()` returns false and the non-SIMD span loop is used (`scan_generic.go`: the generic packed scan "isn't actually fast enough").
- **Allocate-black under Green Tea**: `gcmarknewobject` sets both the mark **and** the scanned bit for inline-bit spans (`mgcmark.go:1748`).

### 6.4 Results & caveats
- **10–40% lower GC CPU**, typically around 10% [S1][S6]. About 10% more with vector scanning. Microbenchmarks showed 10–50% [S2], and the gains grow with core count. Tile38 saw about **35% less GC overhead** [S2]. Google's internal rollout matched [S1].
- **Regressions**: workloads where each dequeued span has only one object to scan: low fan-out, deep, frequently mutated trees. The `bleve-index` benchmark regressed on some machines [S2]. The blog [S1]: it pays off with as little as "2% of a page at a time", and the one-object fast path cuts the losses.
- **Where it doesn't help**: pointer-free heaps (already noscan), heaps dominated by objects over 512 B or large objects, and apps where GC isn't a meaningful share of CPU.
- **Debug**: `GODEBUG=gctrace=2` prints per-size-class scan stats after each trace line (`dumpScanStats`, `:1115`):
  `scan: class 64B 55+2+0=57 objs, 1+0=1 spans`. The object counts are *sparse-single-object + span-sparse + span-dense(SIMD)*. The span counts are *sparse + dense*.

---

## 7. `GODEBUG=gctrace=1`, field by field

Real output captured on this box (1.26.4, 8 P):
```
gc 3 @0.008s 25%: 0.046+0.35+2.5 ms clock, 0.37+0.043/0.12/0+20 ms cpu, 3->3->0 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 8 P
```
Printed in `gcMarkTermination` (`mgc.go:1572–1617`):
| Field | Meaning | Source |
|---|---|---|
| `gc 3` | GC cycle number | `memstats.numgc` |
| `@0.008s` | wall time since program start, at sweep termination | `work.tSweepTerm - runtimeInitTime` |
| `25%` | % of **total CPU since program start** spent in GC (cumulative, not this cycle) | `gc_cpu_fraction` |
| `A+B+C ms clock` | wall time: **A** = sweep-termination STW, **B** = concurrent mark, **C** = mark-termination STW | `tMark-tSweepTerm`, `tMarkTerm-tMark`, `tEnd-tMarkTerm` |
| `a+b/c/d+e ms cpu` | CPU time: **a** = STW sweep-term (A×procs); **b** = mark **assist** time; **c** = **dedicated + fractional** background workers; **d** = **idle** workers; **e** = STW mark-term (C×procs) | `assistTime`, `dedicatedMarkTime+fractionalMarkTime`, `idleMarkTime` |
| `X->Y->Z MB` | **X** = heap live at GC start (≈ the trigger point); **Y** = heap at end of mark (X + allocation during mark); **Z** = **marked live heap** (the base for the next goal) | `heap0`, `heap1`, `heap2=bytesMarked` |
| `4 MB goal` | the heap goal for *this* cycle. `Y > goal` means the pacer overshot | `lastHeapGoal` |
| `0 MB stacks` | scannable stack bytes (feeds the goal formula) | `lastStackScan` |
| `0 MB globals` | scannable globals | `globalsScan` |
| `8 P` | GOMAXPROCS during the cycle | `work.maxprocs` |
| `(forced)` | suffix when triggered by `runtime.GC()` | `work.userForced` |
| `(checking for goroutine leaks)` | 1.26: suffix when the cycle is doing goroutine-leak detection | `goroutineLeakDone` |

What to look for:
- **b ≫ c**: assists dominate, so the mutator is paying. The heap is growing fast relative to GOGC.
- **Y > goal**: overshoot.
- **% creeping up**: GC is eating throughput.
- **Z ≈ goal**: memory-limit pressure or a death-spiral pattern.
- `gctrace=2` adds the Green Tea scan stats (§6.4). `GODEBUG=gcpacertrace=1` prints the pacer's internals.

---

## 8. Finalizers, cleanups, weak pointers

- **`runtime.SetFinalizer`** (`mfinal.go:432`):
  - Runs once on a single finalizer goroutine, after the object is found unreachable. The object is **resurrected** for the finalizer, so it takes **≥2 GC cycles** to free.
  - Objects in **cycles with a finalizer may never be collected**.
  - Order is only guaranteed along dependencies. A finalizer is not guaranteed to run before exit. Don't set one on tiny-allocator objects or on sub-objects of other allocations.
- **`runtime.AddCleanup(ptr, fn, arg)`** (Go 1.24, `mcleanup.go:76`), the recommended replacement:
  - Several cleanups per object are allowed. It works on interior pointers and **doesn't resurrect** (the cleanup gets `arg`, not `ptr`), so the object is freed in one cycle and cycles are fine.
  - **If `ptr` is reachable from `fn` or `arg`, it's never collected**, and it panics if `arg == ptr` [S8].
  - No ordering guarantee. Since 1.25 cleanups run **concurrently and in parallel** [S7].
  - `GODEBUG=checkfinalizers=1` (1.25) reports finalizer/cleanup queue lengths.
- **Weak pointers**: `weak.Make(p) weak.Pointer[T]`, `.Value()` returns nil once collected (Go 1.24).
  - Implemented as a `_KindSpecialWeakHandle` special (`mheap.go:1953`): an indirection cell cleared by the sweeper.
  - Used by `unique` (1.23) for interning and for weak caches. Pair them with `AddCleanup` to evict map entries.
  - Because the GC is non-moving, weak pointers compare stably.
- Implementation: finalizers, cleanups, weak handles, profile records and pins are all **specials**, per-span linked records processed at sweep. `markrootSpans` (`mgcmark.go:393`) marks what finalizers reference.

---

## 9. Escape analysis (stack vs heap)

- The compiler decides whether a value can live in the goroutine's stack frame, which is freed on return with no GC work, no barriers, and no scanning-as-heap. It goes to the heap if it (a) outlives the frame (a returned pointer, stored into a heap object or global, captured by an escaping closure), (b) is too large (`MaxStackVarSize` = 128 KiB for explicit `var x T`/`x := …`; `MaxImplicitStackVarSize` = 64 KiB for `new(T)`, `&T{}`, `make`, from `cmd/compile/internal/ir/cfg.go`), (c) has a size unknown at compile time (`make([]T, n)`, though 1.25/1.26 now stack-allocate some variable-size backing stores [S7][S6]), or (d) is stored in an interface or passed to something the compiler can't see through (`fmt.Println(x)` → `x escapes to heap`).
- Tooling: `go build -gcflags=-m` (add `-m=2`/`-m=3` for reasons). Output on this box:
  ```
  ./main.go:9:21: moved to heap: n          // func leak() *node { n := node{}; return &n }
  ./main.go:14:8: &node{...} escapes to heap
  ./main.go:17:13: ... argument does not escape
  ```
- Goroutine **stacks are not GC'd heap objects**. They are allocated from the stack pool / mheap, start at 2 KiB (8 KiB on some OSes, adaptive average since 1.19), grow by **copying** (the stack is the one thing Go *does* move, which is possible because the compiler knows every stack pointer), and are **shrunk by half during GC** in `scanstack` when less than 1/4 is used (`shrinkstack`, `stack.go`). A dead goroutine's stack is freed or cached (`markrootFreeGStacks`).
- New in 1.26: `new(expr)` allocates and initializes in one expression. It still follows the same escape rules.

---

## 10. Classic leaks & gotchas (for exercises)

1. **Sub-slice of a big array**: `small := big[:10]` keeps the entire backing array alive. Fix: `slices.Clone(big[:10])` or `copy`. Same for strings: `s[:5]` pins the big string; use `strings.Clone`.
2. **Maps never shrink**: deleting keys keeps the buckets or groups. This is still true with the Swiss-table maps in 1.24+. Fix: rebuild into a new map, or `clear(m)` (clears entries but also keeps capacity).
3. **`time.After` in a `select` loop (before 1.23)**: each iteration created a timer that couldn't be collected until it fired, which added up to a lot with long timeouts. **Since Go 1.23, unreferenced Timers/Tickers are GC-eligible even if not stopped**, but only when `go.mod` says `go 1.23` or later (`asynctimerchan=1` reverts) [S9]. Unstopped `Ticker`s were *never* collected before 1.23.
4. **Goroutine leak**: a goroutine blocked forever on a chan, mutex or select keeps its stack **and everything it references** alive. The GC can't free a blocked goroutine (it's a root). Go 1.26 adds `GOEXPERIMENT=goroutineleakprofile`: the **GC** detects goroutines blocked on primitives unreachable from any runnable goroutine. It is exposed at `/debug/pprof/goroutineleak` and targeted for default-on in 1.27 [S6].
5. **Pointers in big long-lived structures** (`map[int]*Big`, `[]*T` caches): the GC re-traces all of them every cycle. Use pointer-free layouts (indices, `[]T` of values, byte arenas). The big-cache libraries (`bigcache`, `freecache`) exist for exactly this.
6. **`sync.Pool` is cleared on GC**, with a **victim cache** since Go 1.13. `poolCleanup` (`sync/pool.go:257`) runs at STW GC start, drops `victim`, and moves `local` to `victim`. An object survives **at most two GCs** without use. So Pool is not a connection pool. Don't `Put` huge variable-size buffers (issue 23199).
7. **Finalizer cycles** never collected. `AddCleanup` whose closure captures `ptr` never runs.
8. **Tiny-allocator retention**: a 1-byte escaping value keeps a 16-byte block alive. Negligible, but it explains odd finalizer behavior.
9. **Interior pointers keep the whole object alive**: `&bigStruct.field` pins all of `bigStruct` (non-moving GC with interior pointers).
10. **cgo / `unsafe`**: Go pointers must not be kept in C memory (cgocheck, `runtime.Pinner` since 1.21). A `uintptr` is not a reference, so the object can be freed.

---

## 11. Interview questions (crisp answers)

1. **Is Go's GC generational? Compacting? Why not?**
   Neither. It's non-moving and non-generational.
   - *Non-moving*: interior pointers are everywhere, and unsafe/cgo code relies on stable addresses. Size-segregated allocation already bounds fragmentation.
   - *Non-generational*: escape analysis puts many short-lived objects on the stack, so the generational hypothesis pays less. Generational GC needs an always-on write barrier, and Hudson showed its cost outweighed the gains. The Request-Oriented Collector was 30–50% slower on the compiler. Growing the heap (memory is cheap) cut mark cost more cheaply than barriers [S5].
2. **What is a write barrier, which kind does Go use, and when is it on?**
   Code the compiler inserts on heap/global pointer stores so the concurrent marker can't miss objects. Go uses a hybrid: Yuasa deletion (shade the old value) plus Dijkstra insertion (shade the new value). It is **on only during mark and mark termination**. Otherwise it costs one branch. Stack writes have no barrier.
3. **Why doesn't Go re-scan stacks at mark termination?**
   Since 1.8 the hybrid barrier's deletion half catches any pointer moved off the heap onto a stack, and new objects are allocated black. So once a stack is scanned it stays black and needs no STW rescan.
4. **What are the STW phases and what bounds them?**
   Sweep termination / mark setup (enable barrier, root jobs) and mark termination. Both are O(GOMAXPROCS). Neither scans the heap. They are usually tens to hundreds of µs.
5. **What's a mark assist, and why does my p99 spike during GC?**
   Allocating goroutines are forced to do scan work proportional to what they allocate, so they pay back their allocation debt. High allocation rates during mark mean request goroutines do GC work themselves. Look at the assist term in gctrace.
6. **How much CPU does the GC use?**
   25% of GOMAXPROCS in background workers (dedicated plus fractional), plus assists, plus idle-P workers, which are free. It is capped around 50% by the CPU limiter when a memory limit is set.
7. **Give the heap-goal formula.**
   `live + (live + stacks + globals) × GOGC/100`, with a floor of 4 MiB × GOGC/100, and capped by the GOMEMLIMIT-derived goal.
8. **GOGC=50 vs 200?**
   50: collects twice as often and uses about half the heap overhead. 200: about double the overhead and about half the GC CPU.
9. **Why does `GOGC=off` + `GOMEMLIMIT` make sense, and when is it dangerous?**
   With a known memory budget, the GC runs only when memory approaches the limit, which is the minimum possible GC frequency. It's dangerous if the live heap approaches the limit: back-to-back GCs get capped at 50% CPU and memory then goes over the limit. Also for programs whose memory scales with input.
10. **What does GOMEMLIMIT count? Is it hard?**
    `Sys − HeapReleased`, which is all Go-runtime-managed memory and not C/cgo. It's **soft**: the GC won't exceed about 50% CPU to enforce it.
11. **What's a GC death spiral and how does Go prevent it?**
    Near the limit, each GC frees little, so the next one starts right away and GC eats all the CPU. The leaky-bucket CPU limiter (1.19) caps GC at about 50% and disables assists.
12. **Does a goroutine's stack get garbage-collected?**
    A stack is not a heap object. It is a root while the goroutine lives, it shrinks during GC, and it is freed when the goroutine exits. A **blocked-forever goroutine is never collected** and keeps everything it references alive (1.26 can *detect* it with the leak profile, not free it).
13. **Does Go move anything?**
    Only goroutine stacks, copied on grow and shrink. Heap objects never move.
14. **Why can a 10-element slice hold 1 GB?**
    It shares the backing array. `slices.Clone` it.
15. **My map had 1M entries, I deleted them all, memory didn't drop. Why?**
    Maps never shrink their bucket or group storage. Copy into a fresh map.
16. **Is `for { select { case <-time.After(d): … } }` a leak?**
    Before 1.23, timers were retained until they fired, so it leaked in bulk. In 1.23+ (with `go 1.23` in go.mod), unreferenced timers are collectable. Reusing a `time.NewTimer` + `Reset` is still better.
17. **What happens to `sync.Pool` contents on GC?**
    Primary moves to victim and the old victim is dropped, so an item survives 1–2 GCs. It is a cache for reducing allocations, not a resource pool.
18. **Finalizer vs `AddCleanup`?**
    A finalizer resurrects the object (≥2 cycles), breaks cycles, and allows one per object. AddCleanup (1.24) gets a separate arg (no resurrection), allows several, handles cycles and interior pointers, and runs in parallel since 1.25. Neither is guaranteed to run.
19. **What are weak pointers for?**
    Caches and canonicalization maps (`unique`, 1.23) that shouldn't keep values alive. `weak.Pointer.Value()` returns nil after collection.
20. **How do I see whether something escapes?**
    `go build -gcflags=-m` (`-m=2` for reasons). Look for `moved to heap` / `escapes to heap`. Interfaces, returned pointers and closures are the usual causes.
21. **Why is `[]int64` cheaper for the GC than `[]*int64`?**
    Pointer-free types go into noscan spans. They are marked but never scanned, and they need no write barriers.
22. **What is Green Tea in one sentence? When is it on by default?**
    Span-granular marking for small objects (16–512 B). It queues 8 KiB spans FIFO, accumulates marks per span, and scans them together (with AVX-512 when available) for memory locality. It was an experiment in 1.25 and is default in 1.26 (`GOEXPERIMENT=nogreenteagc` opts out).
23. **Why FIFO for Green Tea but LIFO for the classic work queue?**
    LIFO gives depth-first, cache-warm processing of *objects*. FIFO gives a span time to collect more marked objects before it's scanned, so density is higher and each metadata/cache-line load does more work.
24. **What workloads might regress on Green Tea?**
    Sparse traversals where each dequeued span has one object: deep, low-fanout, mutation-heavy trees (bleve-index). The one-mark fast path cuts the loss.
25. **What do the three numbers in `4->5->2 MB` mean?**
    Heap at GC start → heap at mark end → live (marked) heap. The next goal derives from the last one.
26. **Is `runtime.GC()` synchronous?**
    Yes. It blocks through a full mark and sweep. Use it for tests and benchmarks, not production tuning.
27. **Why is RSS higher than `HeapInuse`?**
    Fragmentation, stacks, runtime metadata, and free memory not yet scavenged (kept +10% on purpose). The background scavenger returns pages at a 1% CPU budget.
28. **Newly allocated objects during mark: what color?**
    Black. They're marked immediately (`gcmarknewobject`) and, under Green Tea, flagged scanned too. So anything allocated during a cycle survives that cycle ("floating garbage").

---

## 12. Visualization / exercise ideas (2D, interactive)

1. **Tri-color step-through with a write-barrier villain.** Nodes on a canvas with roots on the left (stack frames G1/G2, globals). Buttons: *Step (scan one grey)*, *Mutator: move pointer*. Scripted scenario:
   - (a) Marker blackens A.
   - (b) Mutator does `A.f = C` (C reachable only via B.g) and then `B.g = nil`.
   - (c) Toggle "barrier off": C stays white and is freed, shown as a dangling pointer flashing red.
   - (d) Toggle Dijkstra-only, Yuasa-only, and hybrid, showing which case each catches, including the stack-to-heap move that needs the deletion half.
   Show the per-P wbBuf filling up as a side tray.
2. **Phase timeline.** A horizontal lane per P showing STW bars, dedicated workers (25%), fractional slices, idle workers, and assists on mutator lanes when the allocation rate slider is high. Hovering shows the matching gctrace fields `A+B+C` / `a+b/c/d+e`.
3. **Heap sawtooth with sliders.** Sliders: GOGC (off, 25–800), GOMEMLIMIT, live heap size, allocation rate, stacks+globals.
   - Plot heap over time: each tooth ramps to the goal, the trigger line sits at about 0.7–0.95 of the way, and the drop lands at the live heap.
   - Overlay a GC CPU% line. Push the limit near live and watch GC frequency explode until the 50% limiter kicks in and memory crosses the limit ("death spiral averted").
   - Show the formula with live numbers.
4. **gctrace decoder.** Paste a line and get each field highlighted with an explanation. Flag assist-heavy cycles, overshoot and 4 MB-floor goals.
5. **Green Tea memory-access race.** Split screen of a heap as a grid of 8 KiB spans (cells = objects) with a cache model (e.g. 8 "cache lines"; misses flash red).
   - Left, classic LIFO object flood: an access-path line jumps across spans, with a miss counter.
   - Right, Green Tea: marks accumulate as dots on spans, the FIFO span queue is shown, and a dequeued span is scanned left to right with a highlighted `marks &^ scans` diff and a SIMD "sweep bar".
   - Counters: cache misses, metadata loads, objects per span dequeue.
   - Sliders: fan-out and graph shape (wide vs deep linked list, so users can reproduce the regression case).
6. **Allocator explorer.** Type `make([]byte, 700)` / `&struct{a *int; b [40]byte}{}` and see the size class (with the waste %), scan vs noscan span, tiny-alloc packing for under-16 B noscan values, malloc header for over 512 B, large object for over 32 KiB. The path animates mcache → mcentral → mheap on a miss.
7. **Escape-analysis quiz.** Show snippets. The user predicts stack or heap, then the real `-gcflags=-m` line is revealed.
8. **Leak hunt.** Four mini-programs (sub-slice, map shrink, goroutine leak, pre-1.23 ticker) with a live "retained bytes" meter. The user applies the fix and watches the meter drop after the next GC.
9. **sync.Pool victim animation.** Items move local → victim → gone across GC ticks.

---

## Sources
- Local: `/usr/local/go/src/runtime/{mgc.go, mgcmark.go, mgcmark_greenteagc.go, mgcmark_nogreenteagc.go, mgcpacer.go, mgclimit.go, mgcsweep.go, mgcscavenge.go, mbarrier.go, mwbbuf.go, mheap.go, mcache.go, mcentral.go, malloc.go, mfinal.go, mcleanup.go, proc.go}`, `/usr/local/go/src/internal/runtime/gc/{sizeclasses.go, malloc.go, scan/scan_amd64.go}`, `/usr/local/go/src/internal/buildcfg/exp.go`, `/usr/local/go/src/sync/pool.go`. `/usr/local/go/doc` holds only the spec, go_mem and godebug.md (no GC doc).
- [S1] Knyszek & Clements, "The Green Tea Garbage Collector", go.dev/blog/greenteagc, 2025-10-29.
- [S2] golang/go#73581, "runtime: green tea garbage collector" (design + results).
- [S3] "A Guide to the Go Garbage Collector", go.dev/doc/gc-guide.
- [S4] Proposal 17503, "Eliminate STW stack re-scanning" (hybrid barrier), github.com/golang/proposal/blob/master/design/17503-eliminate-rescan.md.
- [S5] Rick Hudson, "Getting to Go: The Journey of Go's Garbage Collector", ISMM keynote 2018-06-18, go.dev/blog/ismmkeynote.
- [S6] Go 1.26 release notes, go.dev/doc/go1.26.
- [S7] Go 1.25 release notes, go.dev/doc/go1.25.
- [S8] pkg.go.dev/runtime (gctrace format, AddCleanup/SetFinalizer docs).
- [S9] Go 1.23 release notes (timers), go.dev/doc/go1.23.
- [S10] Proposal 48409, soft memory limit (GOMEMLIMIT), Go 1.19.
- [S11] Proposal 44167, GC pacer redesign (Go 1.18).
- [S12] Go 1.13 release notes / CL for sync.Pool victim cache.
