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
const flame = (hot?: 'handle'): Prop[] => [
  bar('f-main', 40, 120, 720, 'main 100%'),
  bar('f-handle', 148, 165, 612, 'handle 85%', hot === 'handle' ? 'red' : 'line'),
  bar('f-scan', 148, 210, 180, 'db.Scan'),
  bar('f-json', 328, 210, 432, 'json.Marshal 60%'),
]

export const cpuProfile: Frame[] = [
  {
    caption: 'A running goroutine is a stack of calls: main calls handle, handle calls json.Marshal.',
    actors: [worker('busy')],
    props: stack(),
  },
  {
    caption: '100 times a second, the profiler copies whichever stack is running.',
    actors: [worker(), lens('snap!')],
    props: [...stack('json.Marshal', 'red'), tally('json ×1')],
    stop: {
      title: 'Safe in production',
      body: (
        <>
          <p>Sampling costs only a few percent; grab 30 seconds of real traffic.</p>
          <Code>{`import _ "net/http/pprof"
// serve it on a private port, then:
go tool pprof -http=: \\
  host:6060/debug/pprof/profile`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Identical stacks are counted. More samples means more CPU time.',
    actors: [worker(), lens('×1000')],
    props: [...stack('db.Scan'), tally('json ×600')],
  },
  {
    caption: 'Waiting on the database uses no CPU, so CPU samples never see it.',
    actors: [worker('waiting', 'dandy-umbrella'), lens('nothing')],
    props: [...stack('db.Query', 'dashed'), tally('json ×600')],
  },
  {
    caption: 'A flame graph merges the counts: the wider the bar, the more CPU.',
    actors: [lens(undefined, 750)],
    props: flame(),
  },
  {
    caption: 'handle is wide, but its time is spent in the calls below it.',
    actors: [lens('flat 0?', 750)],
    props: flame('handle'),
    stop: {
      title: 'flat vs cum',
      body: (
        <p>
          <b>flat</b> is time in the function itself; <b>cum</b> adds everything it calls. Fix wide bars with big flat time.
        </p>
      ),
    },
  },
]

/* ── 2. Heap and goroutine leaks ──────────────────────────────── */

const heap = (): Prop => ({ id: 'heap', x: 40, y: 110, w: 330, h: 240, tone: 'dashed', label: 'heap' })
const blocks = (tone: Prop['tone'] = 'ink'): Prop => ({ id: 'blocks', x: 60, y: 250, w: 290, h: 80, tone, text: tone === 'red' ? '410 MB' : '38 MB' })
const alloc = (bubble?: string): Actor => ({ id: 'alloc', sprite: WORK, x: 470, y: 350, h: 100, tag: 'handler', bubble })
const snoop = (bubble?: string): Actor => ({ id: 'lens', sprite: LENS, x: 690, y: 350, h: 110, tag: 'profiler', bubble })
const stat = (id: string, y: number, text: string, tone: Prop['tone'] = 'line', x = 540): Prop => ({ id, x, y, w: 240, h: 44, text, tone })
const pen = (): Prop => ({ id: 'heap', x: 40, y: 110, w: 440, h: 240, tone: 'dashed', label: 'goroutines' })
const parked = (n: number): Actor[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, sprite: 'dandy-umbrella', x: 100 + i * 120, y: 350, h: 90, tag: 'G' + (i + 1), bubble: i === 0 ? 'stuck on <-ch' : undefined }))

export const memory: Frame[] = [
  {
    caption: 'The heap profile records which code allocated memory, by call stack.',
    actors: [alloc('new order'), snoop('noted')],
    props: [heap(), blocks()],
  },
  {
    caption: 'It has two views: everything ever allocated, and what is still in use.',
    actors: [alloc(), snoop()],
    props: [heap(), blocks(), stat('s1', 110, 'alloc_space'), stat('s2', 160, 'inuse_space')],
    stop: {
      title: 'Which view when',
      body: (
        <p>
          High <code>alloc_space</code> means the GC works hard: allocate less. <code>inuse_space</code> that keeps growing is a leak.
        </p>
      ),
    },
  },
  {
    caption: 'A leak: take two snapshots minutes apart, and in-use memory keeps climbing.',
    actors: [alloc(), snoop()],
    props: [heap(), blocks('red'), stat('s1', 110, 'before 38MB'), stat('s2', 160, 'after 410MB', 'red')],
  },
  {
    caption: 'A common cause: goroutines stuck forever, each holding its memory.',
    actors: parked(3),
    props: [pen()],
  },
  {
    caption: 'The goroutine profile groups them by stack: thousands on one line is the leak.',
    actors: parked(3),
    props: [pen(), stat('s1', 130, '12,408 stuck', 'red', 530), stat('s2', 180, 'worker.go:42', 'line', 530)],
  },
]

/* ── 3. Metrics: RED, USE, p99 ────────────────────────────────── */

const teller = (bubble?: string): Actor => ({ id: 't', sprite: 'fairy-tale-messenger-showing', x: 700, y: 350, h: 120, tag: 'metrics', bubble })
const card = (id: string, x: number, text: string, label?: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y: 150, w: 170, h: 90, text, label, tone })
const four = (id: string, i: number, text: string, label: string): Prop => ({ id, x: 30 + i * 150, y: 130, w: 140, h: 110, text, label })
const reqs = (): Actor[] => [
  { id: 'r1', sprite: 'fairy-tale-messenger-running', x: 90, y: 350, h: 80, tag: '10ms' },
  { id: 'r2', sprite: 'fairy-tale-messenger-running', x: 210, y: 350, h: 80, tag: '×98' },
  { id: 'r3', sprite: 'dandy-raining', x: 400, y: 350, h: 90, tag: '2s ×2', hot: true },
]

