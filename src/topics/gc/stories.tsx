import type { Actor, Frame, Prop } from '../../components/Story'
import { atRoots, beside, gopher, RY, town, type House, type Paint, type Road, type RootBox } from './town'

// ---- helpers ------------------------------------------------------------------------------

type Pos = [id: string, col: number, row: number]
const houses = (pos: Pos[], paint: Record<string, Paint> = {}, more: Record<string, Partial<House>> = {}): House[] =>
  pos.map(([id, col, row]) => ({ id, col, row, label: id, paint: paint[id] ?? 'white', ...more[id] }))
const hot = (roads: Road[], ...keys: string[]) => roads.map((r) => (keys.includes(`${r.from}>${r.to}`) ? { ...r, tone: 'red' as const } : r))
const rest = (row: number) => ({ x: 725, y: RY(row) })

// ---- C1 · tri-color mark ------------------------------------------------------------------

const c1Pos: Pos[] = [
  ['A', 1, 0],
  ['C', 2, 0],
  ['E', 3, 0],
  ['B', 1, 1],
  ['D', 2, 1],
  ['F', 3, 1],
]
const c1Roads: Road[] = [
  { from: 'root:G1', to: 'A' },
  { from: 'root:glob', to: 'B' },
  { from: 'A', to: 'C' },
  { from: 'B', to: 'C' },
  { from: 'B', to: 'D' },
  { from: 'E', to: 'F' },
  { from: 'F', to: 'E' },
]
const c1Roots = (scanned = false): RootBox[] => [
  { id: 'G1', label: 'G1 stack', row: 0, scanned },
  { id: 'glob', label: 'globals', row: 1, scanned },
  { id: 'G2', label: 'G2 stack', row: 2, scanned },
]
const c1 = (paint: Record<string, Paint>, o: { roads?: Road[]; scanned?: boolean; n?: boolean; more?: Record<string, Partial<House>> } = {}): Prop =>
  town({
    rows: [0, 1, 2],
    houses: [...houses(c1Pos, paint, o.more), ...(o.n ? houses([['N', 1, 2]], { N: paint.N ?? 'black' }, { N: { tag: 'NEW' } }) : [])],
    roads: [...(o.roads ?? c1Roads), ...(o.n ? [{ from: 'root:G2', to: 'N' }] : [])],
    roots: c1Roots(o.scanned),
  })

const marker = (at: { x: number; y: number }, bubble?: string, more: Partial<Actor> = {}) => gopher('marker', at, { tag: 'marker', bubble, ...more })
const program = (at: { x: number; y: number }, bubble?: string, more: Partial<Actor> = {}) => gopher('program', at, { tag: 'your program', bubble, ...more })

