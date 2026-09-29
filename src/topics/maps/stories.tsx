import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * Group 0 on top, group 1 below. Each group is a thin fingerprint bar over a
 * row of 8 slots; a key is a hiker gopher standing beside its row.
 */
const RX = 190
const RW = 590
const RY = [64, 204]
const rowBottom = (g: number) => RY[g] + 100
const SIDE = 95
const FLOOR = rowBottom(1)
const HIKER = 'adventure-hiking'

const beside = (id: string, g: number, bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id, sprite: HIKER, x: SIDE, y: rowBottom(g), h: 90, tag: id, bubble, ...extra })
const slots = (g: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'k' + g, x: RX, y: RY[g] + 30, w: RW, h: 70, label: `group ${g}`, text, tone })
const prints = (g: number, text = 'fingerprints', tone: Prop['tone'] = 'soft'): Prop => ({ id: 'f' + g, x: RX, y: RY[g], w: RW, h: 26, text, tone })

export const lookup: Frame[] = [
  {
    caption: 'A map is a hash table. Go hashes the key "eve" into a number.',
    actors: [beside('eve', 0, 'hash("eve")')],
    props: [slots(0, '8 slots'), slots(1, '8 slots')],
  },
  {
    caption: 'That number points straight to one group of 8 slots: O(1) on average.',
    actors: [beside('eve', 1, 'group 1')],
    props: [slots(0, '8 slots'), slots(1, '8 slots', 'red')],
  },
  {
    caption: 'Each slot also has a fingerprint: one byte taken from its key’s hash.',
    actors: [beside('eve', 1, 'group 1')],
    props: [prints(0), slots(0, '8 slots'), prints(1), slots(1, '8 slots', 'red')],
  },
  {
    caption: 'eve checks all 8 fingerprints in one step. Only one matches hers.',
    actors: [beside('eve', 1, 'mine: 59')],
    props: [prints(0), slots(0, '8 slots'), prints(1, 'one match', 'red'), slots(1, '8 slots')],
    stop: {
      title: 'Fingerprints skip slots fast',
      body: <p>Go 1.24+ uses Swiss tables: each slot has a byte holding 7 bits of its key’s hash. All 8 are checked at once, so most slots are skipped without comparing keys.</p>,
    },
  },
  {
    caption: 'A match only means “maybe”, so Go compares the real key. It’s eve: found.',
    actors: [beside('eve', 1, 'found!', { hot: true })],
    props: [prints(0), slots(0, '8 slots'), prints(1, 'one match', 'red'), slots(1, 'eve', 'red')],
  },
  {
    caption: 'New key "kim" also hashes to group 0, but its 8 slots are full.',
    actors: [beside('kim', 0, 'full!')],
    props: [prints(0), slots(0, 'full', 'red'), prints(1), slots(1, '8 slots')],
  },
  {
    caption: 'A collision: kim moves on and takes a free slot in another group.',
    actors: [beside('kim', 1, 'moved in', { hot: true })],
    props: [prints(0), slots(0, 'full'), prints(1), slots(1, 'kim', 'red')],
    stop: {
      title: 'Collisions: try another group',
      body: <p>A key whose group is full probes on to other groups. A lookup walks the same path and stops at the first group with an empty slot: not found.</p>,
    },
  },
]

const table = (id: string, x: number, w: number, label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y: 70, w, h: 90, label, text, tone })
const cart = (x: number, bubble: string): Actor => ({ id: 'cart', sprite: 'adventure-pushing-cart', x, y: FLOOR, h: 88, tag: 'grow', bubble })

