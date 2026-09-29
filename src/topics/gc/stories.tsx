import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'
import { atRoots, beside, gopher, RY, town, type House, type Paint, type Road } from './town'

// ---- helpers ------------------------------------------------------------------------------

type Pos = [id: string, col: number, row: number]
const houses = (pos: Pos[], paint: Record<string, Paint> = {}): House[] => pos.map(([id, col, row]) => ({ id, col, row, label: id, paint: paint[id] ?? 'white' }))
const hot = (roads: Road[], ...keys: string[]) => roads.map((r) => (keys.includes(`${r.from}>${r.to}`) ? { ...r, tone: 'red' as const } : r))
const rest = (row: number) => ({ x: 725, y: RY(row) })
const noLabel = () => ''

const marker = (at: { x: number; y: number }, bubble?: string, more: Partial<Actor> = {}) => gopher('marker', at, { tag: 'marker', bubble, ...more })
const program = (at: { x: number; y: number }, bubble?: string, more: Partial<Actor> = {}) => gopher('program', at, { tag: 'program', bubble, ...more })

// ---- 1 · stack or heap --------------------------------------------------------------------

const stackBox: Prop = { id: 'stack', x: 40, y: 30, w: 320, h: 220, tone: 'soft', label: 'G1 stack' }
const heapBox: Prop = { id: 'heap', x: 440, y: 30, w: 320, h: 220, tone: 'line', label: 'heap' }
const val = (id: string, text: string, x: number, y: number, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y, w: 110, h: 54, tone, text })
const onStack = (id: string, text: string, i: number, tone?: Prop['tone']) => val(id, text, 70 + i * 140, 110, tone)
const onHeap = (id: string, text: string, i: number, tone?: Prop['tone']) => val(id, text, 470 + i * 140, 110, tone)
const fn = (bubble?: string, more: Partial<Actor> = {}) => program({ x: 200, y: 350 }, bubble, { tag: 'func', h: 90, ...more })
const gc = (bubble?: string, more: Partial<Actor> = {}): Actor => gopher('sweeper', { x: 600, y: 350 }, { tag: 'GC', h: 90, bubble, ...more })

export const stackHeap: Frame[] = [
  {
    caption: 'Each goroutine has a stack. Locals there vanish for free when the function returns.',
    actors: [fn('x := 1', { hot: true }), gc(undefined, { dim: true })],
    props: [stackBox, heapBox, onStack('x', 'x', 0)],
  },
  {
    caption: 'The heap is shared. Heap values cost more: only the garbage collector (GC) frees them.',
    actors: [fn(), gc('I free these', { hot: true })],
    props: [stackBox, heapBox, onStack('x', 'x', 0), onHeap('h1', 'obj', 0), onHeap('h2', 'obj', 1)],
  },
  {
    caption: 'The compiler picks stack or heap for every value. This is called escape analysis.',
    actors: [fn('stack or heap?'), gc(undefined, { dim: true })],
    props: [stackBox, heapBox, onStack('x', 'x', 0), onHeap('h1', 'obj', 0), onHeap('h2', 'obj', 1)],
  },
  {
    caption: '`p := &x` is fine: x stays on the stack while p stays local.',
    actors: [fn('p := &x', { hot: true }), gc(undefined, { dim: true })],
    props: [stackBox, heapBox, onStack('x', 'x', 0), onStack('p', 'p → x', 1), onHeap('h1', 'obj', 0), onHeap('h2', 'obj', 1)],
  },
  {
    caption: '`return &n`: n must outlive the function, so it escapes to the heap.',
    actors: [fn('return &n', { hot: true }), gc()],
    props: [stackBox, heapBox, onStack('x', 'x', 0), onStack('p', 'p → x', 1), onHeap('h1', 'obj', 0), { ...onHeap('n', 'n', 1, 'red'), y: 180 }],
    stop: {
      title: 'What makes a value escape',
      body: (
        <>
          <p>Returning a pointer, or passing a value as an interface (like to fmt.Println), usually moves it to the heap.</p>
          <Code>{`
$ go build -gcflags=-m ./esc
esc/main.go:11:2: moved to heap: n
esc/main.go:21:14: x escapes to heap
`}</Code>
        </>
      ),
    },
  },
]

// ---- 2 · mark and sweep -------------------------------------------------------------------

const mPos: Pos[] = [
  ['A', 1, 0],
  ['C', 2, 0],
  ['E', 3, 0],
  ['B', 1, 1],
  ['D', 2, 1],
  ['F', 3, 1],
]
const mRoads: Road[] = [
  { from: 'root:G1', to: 'A' },
  { from: 'root:glob', to: 'B' },
  { from: 'A', to: 'C' },
  { from: 'B', to: 'C' },
  { from: 'B', to: 'D' },
  { from: 'E', to: 'F' },
  { from: 'F', to: 'E' },
]
const m = (paint: Record<string, Paint>, o: { roads?: Road[]; scanned?: boolean; pages?: boolean } = {}): Prop =>
  town({
    rows: [0, 1],
    houses: houses(mPos, paint),
    roads: o.roads ?? mRoads,
    roots: [
      { id: 'G1', label: 'G1 stack', row: 0, scanned: o.scanned },
      { id: 'glob', label: 'globals', row: 1, scanned: o.scanned },
    ],
    streetLabel: o.pages ? (r) => `MEMORY PAGE ${r + 1}` : noLabel,
  })