export const triColor: Frame[] = [
  {
    caption: 'The heap is a town: every house is an object, every road a pointer, and the station on the left holds the roots.',
    actors: [marker(rest(0)), program(rest(2))],
    props: [c1({})],
  },
  {
    caption: 'A GC cycle starts with a tiny stop-the-world pause that switches the write barrier on, then your program runs again.',
    actors: [marker(rest(0), 'barrier on!', { hot: true }), program(rest(2), 'paused… ok, go')],
    props: [c1({})],
    stop: {
      title: 'the first of two short pauses',
      body: (
        <p>
          Stop-the-world #1 (<em>sweep termination</em>) finishes any leftover sweeping, turns the <b>write barrier</b> on for every P and queues the root jobs. It does work proportional to{' '}
          <code>GOMAXPROCS</code>, not to heap size, so it takes tens to hundreds of microseconds. Everything after it runs <b>concurrently</b> with your program.
        </p>
      ),
    },
  },
  {
    caption: 'Every house starts white: “not visited yet”. Whatever is still white when marking ends is garbage.',
    actors: [marker(rest(0)), program(rest(2))],
    props: [c1({})],
  },
  {
    caption: 'The marker starts at the roots and paints every house they point to grey: “found, not looked inside yet”.',
    actors: [marker(atRoots(0), 'roots first', { hot: true }), program(rest(2))],
    props: [c1({ A: 'grey', B: 'grey' }, { roads: hot(c1Roads, 'root:G1>A', 'root:glob>B'), scanned: true })],
    stop: {
      title: 'what counts as a root',
      body: (
        <p>
          Roots are every goroutine’s <b>stack</b> and the <b>globals</b>. Stacks are scanned one goroutine at a time: that goroutine pauses for a moment while the others keep running. Grey means “on the
          marker’s to-do list”.
        </p>
      ),
    },
  },
  {
    caption: 'It takes a grey house and looks inside (red): B has roads to C and D, so C and D turn grey.',
    actors: [marker(beside(1, 1), 'roads to C, D', { hot: true }), program(rest(2))],
    props: [c1({ A: 'grey', B: 'red', C: 'grey', D: 'grey' }, { roads: hot(c1Roads, 'B>C', 'B>D'), scanned: true })],
  },
  {
    caption: 'B is done, so it turns black: the marker will never look inside it again.',
    actors: [marker(beside(1, 1), 'B: done'), program(rest(2))],
    props: [c1({ A: 'grey', B: 'black', C: 'grey', D: 'grey' }, { scanned: true })],
  },
  {
    caption: 'Meanwhile your program allocates a new house. While marking is on, new houses are born black.',
    actors: [marker(beside(1, 1)), program(beside(1, 2), 'n := &T{}', { hot: true, tag: 'G2 · your program' })],
    props: [c1({ A: 'grey', B: 'black', C: 'grey', D: 'grey', N: 'black' }, { scanned: true, n: true })],
    stop: {
      edge: true,
      title: 'allocate black',
      body: (
        <p>
          Anything allocated during marking is marked immediately (<code>gcmarknewobject</code>). The marker never has to chase a moving target, but the price is <b>floating garbage</b>: if the program
          drops <code>n</code> a microsecond later, it still survives this cycle and is only freed by the next one.
        </p>
      ),
    },
  },
  {
    caption: 'A is scanned next. Its road leads to C, which is already grey, so nothing new is added.',
    actors: [marker(beside(1, 0), 'C is already grey'), program(rest(2))],
    props: [c1({ A: 'red', B: 'black', C: 'grey', D: 'grey', N: 'black' }, { roads: hot(c1Roads, 'A>C'), scanned: true, n: true })],
    stop: {
      edge: true,
      title: 'two roads, one visit',
      body: <p>Marking a house sets one bit, atomically. A second road to the same house finds the bit already set and stops there, so shared objects are scanned exactly once.</p>,
    },
  },
  {
    caption: 'C and D have no roads out. Once they are black, nothing grey is left, so marking is done.',
    actors: [marker(beside(2, 0), 'no grey left!', { hot: true }), program(rest(2))],
    props: [c1({ A: 'black', B: 'black', C: 'black', D: 'black', N: 'black' }, { scanned: true, n: true })],
    stop: {
      title: 'the second pause',
      body: (
        <p>
          Stop-the-world #2 (<em>mark termination</em>) stops the mark workers, flushes per-P caches and computes the next heap goal. Now black means reachable, and white means garbage. This pause is also
          O(GOMAXPROCS), not O(heap).
        </p>
      ),
    },
  },
  {
    caption: 'E and F point at each other, but no road from the station reaches them, so both stay white.',
    actors: [marker(beside(2, 0)), program(rest(2))],
    props: [c1({ A: 'black', B: 'black', C: 'black', D: 'black', N: 'black' }, { roads: hot(c1Roads, 'E>F', 'F>E'), scanned: true, n: true })],
    stop: {
      edge: true,
      title: 'cycles are not a problem',
      body: <p>Go traces from the roots; it doesn’t count references. A pair that only points at itself is garbage like any other. A reference-counting collector would leak it forever.</p>,
    },
  },
  {
    caption: 'Sweep: the barrier switches off and the broom frees every white house.',
    actors: [marker(rest(0)), program(rest(2)), gopher('sweeper', beside(3, 1, -1), { tag: 'sweeper', bubble: 'free E, F', hot: true })],
    props: [c1({ A: 'black', B: 'black', C: 'black', D: 'black', N: 'black', E: 'freed', F: 'freed' }, { scanned: true, n: true })],
    stop: {
      title: 'sweeping is lazy',
      body: (
        <p>
          Sweeping runs concurrently: a background sweeper and every allocator (which sweeps a street before reusing it) turn the mark bits into “in use” bits and free empty streets. From here on, new
          houses are born white again. Freed memory isn’t handed back to the OS right away; the scavenger does that slowly.
        </p>
      ),
    },
  },
  {
    caption: 'One rule kept this safe: a black house must never be the only way to reach a white one. The next story breaks it.',
    actors: [marker(rest(0), 'black ↛ white'), program(rest(2))],
    props: [c1({ A: 'black', B: 'black', C: 'black', D: 'black', N: 'black', E: 'freed', F: 'freed' }, { scanned: true, n: true })],
  },
]

// ---- C2 · why the write barrier -----------------------------------------------------------

const c2Pos: Pos[] = [
  ['A', 1, 0],
  ['B', 1, 1],
  ['C', 2, 1],
]
type C2 = { paint: Record<string, Paint>; roads: Road[]; g1?: boolean; g1hot?: boolean }
const c2 = ({ paint, roads, g1, g1hot }: C2): Prop =>
  town({
    rows: [0, 1],
    houses: houses(c2Pos, paint),
    roads,
    roots: [
      { id: 'G1', label: 'G1 stack', row: 0, scanned: g1, hot: g1hot },
      { id: 'glob', label: 'globals', row: 1, scanned: true },
    ],
    top: 40,
  })
const base: Road[] = [
  { from: 'root:glob', to: 'A' },
  { from: 'root:glob', to: 'B' },
]
const start2: Record<string, Paint> = { A: 'black', B: 'grey', C: 'white' }
const guard = (bubble?: string, more: Partial<Actor> = {}) => gopher('barrier', { x: 725, y: RY(0) }, { tag: 'write barrier', bubble, ...more })
const wait = (bubble?: string) => marker({ x: 725, y: RY(1) }, bubble)

