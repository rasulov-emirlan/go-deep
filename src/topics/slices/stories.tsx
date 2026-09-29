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

/* ───────────────────────── 1 · the header ───────────────────────── */

const ARR = [1, 2, 3, 4, 5]
const arrRow = (vals: Cell[] = ARR, hot: number[] = []) => cells('arr', vals, ROW_A, { hot, label: 'arr [5]int' })
const arrGopher = (extra: Partial<Actor> = {}): Actor => ({ id: 'arr', sprite: 'adventure-pirate-lifting-goods', x: 70, y: ROW_A + CH, h: 62, tag: 'arr', ...extra })
const SL = 'adventure-pushing-cart'

export const header: Frame[] = [
  {
    caption: md('`arr := [5]int{1, 2, 3, 4, 5}` is the five ints themselves; the 5 is part of the type.'),
    actors: [arrGopher()],
    props: arrRow(),
  },
  {
    caption: md('Arrays are values: `b := arr` copies all five, so `b[0] = 9` leaves arr alone.'),
    actors: [arrGopher(), { id: 'b', sprite: 'dandy-standing', x: 70, y: 166 + CH, h: 62, tag: 'b', bubble: 'my own copy' }],
    props: [...arrRow(), ...cells('cp', [9, 2, 3, 4, 5], 166, { hot: [0], label: 'b [5]int' })],
  },
  {
    caption: md('`s := arr[1:3]` is a view: a header with a pointer to arr[1], len 2 and cap 4.'),
    actors: [arrGopher(), who('s', SL, BARS[1])],
    props: [...arrRow(ARR, [1, 2]), ...bar('s', 1, 2, 4, BARS[1])],
    stop: {
      title: 'three words, 24 bytes',
      body: (
        <p>
          A slice is <code>{'{ptr, len, cap}'}</code>: <code>unsafe.Sizeof(s)</code> is 24 on 64-bit. Cap runs from the pointer to the end of the array: 5 − 1 = 4.
        </p>
      ),
    },
  },
  {
    caption: md('`s[0] = 7` writes through the pointer, so arr[1] is now 7.'),
    actors: [arrGopher(), who('s', SL, BARS[1], 60, { bubble: 'wrote arr[1]' })],
    props: [...arrRow([1, 7, 3, 4, 5], [1]), ...bar('s', 1, 2, 4, BARS[1])],
  },
  {
    caption: md('Reslicing past len is fine up to cap: `s = s[:4]` is [7 3 4 5].'),
    actors: [arrGopher(), who('s', SL, BARS[1], 60, { bubble: 'see more' })],
    props: [...arrRow([1, 7, 3, 4, 5]), ...bar('s', 1, 4, 4, BARS[1], { hot: true })],
    stop: {
      edge: true,
      title: 'one past cap panics',
      body: (
        <p>
          With <code>n := 5</code>, <code>s[:n]</code> panics: <code>slice bounds out of range [:5] with capacity 4</code>. Len is a soft limit, cap is the hard one.
        </p>
      ),
    },
  },
  {
    caption: md('`var n []int` is a nil slice: header (nil, 0, 0). len, range and append all work on it.'),
    actors: [who('n', 'misc-standing-v2', BARS[0] - 10)],
    props: [...cells('hn', ['nil', 0, 0], BARS[0] - 30, { cw: 110, label: 'ptr · len · cap' })],
  },
  {
    caption: md('`e := []int{}` is empty but not nil: its pointer is set, so `e == nil` is false.'),
    actors: [who('n', 'misc-standing-v2', BARS[0] - 10), who('e', 'misc-standing-left', BARS[2] + 10)],
    props: [...cells('hn', ['nil', 0, 0], BARS[0] - 30, { cw: 110, label: 'ptr · len · cap' }), ...cells('he', ['0xc0…', 0, 0], BARS[2] - 10, { cw: 110, hot: [0] })],
    stop: {
      edge: true,
      title: 'JSON sees the difference',
      body: (
        <>
          <p>Same len, same behavior, different wire format. Return an empty slice from APIs if clients expect a list.</p>
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
    caption: md('`a := make([]int, 3, 4)`: three zeros in use, one spare slot at the end.'),
    actors: [ga],
    props: [...rowA([0, 0, 0, null]), ...bar('a', 0, 3, 4, BARS[0])],
  },
  {
    caption: md('len < cap, so `b := append(a, 1)` writes the spare slot in place. a still has len 3.'),
    actors: [ga, gb()],
    props: [...rowA([0, 0, 0, 1], [3]), ...bar('a', 0, 3, 4, BARS[0]), ...bar('b', 0, 4, 4, BARS[1], { hot: true })],
  },
  {
    caption: md('`c := append(a, 2)` finds the same spare slot and overwrites b’s 1 with 2.'),
    actors: [ga, gb('my 1?!'), gc],
    props: [...rowA([0, 0, 0, 2], [3]), ...abc('c')],
    stop: {
      title: 'the classic puzzle',
      body: (
        <>
          <p>Three headers, one array. Both appends wrote the same slot.</p>
          <Code>{`a := make([]int, 3, 4)
b := append(a, 1)
c := append(a, 2)
fmt.Println(a, b, c) // [0 0 0] [0 0 0 2] [0 0 0 2]`}</Code>
        </>
      ),
    },
  },
  {
    caption: md('b is full, so `d := append(b, 5)` allocates a bigger array, copies 4 ints, then adds 5.'),
    actors: [ga, gb(), gc, gd('new home')],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([0, 0, 0, 2, 5, null, null, null], [4]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75, hot: true })],
    stop: {
      title: 'how much bigger?',
      body: (
        <p>
          Below 256 elements cap doubles. Above that it grows by about 1.25× with a smooth ramp, then rounds up to a malloc size class. For <code>[]int</code>: 256 → 512 → 848 → 1280.
        </p>
      ),
    },
  },
  {
    caption: md('d has its own array now: `d[0] = 9` cannot touch a, b or c.'),
    actors: [ga, gb(), gc, gd()],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([9, 0, 0, 2, 5, null, null, null], [0]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75 })],
  },
  {
    caption: md('Know the final size? `make([]T, 0, n)` allocates once, and every append stays in place.'),
    actors: [ga, gb(), gc, gd()],
    props: [...rowA([0, 0, 0, 2]), ...abc(), ...rowB([9, 0, 0, 2, 5, null, null, null]), ...bar('d', 0, 5, 8, BAR_B, { cw: 75 })],
    stop: {
      edge: true,
      title: 'exact caps are not a contract',
      body: (
        <p>
          Go 1.26 can back a small non-escaping slice with a 32-byte stack buffer, so tiny caps may go 1, 2, 3, 4 instead of 1, 2, 4. Never rely on a cap you didn’t ask for.
        </p>
      ),
    },
  },
]

