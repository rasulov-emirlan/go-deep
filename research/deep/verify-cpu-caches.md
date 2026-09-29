# verify: cpu-caches (page src/topics/cpu-caches)
Env: 4 vCPU Xeon under KVM, Go 1.24.7 (+1.25.1/1.26.0 for -S). Scratch: /tmp/verify/cpu-caches/ (benchmarks copied from research).

## Benchmarks re-run
- Pointer chase ns/load: 16 KiB 1.8-2.1, 256 KiB 5.7-6.4, 4 MiB 29-38, 64 MiB 136-171, 512 MiB 180-190 -> 512 MiB : L1 = 85-105x; caption "80-110x" OK. Added "(TLB misses included)".
- Slice vs list (128 MiB, 2M x 64 B): slice 7.4-11 ms (one 19 ms outlier), in-order list 22-29 ms (3-4x, one run 2x), shuffled 305-392 ms (~30-50x) -> ranges OK (35-57x kept, "3-4x" kept).
- Naive `if v>=128` sorted vs unsorted: 49-54 us vs 51-59 us -> equal (CMOV). `go build -gcflags=-S`: `CMOVQGE` on amd64 Go 1.24.7, 1.25.1 and 1.26.0; `CSEL` on arm64 -> OK; caption now says amd64 and arm64, stop card mentions 1.24-1.26.
- Forced real branch (noinline call + append): unsorted 405-474 us vs sorted 131-138 us = 3.0-3.6x (research had 4.0x) -> FIXED "3.4-4x" to "about 3-4x".
- Atomic vs plain single goroutine: 6.6-6.9 ns vs 0.35-0.46 ns = 15-19x (research 20-28x) -> FIXED to "15-28x".
- Shared atomic: 10.0-10.6 (1), 15.9-19.2 (2), 19.8-20.8 (4) ns -> 1.5-1.9x and ~2x OK.
- 4 cores: unpadded shards 22.1-22.4 (same as shared, OK); mutex 53-57 ns (2.6-2.8x, OK); padded 2.8-3.3 ns = 6-7x faster -> FIXED "3-6x faster" to "5-7x" (bar shortened to match).

## Theory / source checks
- MESI: E->M silent, S->M invalidate+ack, M->S on remote read, I write = RFO miss. Stop card said "only a write to Shared pays" -> FIXED (also Invalid = miss); added "Intel MESIF, AMD MOESI".
- x86-TSO: only store->load reordering, loads not with loads, stores not with stores -> consistent with web-search summaries of the CACM 2010 paper/Intel SDM (paper PDF blocked by proxy: second-hand). Caption hedged "on ordinary memory" (non-temporal stores/string ops are exceptions). "Go atomic" fence wording -> "Go atomic store".
- Go memory model (golang/go master doc/go_mem.html): "data-race-free programs execute in a sequentially consistent manner"; "All the atomic operations executed in a program behave as though executed in some sequentially consistent order"; same semantics as C++ seq-cst atomics/Java volatile -> OK verbatim. "No relaxed/acquire-release variants" = API fact, OK.
- Ladder: L1 ~1 ns/4-5 cycles, L2 3-5, L3 10-20, DRAM 70-100 (ranges, "hardware dependent"); Dean 2012 table L1 0.5 ns/DRAM 100 ns (research, gist fetched) -> OK as ranges. Caption "L2 ... shared by more cores" removed (L2 is private on Intel/AMD); L3 caption "tens of times smaller than DRAM" was vague/wrong -> FIXED.
- "if 1 ns were 1 s: L3 15 s, DRAM 1.5 min" arithmetic OK.
- Skylake 80 ns local / 138 ns remote: WebSearch of the Intel Community thread returned "local 80 ns, remote 138.9 ns" (page itself blocked) -> OK, second-hand.
- 48 KiB/12-way/64 B = 64 sets; 4096 B stride same set; int64 stride 512 -> OK arithmetic. Go CacheLinePadSize 128 on arm64 (research, source-verified).
- SMT/AWS "vCPU = hardware thread": AWS docs not re-fetched (blocked); general fact, marked unverified here.
- NUMA first-touch, Go not NUMA-aware: kernel doc/Vyukov proposal from research only; issue #78044 not used on page.

## Changes (src/topics/cpu-caches/flows.tsx)
See above plus illustration fixes: ladder last frame text spacing; branch stage boxes shortened ("v>=128", "not taken"); NUMA "goroutine hops" label moved off the dashed arrow, duplicate 1.5-2x label removed from the two-arrow frame, "init" node enlarged.

## Bank
No cache-hierarchy bank answers exist (gap noted in research). sync-atomics-vs-mutex claims (seq-cst, CAS fast path) consistent with the above.