export const writeBarrier: Frame[] = [
  {
    caption: 'Marking runs while your program runs. A is black (done), B is grey (to do), and C is white: only B leads to it.',
    actors: [wait('B next…'), program(beside(1, 0, -1))],
    props: [c2({ paint: start2, roads: [...base, { from: 'B', to: 'C' }], g1: true })],
  },
  {
    caption: 'Your program copies B’s road into A (a.f = b.g). Now black A points at white C.',
    actors: [wait(), program(beside(1, 0, -1), 'a.f = b.g', { hot: true })],
    props: [c2({ paint: start2, roads: [...base, { from: 'B', to: 'C' }, { from: 'A', to: 'C', tone: 'red' }], g1: true })],
    stop: {
      title: 'black → white is a warning sign',
      body: <p>The marker never looks inside a black house again. C is still safe for now, because grey B also leads to it. One more write is enough to lose it.</p>,
    },
  },
  {
    caption: 'Then it deletes B’s road (b.g = nil). The only road left to C starts at a black house.',
    actors: [wait(), program(beside(1, 1, -1), 'b.g = nil', { hot: true })],
    props: [c2({ paint: start2, roads: [...base, { from: 'B', to: 'C', tone: 'gone' }, { from: 'A', to: 'C' }], g1: true })],
  },
  {
    caption: 'The marker scans B, finds no roads out, and declares marking done. C is still white.',
    actors: [marker(beside(1, 1), 'no grey left'), program(beside(1, 1, -1))],
    props: [c2({ paint: { A: 'black', B: 'black', C: 'white' }, roads: [...base, { from: 'A', to: 'C' }], g1: true })],
  },
  {
    caption: 'The broom frees C, but A still points at it: a use-after-free. The program will now read recycled memory.',
    actors: [marker(beside(1, 1)), program(beside(1, 0, -1), 'a.f → ???', { hot: true }), gopher('sweeper', beside(2, 1), { tag: 'sweeper', bubble: 'free C' })],
    props: [c2({ paint: { A: 'black', B: 'black', C: 'lost' }, roads: [...base, { from: 'A', to: 'C', tone: 'red' }], g1: true })],
    stop: {
      edge: true,
      title: 'the one bug a GC must never have',
      body: (
        <p>
          Freeing a live object corrupts memory silently. Stopping the whole program for the entire mark would prevent this, which is roughly what Go did before 1.5 (pauses of 300–400 ms). A concurrent GC
          needs help from the program instead.
        </p>
      ),
    },
  },
  {
    caption: 'Rewind. Go’s fix: while marking is on, every pointer write into the heap goes through a write barrier.',
    actors: [wait(), program(beside(1, 0, -1)), guard('I see every write', { hot: true })],
    props: [c2({ paint: start2, roads: [...base, { from: 'B', to: 'C' }], g1: true })],
    stop: {
      title: 'what the barrier is, and what it costs',
      body: (
        <p>
          The compiler wraps every heap or global pointer store in <code>if writeBarrier.enabled {'{…}'}</code>. Outside marking that’s one well-predicted branch. During marking the fast path appends the
          old and new pointer to a per-P buffer, which is flushed in bulk. Stores of non-pointer data never need it.
        </p>
      ),
    },
  },
  {
    caption: 'a.f = b.g: the barrier paints the NEW target, C, grey. That is the Dijkstra “insertion” half.',
    actors: [wait(), program(beside(1, 0, -1), 'a.f = b.g'), guard('new target → grey', { hot: true })],
    props: [c2({ paint: { ...start2, C: 'grey' }, roads: [...base, { from: 'B', to: 'C' }, { from: 'A', to: 'C', tone: 'red' }], g1: true })],
  },
  {
    caption: 'b.g = nil: the barrier also paints the OLD target grey. That is the Yuasa “deletion” half.',
    actors: [wait(), program(beside(1, 1, -1), 'b.g = nil'), guard('old target → grey', { hot: true })],
    props: [c2({ paint: { ...start2, C: 'grey' }, roads: [...base, { from: 'B', to: 'C', tone: 'gone' }, { from: 'A', to: 'C' }], g1: true })],
    stop: {
      title: 'Go’s hybrid barrier does both',
      body: (
        <p>
          Since Go 1.8 the barrier shades the old <em>and</em> the new target (<code>runtime/mbarrier.go</code>). Either half alone would have saved C here. The next two scenes show why Go needs both,
          and the difference is stacks.
        </p>
      ),
    },
  },
  {
    caption: 'C is grey, so the marker visits it before finishing. Every reachable house survives.',
    actors: [marker(beside(2, 1), 'got it'), program(beside(1, 1, -1)), guard()],
    props: [c2({ paint: { A: 'black', B: 'black', C: 'black' }, roads: [...base, { from: 'A', to: 'C' }], g1: true })],
  },
  {
    caption: 'Stacks are different: writing a local variable has NO barrier. Here G1’s scanned stack copies B’s road (local := b.g).',
    actors: [wait(), program({ x: 190, y: RY(0) }, 'local := b.g', { hot: true }), guard('not my job', { dim: true })],
    props: [c2({ paint: start2, roads: [...base, { from: 'B', to: 'C' }, { from: 'root:G1', to: 'C', tone: 'red' }], g1: true })],
    stop: {
      title: 'why stacks have no barrier',
      body: (
        <p>
          Local variables are written constantly; guarding them would slow every function. So stack writes are never checked. The GC has to be correct <em>despite</em> that. (It’s also why keeping values
          on the stack, via escape analysis, is so cheap for the GC.)
        </p>
      ),
    },
  },
  {
    caption: 'b.g = nil is a heap write, so the deletion half paints C grey, even though only an already-scanned stack still points at it.',
    actors: [wait(), program(beside(1, 1, -1), 'b.g = nil'), guard('old target → grey', { hot: true })],
    props: [c2({ paint: { ...start2, C: 'grey' }, roads: [...base, { from: 'B', to: 'C', tone: 'gone' }, { from: 'root:G1', to: 'C' }], g1: true })],
    stop: {
      edge: true,
      title: 'why the deletion half exists',
      body: (
        <p>
          An insertion-only (Dijkstra) barrier would miss this: nothing was inserted into the heap. The only pointer to C moved onto a stack the marker has finished with. Shading whatever a heap write
          <em> removes</em> catches every pointer that leaves the heap.
        </p>
      ),
    },
  },
  {
    caption: 'The reverse: a stack the marker hasn’t reached yet hands its pointer to black A (a.f = local), then forgets it.',
    actors: [wait(), program(beside(1, 0, -1), 'a.f = local', { hot: true }), guard('new target → grey', { hot: true })],
    props: [c2({ paint: { A: 'black', B: 'grey', C: 'grey' }, roads: [...base, { from: 'root:G1', to: 'C', tone: 'gone' }, { from: 'A', to: 'C', tone: 'red' }], g1: false, g1hot: true })],
    stop: {
      title: 'why the insertion half exists, and why stacks are never re-scanned',
      body: (
        <p>
          The deletion half can’t see this one: <code>local = nil</code> is a stack write. The insertion half shades C as it lands in A. Before Go 1.8 the barrier was insertion-only, so stacks could
          gain white pointers after being scanned, and mark termination had to <b>re-scan every stack</b> with the world stopped (tens of ms with many goroutines). With the hybrid barrier and
          allocate-black, a scanned stack stays black: it is scanned once, and pauses dropped below a millisecond.
        </p>
      ),
    },
  },
  {
    caption: 'Result: each stack is scanned exactly once, the pauses stay short, and no reachable house is ever swept.',
    actors: [marker(beside(2, 1), 'all safe'), program(beside(1, 0, -1)), guard()],
    props: [c2({ paint: { A: 'black', B: 'black', C: 'black' }, roads: [...base, { from: 'A', to: 'C' }], g1: true })],
  },
]