/* ───────────────────────── 3 · sub-slices ───────────────────────── */

const rowP = (vals: Cell[], hot: number[] = []) => cells('P', vals, ROW_A, { hot, label: 'p · cap 5' })
const gp = (bubble?: string) => who('p', 'misc-standing-v2', BARS[0], 40, { bubble })
const gsub = who('sub', 'dandy-standing', BARS[1], 100)
const gsafe = (y = BARS[2], bubble?: string) => who('safe', 'superhero-standing', y, y === BAR_B ? 100 : 40, { bubble })
const P2 = [1, 2, 3, 100, 5]

export const subStory: Frame[] = [
  {
    caption: md('`p := []int{1, 2, 3, 4, 5}`: len 5, cap 5.'),
    actors: [gp()],
    props: [...rowP([1, 2, 3, 4, 5]), ...bar('p', 0, 5, 5, BARS[0])],
  },
  {
    caption: md('`sub := p[1:3]` shows two values, but its cap runs to the end of p’s array: 4.'),
    actors: [gp(), gsub],
    props: [...rowP([1, 2, 3, 4, 5], [1, 2]), ...bar('p', 0, 5, 5, BARS[0]), ...bar('sub', 1, 2, 4, BARS[1], { hot: true })],
  },
  {
    caption: md('`sub = append(sub, 100)` fits in cap, so it silently overwrites p[3].'),
    actors: [gp('my 4?!'), gsub],
    props: [...rowP(P2, [3]), ...bar('p', 0, 5, 5, BARS[0]), ...bar('sub', 1, 3, 4, BARS[1])],
    stop: {
      title: 'p is now [1 2 3 100 5]',
      body: <p>No copy, no warning. Appending to a sub-slice of a buffer someone else still reads is a classic production bug.</p>,
    },
  },
  {
    caption: md('The full slice expression `p[low:high:max]` caps the view: `safe := p[1:3:3]` has cap 2.'),
    actors: [gp(), gsub, gsafe()],
    props: [...rowP(P2, [1, 2]), ...bar('p', 0, 5, 5, BARS[0]), ...bar('sub', 1, 3, 4, BARS[1]), ...bar('safe', 1, 2, 2, BARS[2], { hot: true })],
    stop: {
      title: 'cap = max − low',
      body: (
        <p>
          <code>slices.Clip(s)</code> is the same trick: <code>s[:len(s):len(s)]</code>. Hand out clipped slices and nobody can append into your spare room.
        </p>
      ),
    },
  },
  {
    caption: md('No spare cap, so `append(safe, 7)` copies to a new array; p is untouched.'),
    actors: [gp(), gsub, gsafe(BAR_B, 'own array')],
    props: [
      ...rowP(P2),
      ...bar('p', 0, 5, 5, BARS[0]),
      ...bar('sub', 1, 3, 4, BARS[1]),
      ...cells('S', [2, 3, 7, null], ROW_B, { hot: [2], label: 'new array · cap 4' }),
      ...bar('safe', 0, 3, 4, BAR_B, { hot: true }),
    ],
  },
]

