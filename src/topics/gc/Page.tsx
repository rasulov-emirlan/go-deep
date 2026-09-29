import { Link } from 'react-router-dom'
import { Callout, Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { QuizList } from '../../components/Quiz'
import { Interview } from '../../components/Interview'
import { NextTopic, Sources, TopicHero } from '../../components/TopicShell'
import { Story } from '../../components/Story'
import { TriColorLab } from './TriColorLab'
import { PacerLab } from './PacerLab'
import { GreenTeaLab } from './GreenTeaLab'
import { GctraceDecoder } from './Gctrace'
import { GuidedGC } from './GuidedGC'
import { GuidedGreenTea } from './GuidedGreenTea'
import { greenTea, leaks, pacer, triColor, writeBarrier } from './stories'
import { interview, quiz } from './content'
import './gc.css'

const toc = [
  { id: 'mark', label: 'Tri-color mark' },
  { id: 'barrier', label: 'Write barrier' },
  { id: 'tour', label: 'Guided tour' },
  { id: 'greentea', label: 'Green Tea' },
  { id: 'pacer', label: 'Pacer' },
  { id: 'phases', label: 'Phases' },
  { id: 'alloc', label: 'Allocator & escape' },
  { id: 'gctrace', label: 'gctrace' },
  { id: 'leaks', label: 'Leaks' },
  { id: 'sandbox', label: 'Sandbox' },
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
        lead="Go’s collector trades memory for latency: concurrent, non-moving, non-generational, with sub-millisecond pauses. Go 1.26 made Green Tea — span-based marking — the default. Watch it paint a town, break it, and read its trace."
        toc={toc}
      />

      <Section id="mark" n="01" kicker="Tri-color mark & sweep" title="Paint the reachable town">
        <div className="prose">
          <p>
            Each story below plays by itself with <b>Autoplay</b> and <b>stops at every important moment</b> to explain it. Press <b>OK, next</b> to go on, or step with the arrows.
          </p>
        </div>
        <Story id="story-mark" title="Tri-color mark" frames={triColor} />
        <div className="prose">
          <p>
            In one breath: Go’s GC is a <b>concurrent, tri-color, mark-sweep</b> collector. It is <b>precise</b> (it knows exactly which words are pointers), <b>non-moving</b> and{' '}
            <b>non-generational</b>, with two short stop-the-world pauses per cycle that don’t grow with the heap.
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

      <Section id="barrier" n="02" kicker="Write barrier" title="Why Go needs the hybrid barrier">
        <Story id="story-barrier" title="Why the write barrier" frames={writeBarrier} />
        <div className="prose">
          <Code>{`
// runtime/mbarrier.go — Go 1.8+ hybrid barrier (the runtime shades both unconditionally)
writePointer(slot, ptr):
    shade(*slot)                  // Yuasa deletion: shade the old target
    if current stack is grey:
        shade(ptr)                // Dijkstra insertion: shade the new target
    *slot = ptr
`}</Code>
        </div>
      </Section>

      <Section id="tour" n="03" kicker="Guided tour" title="Run the real model, barrier by barrier">
        <div className="prose">
          <p>
            A tested tri-color simulator. Tour 1 is a plain marking run. Tours 2–4 are the three ways a program can hide an object from the marker; pick a barrier and press <b>Autoplay</b>. It stops the
            first time each kind of event happens: a root scan, a shade, a barrier firing, a stack write with no barrier, a sweep, and the final verdict (use-after-free, or every reachable object
            survived). The chips show which cases you’ve seen. Only <b>Hybrid</b> survives all three.
          </p>
        </div>
        <GuidedGC />
      </Section>

      <Section id="greentea" n="04" kicker="Go 1.25 experiment · 1.26 default" title="Green Tea: scan by street, not by house">
        <Story id="story-greentea" title="Green Tea" frames={greenTea} />
        <div className="prose">
          <p>
            Now the same idea on a real (tiny) run: first the classic marker, then Green Tea, on the same heap. Watch the cache-miss counter and the queue.
          </p>
        </div>
        <GuidedGreenTea />
      </Section>

      <Section id="pacer" n="05" kicker="GOGC · GOMEMLIMIT · pacer" title="When does the next GC start?">
        <Story id="story-pacer" title="The pacer" frames={pacer} />
        <div className="prose">
          <Code>{`
heap goal = live + (live + stacks + globals) × GOGC/100     // roots counted since 1.18
          = max(goal, 4 MiB × GOGC/100)
          = min(goal, GOMEMLIMIT − non-heap − headroom)       // since 1.19, never below live
trigger  ≈ goal − runway   (clamped to 70%…95% of the way from live to goal)
`}</Code>
        </div>
      </Section>

      <Section id="phases" n="06" kicker="runtime/mgc.go" title="One cycle, four phases">
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

      <Section id="alloc" n="07" kicker="Allocator & escape analysis" title="The cheapest garbage is the kind you never make">
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

      <Section id="gctrace" n="08" kicker="GODEBUG=gctrace=1" title="Read the trace">
        <div className="prose">
          <p>
            Tap a field to see what it means. The sample line was captured on go1.26.4. <code>gctrace=2</code> additionally prints Green Tea’s per-size-class scan statistics.
          </p>
        </div>
        <GctraceDecoder />
      </Section>

      <Section id="leaks" n="09" kicker="Retention" title="Memory the GC can’t take back">
        <Story id="story-leaks" title="What the GC can’t take back" frames={leaks} />
        <div className="prose">
          <p>Two more that don’t need a picture:</p>
          <ul>
            <li>
              <b>Maps never shrink</b>: deleting keys keeps the groups (see the maps topic). Copy into a fresh map to give memory back.
            </li>
            <li>
              <b>
                <code>time.After</code> in a loop
              </b>{' '}
              kept each timer alive until it fired before Go 1.23. Since 1.23 (with <code>go 1.23</code> in go.mod) unreferenced timers are collectable.
            </li>
          </ul>
        </div>
      </Section>

      <section className="section" id="sandbox">
        <div className="wrap">
          <span className="kicker red">Sandbox</span>
          <h2>Free-play labs</h2>
          <p className="prose" style={{ color: 'var(--g500)' }}>
            The full dashboards, for when the stories make sense and you want to poke at the models yourself.
          </p>
          <details className="sandbox">
            <summary>Tri-color + write barrier dashboard</summary>
            <div className="sandbox-body">
              <TriColorLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Pacer: GOGC, GOMEMLIMIT, heap sawtooth</summary>
            <div className="sandbox-body">
              <PacerLab />
            </div>
          </details>
          <details className="sandbox">
            <summary>Green Tea vs classic on a random heap</summary>
            <div className="sandbox-body">
              <GreenTeaLab />
            </div>
          </details>
        </div>
      </section>

      <Section id="puzzles" n="10" kicker="Test yourself" title="GC & escape puzzles">
        <QuizList items={quiz} />
      </Section>

      <Section id="interview" n="11" kicker="Interview prep" title="Questions you will be asked">
        <Interview items={interview} prefix="gc" />
        <p className="bank-link">
          <Link to="/interview?cat=memory-gc">Drill the real interview questions on this topic →</Link>
        </p>
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
