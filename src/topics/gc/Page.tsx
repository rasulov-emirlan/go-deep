import { Callout, Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { QuizList } from '../../components/Quiz'
import { Interview } from '../../components/Interview'
import { NextTopic, Sources, TopicHero } from '../../components/TopicShell'
import { TriColorLab } from './TriColorLab'
import { PacerLab } from './PacerLab'
import { GreenTeaLab } from './GreenTeaLab'
import { GctraceDecoder } from './Gctrace'
import { interview, quiz } from './content'

const toc = [
  { id: 'answer', label: '30-second answer' },
  { id: 'phases', label: 'Phases' },
  { id: 'barrier', label: 'Write barrier' },
  { id: 'pacer', label: 'Pacer' },
  { id: 'alloc', label: 'Allocator & escape' },
  { id: 'greentea', label: 'Green Tea' },
  { id: 'gctrace', label: 'gctrace' },
  { id: 'leaks', label: 'Leaks' },
  { id: 'puzzles', label: 'Puzzles' },
  { id: 'interview', label: 'Interview' },
]

const td = { padding: '.45rem .6rem', borderBottom: '1px solid #d4d4d4', verticalAlign: 'top' as const }

export default function GcPage() {
  return (
    <>
      <TopicHero
        slug="gc"
        title={
          <>
            GC & <span className="r">Green Tea</span>
          </>
        }
        lead="Go’s collector trades memory for latency: concurrent, non-moving, non-generational, with sub-millisecond pauses. Go 1.26 made Green Tea — span-based marking — the default. Break it, tune it, and read its trace."
        toc={toc}
      />

      <Section id="answer" n="01" kicker="Mental model" title="The 30-second answer">
        <div className="prose">
          <p>
            Go’s GC is a <b>concurrent, tri-color, mark-sweep</b> collector. It is <b>precise</b> (it knows exactly which words are pointers), <b>non-moving</b> (heap objects never move) and{' '}
            <b>non-generational</b>. Each cycle has two short stop-the-world pauses — typically tens to hundreds of microseconds, independent of heap size — and a <b>hybrid write barrier</b> that is on
            only while marking. The <b>pacer</b> decides when to start so marking finishes as the heap reaches its goal, which is set by <code>GOGC</code> and capped by <code>GOMEMLIMIT</code>.
          </p>
          <Callout label="Why not generational or compacting?">
            <p>
              Escape analysis already keeps many short-lived values on goroutine stacks, which weakens the generational bet. A generational GC needs a write barrier that is always on, and Go’s experiments
              (the Request-Oriented Collector) were 30–50% slower on the compiler. Compaction would break interior pointers, cgo and <code>unsafe</code> code. Size-segregated allocation keeps
              fragmentation bounded instead.
            </p>
          </Callout>
        </div>
      </Section>

      <Section id="phases" n="02" kicker="runtime/mgc.go" title="One cycle, four phases">
        <div className="viz-scroll">
          <table style={{ borderCollapse: 'collapse', fontSize: 14, maxWidth: '56rem', minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #0a0a0a', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={td}>Phase</th>
                <th style={td}>STW?</th>
                <th style={td}>What happens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>1. Sweep termination</td>
                <td style={{ ...td, color: '#e63946', fontWeight: 700 }}>yes</td>
                <td style={td}>Finish leftover sweeping, turn the write barrier on, enqueue root jobs. No object may be scanned until every P has the barrier enabled.</td>
              </tr>
              <tr>
                <td style={td}>2. Mark</td>
                <td style={td}>no</td>
                <td style={td}>
                  Background workers (25% of GOMAXPROCS) and mark assists drain grey objects. Stacks are scanned one goroutine at a time. New objects are allocated <b>black</b>.
                </td>
              </tr>
              <tr>
                <td style={td}>3. Mark termination</td>
                <td style={{ ...td, color: '#e63946', fontWeight: 700 }}>yes</td>
                <td style={td}>Stop workers and assists, flush caches, compute the next heap goal.</td>
              </tr>
              <tr>
                <td style={td}>4. Sweep</td>
                <td style={td}>no</td>
                <td style={td}>Barrier off. Spans are swept lazily by allocators and by the background sweeper: mark bits become alloc bits, empty spans are freed.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="prose" style={{ marginTop: '1rem' }}>
          <p>
            Triggers: the heap reaches the pacer’s trigger, <code>runtime.GC()</code> (blocks until mark <em>and</em> sweep finish), or 2 minutes without a GC (sysmon’s forcegc).
          </p>
        </div>
      </Section>

      <Section id="barrier" n="03" kicker="Tri-color + write barrier" title="Why Go needs the hybrid barrier">
        <div className="prose">
          <p>
            <b>White</b> = not reached yet, <b>grey</b> = reached but its pointers not scanned, <b>black</b> = scanned. Marking is done when there is no grey left, and every white object is garbage. The
            mutator keeps running during marking, so it can break the invariant <em>“no black object points to a white one”</em>. A <b>write barrier</b> is code the compiler puts on every heap pointer
            store while the GC is marking:
          </p>
          <Code>{`
// runtime/mbarrier.go — Go 1.8+ hybrid barrier
writePointer(slot, ptr):
    shade(*slot)                  // Yuasa deletion: shade the old target
    if current stack is grey:
        shade(ptr)                // Dijkstra insertion: shade the new target
    *slot = ptr
`}</Code>
          <p>
            The catch: <b>stack writes have no barrier</b> — too expensive. Each half of the barrier alone loses objects in one of the scenarios below. Before 1.8 Go used Dijkstra only and had to{' '}
            <em>re-scan every stack</em> in the final STW pause (tens of ms with many goroutines). The hybrid barrier made stack re-scans unnecessary, and pauses dropped under a millisecond. In practice
            the runtime shades both pointers unconditionally.
          </p>
        </div>
        <TriColorLab />
      </Section>

      <Section id="pacer" n="04" kicker="GOGC · GOMEMLIMIT · pacer" title="When does the next GC start?">
        <div className="prose">
          <Code>{`
heap goal = live + (live + stacks + globals) × GOGC/100     // roots counted since 1.18
          = max(goal, 4 MiB × GOGC/100)
          = min(goal, GOMEMLIMIT − non-heap − headroom)       // since 1.19, never below live
trigger  ≈ goal − runway   (clamped to 70%…95% of the way from live to goal)
`}</Code>
          <ul>
            <li>
              <b>GOGC</b> (default 100): doubling it roughly doubles heap overhead and halves GC CPU. <code>GOGC=off</code> disables the proportional goal entirely.
            </li>
            <li>
              <b>Mark assists</b>: if your goroutines allocate faster than the 25% background workers can mark, the allocating goroutine is made to do scan work before <code>malloc</code> returns. That’s
              the GC latency you actually feel in p99.
            </li>
            <li>
              <b>GOMEMLIMIT</b> is a <em>soft</em> limit on memory the runtime manages (<code>Sys − HeapReleased</code>, not cgo). Near the limit the GC runs back to back — a death spiral — so the{' '}
              <b>CPU limiter</b> caps GC at roughly 50% CPU and disables assists. When that happens the program exceeds the limit rather than stalling.
            </li>
            <li>
              <b>GOGC=off + GOMEMLIMIT=X</b> is right for a container with a dedicated memory budget and a live heap well below it: GC only runs when it must. It is dangerous when live memory can
              approach X.
            </li>
          </ul>
        </div>
        <PacerLab />
      </Section>

      <Section id="alloc" n="05" kicker="Allocator & escape analysis" title="The cheapest garbage is the kind you never make">
        <div className="prose">
          <p>
            Allocation is TCMalloc-style and size-segregated: a per-P <code>mcache</code> (no locks) holds one span per <em>span class</em> (68 size classes × scan/noscan); on a miss it refills from{' '}
            <code>mcentral</code>, which gets pages from <code>mheap</code>. Objects over 32 KiB get their own span. Pointer-free allocations under 16 B are packed together by the <b>tiny allocator</b>.
          </p>
          <ul>
            <li>
              <b>noscan spans</b>: types with no pointers (<code>[]byte</code>, <code>[]int64</code>, structs of scalars) are marked but never scanned, and writes to them need no barrier. Swapping pointers
              for indices is a real GC optimization; remember that <code>string</code> contains a pointer.
            </li>
            <li>
              <b>Escape analysis</b> decides stack vs heap at compile time. A value escapes if it outlives its frame (returned pointer, stored in a heap object, captured by an escaping closure), is stored
              in an interface the compiler can’t see through, is too big, or has a size unknown at compile time. Check with <code>go build -gcflags=-m</code>.
            </li>
          </ul>
          <Code>{`
$ go build -gcflags=-m ./esc          # real output, go1.26.4
esc/main.go:10:6: can inline leak
esc/main.go:11:2: moved to heap: n           // n := node{v: 1}; return &n
esc/main.go:21:13: ... argument does not escape
esc/main.go:21:14: x escapes to heap         // fmt.Println(x): x boxed into an interface
`}</Code>
        </div>
      </Section>

      <Section id="greentea" n="06" kicker="Go 1.25 experiment · 1.26 default" title="Green Tea: scan pages, not pointers">
        <div className="prose">
          <p>
            The classic mark phase is a <b>graph flood</b>: pop an object, read its pointers, look up each target’s span and mark bits, push it. Consecutive steps jump all over the heap, so the CPU
            spends at least 35% of mark time <em>stalled on memory</em>, and the prefetcher can’t help.
          </p>
          <p>Green Tea changes the unit of work from an object to a <b>span</b> (an 8 KiB page of same-size objects) for small objects of 16–512 bytes:</p>
          <ol>
            <li>
              Each small-object span keeps two bitmaps inline at its end: <b>marks</b> (“seen”) and <b>scans</b> (“scanned”). Finding the metadata is address arithmetic, with no <code>mspan</code>{' '}
              lookup.
            </li>
            <li>
              Marking an object just sets its bit. The <em>first</em> marker of an unqueued span enqueues the span. Later marks only accumulate.
            </li>
            <li>
              Span queues are <b>FIFO</b> (the classic work queue is LIFO), so a span waits and collects more marks before it’s scanned.
            </li>
            <li>
              Scanning a span processes <code>marks &amp;^ scans</code> in one sequential pass — with AVX-512 on Ice Lake / Zen 4 and newer. If only one object was marked, a fast path scans just that one.
            </li>
          </ol>
          <Callout label="Status">
            <p>
              Go 1.25: <code>GOEXPERIMENT=greenteagc</code>. <b>Go 1.26: on by default</b>; opt out at build time with <code>GOEXPERIMENT=nogreenteagc</code> (expected to disappear in 1.27). Reported 10–40%
              less GC CPU, plus ~10% more with vector scanning. It can regress when each dequeued span holds one object: deep, low-fan-out, pointer-chasing graphs.
            </p>
          </Callout>
        </div>
        <GreenTeaLab />
      </Section>

      <Section id="gctrace" n="07" kicker="GODEBUG=gctrace=1" title="Read the trace">
        <div className="prose">
          <p>
            Tap a field to see what it means. The sample line was captured on go1.26.4. <code>gctrace=2</code> additionally prints Green Tea’s per-size-class scan statistics.
          </p>
        </div>
        <GctraceDecoder />
      </Section>

      <Section id="leaks" n="08" kicker="Retention" title="Memory the GC can’t take back">
        <div className="prose">
          <ul>
            <li>
              <b>Sub-slices and substrings</b> pin the whole backing array: <code>small := big[:10]</code> keeps all of <code>big</code> alive. Use <code>slices.Clone</code> or{' '}
              <code>strings.Clone</code>.
            </li>
            <li>
              <b>Goroutine leaks</b>: a goroutine blocked forever is a root. Its stack and everything it references stay alive. Go 1.26’s <code>goroutineleak</code> profile can <em>detect</em> them;
              nothing frees them.
            </li>
            <li>
              <b>Maps never shrink</b> — see the maps topic.
            </li>
            <li>
              <b>
                <code>time.After</code> in a loop
              </b>{' '}
              kept each timer alive until it fired before Go 1.23. Since 1.23 (with <code>go 1.23</code> in go.mod) unreferenced timers are collectable.
            </li>
            <li>
              <b>
                <code>sync.Pool</code>
              </b>{' '}
              is emptied by GC: at each cycle, pooled items move to a victim cache and the old victims are dropped. It reduces allocation; it is not a connection pool.
            </li>
            <li>
              <b>Finalizers</b> resurrect the object (≥2 cycles to free it) and never run for cycles. Prefer <code>runtime.AddCleanup</code> (1.24): it doesn’t resurrect, handles cycles, and allows several
              cleanups per object — unless the cleanup captures the object itself, in which case it never runs.
            </li>
            <li>
              <b>Interior pointers</b>: <code>&amp;big.field</code> keeps all of <code>big</code> alive.
            </li>
          </ul>
        </div>
      </Section>

      <Section id="puzzles" n="09" kicker="Test yourself" title="GC & escape puzzles">
        <QuizList items={quiz} />
      </Section>

      <Section id="interview" n="10" kicker="Interview prep" title="Questions you will be asked">
        <Interview items={interview} prefix="gc" />
        <Sources>
          <p>
            Go 1.26.4 <code>runtime/mgc.go, mgcmark.go, mgcmark_greenteagc.go, mgcpacer.go, mgclimit.go, mbarrier.go, mgcsweep.go, mgcscavenge.go, malloc.go</code>;{' '}
            <a href="https://go.dev/doc/gc-guide">A Guide to the Go Garbage Collector</a>; <a href="https://go.dev/blog/greenteagc">The Green Tea Garbage Collector</a> (2025);{' '}
            <a href="https://github.com/golang/go/issues/73581">golang/go#73581</a>; <a href="https://go.dev/blog/ismmkeynote">Getting to Go</a> (Hudson, 2018); proposals 17503 (hybrid barrier), 44167
            (pacer), 48409 (memory limit); release notes <a href="https://go.dev/doc/go1.25">1.25</a> and <a href="https://go.dev/doc/go1.26">1.26</a>.
          </p>
        </Sources>
      </Section>
      <NextTopic slug="gc" />
    </>
  )
}
