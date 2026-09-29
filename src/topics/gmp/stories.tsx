import type { Actor, Frame, Prop } from '../../components/Story'

const WAIT = 'misc-standing-left'
const RUN = 'convict-working-hard'
const KNIGHT = 'fairy-tale-armored-knight'

const g = (id: string, x: number, more: Partial<Actor> = {}): Actor => ({ id, sprite: WAIT, x, y: 330, h: 88, tag: id, ...more })
const running = (id: string, x: number, more: Partial<Actor> = {}): Actor => ({ id, sprite: RUN, x, y: 330, h: 110, tag: id, hot: true, ...more })

// 1 · G, M, P and the run loop
const runq: Prop = { id: 'runq', x: 90, y: 210, w: 290, h: 140, tone: 'dashed', label: 'P0 queue' }
const desk: Prop = { id: 'desk', x: 420, y: 230, w: 210, h: 120, tone: 'soft', label: 'P0' }
const m0: Actor = { id: 'M0', sprite: KNIGHT, x: 710, y: 340, h: 170, tag: 'M0' }

export const meetGMP: Frame[] = [
  {
    caption: 'A goroutine (G) is a task with a tiny 2 KB stack. Thousands wait cheaply.',
    actors: [g('G1', 300), g('G2', 222), g('G3', 144)],
  },
  {
    caption: 'P is a slot with a queue. A thread needs one to run Go code.',
    actors: [g('G1', 300), g('G2', 222), g('G3', 144)],
    props: [runq, desk],
  },
  {
    caption: 'M is an OS thread. M0 holds P0, so it can run G1.',
    actors: [running('G1', 525, { bubble: 'running' }), g('G2', 222), g('G3', 144), m0],
    props: [runq, desk],
    stop: {
      title: 'How many run at once?',
      body: (
        <p>
          There are <code>GOMAXPROCS</code> Ps, so at most that many goroutines run Go code at the same instant. There can be more threads: a thread stuck in a slow syscall hands its P off.
        </p>
      ),
    },
  },
  {
    caption: 'G1 finishes or blocks. M0 picks the next G right away.',
    actors: [running('G2', 525, { bubble: 'running' }), g('G3', 144), m0],
    props: [runq, desk],
  },
  {
    caption: 'G2 loops forever and never blocks. Can it hog P0?',
    actors: [running('G2', 525, { bubble: 'for {}' }), g('G3', 144), m0],
    props: [runq, desk],
  },
  {
    caption: 'No. After about 10 ms the runtime preempts it: pauses it, runs G3.',
    actors: [g('G2', 230, { y: 190, bubble: 'later' }), running('G3', 525, { bubble: 'running' }), m0],
    props: [runq, desk],
    stop: {
      title: 'Even a for {} loop?',
      body: (
        <p>
          Yes, since Go 1.14: the runtime interrupts it with a signal. Before 1.14, a loop with no function calls could hang the program.
        </p>
      ),
    },
  },
]

// 2 · one shared queue vs a queue per P, then stealing
const kn = (id: string, x: number, bubble?: string, hot?: boolean): Actor => ({ id, sprite: KNIGHT, x, y: 345, h: 130, tag: id, bubble, hot })
const tray: Prop = { id: 'tray', x: 200, y: 190, w: 400, h: 150, tone: 'dashed', label: 'shared queue' }
const lock: Prop = { id: 'lock', x: 370, y: 150, w: 60, h: 34, tone: 'ink', text: 'LOCK' }
const q0: Prop = { id: 'q0', x: 30, y: 210, w: 340, h: 140, tone: 'dashed', label: 'P0 queue' }
const q1: Prop = { id: 'q1', x: 430, y: 210, w: 340, h: 140, tone: 'dashed', label: 'P1 queue' }

export const whyP: Frame[] = [
  {
    caption: 'Naive design: every thread takes goroutines from one shared queue.',
    actors: [g('G1', 340), g('G2', 460), kn('M0', 120), kn('M1', 680)],
    props: [tray],
  },
  {
    caption: 'A shared queue needs a lock, so threads wait for each other.',
    actors: [g('G1', 340), g('G2', 460), kn('M0', 120), kn('M1', 680, 'waiting…', true)],
    props: [tray, lock],
  },
  {
    caption: 'Go’s fix: each P gets its own queue. No lock, no waiting.',
    actors: [g('G1', 100), g('G2', 190), kn('M0', 310), kn('M1', 710)],
    props: [q0, q1],
  },
  {
    caption: 'P1’s queue runs empty. Its thread doesn’t go to sleep yet.',
    actors: [g('G1', 100), g('G2', 190), kn('M0', 310), kn('M1', 710, 'queue empty', true)],
    props: [q0, q1],
  },
  {
    caption: 'Work stealing: an idle P takes half of another P’s queue.',
    actors: [g('G1', 100), g('G2', 560), kn('M0', 310), kn('M1', 710, 'got one!')],
    props: [q0, q1],
    stop: {
      title: 'There’s a global queue too',
      body: (
        <p>
          It holds overflow and goroutines back from syscalls; an idle P checks it before stealing. Every P also checks it every 61st turn, so it never starves.
        </p>
      ),
    },
  },
]