// ---- C3 · Green Tea -----------------------------------------------------------------------

const gtPos: Pos[] = [0, 1, 2].flatMap((row) => [1, 2, 3, 4].map((col): Pos => [`h${row}${col}`, col, row]))
const gtLabel = (r: number) => `STREET ${r + 1} · 8 KIB SPAN`
type GT = { paint?: Record<string, Paint>; roads?: Road[]; notes?: Record<number, string>; big?: boolean; roots?: boolean }
const gt = ({ paint = {}, roads = [], notes, big, roots = true }: GT): Prop =>
  town({
    rows: [0, 1, 2],
    houses: [
      ...houses(big ? gtPos.filter(([id]) => id !== 'h23' && id !== 'h24') : gtPos, paint, {}).map((h) => ({ ...h, label: undefined })),
      ...(big ? [{ id: 'big', col: 3.5, row: 2, paint: paint.big ?? 'white', big: true, tag: '> 512 B' }] : []),
    ],
    roads,
    roots: roots ? [{ id: 'r', label: 'roots', row: 0, scanned: true }] : [],
    streetLabel: gtLabel,
    notes,
  })
const queue = (text: string, on = false): Prop => ({ id: 'queue', x: 540, y: 2, w: 252, h: 54, tone: on ? 'red' : 'dashed', label: 'queue', text })
const hops = (text: string): Prop => ({ id: 'hops', x: 540, y: 2, w: 252, h: 54, tone: 'soft', label: 'trips', text })
const pirate = (row: number, bubble?: string, more: Partial<Actor> = {}) => gopher('pirate', { x: 190, y: RY(row) }, { tag: 'span scanner', bubble, ...more })
const trail: Road[] = [
  { from: 'h01', to: 'h23', tone: 'trail' },
  { from: 'h23', to: 'h03', tone: 'trail' },
  { from: 'h03', to: 'h14', tone: 'trail' },
  { from: 'h14', to: 'h21', tone: 'trail' },
]