const live = { A: 'black', B: 'black', C: 'black', D: 'black' } as const

export const markSweep: Frame[] = [
  {
    caption: 'The heap is a town: houses are objects, roads are pointers between them.',
    actors: [marker(rest(0)), program(rest(1))],
    props: [m({})],
  },
  {
    caption: 'The marker starts at the roots: stacks and globals. What they point to turns grey.',
    actors: [marker(atRoots(0), 'roots first', { hot: true }), program(rest(1))],
    props: [m({ A: 'grey', B: 'grey' }, { roads: hot(mRoads, 'root:G1>A', 'root:glob>B'), scanned: true })],
  },
  {
    caption: 'Grey means “to check”. Checking B finds C and D; B turns black, meaning done.',
    actors: [marker(beside(1, 1), 'found C, D', { hot: true }), program(rest(1))],
    props: [m({ A: 'grey', B: 'black', C: 'grey', D: 'grey' }, { roads: hot(mRoads, 'B>C', 'B>D'), scanned: true })],
  },
  {
    caption: 'When nothing grey is left, black means alive and white means garbage.',
    actors: [marker(beside(2, 0), 'no grey left', { hot: true }), program(rest(1))],
    props: [m(live, { scanned: true })],
    stop: {
      title: 'Two short pauses',
      body: <p>Marking runs alongside your program. Only a short pause at the start and one at the end stop everything, usually well under 1 ms.</p>,
    },
  },
  {
    caption: 'E and F point at each other, but no road from the roots reaches them.',
    actors: [marker(beside(2, 0)), program(rest(1))],
    props: [m(live, { roads: hot(mRoads, 'E>F', 'F>E'), scanned: true })],
    stop: {
      edge: true,
      title: 'Cycles are not leaks',
      body: <p>Go traces from the roots; it doesn’t count references. A loop nobody can reach is freed like any other garbage.</p>,
    },
  },
  {
    caption: 'Sweep: the sweeper frees every white house while your program keeps running.',
    actors: [marker(rest(0)), program(rest(1)), gopher('sweeper', beside(3, 1, -1), { tag: 'sweeper', bubble: 'free E, F', hot: true })],
    props: [m({ ...live, E: 'freed', F: 'freed' }, { scanned: true })],
  },
  {
    caption: 'Go 1.26’s Green Tea marks small objects page by page: fewer memory jumps.',
    actors: [gopher('pirate', { x: 725, y: RY(0) }, { tag: 'Green Tea', bubble: 'whole page', hot: true })],
    props: [m({ ...live, A: 'red', C: 'red', E: 'freed', F: 'freed' }, { scanned: true, pages: true })],
  },
]

// ---- 3 · write barrier --------------------------------------------------------------------

const wPos: Pos[] = [
  ['A', 1, 0],
  ['B', 1, 1],
  ['C', 2, 1],
]
const w = (paint: Record<string, Paint>, roads: Road[]): Prop =>
  town({ rows: [0, 1], houses: houses(wPos, paint), roads, roots: [{ id: 'glob', label: 'globals', row: 1, scanned: true }], streetLabel: noLabel, top: 40 })
const base: Road[] = [
  { from: 'root:glob', to: 'A' },
  { from: 'root:glob', to: 'B' },
]
const start: Record<string, Paint> = { A: 'black', B: 'grey', C: 'white' }
const moved: Road[] = [...base, { from: 'B', to: 'C', tone: 'gone' }, { from: 'A', to: 'C', tone: 'red' }]
const wait = (bubble?: string, more: Partial<Actor> = {}) => marker({ x: 725, y: RY(1) }, bubble, more)
const guard = (bubble?: string, more: Partial<Actor> = {}) => gopher('barrier', { x: 560, y: RY(0) }, { tag: 'barrier', bubble, ...more })