// 3 · network wait (netpoller) vs file read (syscall handoff)
const desk3: Prop = { id: 'desk', x: 250, y: 230, w: 200, h: 120, tone: 'soft', label: 'P0' }
const poller: Prop = { id: 'poll', x: 20, y: 70, w: 200, h: 110, tone: 'dashed', label: 'netpoller' }
const m0b: Actor = { id: 'M0', sprite: KNIGHT, x: 520, y: 345, h: 150, tag: 'M0' }
const parked: Actor = g('G1', 120, { y: 170, h: 80, dim: true })

export const waiting: Frame[] = [
  {
    caption: 'G1 reads from a network socket. No data has arrived yet.',
    actors: [running('G1', 350, { bubble: 'conn.Read()' }), g('G2', 150), m0b],
    props: [desk3, poller],
  },
  {
    caption: 'The netpoller, a socket watcher, parks G1. M0 runs G2 meanwhile.',
    actors: [parked, running('G2', 350), m0b],
    props: [desk3, poller],
  },
  {
    caption: 'Data arrives, so G1 is ready again. No thread sat waiting.',
    actors: [g('G1', 150), running('G2', 350), m0b],
    props: [desk3, poller],
  },
  {
    caption: 'G2 reads a file: a blocking syscall. M0 is stuck inside it.',
    actors: [g('G1', 150), running('G2', 615, { bubble: 'os.ReadFile', h: 95 }), { ...m0b, x: 725, hot: true }],
    props: [desk3, poller],
  },
  {
    caption: 'It’s slow, so P0 is handed off to another thread, M1. G1 runs.',
    actors: [
      running('G1', 350),
      running('G2', 615, { bubble: 'os.ReadFile', h: 95 }),
      { ...m0b, x: 725, hot: true },
      { id: 'M1', sprite: KNIGHT, x: 500, y: 345, h: 150, tag: 'M1' },
    ],
    props: [desk3, poller],
    stop: {
      title: 'Network vs file',
      body: (
        <p>
          A network wait parks only the goroutine. A slow file or cgo call holds a whole thread, so 1,000 of them can mean ~1,000 threads.
        </p>
      ),
    },
  },
]

// 4 · GOMAXPROCS in a container
const whale = (bubble?: string): Actor => ({ id: 'whale', sprite: 'friends-docker', x: 110, y: 330, h: 110, tag: 'pod', bubble })
const node = (tone: Prop['tone'] = 'dashed', label = '64 CPUs'): Prop => ({ id: 'node', x: 220, y: 140, w: 560, h: 210, tone, label })
const ps = (label: string, tone: Prop['tone'] = 'soft'): Prop => ({ id: 'ps', x: 260, y: 220, w: 480, h: 110, tone, label })
const knights = (n: number): Actor[] => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, sprite: KNIGHT, x: 380 + i * 120, y: 325, h: 80 }))

export const containerProcs: Frame[] = [
  {
    caption: 'Your pod runs on a 64-core machine, but its CPU limit is 2.',
    actors: [whale('limit: 2 CPUs')],
    props: [node()],
  },
  {
    caption: 'Before Go 1.25, GOMAXPROCS (the number of Ps) counted all 64 cores.',
    actors: [whale(), ...knights(3)],
    props: [node(), ps('64 Ps')],
  },
  {
    caption: 'They use up the 2-CPU budget fast, then the kernel pauses the app.',
    actors: [whale('throttled!'), ...knights(3)],
    props: [node('red', 'throttled'), ps('64 Ps', 'red')],
    stop: {
      title: 'Random latency spikes',
      body: (
        <p>
          This throttling shows up as sudden tail-latency spikes. The old fix was <code>uber-go/automaxprocs</code> or setting <code>GOMAXPROCS</code> by hand.
        </p>
      ),
    },
  },
  {
    caption: 'Go 1.25+ reads the CPU limit: GOMAXPROCS = 2. No throttling.',
    actors: [whale(), ...knights(2)],
    props: [node(), ps('2 Ps')],
    stop: {
      title: 'The fine print',
      edge: true,
      body: (
        <p>
          Only the CPU <b>limit</b> counts, not requests, and it is rounded up to at least 2. It needs <code>go 1.25</code>+ in go.mod, and setting <code>GOMAXPROCS</code> yourself still wins.
        </p>
      ),
    },
  },
]
