import type { ReactNode } from 'react'
import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/** Caption with `code` spans. */
const md = (t: string): ReactNode => t.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))

/*
 * One stage for every scene: a backing array is a row of cells on top, each
 * slice header is a bar under it (starts at the pointer, solid for len,
 * dashed out to cap), and a gopher at the left holds each header.
 * A freshly allocated array appears in the bottom row.
 */
const X0 = 150
const CH = 54
const BAR = 30
const ROW_A = 36
const ROW_B = 240
const BARS = [100, 142, 184]
const BAR_B = 302

type Cell = string | number | null
type CellOpts = { cw?: number; hot?: number[]; spare?: number[]; label?: string }

/** A backing array: one prop per cell; `null` = never written (dashed). */
function cells(key: string, vals: Cell[], y: number, o: CellOpts = {}): Prop[] {
  const cw = o.cw ?? 80
  const out: Prop[] = vals.map((v, i) => ({
    id: `${key}${i}`,
    x: X0 + i * cw + 2,
    y,
    w: cw - 4,
    h: CH,
    tone: o.hot?.includes(i) ? 'red' : v === null ? 'dashed' : o.spare?.includes(i) ? 'soft' : 'line',
    text: v === null ? '' : String(v),
  }))
  if (o.label) out.push({ id: `${key}L`, x: X0, y: y - 26, w: 300, h: 20, tone: 'none', label: o.label })
  return out
}

/** A slice header drawn under its array: ptr = where it starts, solid = len, dashed = spare cap. */
function bar(name: string, from: number, len: number, cap: number, y: number, o: { cw?: number; hot?: boolean } = {}): Prop[] {
  const cw = o.cw ?? 80
  const full = len === cap
  const out: Prop[] = [
    { id: `${name}-len`, x: X0 + from * cw + 2, y, w: Math.max(len * cw - 4, 0), h: BAR, tone: o.hot ? 'red' : 'ink', text: full ? `len ${len} · cap ${cap}` : `len ${len}`, hidden: len === 0 },
  ]
  if (!full) out.push({ id: `${name}-cap`, x: X0 + (from + len) * cw + 2, y, w: (cap - len) * cw - 4, h: BAR, tone: 'dashed', text: (cap - len) * cw < 120 ? cap : `cap ${cap}` })
  return out
}

const who = (id: string, sprite: string, y: number, x = 60, extra: Partial<Actor> = {}): Actor => ({ id, sprite, x, y: y + BAR, h: 46, tag: id, ...extra })

/* ───────────────────────── 1 · arrays vs slices ───────────────────────── */

const ARR = [1, 2, 3, 4, 5]
const arrRow = (vals: Cell[] = ARR, hot: number[] = []) => cells('arr', vals, ROW_A, { hot, label: 'arr [5]int' })
const arrGopher = (extra: Partial<Actor> = {}): Actor => ({ id: 'arr', sprite: 'adventure-pirate-lifting-goods', x: 70, y: ROW_A + CH, h: 62, tag: 'arr', ...extra })
const SL = 'adventure-pushing-cart'

export const header: Frame[] = [
  {
    caption: md('`arr` is a `[5]int`: five ints. The 5 is part of its type.'),
    actors: [arrGopher()],
    props: arrRow(),
  },
  {
    caption: md('Arrays are copied whole: `b := arr` gets its own five ints.'),
    actors: [arrGopher(), { id: 'b', sprite: 'dandy-standing', x: 70, y: 166 + CH, h: 62, tag: 'b', bubble: 'my copy' }],
    props: [...arrRow(), ...cells('cp', ARR, 166, { label: 'b [5]int' })],
  },
  {
    caption: md('`s := arr[1:3]` is a slice: a small header pointing into arr.'),
    actors: [arrGopher(), who('s', SL, BARS[1])],
    props: [...arrRow(ARR, [1, 2]), ...bar('s', 1, 2, 4, BARS[1])],
    stop: {
      title: 'Pointer, len, cap',
      body: (
        <p>
          A slice header is a pointer, a length and a capacity: 24 bytes. Cap counts from the pointer to the array’s end, so here it is 5 − 1 = 4.
        </p>
      ),
    },
  },
  {
    caption: md('`s[0] = 7` writes through the pointer, so arr[1] becomes 7 too.'),
    actors: [arrGopher(), who('s', SL, BARS[1], 60, { bubble: 'wrote arr[1]' })],
    props: [...arrRow([1, 7, 3, 4, 5], [1]), ...bar('s', 1, 2, 4, BARS[1])],
  },
  {
    caption: md('`var n []int` is nil; `e := []int{}` is empty but not nil.'),
    actors: [who('n', 'misc-standing-v2', BARS[0] - 10), who('e', 'misc-standing-left', BARS[2] + 10)],
    props: [...cells('hn', ['nil', 0, 0], BARS[0] - 30, { cw: 110, label: 'ptr · len · cap' }), ...cells('he', ['0xc0…', 0, 0], BARS[2] - 10, { cw: 110, hot: [0] })],
    stop: {
      edge: true,
      title: 'JSON sees the difference',
      body: (
        <>
          <p>Both have len 0 and work with append, but JSON differs.</p>
          <Code>{`json.Marshal([]int(nil)) // null
json.Marshal([]int{})    // []`}</Code>
        </>
      ),
    },
  },
]