export const writeBarrier: Frame[] = [
  {
    caption: 'Your program keeps running during marking. A is done (black); B is not (grey).',
    actors: [wait('B next'), program(beside(1, 0, -1))],
    props: [w(start, [...base, { from: 'B', to: 'C' }])],
  },
  {
    caption: 'It moves C’s only road from B to A: `a.f = b.g; b.g = nil`.',
    actors: [wait(), program(beside(1, 0, -1), 'move pointer', { hot: true })],
    props: [w(start, moved)],
  },
  {
    caption: 'The marker never looks inside black A again, so live C gets freed. Bug!',
    actors: [wait('no grey left'), program(beside(1, 0, -1), 'a.f → ???', { hot: true }), gopher('sweeper', beside(2, 1), { tag: 'sweeper', bubble: 'free C' })],
    props: [w({ A: 'black', B: 'black', C: 'lost' }, [...base, { from: 'A', to: 'C', tone: 'red' }])],
  },
  {
    caption: 'Fix: the write barrier, a tiny check on every heap pointer write while marking.',
    actors: [wait(), program(beside(1, 0, -1)), guard('I see writes', { hot: true })],
    props: [w(start, [...base, { from: 'B', to: 'C' }])],
  },
  {
    caption: 'As the road moves, the barrier paints C grey, so the marker checks it. Saved.',
    actors: [wait(), program(beside(1, 0, -1), 'move pointer'), guard('C → grey', { hot: true })],
    props: [w({ ...start, C: 'grey' }, moved)],
    stop: {
      title: 'Go’s hybrid barrier',
      body: <p>It greys both the new target and the old one being overwritten. So stack writes need no check, and each stack is scanned only once.</p>,
    },
  },
]

// ---- 4 · when GC runs ---------------------------------------------------------------------

const BOTTOM = 340
const mb = (v: number) => BOTTOM - v // 1 MB = 1 stage unit
type T = { live: number; fresh?: number; goal?: number; limit?: number; goalHot?: boolean; liveHot?: boolean; limitHot?: boolean }
const tank = ({ live, fresh = 0, goal, limit, goalHot, liveHot, limitHot }: T): Prop[] => [
  { id: 'tank', x: 60, y: 40, w: 180, h: 300, tone: 'line', label: 'heap' },
  { id: 'live', x: 62, y: mb(live), w: 176, h: live - 2, tone: liveHot ? 'red' : 'ink', text: `live ${live} MB` },
  { id: 'fresh', x: 62, y: mb(live + fresh), w: 176, h: fresh, tone: 'dashed', text: fresh >= 24 ? 'new' : undefined, hidden: fresh <= 0 },
  { id: 'goal', x: 48, y: mb(goal ?? 200) - 1, w: 204, h: 3, tone: goalHot ? 'red' : 'ink', hidden: goal === undefined },
  { id: 'goalL', x: 258, y: mb(goal ?? 200) - 12, w: 160, h: 24, tone: 'none', text: '← next GC', hidden: goal === undefined },
  { id: 'limit', x: 40, y: mb(limit ?? 180) - 2, w: 220, h: 4, tone: limitHot ? 'red' : 'ink', hidden: limit === undefined },
  { id: 'limitL', x: 258, y: mb(limit ?? 180) - 34, w: 160, h: 24, tone: 'none', text: '← GOMEMLIMIT', hidden: limit === undefined },
]
const app = (bubble?: string, more: Partial<Actor> = {}) => gopher('program', { x: 540, y: 340 }, { tag: 'program', h: 100, bubble, ...more })
const worker = (bubble?: string, more: Partial<Actor> = {}) => gopher('marker', { x: 690, y: 340 }, { tag: 'GC', h: 100, bubble, ...more })

export const whenGC: Frame[] = [
  {
    caption: 'The last GC found 100 MB still in use (live). Your program keeps allocating.',
    actors: [app('new(T)', { hot: true }), worker(undefined, { dim: true })],
    props: tank({ live: 100, fresh: 50, liveHot: true }),
  },
  {
    caption: 'GOGC=100, the default: the heap may grow ~100% over live before the next GC.',
    actors: [app(), worker(undefined, { dim: true })],
    props: tank({ live: 100, fresh: 70, goal: 200, goalHot: true }),
    stop: {
      title: 'GOGC trades memory for CPU',
      body: <p>Doubling GOGC roughly halves GC CPU but doubles the extra memory. GOGC=off removes this goal.</p>,
    },
  },
  {
    caption: 'Near the goal the GC runs, frees the garbage, and the heap drops back.',
    actors: [app(), worker('GC time', { hot: true })],
    props: tank({ live: 100, fresh: 6, goal: 200 }),
  },
  {
    caption: 'GOMEMLIMIT sets a memory ceiling. Close to it, the GC runs sooner.',
    actors: [app(), worker(undefined, { dim: true })],
    props: tank({ live: 100, fresh: 40, goal: 160, limit: 180, limitHot: true }),
    stop: {
      title: 'A soft limit',
      body: (
        <p>
          It counts Go runtime memory but not cgo, so set it 5–10% below the container limit. It is soft: GC won’t use more than about half the CPU to obey it.
        </p>
      ),
    },
  },
  {
    caption: 'If live data nears the limit, GC runs back to back and eats your CPU.',
    actors: [app('so slow…', { hot: true }), worker('again?!', { hot: true })],
    props: tank({ live: 165, fresh: 8, limit: 180, limitHot: true }),
  },
]
