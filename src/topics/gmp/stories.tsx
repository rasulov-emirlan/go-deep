import type { Actor, Frame, Prop } from '../../components/Story'

const WAIT = 'misc-standing-left'
const RUN = 'convict-working-hard'

const queue = (ids: string[], from = 340): Actor[] => ids.map((id, i) => ({ id, sprite: WAIT, x: from - i * 78, y: 330, h: 88, tag: id }))
const runq: Prop = { id: 'runq', x: 20, y: 210, w: 370, h: 140, tone: 'dashed', label: 'P0 local run queue' }
const desk: Prop = { id: 'desk', x: 420, y: 230, w: 210, h: 120, tone: 'soft', label: 'P0 · processor' }
const knight: Actor = { id: 'm0', sprite: 'fairy-tale-armored-knight', x: 710, y: 340, h: 170, tag: 'M0 · OS thread' }

export const meetGMP: Frame[] = [
  {
    caption: 'A goroutine (G) is a tiny gopher with a job to do. They are cheap — thousands can wait in line.',
    actors: queue(['G1', 'G2', 'G3', 'G4']),
    props: [runq],
  },
  {
    caption: 'A P is a workbench. Only a gopher standing at a P can run Go code. There are exactly GOMAXPROCS benches.',
    actors: queue(['G1', 'G2', 'G3', 'G4']),
    props: [runq, desk],
  },
  {
    caption: 'An M is an OS thread: a heavy knight that does the actual work. A knight must hold a bench (P) to run a goroutine.',
    actors: [...queue(['G1', 'G2', 'G3', 'G4']), knight],
    props: [runq, desk],
    stop: {
      title: 'why three pieces, not two?',
      body: (
        <p>
          Go 1.0 had only G and M, with one global queue behind one lock. When a knight got stuck in a slow syscall, the goroutines it held were stuck too. Putting the queue on the <b>bench</b> means a
          stuck knight can simply hand its bench — queue and all — to another knight.
        </p>
      ),
    },
  },
  {
    caption: 'M0 takes the first gopher in P0’s queue and runs it.',
    actors: [{ id: 'G1', sprite: RUN, x: 525, y: 330, h: 110, tag: 'G1', hot: true, bubble: 'running' }, ...queue(['G2', 'G3', 'G4']), knight],
    props: [runq, desk],
  },
  {
    caption: 'When G1 finishes (or blocks), the next gopher in line steps up. The knight never idles while there is work.',
    actors: [
      { id: 'G1', sprite: 'superhero-standing', x: 525, y: 180, h: 90, tag: 'G1 done', hidden: false, dim: true },
      { id: 'G2', sprite: RUN, x: 525, y: 330, h: 110, tag: 'G2', hot: true, bubble: 'running' },
      ...queue(['G3', 'G4']),
      knight,
    ],
    props: [runq, desk],
  },
]

const tray: Prop = { id: 'tray', x: 250, y: 190, w: 300, h: 150, tone: 'dashed', label: 'one shared queue' }
const lock: Prop = { id: 'lock', x: 370, y: 150, w: 60, h: 34, tone: 'ink', text: 'LOCK' }
const kn = (id: string, x: number, bubble?: string, hot?: boolean): Actor => ({ id, sprite: 'fairy-tale-armored-knight', x, y: 345, h: 130, tag: id, bubble, hot })
const w3 = (dx = 0): Actor[] => [
  { id: 'G1', sprite: 'misc-standing-left', x: 320 + dx, y: 330, h: 80, tag: 'G1' },
  { id: 'G2', sprite: 'misc-standing-v2', x: 400 + dx, y: 330, h: 80, tag: 'G2' },
  { id: 'G3', sprite: 'dandy-standing', x: 480 + dx, y: 330, h: 80, tag: 'G3' },
]