export const greenTea: Frame[] = [
  {
    caption: 'A bigger town: three streets, each one 8 KiB span holding houses of the same size.',
    actors: [marker(rest(0))],
    props: [gt({ roots: true })],
  },
  {
    caption: 'Classic marking goes house by house: take one grey house, look inside, push its neighbours onto a stack.',
    actors: [marker(beside(1, 0), 'one house', { hot: true })],
    props: [gt({ paint: { h01: 'red' }, roads: [{ from: 'root:r', to: 'h01', tone: 'red' }] }), hops('1 house')],
  },
  {
    caption: 'The next house is on street 3, then street 1, then 2: every hop is a trip to far-away memory.',
    actors: [marker(beside(1, 2), 'and again…', { hot: true })],
    props: [gt({ paint: { h01: 'black', h23: 'black', h03: 'black', h14: 'black', h21: 'red' }, roads: trail }), hops('4 far hops · 4 cache misses')],
    stop: {
      title: 'why hopping is slow',
      body: (
        <p>
          Each step pops a pointer to some random place in the heap, then has to look up that street’s bookkeeping (kept elsewhere) to read and set its mark bit. Almost every step misses the CPU cache,
          and the prefetcher can’t guess where you’ll go next. The Go team measured <b>at least 35%</b> of mark time stalled on memory.
        </p>
      ),
    },
  },
  {
    caption: 'Green Tea instead: finding a house only ticks its “seen” bit, and the whole street goes into the queue, once.',
    actors: [pirate(0)],
    props: [
      gt({ paint: { h01: 'grey', h03: 'grey' }, roads: [{ from: 'root:r', to: 'h01', tone: 'red' }, { from: 'root:r', to: 'h03', tone: 'red' }], notes: { 0: 'seen 1010 · scanned 0000' } }),
      queue('street 1', true),
    ],
    stop: {
      title: 'the bits live on the street',
      body: (
        <p>
          Each small-object span keeps two tiny bitmaps at its own end: <b>seen</b> (marked) and <b>scanned</b>. Finding them is plain address arithmetic: round the pointer down to 8 KiB. No lookup
          elsewhere is needed. Grey here means seen but not scanned; black means both.
        </p>
      ),
    },
  },
  {
    caption: 'The scanner takes street 1 off the queue and scans both ticked houses in one walk along the street.',
    actors: [pirate(0, 'whole street!', { hot: true })],
    props: [gt({ paint: { h01: 'red', h03: 'red' }, notes: { 0: 'seen 1010 · scanned 1010' } }), queue('(empty)')],
  },
  {
    caption: 'Their roads lead to three houses on street 2 and one on street 3. Each street is queued once, however many ticks it gets.',
    actors: [pirate(0)],
    props: [
      gt({
        paint: { h01: 'black', h03: 'black', h11: 'grey', h12: 'grey', h14: 'grey', h22: 'grey' },
        roads: [
          { from: 'h01', to: 'h11', tone: 'red' },
          { from: 'h01', to: 'h12', tone: 'red' },
          { from: 'h03', to: 'h14', tone: 'red' },
          { from: 'h03', to: 'h22', tone: 'red' },
        ],
        notes: { 0: 'seen 1010 · scanned 1010', 1: 'seen 1101 · scanned 0000', 2: 'seen 0100 · scanned 0000' },
      }),
      queue('street 2 → street 3', true),
    ],
    stop: {
      title: 'marks accumulate',
      body: (
        <p>
          Only the first house found on an unqueued street puts the street in the queue. Later finds on the same street just set their seen bit. The street collects work while it waits, and nothing is
          queued twice.
        </p>
      ),
    },
  },
  {
    caption: 'The queue is first-in, first-out, so a street waits a while and gathers more ticks before the scanner gets to it.',
    actors: [pirate(0, 'no rush')],
    props: [
      gt({
        paint: { h01: 'black', h03: 'black', h11: 'grey', h12: 'grey', h14: 'grey', h22: 'grey' },
        notes: { 0: 'seen 1010 · scanned 1010', 1: 'seen 1101 · scanned 0000', 2: 'seen 0100 · scanned 0000' },
      }),
      queue('street 2 → street 3', true),
    ],
    stop: {
      title: 'FIFO, not LIFO',
      body: (
        <p>
          The classic work list is a stack (LIFO), which keeps a depth-first walk warm in the cache. For streets that’s the wrong choice: FIFO gives each street the longest time to collect ticks, so every
          visit does more work. In the runtime’s tests this gave the highest average number of objects per scanned span.
        </p>
      ),
    },
  },
  {
    caption: 'The scanner takes street 2 and scans all three seen-but-not-scanned houses in one left-to-right pass.',
    actors: [pirate(1, '3 at once', { hot: true })],
    props: [
      gt({
        paint: { h01: 'black', h03: 'black', h11: 'red', h12: 'red', h14: 'red', h22: 'grey' },
        notes: { 0: 'seen 1010 · scanned 1010', 1: 'seen 1101 · scanned 1101', 2: 'seen 0100 · scanned 0000' },
      }),
      queue('street 3'),
    ],
    stop: {
      title: 'seen AND NOT scanned',
      body: (
        <p>
          The scanner computes <code>seen &amp;^ scanned</code> a word at a time, which gives exactly the houses to scan, then marks them scanned. On CPUs with AVX-512 (Intel Ice Lake, AMD Zen 4 and newer)
          a dense street is scanned with a handful of vector instructions, worth about another 10%. Elsewhere a plain loop does the same job.
        </p>
      ),
    },
  },
  {
    caption: 'Street 3 has only one tick, so the scanner looks at just that house. That is the single-object fast path.',
    actors: [pirate(2, 'just one', { hot: true })],
    props: [
      gt({
        paint: { h01: 'black', h03: 'black', h11: 'black', h12: 'black', h14: 'black', h22: 'red' },
        notes: { 0: 'seen 1010 · scanned 1010', 1: 'seen 1101 · scanned 1101', 2: 'seen 0100 · scanned 0100' },
      }),
      queue('(empty)'),
    ],
    stop: {
      edge: true,
      title: 'when Green Tea can be slower',
      body: (
        <p>
          If every street comes off the queue with a single tick, queuing streets is pure overhead. Deep, low-fan-out, frequently changed pointer structures do this; the <code>bleve-index</code>{' '}
          benchmark regressed on some machines. The fast path (if nobody else ticked the street, scan just that house) limits the loss. The Go blog says span scanning already pays off at about 2% of a
          page.
        </p>
      ),
    },
  },
  {
    caption: 'Only streets of small houses (16 to 512 bytes) work this way. Bigger houses, and tiny 8-byte ones, are still marked one by one.',
    actors: [marker(beside(3.5, 2, -1), 'this one’s mine', { x: 520 })],
    props: [gt({ big: true, paint: { h01: 'black', h03: 'black', h11: 'black', h12: 'black', h14: 'black', h22: 'black', big: 'red' } })],
    stop: {
      edge: true,
      title: 'which objects take the street path',
      body: (
        <p>
          Size classes from 16 B to 512 B, which all live in one-page (8 KiB) spans with the bits stored inline. Objects over 512 B carry a type header, and objects over 32 KiB get a span of their own;
          both still use the classic per-object marker (huge ones in 128 KiB chunks). Pointer-free objects are ticked but never scanned, whatever their size.
        </p>
      ),
    },
  },
  {
    caption: 'Result: fewer, longer, sequential trips through memory and 10–40% less GC CPU. On by default since Go 1.26.',
    actors: [pirate(0, 'highway, not side streets')],
    props: [gt({ paint: Object.fromEntries(gtPos.map(([id]) => [id, ['h01', 'h03', 'h11', 'h12', 'h14', 'h22'].includes(id) ? 'black' : 'white'])) as Record<string, Paint> })],
    stop: {
      title: 'status and numbers',
      body: (
        <p>
          Go 1.25: experiment (<code>GOEXPERIMENT=greenteagc</code>). Go 1.26: <b>the default</b>; opt out at build time with <code>GOEXPERIMENT=nogreenteagc</code>, which is expected to be removed in
          1.27. Typical savings are around 10% of GC CPU, up to 40%, plus about 10% more with AVX-512. <code>GODEBUG=gctrace=2</code> prints per-size-class span scan statistics.
        </p>
      ),
    },
  },
]