/* ───────────────────────── 2 · append ───────────────────────── */

const rowA = (vals: Cell[], hot: number[] = []) => cells('A', vals, ROW_A, { hot, label: 'array · cap 4' })
const rowB = (vals: Cell[], hot: number[] = []) => cells('B', vals, ROW_B, { cw: 75, hot, label: 'new array · cap 8' })
const ga = who('a', 'misc-standing-v2', BARS[0], 40)
const gb = (bubble?: string) => who('b', 'dandy-standing', BARS[1], 100, { bubble })
const gc = who('c', 'misc-standing-left', BARS[2], 40)
const gd = (bubble?: string) => who('d', 'superhero-standing', BAR_B, 100, { bubble })
const abc = (hot?: 'b' | 'c') => [...bar('a', 0, 3, 4, BARS[0]), ...bar('b', 0, 4, 4, BARS[1], { hot: hot === 'b' }), ...bar('c', 0, 4, 4, BARS[2], { hot: hot === 'c' })]

export const appendStory: Frame[] = [
  {
    caption: md('`a := make([]int, 3, 4)`: three zeros, plus one spare slot.'),
    actors: [ga],
    props: [...rowA([0, 0, 0, null]), ...bar('a', 0, 3, 4, BARS[0])],
  },
  {
    caption: md('There is room, so `b := append(a, 1)` writes the spare slot. No copy.'),
    actors: [ga, gb()],
    props: [...rowA([0, 0, 0, 1], [3]), ...bar('a', 0, 3, 4, BARS[0]), ...bar('b', 0, 4, 4, BARS[1], { hot: true })],
  },
  {
    caption: md('`c := append(a, 2)` writes the same slot, so b’s 1 becomes 2.'),
    actors: [ga, gb('my 1?!'), gc],
    props: [...rowA([0, 0, 0, 2], [3]), ...abc('c')],
    stop: {
      title: 'The classic puzzle',
      body: (
        <>
          <p>Three slices, one array. Both appends wrote the same slot.</p>
          <Code>{`a := make([]int, 3, 4)
b := append(a, 1)
c := append(a, 2)
fmt.Println(a, b, c)
// [0 0 0] [0 0 0 2] [0 0 0 2]`}</Code>
        </>
      ),
    },
  },
  {
    caption: md('b is full, so `d := append(b, 5)` copies everything into a bigger array.'),
    actors: [ga, gb(), gc, gd('new home')],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([0, 0, 0, 2, 5, null, null, null], [4]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75, hot: true })],
    stop: {
      title: 'How much bigger?',
      body: (
        <p>
          Small slices usually double their cap; from 256 elements on, growth eases toward 1.25×. The result is then rounded up, so never rely on an exact cap.
        </p>
      ),
    },
  },
  {
    caption: md('d has its own array now: `d[0] = 9` can’t touch a, b or c.'),
    actors: [ga, gb(), gc, gd()],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([9, 0, 0, 2, 5, null, null, null], [0]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75 })],
  },
  {
    caption: md('Know the final size? `make([]T, 0, n)` allocates once; appends stay in place.'),
    actors: [ga, gb(), gc, gd()],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([9, 0, 0, 2, 5, null, null, null]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75 })],
  },
]

/* ───────────────────────── 3 · passing to a function ───────────────────────── */

const FW = 60
const rowM = (vals: Cell[], hot: number[] = []) => cells('M', vals, ROW_A, { cw: FW, hot, label: 'main’s array · cap 5' })
const gmain = (bubble?: string) => who('main', 'fairy-tale-king', BARS[0], 60, { bubble, h: 52 })
const ggrow = (y = BARS[1], bubble?: string) => who('grow', 'convict-working-hard', y, 60, { bubble, h: 52 })

