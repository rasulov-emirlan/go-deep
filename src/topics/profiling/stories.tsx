import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ── 1. CPU profile → flame graph ─────────────────────────────── */

const WORK = 'convict-working-hard'
const LENS = 'science-welding'

const worker = (bubble?: string, sprite = WORK): Actor => ({ id: 'w', sprite, x: 380, y: 350, h: 90, tag: 'goroutine', bubble })
const lens = (bubble?: string, x = 530): Actor => ({ id: 'lens', sprite: LENS, x, y: 350, h: 110, tag: 'profiler', bubble })
const bar = (id: string, x: number, y: number, w: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y, w, h: 40, text, tone })
const stack = (leaf = 'json.Marshal', tone: Prop['tone'] = 'line'): Prop[] => [
  bar('f-main', 40, 120, 270, 'main'),
  bar('f-handle', 40, 165, 270, 'handle'),
  bar('f-json', 40, 210, 270, leaf, tone),
]
const tally = (text: string): Prop => ({ id: 'tally', x: 600, y: 120, w: 180, h: 130, tone: 'soft', label: 'samples', text })
const flame = (hot?: 'handle' | 'json'): Prop[] => [
  bar('f-main', 40, 120, 720, 'main · 100%'),
  bar('f-gc', 40, 165, 108, 'gc'),
  bar('f-handle', 148, 165, 612, 'handle · 85%', hot === 'handle' ? 'red' : 'line'),
  bar('f-scan', 148, 210, 180, 'db.Scan · 25%'),
  bar('f-json', 328, 210, 432, 'json.Marshal · 60%', hot === 'json' ? 'red' : 'line'),
]

