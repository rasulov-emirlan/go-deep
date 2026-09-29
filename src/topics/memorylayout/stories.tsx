import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ───────── 1 · field order: each row is one 8-byte word ───────── */

const X0 = 150
const B = 80 // one byte, in stage units
const ROWS = [120, 195, 270]
const RH = 60

/** A field (or padding) of `n` bytes starting at byte `col` of word `row`. */
const blk = (id: string, row: number, col: number, n: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({
  id,
  x: X0 + col * B + 2,
  y: ROWS[row],
  w: n * B - 4,
  h: RH,
  tone,
  text: <span className="ml-mono">{text}</span>,
})
const pad = (id: string, row: number, col: number, n: number) => blk(id, row, col, n, `${n} pad`, 'red')
const cpu = (o: Partial<Actor> = {}): Actor => ({ id: 'cpu', sprite: 'science-lightbulb', x: 72, y: 330, h: 110, tag: 'CPU', ...o })

export const orderStory: Frame[] = [
  {
    caption: 'The CPU reads memory in 8-byte chunks, called words.',
    actors: [cpu()],
    props: [{ id: 'word', x: X0 + 2, y: ROWS[0], w: 8 * B - 4, h: RH, tone: 'dashed', label: 'one word', text: '8 bytes' }],
  },
  {
    caption: '`type Bad struct{ a bool; b int64; c bool }`. First, a takes 1 byte.',
    actors: [cpu({ tag: 'Bad' })],
    props: [blk('a', 0, 0, 1, 'a')],
  },
  {
    caption: 'An int64 must start at a multiple of 8. That rule is called alignment.',
    actors: [cpu({ tag: 'Bad' })],
    props: [blk('a', 0, 0, 1, 'a'), pad('p1', 0, 1, 7), blk('b', 1, 0, 8, 'b int64', 'ink')],
    stop: {
      title: 'Why align?',
      body: <p>An aligned int64 sits inside one word, so one read gets it. Misaligned, it spans two words: slower, and some CPUs refuse.</p>,
    },
  },
  {
    caption: 'c takes 1 byte. Then the size rounds up to a multiple of 8.',
    actors: [cpu({ tag: 'Bad · 24 B', hot: true })],
    props: [blk('a', 0, 0, 1, 'a'), pad('p1', 0, 1, 7), blk('b', 1, 0, 8, 'b int64', 'ink'), blk('c', 2, 0, 1, 'c'), pad('p2', 2, 1, 7)],
  },
  {
    caption: 'Same fields, biggest first: b, a, c. Now it is 16 bytes.',
    actors: [cpu({ tag: 'Good · 16 B' })],
    props: [blk('b', 0, 0, 8, 'b int64', 'ink'), blk('a', 1, 0, 1, 'a'), blk('c', 1, 1, 1, 'c'), pad('p2', 1, 2, 6)],
  },
  {
    caption: 'Go never reorders fields for you. Order them from largest to smallest.',
    actors: [cpu({ tag: 'Good · 16 B' })],
    props: [blk('b', 0, 0, 8, 'b int64', 'ink'), blk('a', 1, 0, 1, 'a'), blk('c', 1, 1, 1, 'c'), pad('p2', 1, 2, 6)],
    stop: {
      title: 'Check it yourself',
      body: (
        <>
          <p>The fieldalignment linter flags structs like Bad.</p>
          <Code>{`type Bad struct {
    a bool
    b int64
    c bool
}
unsafe.Sizeof(Bad{}) // 24`}</Code>
        </>
      ),
    },
  },
]

/* ───────── 2 · zero-size fields ───────── */

const zs = (id: string, x: number, text: string): Prop => ({ id, x, y: 110, w: 150, h: 80, tone: 'dashed', label: '0 B', text: <span className="ml-mono">{text}</span> })
const n64 = (x: number, hot = false): Prop => ({ id: 'n', x, y: 110, w: 280, h: 80, tone: hot ? 'red' : 'ink', label: '8 B', text: <span className="ml-mono">n int64</span> })
const tail: Prop = { id: 'tail', x: 590, y: 110, w: 150, h: 80, tone: 'red', text: <span className="ml-mono">8 pad</span> }
const zg = (tag: string, o: Partial<Actor> = {}): Actor => ({ id: 'z', sprite: 'misc-standing-v2', x: 400, y: 340, h: 110, tag, ...o })

export const zeroStory: Frame[] = [
  {
    caption: '`struct{}` has no fields and takes 0 bytes. Sets use it as the value.',
    actors: [zg('0 B')],
    props: [zs('e', 325, 'struct{}')],
  },
  {
    caption: 'Put one first: `struct{ _ struct{}; n int64 }` is still 8 bytes.',
    actors: [zg('8 B')],
    props: [zs('e', 120, 'struct{}'), n64(290)],
  },
  {
    caption: 'Put it last, and the same struct grows to 16 bytes.',
    actors: [zg('16 B', { hot: true, bubble: 'why 16?' })],
    props: [n64(120), zs('e', 420, 'struct{}'), tail],
    stop: {
      title: 'The trailing padding',
      body: <p>A pointer to a last, zero-size field would point just past the struct, into the next object. Go adds padding so it stays inside.</p>,
    },
  },
  {
    caption: '`[0]func()` also takes 0 bytes. But funcs can’t be compared with ==.',
    actors: [zg('8 B')],
    props: [zs('e2', 120, '[0]func()'), n64(290)],
  },
  {
    caption: 'So this struct can’t use == or be a map key. A free guard.',
    actors: [zg('8 B', { bubble: 'no ==' })],
    props: [zs('e2', 120, '[0]func()'), n64(290)],
    stop: {
      edge: true,
      title: 'Forbid == for free',
      body: (
        <>
          <p>It costs no bytes when placed first.</p>
          <Code>{`type Key struct {
    _  [0]func()
    id int64
}
k1 == k2 // compile error`}</Code>
        </>
      ),
    },
  },
]

/* ───────── 3 · cache lines and false sharing ───────── */

const LY = 50
const line = (x: number, hot = false): Prop => ({ id: 'line', x, y: LY, w: 300, h: 100, tone: hot ? 'red' : 'line', label: 'cache line · 64 B' })
const ctr = (id: 'A' | 'B', lineX: number, hot = false): Prop => ({ id, x: lineX + (id === 'A' ? 30 : 160), y: LY + 36, w: 110, h: 50, tone: hot ? 'ink' : 'soft', text: <span className="ml-mono">{id}</span> })
const ram: Prop = { id: 'ram', x: 520, y: 230, w: 220, h: 90, tone: 'soft', label: 'RAM', text: 'slow' }
const core = (id: 'c1' | 'c2', o: Partial<Actor> = {}): Actor => ({
  id,
  sprite: id === 'c1' ? 'convict-working-hard' : 'science-welding',
  x: id === 'c1' ? 140 : 660,
  y: 340,
  h: 115,
  tag: id === 'c1' ? 'core 1' : 'core 2',
  flip: id === 'c2',
  ...o,
})
const both = (lx: number, hotLine = false, hot?: 'A' | 'B') => [line(lx, hotLine), ctr('A', lx, hot === 'A'), ctr('B', lx, hot === 'B')]

export const sharingStory: Frame[] = [
  {
    caption: 'A cache is fast memory in each core. It copies RAM in blocks: cache lines.',
    actors: [core('c1')],
    props: [{ ...line(80), text: 'x86: 64 B' }, ram],
  },
  {
    caption: 'Two goroutines on two cores each bump their own counter, A and B.',
    actors: [core('c1', { bubble: 'A++' }), core('c2', { bubble: 'B++' })],
    props: both(250),
  },
  {
    caption: 'A and B sit 8 bytes apart, so they share one cache line.',
    actors: [core('c1'), core('c2')],
    props: both(250, true),
  },
  {
    caption: 'Core 1 writes A. Core 2’s copy of the line is now stale.',
    actors: [core('c1', { bubble: 'mine!' }), core('c2', { dim: true })],
    props: both(40, true, 'A'),
  },
  {
    caption: 'Core 2 writes B and pulls the whole line back. Every write ping-pongs.',
    actors: [core('c1', { dim: true }), core('c2', { bubble: 'mine!' })],
    props: both(460, true, 'B'),
    stop: {
      title: 'False sharing',
      body: <p>The cores share no data, yet fight over one line. It is not a data race: the code is correct, just slow.</p>,
    },
  },
]

/* ───────── 4 · the fix ───────── */

const own = (id: 'l1' | 'l2', text: string, hot = false): Prop => ({
  id,
  x: id === 'l1' ? 40 : 460,
  y: LY,
  w: 300,
  h: 100,
  tone: hot ? 'ink' : 'line',
  label: id === 'l1' ? 'line 1' : 'line 2',
  text: <span className="ml-mono">{text}</span>,
})
const lines = (hot = false) => [own('l1', 'A + 56 pad', hot), own('l2', 'B + 56 pad', hot)]
const result: Prop = { id: 'res', x: 290, y: 190, w: 220, h: 70, tone: 'red', text: <span className="ml-big">6–7× faster</span> }

export const fixStory: Frame[] = [
  {
    caption: 'Fix 1: pad each counter with unused bytes so it fills its own line.',
    actors: [core('c1'), core('c2')],
    props: lines(),
  },
  {
    caption: 'Now each core keeps its line. Both write at full speed.',
    actors: [core('c1', { bubble: 'A++' }), core('c2', { bubble: 'B++' })],
    props: lines(true),
  },
  {
    caption: 'On an 8-core box, 8 padded counters ran 6–7× faster.',
    actors: [core('c1'), core('c2')],
    props: [...lines(true), result],
    stop: {
      title: 'Pad to 64 bytes',
      body: (
        <>
          <p>Give each goroutine its own element of a slice of these.</p>
          <Code>{`type counter struct {
    n atomic.Int64
    _ [56]byte // 8 + 56 = 64
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Fix 2: shard. Each goroutine counts locally, then adds its total once.',
    actors: [core('c1', { bubble: 'local++' }), core('c2', { bubble: 'local++' })],
    props: [own('l1', 'local A'), own('l2', 'local B'), { id: 'sum', x: 300, y: 200, w: 200, h: 60, tone: 'soft', text: <span className="ml-mono">one total</span> }],
  },
  {
    caption: 'The Go runtime pads its hot structs this way, with `cpu.CacheLinePad`.',
    actors: [{ id: 'rt', sprite: 'superhero-standing', x: 400, y: 340, h: 120, tag: 'runtime' }],
    props: [own('l1', 'hot data'), own('l2', 'CacheLinePad')],
  },
  {
    caption: '`sync.Pool` pads its slots to 128 bytes: Apple M-series chips use 128-byte lines.',
    actors: [{ id: 'rt', sprite: 'superhero-standing', x: 400, y: 340, h: 120, tag: 'sync.Pool' }],
    props: [own('l1', 'slot'), own('l2', '128 B pad')],
  },
]