export const funcStory: Frame[] = [
  {
    caption: md('main has `s := make([]int, 3, 5)`: len 3, two spare slots.'),
    actors: [gmain()],
    props: [...rowM([0, 0, 0, null, null]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW })],
  },
  {
    caption: md('Go passes by value: `grow(s)` copies the header, not the array.'),
    actors: [gmain(), ggrow()],
    props: [...rowM([0, 0, 0, null, null]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 3, 5, BARS[1], { cw: FW, hot: true })],
  },
  {
    caption: md('Inside grow, `s[0] = 42` writes the shared array, so main sees 42.'),
    actors: [gmain('I see 42'), ggrow()],
    props: [...rowM([42, 0, 0, null, null], [0]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 3, 5, BARS[1], { cw: FW })],
  },
  {
    caption: md('`s = append(s, 99)` fills slot 3, but only grow’s len becomes 4.'),
    actors: [gmain('still len 3'), ggrow()],
    props: [...rowM([42, 0, 0, 99, null], [3]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 4, 5, BARS[1], { cw: FW, hot: true })],
    stop: {
      title: 'main prints [42 0 0]',
      body: (
        <p>
          main’s len is still 3, so it doesn’t see the 99. Return the slice, as <code>append</code> does, to pass the change back.
        </p>
      ),
    },
  },
  {
    caption: md('Past cap, grow’s slice moves to a new array; main stops seeing its writes.'),
    actors: [gmain(), ggrow(BAR_B, 'own array')],
    props: [
      ...rowM([42, 0, 0, 99, null]),
      ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }),
      ...cells('G', [42, 0, 0, 99, 7, 8, null, null, null, null], ROW_B, { cw: FW, hot: [4, 5], label: 'grow’s new array · cap 10' }),
      ...bar('gs', 0, 6, 10, BAR_B, { cw: FW, hot: true }),
    ],
  },
]

/* ───────────────────────── 4 · strings ───────────────────────── */

const SW = 50
const BYTES = ['d0', 'bf', 'd1', '80', 'd0', 'b8', 'd0', 'b2', 'd0', 'b5', 'd1', '82']
const RUNES = 'привет'.split('')
const bytesRow = (hot: number[] = []) => cells('by', BYTES, 110, { cw: SW, hot, label: 'bytes' })
const runesRow = (hot = -1): Prop[] =>
  RUNES.map((r, i) => ({ id: `ru${i}`, x: X0 + i * 2 * SW + 2, y: 30, w: 2 * SW - 4, h: 40, tone: i === hot ? 'red' : 'soft', text: r }))
const strBar: Prop[] = [{ id: 'str-len', x: X0 + 2, y: 190, w: 12 * SW - 4, h: BAR, tone: 'ink', text: 'len 12' }]
const reader = (x = 60, bubble?: string, y = 220): Actor => ({ id: 's', sprite: 'fairy-tale-messenger-reading', x, y, h: 60, tag: 's', bubble })

export const stringsStory: Frame[] = [
  {
    caption: md('A string is read-only bytes. `len("привет")` counts bytes: 12.'),
    actors: [reader()],
    props: [...bytesRow(), ...strBar],
  },
  {
    caption: md('Each letter here takes 2 bytes. A rune is one whole letter.'),
    actors: [reader()],
    props: [...runesRow(), ...bytesRow(), ...strBar],
  },
  {
    caption: md('`s[0]` reads one byte: 208, only half of п.'),
    actors: [reader(60, '208?')],
    props: [...runesRow(), ...bytesRow([0]), ...strBar],
  },
  {
    caption: md('`for i, r := range s` walks runes: 6 steps, one per letter.'),
    actors: [reader(X0 + 2 * 2 * SW + SW, 'и', 332)],
    props: [...runesRow(2), ...bytesRow([4, 5]), ...strBar],
    stop: {
      title: 'Counting letters',
      body: (
        <p>
          <code>utf8.RuneCountInString(s)</code> returns 6. <code>len([]rune(s))</code> also gives 6, but builds a copy first.
        </p>
      ),
    },
  },
  {
    caption: md('Strings can’t change: `s[0] = 1` won’t compile.'),
    actors: [reader()],
    props: [...runesRow(), ...bytesRow(), ...strBar, { id: 'err', x: X0, y: 250, w: 300, h: 40, tone: 'red', text: 'compile error' }],
  },
  {
    caption: md('So `s += x` in a loop copies every time. Use `strings.Builder` instead.'),
    actors: [reader()],
    props: [...runesRow(), ...bytesRow(), ...strBar],
  },
]