export const metrics: Frame[] = [
  {
    caption: 'For each service, watch RED: request rate, errors, and duration.',
    actors: [teller('per service')],
    props: [card('c1', 40, 'Rate', 'req/s'), card('c2', 230, 'Errors', '5xx/s'), card('c3', 420, 'Duration', 'latency')],
  },
  {
    caption: 'For each resource, like a DB pool, watch USE: utilization, saturation, errors.',
    actors: [teller('per resource')],
    props: [card('c1', 40, 'Utilization', '% busy'), card('c2', 230, 'Saturation', 'queue', 'red'), card('c3', 420, 'Errors', 'failures')],
  },
  {
    caption: 'Prometheus has four metric types. A counter only ever goes up.',
    actors: [teller()],
    props: [four('c1', 0, 'counter', 'only up'), four('c2', 1, 'gauge', 'up & down'), four('c3', 2, 'histogram', 'buckets'), four('c4', 3, 'summary', 'quantiles')],
    stop: {
      title: 'Histogram vs summary',
      body: <p>A histogram counts requests per latency bucket, so pods can be added up. A summary computes percentiles inside one process, and those can’t be merged.</p>,
    },
  },
  {
    caption: 'Of 100 requests, 98 take 10 ms and two take 2 seconds.',
    actors: reqs(),
    props: [],
  },
  {
    caption: 'The average, 50 ms, looks fine. p99, the slowest 1%, takes 2 s.',
    actors: [...reqs(), teller('mean lies')],
    props: [card('c1', 40, '50 ms', 'mean'), card('c2', 230, '2 s', 'p99', 'red')],
  },
]

/* ── 4. Traces ────────────────────────────────────────────────── */

const svc = (id: string, x: number, label: string, hot?: string): Prop => ({ id, x, y: 260, w: 160, h: 70, text: label, tone: hot === id ? 'red' : 'line' })
const services = (hot?: string): Prop[] => [svc('gw', 30, 'gateway', hot), svc('ord', 320, 'orders', hot), svc('pay', 610, 'payments', hot)]
const msgr = (x: number, bubble?: string): Actor => ({ id: 'msg', sprite: 'fairy-tale-messenger-red-letter', x, y: 335, h: 90, tag: 'trace 4bf9', bubble })
const span = (id: string, x: number, y: number, w: number, text: string, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y, w, h: 30, text, tone })

export const traces: Frame[] = [
  {
    caption: 'Metrics say something is wrong. Logs say what happened. Traces say where.',
    actors: [
      { id: 'm', sprite: 'fairy-tale-messenger-showing', x: 150, y: 340, h: 110, tag: 'metrics', bubble: 'something’s slow' },
      { id: 'l', sprite: 'fairy-tale-witch-learning', x: 400, y: 340, h: 110, tag: 'logs', bubble: 'what happened' },
      { id: 'msg', sprite: 'fairy-tale-messenger-red-letter', x: 650, y: 340, h: 100, tag: 'traces', bubble: 'where exactly' },
    ],
    props: [],
  },
  {
    caption: 'The gateway creates a trace id and a span: one timed step of work.',
    actors: [msgr(255, 'new trace')],
    props: [...services('gw'), span('s1', 30, 110, 740, 'gateway')],
  },
  {
    caption: (
      <>
        Calling orders, it sends the trace id in a <code>traceparent</code> header.
      </>
    ),
    actors: [msgr(255, 'traceparent')],
    props: [...services(), span('s1', 30, 110, 740, 'gateway')],
  },
  {
    caption: 'orders opens a child span with the same trace id, carried in Go’s ctx.',
    actors: [msgr(545, 'ctx carries it')],
    props: [...services('ord'), span('s1', 30, 110, 740, 'gateway'), span('s2', 90, 145, 640, 'orders', 'line')],
    stop: {
      title: 'The broken trace',
      body: (
        <p>
          Pass <code>ctx</code> into every call. Use <code>context.Background()</code> midway and the next service starts a new, unrelated trace.
        </p>
      ),
    },
  },
  {
    caption: 'The spans line up as a waterfall. The widest child is where time goes.',
    actors: [],
    props: [...services('pay'), span('s1', 30, 110, 740, 'gateway 2.0s'), span('s2', 90, 145, 640, 'orders 1.9s', 'line'), span('s3', 160, 180, 520, 'payments 1.8s', 'red')],
  },
]