// ---- C4 · the pacer -----------------------------------------------------------------------

const TANK_BOTTOM = 340
const mb = (v: number) => TANK_BOTTOM - v // 1 MB = 1 stage unit
type Pc = { live: number; fresh?: number; goal?: number | null; trigger?: number | null; limit?: number | null; goalHot?: boolean; liveHot?: boolean; limitHot?: boolean; goalLabel?: boolean }
const tank = ({ live, fresh = 0, goal = null, trigger = null, limit = null, goalHot, liveHot, limitHot, goalLabel = true }: Pc): Prop[] => {
  const p: Prop[] = [
    { id: 'tank', x: 40, y: 40, w: 150, h: 300, tone: 'line', label: 'heap' },
    { id: 'live', x: 42, y: mb(live), w: 146, h: live - 2, tone: liveHot ? 'red' : 'ink', text: `live ${live} MB` },
    { id: 'fresh', x: 42, y: mb(live + fresh), w: 146, h: fresh, tone: 'dashed', text: fresh >= 24 ? `new ${fresh} MB` : undefined, hidden: fresh <= 0 },
  ]
  if (goal !== null) {
    p.push({ id: 'goal', x: 30, y: mb(goal) - 1, w: 170, h: 3, tone: goalHot ? 'red' : 'ink' })
    p.push({ id: 'goalL', x: 204, y: mb(goal) - 12, w: 150, h: 24, tone: 'none', text: `← goal ${goal} MB`, hidden: !goalLabel })
  }
  if (trigger !== null) {
    p.push({ id: 'trig', x: 30, y: mb(trigger), w: 170, h: 0, tone: 'dashed' })
    p.push({ id: 'trigL', x: 204, y: mb(trigger) - 12, w: 150, h: 24, tone: 'none', text: `← trigger ${trigger}` })
  }
  if (limit !== null) {
    p.push({ id: 'limit', x: 22, y: mb(limit) - 2, w: 186, h: 4, tone: limitHot ? 'red' : 'ink' })
    p.push({ id: 'limitL', x: 204, y: mb(limit) - 34, w: 170, h: 24, tone: 'none', text: `GOMEMLIMIT ${limit} MB` })
  }
  return p
}
const desks: Prop[] = [0, 1, 2, 3].map((i) => ({ id: 'P' + i, x: 400 + i * 100, y: 300, w: 90, h: 40, tone: 'soft', label: 'P' + i }))
type Who = 'run' | 'gc' | 'assist' | 'idle'
const ps = (who: Who[], bubbles: (string | undefined)[] = []): Actor[] =>
  who.map((w, i) => ({
    id: 'p' + i + w,
    sprite: w === 'gc' ? 'science-lightbulb' : w === 'assist' ? 'convict-working-hard' : 'fairy-tale-messenger-running',
    x: 445 + i * 100,
    y: 300,
    h: 100,
    tag: w === 'gc' ? 'GC worker' : w === 'assist' ? 'assist' : 'G',
    hot: !!bubbles[i],
    bubble: bubbles[i],
    dim: w === 'idle',
  }))
const RUN4: Who[] = ['run', 'run', 'run', 'run']