/* ───────────────────────── 4 · passing to a function ───────────────────────── */

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
    caption: md('`grow(s)` copies the header, not the array: same pointer, len 3, cap 5.'),
    actors: [gmain(), ggrow()],
    props: [...rowM([0, 0, 0, null, null]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 3, 5, BARS[1], { cw: FW, hot: true })],
    stop: {
      title: 'everything is passed by value',
      body: <p>Go has no pass-by-reference. The value copied here is a 24-byte header that happens to contain a pointer, so passing a slice never copies its elements.</p>,
    },
  },
  {
    caption: md('Inside grow, `s[0] = 42` writes the shared array, so main sees 42.'),
    actors: [gmain('I see 42'), ggrow()],
    props: [...rowM([42, 0, 0, null, null], [0]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 3, 5, BARS[1], { cw: FW })],
  },
  {
    caption: md('`s = append(s, 99)` writes slot 3, but only grow’s copy of the header gets len 4.'),
    actors: [gmain('still len 3'), ggrow()],
    props: [...rowM([42, 0, 0, 99, null], [3]), ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }), ...bar('gs', 0, 4, 5, BARS[1], { cw: FW, hot: true })],
    stop: {
      title: 'main prints [42 0 0]',
      body: (
        <p>
          The 99 is in memory: main’s <code>s[:4]</code> prints <code>[42 0 0 99]</code>. To let the caller see appends, return the slice (as <code>append</code> does) or pass <code>*[]int</code>.
        </p>
      ),
    },
  },
  {
    caption: md('Append past cap and grow gets a new array; nothing it writes after that reaches main.'),
    actors: [gmain(), ggrow(BAR_B, 'own array')],
    props: [
      ...rowM([42, 0, 0, 99, null]),
      ...bar('ms', 0, 3, 5, BARS[0], { cw: FW }),
      ...cells('G', [42, 0, 0, 99, 7, 8, null, null, null, null], ROW_B, { cw: FW, hot: [4, 5], label: 'grow’s new array · cap 10' }),
      ...bar('gs', 0, 6, 10, BAR_B, { cw: FW, hot: true }),
    ],
  },
]

