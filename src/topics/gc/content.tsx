import type { QuizItem } from '../../components/Quiz'
import type { InterviewQ } from '../../components/Interview'

export const quiz: QuizItem[] = [
  {
    id: 'gc.escape1',
    q: 'Does n live on the stack or the heap?',
    code: `type node struct{ next *node; v int }

func leak() *node {
    n := node{v: 1}
    return &n
}`,
    options: ['Stack — it’s a local variable', 'Heap — its address outlives the frame (“moved to heap: n”)', 'Stack, copied to the caller on return', 'Depends on GOGC'],
    answer: 1,
    explain: <p>Returning <code>&amp;n</code> means n must outlive <code>leak</code>’s frame, so escape analysis moves it to the heap. Go has no dangling-stack-pointer bugs because of this.</p>,
  },
  {
    id: 'gc.escape2',
    q: 'Which line makes x escape to the heap?',
    code: `func f() {
    x := 42
    y := x * 2          // (a)
    p := &x             // (b)
    _ = *p
    fmt.Println(x)      // (c)
}`,
    options: ['(a)', '(b)', '(c)', 'None — everything stays on the stack'],
    answer: 2,
    explain: (
      <p>
        Taking an address that never leaves the function is fine (b). Passing x to <code>fmt.Println</code> converts it to an <code>any</code>, and the compiler can’t prove the callee doesn’t keep it, so
        the <em>value</em> escapes (<code>x escapes to heap</code>). This is why logging in hot loops allocates.
      </p>
    ),
  },
  {
    id: 'gc.barrier',
    q: 'When is Go’s write barrier enabled?',
    options: ['Always', 'Only during the mark phase (and mark termination)', 'Only during sweeping', 'Only when GOGC < 100'],
    answer: 1,
    explain: <p>Outside marking, every pointer store just pays one predictable branch on a global flag. Stack writes never have a barrier.</p>,
  },
  {
    id: 'gc.goal',
    q: 'Live heap is 200 MiB after marking, stacks+globals are 20 MiB, GOGC=50, no memory limit. What is the next heap goal?',
    options: ['300 MiB', '310 MiB', '400 MiB', '220 MiB'],
    answer: 1,
    explain: <p>200 + (200 + 20) × 50/100 = 310 MiB. Roots have been part of the formula since Go 1.18.</p>,
  },
  {
    id: 'gc.newobj',
    q: 'An object is allocated while a GC cycle is marking. What color is it?',
    options: ['White — it will be scanned later', 'Grey', 'Black — it survives this cycle even if it becomes garbage right away', 'It isn’t tracked until the next cycle'],
    answer: 2,
    explain: <p>New objects are allocated black (and marked “scanned” under Green Tea). That keeps the marker from chasing a moving target, at the cost of some floating garbage.</p>,
  },
  {
    id: 'gc.limit',
    q: 'GOGC=off, GOMEMLIMIT=1GiB, and the live heap slowly grows to 1.2 GiB. What happens?',
    options: [
      'The runtime returns an out-of-memory error from new()',
      'GC runs almost continuously, capped at ~50% CPU by the limiter; the heap grows past the limit',
      'GC stops entirely because GOGC=off',
      'The program panics: memory limit exceeded',
    ],
    answer: 1,
    explain: <p>The limit is soft. When it can’t be met, the CPU limiter stops the GC from eating the whole machine and lets memory overshoot. You’ll likely be OOM-killed by the container instead, but slowly.</p>,
  },
  {
    id: 'gc.greentea',
    q: 'In Go 1.26, which objects does Green Tea’s span scanning handle?',
    options: ['All heap objects', 'Small objects of 16–512 bytes in single-page spans', 'Only objects larger than 32 KiB', 'Only pointer-free objects'],
    answer: 1,
    explain: <p>Size classes 16 B…512 B, whose spans are one 8 KiB page with inline mark/scan bits. 8-byte objects, header objects over 512 B and large objects still use the per-object path.</p>,
  },
  {
    id: 'gc.pool',
    q: 'You Put a buffer into a sync.Pool and nothing Gets it. How long can it survive?',
    options: ['Forever', 'Until the next GC', 'At most about two GC cycles (primary → victim → dropped)', 'Until GOMEMLIMIT is reached'],
    answer: 2,
    explain: <p>Since Go 1.13, each GC moves the pool’s contents into a victim cache and drops the previous victims. So an unused item survives one GC and is freed at the next.</p>,
  },
  {
    id: 'gc.slice',
    q: 'What does this function keep alive after it returns?',
    code: `func header(path string) []byte {
    data, _ := os.ReadFile(path)   // 1 GB file
    return data[:16]
}`,
    options: ['16 bytes', 'The whole 1 GB backing array', 'Nothing, the slice is copied', '16 bytes plus the slice header'],
    answer: 1,
    explain: <p>A slice points into its backing array. Since Go’s GC is non-moving and handles interior pointers, the whole array stays reachable. Return <code>bytes.Clone(data[:16])</code>.</p>,
  },
]