export const pacer: Frame[] = [
  {
    caption: 'Your program runs on four Ps (GOMAXPROCS=4) and keeps allocating: new objects fill the heap like a tank.',
    actors: ps(RUN4, [undefined, 'new(T)', undefined, 'alloc!']),
    props: [...tank({ live: 100, fresh: 60 }), ...desks],
  },
  {
    caption: 'The last GC found 100 MB still live. Stacks and globals (the roots) add another 8 MB of work to scan.',
    actors: ps(RUN4),
    props: [...tank({ live: 100, liveHot: true }), ...desks],
  },
  {
    caption: 'GOGC=100 sets the goal: live + (live + roots) × 100% = 100 + 108 = 208 MB.',
    actors: ps(RUN4),
    props: [...tank({ live: 100, goal: 208, goalHot: true }), ...desks],
    stop: {
      title: 'the heap goal',
      body: (
        <>
          <p>
            <code>goal = live + (live + stacks + globals) × GOGC/100</code>. Roots have been part of the formula since Go 1.18. The goal never drops below 4 MB × GOGC/100, which is why tiny programs
            show “4 MB goal”.
          </p>
          <p>Rule of thumb: doubling GOGC roughly doubles the extra memory and halves the GC’s CPU. GOGC=50 does the opposite.</p>
        </>
      ),
    },
  },
  {
    caption: 'Marking takes time and your program keeps allocating, so the GC must start early: at the trigger.',
    actors: ps(RUN4),
    props: [...tank({ live: 100, fresh: 85, goal: 208, trigger: 185 }), ...desks],
    stop: {
      title: 'the trigger',
      body: (
        <p>
          The pacer measures how fast you allocate compared with how fast it can mark, and starts the cycle early enough to finish near the goal. The trigger is kept between about 70% and 95% of the way
          from the live heap to the goal.
        </p>
      ),
    },
  },
  {
    caption: 'At the trigger the GC takes one of the four Ps for its own worker: 25% of the CPU.',
    actors: ps(['gc', 'run', 'run', 'run'], ['my P now']),
    props: [...tank({ live: 100, fresh: 90, goal: 208, trigger: 185 }), ...desks],
    stop: {
      title: 'the 25% budget',
      body: (
        <p>
          Background marking gets <code>GOMAXPROCS × 0.25</code> Ps: with 8 Ps that’s 2 dedicated workers. When it doesn’t divide evenly (GOMAXPROCS ≤ 3 or 6), a <em>fractional</em> worker covers the
          rest part-time. Idle Ps may also mark, which costs nothing because nobody else wanted them.
        </p>
      ),
    },
  },
  {
    caption: 'A goroutine allocating faster than the worker can mark is drafted: it must help mark before its allocation returns.',
    actors: ps(['gc', 'run', 'assist', 'run'], [undefined, undefined, 'mark assist!']),
    props: [...tank({ live: 100, fresh: 102, goal: 208, trigger: 185 }), ...desks],
    stop: {
      title: 'mark assists: the latency you feel',
      body: (
        <p>
          Each allocation during marking runs up a debt, paid off with scan work proportional to the bytes allocated. That’s how the pacer keeps the heap near the goal. It is also why an allocation-heavy
          request path gets slower (p99 spikes) while a GC is running. In <code>gctrace</code> it’s the assist term of the CPU numbers.
        </p>
      ),
    },
  },
  {
    caption: 'Marking finishes near the goal, the sweep frees the garbage, and the heap drops back to what’s live.',
    actors: ps(RUN4),
    props: [...tank({ live: 100, fresh: 6, goal: 208, trigger: 185 }), ...desks],
  },
  {
    caption: 'GOMEMLIMIT adds a ceiling. When the GOGC goal would cross it, the goal is pulled down below the limit.',
    actors: ps(RUN4),
    props: [...tank({ live: 100, goal: 160, limit: 180, limitHot: true }), ...desks],
    stop: {
      title: 'a soft limit on the whole runtime',
      body: (
        <p>
          <code>GOMEMLIMIT</code> (Go 1.19) counts all memory the Go runtime manages: heap, stacks and runtime metadata (<code>Sys − HeapReleased</code>). It does not count C/cgo memory or mmaps you make
          yourself, so leave 5–10% headroom below your container limit. It is <b>soft</b>: the runtime tries hard, but it won’t stall your program to obey it.
        </p>
      ),
    },
  },
  {
    caption: 'Now the live heap creeps up to the limit: each GC frees almost nothing, so the next one starts right away.',
    actors: ps(['gc', 'assist', 'assist', 'assist'], ['again?!', undefined, 'assist', undefined]),
    props: [...tank({ live: 160, fresh: 8, goal: 163, limit: 180, goalLabel: false }), ...desks],
    stop: {
      edge: true,
      title: 'the death spiral',
      body: (
        <p>
          Goal ≈ live heap means GC runs back to back and eats every CPU. Requests then finish more slowly, so more of them are in flight, so more memory is live, and it gets worse. Before Go 1.19 there
          was no brake.
        </p>
      ),
    },
  },
  {
    caption: 'The CPU limiter caps GC at about half the CPU: assists stop, your program keeps working, and memory goes over the limit instead.',
    actors: ps(['gc', 'gc', 'run', 'run'], [undefined, undefined, 'phew', undefined]),
    props: [...tank({ live: 175, fresh: 20, goal: 176, limit: 180, limitHot: true, goalLabel: false }), ...desks],
    stop: {
      title: 'the GC CPU limiter',
      body: (
        <p>
          A leaky bucket fills with GC CPU time and drains with program CPU time over a window of about 2 × GOMAXPROCS CPU-seconds, so GC settles at roughly <b>50%</b>. While it’s limiting, mark assists are
          switched off. You get slower and over the limit, rather than stuck. (An OOM kill from the container is still possible.)
        </p>
      ),
    },
  },
  {
    caption: 'GOGC=off plus GOMEMLIMIT: no GOGC goal at all, so the GC runs only when memory gets close to the limit.',
    actors: ps(RUN4, [undefined, 'fewest GCs', undefined, undefined]),
    props: [...tank({ live: 100, fresh: 130, limit: 250 }), ...desks],
    stop: {
      title: 'when GOGC=off is right, and when it’s dangerous',
      body: (
        <p>
          Good fit: a container with a dedicated, known memory budget and a live heap well below it. The GC runs as rarely as the limit allows. Bad fit: anything whose live memory can approach the limit, or
          CLIs and desktop apps sharing a machine. There’s no GOGC goal left to cap how often it runs, so you ride the limiter at ~50% CPU.
        </p>
      ),
    },
  },
]

// ---- C5 · what the GC can't take back ----------------------------------------------------