export const cpuProfile: Frame[] = [
  {
    caption: 'A running goroutine is a stack of calls: main calls handle, handle calls json.Marshal.',
    actors: [worker('busy')],
    props: stack(),
  },
  {
    caption: 'A hundred times a second, SIGPROF interrupts the thread and the profiler copies whatever stack is running.',
    actors: [worker(), lens('snap!')],
    props: [...stack('json.Marshal', 'red'), tally('main;handle;json ×1')],
    stop: {
      title: 'how to capture one',
      body: (
        <>
          <p>Sampling costs a few percent, so it is safe in production. It is statistics: profile ≥30 s of real load.</p>
          <Code>{`go test -bench . -cpuprofile cpu.out
curl -O host:6060/debug/pprof/profile
go tool pprof -http=: profile`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Different moments catch different stacks. Identical stacks are simply counted.',
    actors: [worker(), lens('×1000')],
    props: [...stack('db.Scan'), tally('json 600 · scan 250 · gc 150')],
  },
  {
    caption: 'A goroutine waiting on the database is not on a CPU, so no sample ever sees it.',
    actors: [worker('waiting on DB', 'dandy-umbrella'), lens('nothing here')],
    props: [...stack('db.Query', 'dashed'), tally('json 600 · scan 250 · gc 150')],
    stop: {
      edge: true,
      title: 'off-CPU time is invisible',
      body: <p>A CPU profile answers “what burns CPU?”, not “why is it slow?”. Time spent waiting on locks, channels or the network lives in the block and mutex profiles, or the execution trace.</p>,
    },
  },
  {
    caption: 'Merge the counts into a flame graph: one bar per frame, width = share of samples.',
    actors: [lens(undefined, 700)],
    props: flame(),
  },
  {
    caption: 'Read it top-down. Left to right is not time (tools sort by name): only width means anything.',
    actors: [lens('widths only', 700)],
    props: flame(),
  },
  {
    caption: 'handle is 85% wide, yet it does almost nothing itself: all its time is in callees.',
    actors: [lens('flat 0?', 700)],
    props: flame('handle'),
    stop: {
      title: 'flat vs cum',
      body: (
        <>
          <p>
            <b>flat</b>: samples with this function on top of the stack. <b>cum</b>: flat plus everything it called. Wide bar, tiny flat → look below it.
          </p>
          <Code>{`flat  cum   cum%
6.0s  6.0s  60%  json.Marshal
   0  8.5s  85%  handle`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'The widest bar with fat flat time, json.Marshal, is where the CPU burns. Start there.',
    actors: [lens('found it', 700)],
    props: flame('json'),
  },
]

/* ── 2. Heap, goroutines, waiting ─────────────────────────────── */

const heap = (label = 'heap'): Prop => ({ id: 'heap', x: 40, y: 110, w: 330, h: 240, tone: 'dashed', label })
const blk = (id: string, x: number, y: number, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y, w: 60, h: 34, tone })
const blocks = (n: number, tone: Prop['tone'] = 'ink'): Prop[] =>
  Array.from({ length: n }, (_, i) => blk('b' + i, 60 + (i % 4) * 75, 300 - Math.floor(i / 4) * 44, i >= 4 ? tone : 'ink'))
const alloc = (bubble?: string): Actor => ({ id: 'alloc', sprite: WORK, x: 470, y: 350, h: 100, tag: 'handler', bubble })
const snoop = (bubble?: string): Actor => ({ id: 'lens', sprite: LENS, x: 690, y: 350, h: 110, tag: 'profiler', bubble })
const stat = (id: string, y: number, text: string, tone: Prop['tone'] = 'line', x = 540): Prop => ({ id, x, y, w: 240, h: 44, text, tone })
const pen = (label: string, w = 720): Prop => ({ id: 'heap', x: 40, y: 110, w, h: 240, tone: 'dashed', label })
const parked = (n: number): Actor[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, sprite: 'dandy-umbrella', x: 100 + i * 100, y: 350, h: 90, tag: 'G' + (i + 1), bubble: i === 0 ? '<-ch forever' : undefined }))

export const memory: Frame[] = [
  {
    caption: 'The heap profile samples about one allocation per 512 KiB allocated and remembers its stack.',
    actors: [alloc('new order'), snoop('noted: stack')],
    props: [heap(), ...blocks(3)],
  },
  {
    caption: 'Two views: alloc_space is everything ever allocated; inuse_space is what was still live at the last GC.',
    actors: [alloc(), snoop()],
    props: [heap(), ...blocks(3), stat('s1', 110, 'alloc_space · 4.1 GB'), stat('s2', 160, 'inuse_space · 38 MB')],
    stop: {
      title: 'which view when',
      body: (
        <p>
          High <code>alloc_space</code> means GC pressure and CPU: cut allocations. <code>inuse_space</code> that keeps growing is a leak or an unbounded cache. Same data:{' '}
          <code>-sample_index</code> switches.
        </p>
      ),
    },
  },
  {
    caption: 'A leak: two snapshots minutes apart under steady load, and inuse keeps climbing. Diff them to see what grew.',
    actors: [alloc(), snoop()],
    props: [heap(), ...blocks(12, 'red'), stat('s1', 110, 'snapshot 1 · 38 MB'), stat('s2', 160, 'snapshot 2 · 410 MB', 'red')],
  },
  {
    caption: 'The usual culprit is goroutines: each one blocked forever pins its stack and everything it references.',
    actors: [...parked(5)],
    props: [pen('parked goroutines')],
  },
  {
    caption: 'The goroutine profile groups them by stack: thousands parked on the same line give the leak away.',
    actors: [...parked(5)],
    props: [pen('parked goroutines'), stat('s1', 130, '12,408 goroutines', 'red', 500), stat('s2', 180, 'all at worker.go:42', 'line', 500)],
    stop: {
      edge: true,
      title: 'Go 1.26: goroutineleak',
      body: (
        <p>
          Build with <code>GOEXPERIMENT=goroutineleakprofile</code> and <code>/debug/pprof/goroutineleak</code> lists goroutines blocked on a channel or lock that nothing reachable can ever
          unblock. The GC finds them.
        </p>
      ),
    },
  },
  {
    caption: 'Waiting is not CPU. The block and mutex profiles show where goroutines queue on channels and locks.',
    actors: [
      { id: 'p0', sprite: 'convict-chained', x: 200, y: 350, h: 100, tag: 'G1', bubble: 'lock busy' },
      { id: 'p1', sprite: WORK, x: 420, y: 350, h: 100, tag: 'G2 · holds mu', hot: true },
    ],
    props: [pen('sync.Mutex', 560)],
    stop: {
      title: 'off by default',
      body: (
        <>
          <p>Both cost overhead, so you opt in. Block rate = nanoseconds blocked per sample (1 = every event). Mutex fraction 5 = 1 in 5 contentions.</p>
          <Code>{`runtime.SetBlockProfileRate(10_000)
runtime.SetMutexProfileFraction(5)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'The execution trace logs every scheduler event: who ran where, GC, syscalls. Use it for latency spikes.',
    actors: [snoop('go tool trace')],
    props: [
      pen('timeline', 560),
      { id: 'b6', x: 48, y: 150, w: 30, h: 34, tone: 'none', text: 'P0' },
      { id: 'b7', x: 48, y: 210, w: 30, h: 34, tone: 'none', text: 'P1' },
      { id: 'b0', x: 85, y: 150, w: 155, h: 34, tone: 'ink', text: 'G7' },
      { id: 'b1', x: 250, y: 150, w: 90, h: 34, tone: 'red', text: 'GC' },
      { id: 'b2', x: 350, y: 150, w: 220, h: 34, tone: 'ink', text: 'G9' },
      { id: 'b3', x: 85, y: 210, w: 95, h: 34, tone: 'soft', text: 'syscall' },
      { id: 'b4', x: 250, y: 210, w: 90, h: 34, tone: 'red', text: 'GC' },
      { id: 'b5', x: 350, y: 210, w: 140, h: 34, tone: 'ink', text: 'G3' },
    ],
  },
  {
    caption: 'In production: net/http/pprof on a private port, a continuous profiler, and profiles fed back into the build.',
    actors: [snoop('always on'), { id: 'alloc', sprite: 'superhero-flying', x: 300, y: 330, h: 110, tag: 'PGO build', hot: true }],
    props: [
      pen('prod', 560),
      { id: 'b0', x: 60, y: 130, w: 160, h: 50, tone: 'soft', text: '/debug/pprof' },
      { id: 'b1', x: 230, y: 130, w: 160, h: 50, tone: 'soft', text: 'Pyroscope' },
      { id: 'b2', x: 400, y: 130, w: 160, h: 50, tone: 'red', text: 'default.pgo' },
    ],
    stop: {
      title: 'pprof endpoint and PGO',
      body: (
        <>
          <p>
            <code>import _ "net/http/pprof"</code> registers <code>/debug/pprof/</code> on the default mux: serve it on an internal port, never the public one. Commit a CPU profile as{' '}
            <code>default.pgo</code> in the main package and <code>go build</code> uses it to inline and devirtualize hot calls: typically 2–14% faster.
          </p>
        </>
      ),
    },
  },
]

/* ── 3. Metrics: RED, USE, p99 ────────────────────────────────── */

const teller = (bubble?: string): Actor => ({ id: 't', sprite: 'fairy-tale-messenger-showing', x: 700, y: 350, h: 120, tag: 'metrics', bubble })
const card = (id: string, x: number, text: string, label?: string, tone: Prop['tone'] = 'line', w = 170): Prop => ({ id, x, y: 150, w, h: 90, text, label, tone })
const four = (id: string, i: number, text: string, label: string): Prop => ({ id, x: 30 + i * 150, y: 130, w: 140, h: 110, text, label })
const reqs = (slow: boolean): Actor[] => [
  { id: 'r1', sprite: 'fairy-tale-messenger-running', x: 90, y: 350, h: 80, tag: '10ms' },
  { id: 'r2', sprite: 'fairy-tale-messenger-running', x: 190, y: 350, h: 80, tag: '10ms' },
  { id: 'r3', sprite: 'fairy-tale-messenger-running', x: 290, y: 350, h: 80, tag: '×98' },
  { id: 'r4', sprite: 'dandy-raining', x: 420, y: 350, h: 90, tag: '2s', hot: true, bubble: slow ? 'still waiting' : undefined },
  { id: 'r5', sprite: 'dandy-raining', x: 520, y: 350, h: 90, tag: '2s', hot: true },
]

const spark: Prop[] = [18, 22, 20, 24, 19, 23, 21, 70, 110, 96, 28].map((v, i) => ({ id: 'k' + i, x: 70 + i * 45, y: 285 - v, w: 30, h: v, tone: v > 50 ? 'red' : 'ink' }))

export const metrics: Frame[] = [
  {
    caption: 'A metric is a number over time: cheap, aggregated, kept for months. It tells you something is wrong.',
    actors: [teller('p99 up 4×')],
    props: [{ id: 'm', x: 40, y: 130, w: 540, h: 170, tone: 'soft', label: 'p99 latency' }, ...spark],
  },
  {
    caption: 'For every service, watch RED: request Rate, Errors, and Duration.',
    actors: [teller('per service')],
    props: [card('c1', 40, 'Rate', 'R · req/s'), card('c2', 230, 'Errors', 'E · 5xx/s'), card('c3', 420, 'Duration', 'D · latency')],
  },
  {
    caption: 'For every resource (CPU, DB pool, queue, disk), watch USE: Utilization, Saturation, Errors.',
    actors: [teller('per resource')],
    props: [card('c1', 40, 'Utilization', 'U · % busy'), card('c2', 230, 'Saturation', 'S · queue', 'red'), card('c3', 420, 'Errors', 'E · failures')],
    stop: {
      edge: true,
      title: 'saturation warns first',
      body: <p>A pool at 100% utilization might be fine. Requests waiting for a connection is saturation: latency is already climbing.</p>,
    },
  },
  {
    caption: 'Prometheus has four metric types. Only the counter never goes down.',
    actors: [teller()],
    props: [four('c1', 0, 'counter', 'only up'), four('c2', 1, 'gauge', 'up & down'), four('c3', 2, 'histogram', 'buckets'), four('c4', 3, 'summary', 'quantiles')],
    stop: {
      title: 'histogram vs summary',
      body: (
        <p>
          Query a counter with <code>rate()</code>: it resets on restart and <code>rate</code> handles that. A histogram is a counter per bucket, so pods can be summed. A summary computes
          quantiles inside one process: you can’t merge them.
        </p>
      ),
    },
  },
  {
    caption: 'Of 100 requests, 98 take 10 ms and two take 2 seconds.',
    actors: [...reqs(true)],
    props: [],
  },
  {
    caption: 'The mean is 50 ms and looks healthy. The p99 is 2 s: that’s what the unlucky users felt.',
    actors: [...reqs(false), teller('mean lies')],
    props: [card('c1', 40, '50 ms', 'mean'), card('c2', 230, '2 s', 'p99', 'red')],
    stop: {
      title: 'why p99, not the average',
      body: <p>Averages hide the tail. Tails compound: a page that fans out to 100 backends hits some backend’s p99 on 63% of loads (1 − 0.99¹⁰⁰).</p>,
    },
  },
  {
    caption: 'Across pods, never average percentiles: sum the histogram buckets first, then take the quantile.',
    actors: [teller('sum buckets')],
    props: [card('c1', 40, 'pod A p99 + pod B p99 ÷ 2', 'wrong', 'dashed', 300), card('c2', 360, 'Σ buckets → quantile', 'right', 'ink', 260)],
    stop: {
      edge: true,
      title: 'the PromQL',
      body: <Code>{`histogram_quantile(0.99,
  sum by (le) (
    rate(latency_seconds_bucket[5m])))`}</Code>,
    },
  },
]

/* ── 4. Logs, metrics, traces ─────────────────────────────────── */

const svc = (id: string, x: number, label: string, hot?: string): Prop => ({ id, x, y: 260, w: 160, h: 70, text: label, tone: hot === id ? 'red' : 'line' })
const services = (hot?: string): Prop[] => [svc('gw', 30, 'gateway', hot), svc('ord', 320, 'orders', hot), svc('pay', 610, 'payments', hot)]
const msgr = (x: number, bubble?: string, tag = 'trace 4bf9…'): Actor => ({ id: 'msg', sprite: 'fairy-tale-messenger-red-letter', x, y: 335, h: 90, tag, bubble })
const span = (id: string, x: number, y: number, w: number, text: string, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y, w, h: 30, text, tone })

export const traces: Frame[] = [
  {
    caption: 'Metrics say something is wrong. Logs say what happened in one place. Traces say where, across services.',
    actors: [
      { id: 'm', sprite: 'fairy-tale-messenger-showing', x: 150, y: 340, h: 110, tag: 'metrics', bubble: 'something’s slow' },
      { id: 'l', sprite: 'fairy-tale-witch-learning', x: 400, y: 340, h: 110, tag: 'logs', bubble: 'here’s one event' },
      { id: 'msg', sprite: 'fairy-tale-messenger-red-letter', x: 650, y: 340, h: 100, tag: 'traces', bubble: 'here’s the path' },
    ],
    props: [],
  },
  {
    caption: 'A request hits the gateway. It mints a 128-bit trace id and opens the root span.',
    actors: [msgr(255, 'new trace')],
    props: [...services('gw'), span('s1', 30, 110, 740, 'gateway span')],
  },
  {
    caption: 'Calling orders, the gateway sends the trace id and its own span id in the traceparent header.',
    actors: [msgr(255, 'traceparent')],
    props: [...services(), span('s1', 30, 110, 740, 'gateway span')],
    stop: {
      title: 'W3C traceparent',
      body: (
        <>
          <p>version · trace id (16 bytes) · parent span id (8 bytes) · flags (01 = sampled).</p>
          <Code>{`traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'orders opens a child span: same trace id, parent = the gateway’s span.',
    actors: [msgr(255, 'child span')],
    props: [...services('ord'), span('s1', 30, 110, 740, 'gateway span'), span('s2', 90, 145, 640, 'orders', 'line')],
  },
  {
    caption: 'In Go the span rides in context.Context, so every call has to pass ctx along.',
    actors: [msgr(545, 'ctx carries it')],
    props: [...services(), span('s1', 30, 110, 740, 'gateway span'), span('s2', 90, 145, 640, 'orders', 'line'), span('s3', 160, 180, 520, 'payments', 'line')],
    stop: {
      edge: true,
      title: 'the broken trace',
      body: <p>Call <code>context.Background()</code> midway, or use a plain http.Client, and the next hop starts a new trace. otelhttp’s handler and transport extract and inject the header for you.</p>,
    },
  },
  {
    caption: 'A collector stitches the spans into a waterfall. The widest child is where the latency lives.',
    actors: [msgr(545, 'payments: 1.8 s')],
    props: [...services('pay'), span('s1', 30, 110, 740, 'gateway · 2.0 s'), span('s2', 90, 145, 640, 'orders · 1.9 s', 'line'), span('s3', 160, 180, 520, 'payments · 1.8 s', 'red')],
    stop: {
      title: 'tie the three together',
      body: (
        <p>
          Put <code>trace_id</code> in every log line and attach exemplars to latency histograms: then a p99 spike links to one trace, and the trace to its logs. Keep all errors and slow traces
          (tail sampling), sample the rest.
        </p>
      ),
    },
  },
]