export const interview: InterviewQ[] = [
  {
    id: 'describe',
    level: 'core',
    q: 'Describe Go’s garbage collector in one breath.',
    a: <p>Concurrent, tri-color, precise mark-sweep; non-moving and non-generational; a hybrid write barrier on only during marking; two short STW pauses per cycle; paced by GOGC and GOMEMLIMIT; 25% of GOMAXPROCS for background marking plus assists; Green Tea span-based marking for small objects by default since 1.26.</p>,
  },
  {
    id: 'why-not-gen',
    level: 'senior',
    q: 'Why isn’t Go’s GC generational or compacting?',
    a: <p>Compaction would move objects, but Go has interior pointers everywhere and cgo/unsafe code that relies on stable addresses; size-segregated allocation bounds fragmentation instead. Generational GC needs an always-on write barrier; escape analysis already removes much short-lived garbage, and the Go team’s experiments (Request-Oriented Collector) were 30–50% slower. Spending memory (a bigger heap) turned out cheaper than barriers.</p>,
  },
  {
    id: 'barrier',
    level: 'senior',
    q: 'What is a write barrier and which one does Go use?',
    a: <p>Compiler-inserted code on heap and global pointer writes, active only during marking, so the concurrent marker can’t miss an object the mutator hides. Go uses a hybrid: Yuasa deletion (shade the old value) plus Dijkstra insertion (shade the new value). Stack writes have no barrier. Stores go into a per-P buffer that’s flushed in bulk.</p>,
  },
  {
    id: 'rescan',
    level: 'staff',
    q: 'Why doesn’t Go re-scan stacks at mark termination anymore?',
    a: <p>Before 1.8, the Dijkstra-only barrier didn’t cover stack writes, so stacks could gain pointers to white objects after being scanned and had to be re-scanned under STW — the biggest pause. The hybrid barrier’s deletion half shades anything unlinked from the heap, and new objects are allocated black, so a scanned stack stays black. Pauses fell below 1 ms.</p>,
  },
  {
    id: 'stw',
    level: 'core',
    q: 'What are the STW phases and what determines their length?',
    a: <p>Sweep termination (enable barrier, set up roots) and mark termination (disable workers, flush caches, compute the next goal). Both do O(GOMAXPROCS) work — not proportional to heap size or goroutine count — so they’re usually 10–500 µs.</p>,
  },
  {
    id: 'assist',
    level: 'senior',
    q: 'What’s a mark assist and why does it hurt latency?',
    a: <p>If the program allocates faster than background workers can mark, allocating goroutines are charged scan work proportional to their allocation before malloc returns. Request goroutines end up doing GC work, which shows up as p99 latency. In gctrace it’s the first term after the plus in the CPU section. Reduce allocation rate, raise GOGC, or give the heap more room.</p>,
  },
  {
    id: 'cpu',
    level: 'core',
    q: 'How much CPU does the GC use?',
    a: <p>25% of GOMAXPROCS in background workers while marking (dedicated plus fractional), plus assists, plus idle-P workers that only use otherwise idle CPU. The CPU limiter caps the total at about 50% when a memory limit is pushing too hard.</p>,
  },
  {
    id: 'formula',
    level: 'core',
    q: 'Give the heap-goal formula.',
    a: <p>live + (live + stacks + globals) × GOGC/100, with a floor of 4 MiB × GOGC/100, capped by the GOMEMLIMIT-derived goal (limit minus non-heap memory and a small headroom), never below the live heap.</p>,
  },
  {
    id: 'gomemlimit',
    level: 'senior',
    q: 'What does GOMEMLIMIT count, and when would you set GOGC=off with it?',
    a: <p>It limits Go-managed memory: <code>Sys − HeapReleased</code> (heap, stacks, runtime metadata; not cgo or mmap you do yourself). It’s soft. GOGC=off + GOMEMLIMIT makes GC run only as often as needed to stay under the limit — ideal for a container with a known, dedicated budget and a live heap well below it. Dangerous for programs whose live memory can approach the limit, or for CLIs sharing a machine.</p>,
  },
  {
    id: 'spiral',
    level: 'senior',
    q: 'What’s a GC death spiral and how does Go prevent it?',
    a: <p>Near the memory limit each cycle frees little, so the next starts immediately and GC eats all CPU. Requests slow down, more are in flight, more memory is live, and it gets worse. Since 1.19 a leaky-bucket CPU limiter caps GC at ~50% (and turns off assists), letting memory exceed the limit rather than grinding to a halt.</p>,
  },
  {
    id: 'greentea',
    level: 'senior',
    q: 'What is Green Tea GC?',
    a: <p>Span-granular marking for small objects (16–512 B). Marking sets a bit in inline per-span bitmaps; the first mark enqueues the span on a FIFO queue; by the time it’s dequeued many objects are marked, and they’re scanned together in one sequential pass (with AVX-512 where available). Experimental in 1.25, default in 1.26, 10–40% less GC CPU.</p>,
  },
  {
    id: 'fifo',
    level: 'staff',
    q: 'Why does Green Tea use a FIFO queue when the classic marker uses LIFO?',
    a: <p>LIFO keeps the classic depth-first object walk cache-warm. For spans, FIFO gives a queued span time to accumulate more marked objects before it’s scanned, so each span load does more work — the density is the whole point.</p>,
  },
  {
    id: 'regress',
    level: 'staff',
    q: 'Which workloads can regress with Green Tea?',
    a: <p>Ones where a dequeued span has only one object to scan: deep, low-fan-out, frequently mutated pointer structures (bleve-index regressed on some machines). A single-object fast path limits the damage. Pointer-free heaps and heaps dominated by large objects see little change either way.</p>,
  },
  {
    id: 'stacks',
    level: 'core',
    q: 'Is a goroutine stack garbage-collected?',
    a: <p>A stack isn’t a heap object. It’s a GC root while the goroutine lives, can be shrunk during GC, and is freed or cached when the goroutine exits. A goroutine blocked forever is never collected and keeps everything it references alive.</p>,
  },
  {
    id: 'moves',
    level: 'senior',
    q: 'Does Go ever move memory?',
    a: <p>Heap objects never move. Goroutine stacks do: they are copied when they grow or shrink, which is possible because the compiler knows every pointer into the stack. That’s why Go pointers to stack memory can’t be handed to C.</p>,
  },
  {
    id: 'noscan',
    level: 'senior',
    q: 'How do you make a large in-memory cache cheap for the GC?',
    a: <p>Avoid pointers in it: pointer-free types go into noscan spans and are never scanned. Store values in <code>[]T</code> of structs without pointers, use integer indices instead of <code>*T</code>, or serialize into big byte arenas (the approach behind bigcache/freecache). Fewer, larger allocations also help.</p>,
  },
  {
    id: 'finalizer',
    level: 'senior',
    q: 'Finalizers vs runtime.AddCleanup?',
    a: <p>A finalizer receives the object, so it resurrects it: freeing takes at least two cycles, only one finalizer per object, and cycles with finalizers are never collected. AddCleanup (1.24) receives a separate argument, doesn’t resurrect, allows many per object, works with cycles and interior pointers, and runs cleanups concurrently since 1.25. Neither is guaranteed to run before exit.</p>,
  },
  {
    id: 'weak',
    level: 'senior',
    q: 'What are weak pointers for?',
    a: <p><code>weak.Pointer[T]</code> (1.24) references an object without keeping it alive; <code>Value()</code> returns nil after it’s collected. Useful for caches and canonicalization maps (the <code>unique</code> package), usually paired with AddCleanup to evict map entries.</p>,
  },
  {
    id: 'rss',
    level: 'senior',
    q: 'Why is RSS higher than the live heap?',
    a: <p>Heap goal headroom (GOGC), fragmentation within size classes, goroutine stacks, runtime metadata, and freed pages the scavenger hasn’t returned yet (it deliberately keeps ~10% extra and runs at ~1% CPU). <code>debug.FreeOSMemory()</code> forces a GC and a full scavenge.</p>,
  },
  {
    id: 'escape',
    level: 'core',
    q: 'How do you find out whether a value escapes to the heap?',
    a: <p><code>go build -gcflags=-m</code> (use <code>-m=2</code> for reasons). Look for “moved to heap” and “escapes to heap”. The usual culprits: returned pointers, storing into interfaces (fmt, logging), closures captured by goroutines, and slices whose size isn’t known at compile time.</p>,
  },
  {
    id: 'gctrace',
    level: 'senior',
    q: 'You see “gc 812 @3601s 18%: … 48->52->31 MB, 50 MB goal …”. What does it tell you?',
    a: <p>Cycle 812; 18% of all CPU since start went to GC. The GC started at 48 MB, marking ended at 52 MB (it overshot the 50 MB goal, so allocation outran the pacer), and 31 MB is live. The next goal will be ~31×2 plus roots at GOGC=100. 18% is high: look at the assist time and allocation profile.</p>,
  },
  {
    id: 'runtimegc',
    level: 'core',
    q: 'Is runtime.GC() synchronous? Should you call it?',
    a: <p>Yes, it blocks until a full mark and sweep finish. It’s for tests, benchmarks and diagnostics, not production tuning. Use GOGC/GOMEMLIMIT and reduce allocation instead.</p>,
  },
]