export const growth: Frame[] = [
  {
    caption: 'Keep adding keys. Once the table is 7/8 full, it must grow.',
    actors: [cart(120, '14 of 16')],
    props: [table('t0', 200, 200, 'table', '16 slots', 'red')],
  },
  {
    caption: 'Go builds a table twice as big and moves every key into it.',
    actors: [cart(420, 'moving keys')],
    props: [table('t0', 200, 200, 'old', '16 slots', 'soft'), table('t1', 440, 330, 'new', '32 slots', 'red')],
    stop: {
      title: 'Grows at 7/8 full',
      body: (
        <p>
          Go 1.24+ rehashes one table of at most 1024 slots at once; bigger maps split into more tables. Go ≤ 1.23 doubled everything and moved buckets a few per write (<em>evacuation</em>).
        </p>
      ),
    },
  },
  {
    caption: 'Every key now sits somewhere new. A pointer to the old spot would dangle.',
    actors: [{ id: 'ptr', sprite: 'fairy-tale-messenger-showing', x: 280, y: FLOOR, h: 88, tag: 'pointer', bubble: 'eve moved!', hot: true }],
    props: [table('t1', 440, 330, 'new', '32 slots')],
    stop: {
      title: 'No pointers to elements',
      body: (
        <>
          <p>Map elements move when the map grows, so Go won’t let you point at them.</p>
          <Code>{`p := &m["eve"]    // compile error
m["eve"].Age = 3  // compile error
v := m["eve"]     // copy it,
v.Age = 3         // change it,
m["eve"] = v      // store it back`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Delete every key, or call clear(m): the slots stay allocated. Maps never shrink.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: 280, y: FLOOR, h: 88, tag: 'delete', bubble: 'still 32' }],
    props: [table('t1', 440, 330, 'len 0', '32 slots', 'soft')],
  },
  {
    caption: 'To get memory back, copy the keys you keep into a new map.',
    actors: [cart(280, 'fresh map')],
    props: [table('t1', 440, 330, 'old', 'dropped', 'dashed'), table('t2', 200, 160, 'new', '2 keys', 'red')],
  },
]

const slot = (i: number): Prop => ({ id: 's' + i, x: 190 + i * 110, y: 110, w: 90, h: 70, text: <b>{i + 1}</b> })
const five = [0, 1, 2, 3, 4].map(slot)
const sx = (i: number) => 235 + i * 110
const runner = (x: number, bubble: string): Actor => ({ id: 'run', sprite: 'fairy-tale-messenger-running', x, y: 340, h: 88, tag: 'range', bubble })

export const order: Frame[] = [
  {
    caption: 'Keys 1 to 5 sit in a map. A range loop visits each one.',
    actors: [runner(95, 'where first?')],
    props: five,
  },
  {
    caption: 'Each loop starts at a random spot. This time: 3 4 5 1 2.',
    actors: [runner(sx(2), 'start: 3')],
    props: five,
  },
  {
    caption: 'Run it again and it may start elsewhere: 5 1 2 3 4.',
    actors: [runner(sx(4), 'start: 5')],
    props: five,
  },
  {
    caption: 'Never rely on map order. Need one? Sort the keys. fmt.Println sorts them.',
    actors: [runner(95, 'sort first')],
    props: five,
  },
]

const nilBox: Prop = { id: 'm', x: RX, y: 60, w: RW, h: 90, tone: 'dashed', text: 'nil map' }
const realBox: Prop = { id: 'm', x: RX, y: 60, w: RW, h: 90, tone: 'line', label: 'm', text: 'real map' }
const gopher = (id: string, x: number, bubble: string, extra: Partial<Actor> = {}): Actor => ({ id, sprite: HIKER, x, y: FLOOR, h: 90, tag: id, bubble, ...extra })

export const danger: Frame[] = [
  {
    caption: '`var m map[string]int` gives a nil map: there is no table behind it.',
    actors: [],
    props: [nilBox],
  },
  {
    caption: 'Reading a nil map is fine. You get the zero value.',
    actors: [gopher('read', 300, '0, false')],
    props: [nilBox],
  },
  {
    caption: 'Writing to a nil map panics. Create it with make first.',
    actors: [gopher('read', 300, '0, false', { dim: true }), gopher('write', 660, 'panic!', { hot: true, flip: true })],
    props: [nilBox],
    stop: {
      title: 'Writing nil maps panics',
      body: (
        <p>
          Read, <code>len</code>, <code>delete</code> and <code>range</code> act like an empty map. <code>m[k] = v</code> panics: “assignment to entry in nil map”.
        </p>
      ),
    },
  },
  {
    caption: 'A real map now. Two goroutines write to it at the same time.',
    actors: [gopher('G1', 300, 'm["a"] = 1'), gopher('G2', 660, 'm["b"] = 2', { flip: true })],
    props: [realBox],
  },
  {
    caption: 'The runtime notices and kills the whole program.',
    actors: [
      gopher('G1', 300, 'm["a"] = 1', { dim: true }),
      gopher('G2', 660, 'm["b"] = 2', { flip: true, dim: true }),
      { id: 'rt', sprite: 'fairy-tale-messenger-red-letter', x: 480, y: FLOOR, h: 88, tag: 'runtime', hot: true, bubble: 'fatal error!' },
    ],
    props: [realBox],
    stop: {
      title: 'Concurrent writes are fatal',
      body: (
        <p>
          Many readers are fine; a write next to any other access is a race. It’s a fatal error that <code>recover</code> can’t catch, so guard the map with a mutex.
        </p>
      ),
    },
  },
]