export const whyP: Frame[] = [
  {
    caption: 'Imagine the naive design: every thread (knight) takes goroutines from one shared queue.',
    actors: [...w3(), kn('M0', 120), kn('M1', 680)],
    props: [tray],
  },
  {
    caption: 'A shared queue needs a lock. Both knights reach for it; one of them has to wait.',
    actors: [...w3(), kn('M0', 200, 'mine!'), kn('M1', 600, 'waiting…', true)],
    props: [tray, lock],
  },
  {
    caption: 'Add more CPUs and more knights, and the line at the lock gets longer than the line of work. This was Go 1.0.',
    actors: [...w3(), kn('M0', 200, 'mine!'), kn('M1', 600, 'waiting…', true), kn('M2', 700, 'waiting…', true), kn('M3', 90, 'waiting…', true)],
    props: [tray, lock],
    stop: {
      title: 'the Go 1.0 scheduler',
      body: <p>One global run queue behind one mutex, and allocation caches per thread. Dmitry Vyukov’s 2012 redesign (Go 1.1) fixed both by introducing P.</p>,
    },
  },
  {
    caption: 'Fix: give each workbench (P) its own queue. A knight working at P0 takes from P0’s queue — no lock.',
    actors: [
      { id: 'G1', sprite: 'misc-standing-left', x: 150, y: 330, h: 80, tag: 'G1' },
      { id: 'G2', sprite: 'misc-standing-v2', x: 230, y: 330, h: 80, tag: 'G2' },
      { id: 'G3', sprite: 'dandy-standing', x: 570, y: 330, h: 80, tag: 'G3' },
      kn('M0', 330, 'no lock!'),
      kn('M1', 710, 'no lock!'),
    ],
    props: [
      { id: 'q0', x: 90, y: 210, w: 300, h: 140, tone: 'dashed', label: 'P0 queue' },
      { id: 'q1', x: 480, y: 210, w: 300, h: 140, tone: 'dashed', label: 'P1 queue' },
    ],
  },
  {
    caption: 'The queue belongs to the P, not the knight. If a knight gets stuck, its P — queue and all — moves to another knight.',
    actors: [
      { id: 'G1', sprite: 'misc-standing-left', x: 150, y: 330, h: 80, tag: 'G1' },
      { id: 'G2', sprite: 'misc-standing-v2', x: 230, y: 330, h: 80, tag: 'G2' },
      { id: 'G3', sprite: 'dandy-standing', x: 570, y: 330, h: 80, tag: 'G3' },
      { id: 'M0', sprite: 'fairy-tale-armored-knight', x: 440, y: 190, h: 95, tag: 'M0', bubble: 'stuck in read()', hot: true },
      kn('M2', 330, 'I’ll take P0'),
      kn('M1', 710),
    ],
    props: [
      { id: 'q0', x: 90, y: 210, w: 300, h: 140, tone: 'dashed', label: 'P0 queue' },
      { id: 'q1', x: 480, y: 210, w: 300, h: 140, tone: 'dashed', label: 'P1 queue' },
    ],
    stop: {
      title: 'what the global queue is still for',
      body: (
        <p>
          A global queue still exists, but only for overflow (a full local queue), <code>Gosched</code>, preemption, and goroutines returning from syscalls with no free P. Every P checks it when its own
          queue is empty, and once every 61 turns anyway. The guided tour below shows each case.
        </p>
      ),
    },
  },
]

const whale: Actor = { id: 'whale', sprite: 'friends-docker', x: 110, y: 330, h: 110, tag: 'pod: limits.cpu = 2' }
const benches = (n: number, red = false): Prop[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'b' + i, x: 230 + (i % 8) * 68, y: 160 + Math.floor(i / 8) * 64, w: 58, h: 50, tone: red ? 'red' : 'soft', text: `P${i}` }))
const knights = (n: number, bubble?: string): Actor[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'k' + i, sprite: 'fairy-tale-armored-knight', x: 259 + (i % 8) * 68, y: 210 + Math.floor(i / 8) * 64 - 4, h: 46, bubble: i === 0 ? bubble : undefined }))

export const containerProcs: Frame[] = [
  {
    caption: 'Your pod runs on a 64-core node, but its CPU limit is 2 cores.',
    actors: [whale],
    props: [{ id: 'node', x: 220, y: 140, w: 560, h: 210, tone: 'dashed', label: 'node: 64 CPUs' }],
  },
  {
    caption: 'Go ≤ 1.24 counts the node’s CPUs: GOMAXPROCS = 64, so 64 benches work in parallel (16 drawn).',
    actors: [whale, ...knights(16)],
    props: [{ id: 'node', x: 220, y: 140, w: 560, h: 210, tone: 'dashed', label: 'node: 64 CPUs · GOMAXPROCS = 64' }, ...benches(16)],
  },
  {
    caption: 'They burn the pod’s 2-core quota in a few milliseconds, then the kernel throttles the whole process for the rest of the 100 ms period.',
    actors: [whale, ...knights(16, 'throttled!')],
    props: [{ id: 'node', x: 220, y: 140, w: 560, h: 210, tone: 'red', label: 'CFS quota used up → everyone waits' }, ...benches(16, true)],
    stop: {
      title: 'the p99 spike nobody could explain',
      body: <p>CPU throttling shows up as random 50–100 ms latency spikes. For years the fix was <code>uber-go/automaxprocs</code> or setting GOMAXPROCS by hand.</p>,
    },
  },
  {
    caption: 'Go 1.25+ reads the cgroup limit: GOMAXPROCS = min(64, ceil(2)) = 2. Two benches, no throttling.',
    actors: [whale, ...knights(2)],
    props: [{ id: 'node', x: 220, y: 140, w: 560, h: 210, tone: 'dashed', label: 'node: 64 CPUs · GOMAXPROCS = 2' }, ...benches(2)],
    stop: {
      title: 'the fine print',
      edge: true,
      body: (
        <>
          <p>
            Only the CPU <b>limit</b> counts, never requests. A limit below 2 is rounded up to <b>2</b> (so 500m → 2). The runtime re-checks about once a second, so resizing the pod updates it.
          </p>
          <p>
            It only applies if <code>go.mod</code> says <code>go 1.25</code> or later, and setting <code>GOMAXPROCS</code> yourself turns it off.
          </p>
        </>
      ),
    },
  },
]