/* ───────────────────────── 5 · strings ───────────────────────── */

const SW = 50
const BYTES = ['d0', 'bf', 'd1', '80', 'd0', 'b8', 'd0', 'b2', 'd0', 'b5', 'd1', '82']
const RUNES = 'привет'.split('')
const bytesRow = (hot: number[] = []) => cells('by', BYTES, 110, { cw: SW, hot, label: 'bytes (UTF-8)' })
const runesRow = (hot = -1): Prop[] =>
  RUNES.map((r, i) => ({ id: `ru${i}`, x: X0 + i * 2 * SW + 2, y: 30, w: 2 * SW - 4, h: 40, tone: i === hot ? 'red' : 'soft', text: r }))
const strBar: Prop[] = [{ id: 'str-len', x: X0 + 2, y: 190, w: 12 * SW - 4, h: BAR, tone: 'ink', text: 'len 12 · no cap' }]
const reader = (x = 60, bubble?: string, y = 220): Actor => ({ id: 's', sprite: 'fairy-tale-messenger-reading', x, y, h: 60, tag: 's', bubble })

export const stringsStory: Frame[] = [
  {
    caption: md('`s := "привет"` is a header (pointer, len) over UTF-8 bytes. `len(s)` is 12.'),
    actors: [reader()],
    props: [...bytesRow(), ...strBar],
  },
  {
    caption: md('Each Cyrillic letter takes 2 bytes. A rune (int32) is one decoded code point.'),
    actors: [reader()],
    props: [...runesRow(), ...bytesRow(), ...strBar],
  },
  {
    caption: md('Indexing reads bytes: `s[0]` is 208 (0xD0), half of п.'),
    actors: [reader(60, '208?')],
    props: [...runesRow(), ...bytesRow([0]), ...strBar],
    stop: {
      edge: true,
      title: 'slicing can split a letter',
      body: (
        <p>
          <code>s[:3]</code> is <code>"п\xd1"</code> and prints <code>п�</code>. Cut only at offsets that <code>range</code> gives you.
        </p>
      ),
    },
  },
  {
    caption: md('`for i, r := range s` decodes UTF-8: 6 iterations, at byte offsets 0, 2, 4, 6, 8, 10.'),
    actors: [reader(X0 + 2 * 2 * SW + SW, 'i=4 и', 332)],
    props: [...runesRow(2), ...bytesRow([4, 5]), ...strBar],
    stop: {
      title: 'counting letters',
      body: (
        <p>
          <code>utf8.RuneCountInString(s)</code> is 6 and allocates nothing. <code>len([]rune(s))</code> is also 6 but builds a new slice first.
        </p>
      ),
    },
  },
  {
    caption: md('Strings are immutable: `s[0] = 1` won’t compile. `[]byte(s)` gives you an editable copy.'),
    actors: [reader(60, 'read-only')],
    props: [...runesRow(), ...bytesRow(), ...strBar, { id: 'err', x: X0, y: 250, w: 300, h: 40, tone: 'red', text: 'cannot assign to s[0]' }],
  },
  {
    caption: md('So `s += x` in a loop copies everything each time; `strings.Builder` appends to one growing buffer.'),
    actors: [reader(60, 'use Builder')],
    props: [...runesRow(), ...bytesRow(), ...strBar],
    stop: {
      title: 'why Builder is fast',
      body: (
        <p>
          It is <code>append</code> on a <code>[]byte</code>, and <code>String()</code> hands those bytes over without copying. Call <code>b.Grow(n)</code> if you know the size.
        </p>
      ),
    },
  },
]