type L = { paint?: Record<string, Paint>; pos: Pos[]; roads: Road[]; roots: RootBox[]; label?: (r: number) => string; more?: Record<string, Partial<House>> }
const lt = ({ paint = {}, pos, roads, roots, label, more }: L): Prop => town({ rows: [0, 1], houses: houses(pos, paint, more), roads, roots, streetLabel: label, top: 20 })

export const leaks: Frame[] = [
  {
    caption: 'small := big[:10]. A road into one corner of a huge house keeps the whole house alive.',
    actors: [program(beside(1, 1, -1), 'I only need 10 bytes', { x: 250 })],
    props: [
      lt({
        pos: [['big', 2, 0]],
        more: { big: { big: true, label: '1 GB array', tag: 'kept alive' } },
        paint: { big: 'black' },
        roads: [{ from: 'root:G1', to: 'big', tone: 'red' }],
        roots: [{ id: 'G1', label: 'small', row: 0, scanned: true }],
      }),
    ],
    stop: {
      title: 'slices and strings share memory',
      body: (
        <p>
          A slice or substring points into its backing array, and Go’s GC keeps the whole object alive for any pointer into it (the same goes for <code>&amp;big.field</code>). Copy what you keep:{' '}
          <code>slices.Clone(big[:10])</code>, <code>bytes.Clone</code>, <code>strings.Clone</code>.
        </p>
      ),
    },
  },
  {
    caption: 'A goroutine blocked forever is a root: its stack, and every house it points to, stays alive.',
    actors: [gopher('stuck', { x: 190, y: RY(1) }, { tag: 'G7', bubble: '<-ch … forever', hot: true })],
    props: [
      lt({
        pos: [
          ['a', 1, 1],
          ['b', 2, 1],
          ['c', 3, 1],
        ],
        paint: { a: 'black', b: 'black', c: 'black' },
        roads: [
          { from: 'root:G7', to: 'a', tone: 'red' },
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
        roots: [{ id: 'G7', label: 'G7 stack', row: 1, scanned: true, hot: true }],
      }),
    ],
    stop: {
      edge: true,
      title: 'goroutine leaks',
      body: (
        <p>
          The GC never frees a live goroutine, even one that can never wake up. Go 1.26 adds an experimental leak profile (<code>GOEXPERIMENT=goroutineleakprofile</code>, served at{' '}
          <code>/debug/pprof/goroutineleak</code>) in which the GC <em>detects</em> goroutines blocked on something no runnable goroutine can reach. It reports them; it doesn’t free them.
        </p>
      ),
    },
  },
  {
    caption: 'sync.Pool is emptied by the GC: each cycle, pooled items move to a “victim” shelf.',
    actors: [gopher('sweeper', beside(3, 0), { tag: 'GC', bubble: 'move to victim', hot: true })],
    props: [
      lt({
        pos: [
          ['p1', 1, 1],
          ['p2', 2, 1],
        ],
        more: { p1: { label: 'buf' }, p2: { label: 'buf' } },
        roads: [],
        roots: [],
        label: (r) => (r === 0 ? 'POOL · PRIMARY' : 'POOL · VICTIM'),
      }),
    ],
  },
  {
    caption: 'At the next GC, victims nobody took back out are dropped, so an unused item lives through at most two GCs.',
    actors: [gopher('sweeper', beside(3, 1), { tag: 'GC', bubble: 'drop victims', hot: true })],
    props: [
      lt({
        pos: [
          ['p1', 1, 1],
          ['p2', 2, 1],
        ],
        more: { p1: { label: 'buf' }, p2: { label: 'buf' } },
        paint: { p1: 'freed', p2: 'freed' },
        roads: [],
        roots: [],
        label: (r) => (r === 0 ? 'POOL · PRIMARY' : 'POOL · VICTIM'),
      }),
    ],
    stop: {
      title: 'a cache, not a pool of connections',
      body: (
        <p>
          Since Go 1.13 each GC drops the old victims and moves the primary items into the victim cache. <code>sync.Pool</code> saves allocations between GCs; it is not a place to keep connections or
          anything that must live. Don’t <code>Put</code> huge, variable-size buffers either: they stay pinned until the next cycles.
        </p>
      ),
    },
  },
  {
    caption: 'A finalizer brings its house back to life so the finalizer can run, so freeing it takes at least two GC cycles.',
    actors: [gopher('sweeper', beside(1, 0), { tag: 'GC', bubble: 'wait, it has a finalizer' })],
    props: [
      lt({
        pos: [
          ['X', 1, 0],
          ['Y', 2, 0],
        ],
        paint: { X: 'grey', Y: 'grey' },
        more: { X: { tag: 'finalizer' } },
        roads: [
          { from: 'X', to: 'Y', tone: 'red' },
          { from: 'Y', to: 'X' },
        ],
        roots: [],
      }),
    ],
    stop: {
      edge: true,
      title: 'finalizers vs runtime.AddCleanup',
      body: (
        <>
          <p>
            <code>SetFinalizer</code> hands the object itself to the finalizer, so it must be resurrected: at least two cycles to free, one finalizer per object, and a cycle that contains a finalizer may
            never be collected (as here: X → Y → X).
          </p>
          <p>
            <code>runtime.AddCleanup</code> (Go 1.24) gets a separate argument instead, so nothing is resurrected: freed in one cycle, fine with cycles, several per object, and cleanups run in parallel
            since 1.25. The trap: if the cleanup function or its argument can reach the object, it is never freed. Neither is guaranteed to run before exit.
          </p>
        </>
      ),
    },
  },
]
