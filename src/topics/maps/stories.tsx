import type { Actor, Frame, Prop } from '../../components/Story'

/*
 * The locker hall. A slot is a locker; a group is a row of 8 lockers with a
 * panel of 8 lights above it (the control word); a key is a hiker gopher.
 * Every scene uses the same geometry: group 0 on the left, group 1 on the right.
 */
const RX = 190 // rows start here; the strip to the left is where gophers stand
const LW = 74
const RY = [64, 204] // lights of group 0 on top, group 1 below
const LIGHT_H = 26
const LOCK_H = 70
const rowBottom = (g: number) => RY[g] + 30 + LOCK_H
const SIDE = 95 // x of a gopher standing beside a row
const FLOOR = rowBottom(1) // feet of a gopher standing under row 0
const HIKER = 'adventure-hiking'

/** Slot spec: '' empty · '×' tombstone · 'key:h2' full. */
type Row = string[]
const cx = (s: number) => RX + s * LW + LW / 2

function hall(rows: Row[], hot: string[] = [], opts: { labels?: string[]; dimLights?: boolean; noLights?: boolean; numbers?: boolean } = {}): Prop[] {
  const props: Prop[] = []
  rows.forEach((row, g) => {
    props.push({ id: 'G' + g, x: RX - 4, y: RY[g] - 30, w: 8 * LW + 8, h: 26, tone: 'none', label: opts.labels?.[g] ?? `group ${g}` })
    row.forEach((spec, s) => {
      const [key, h2] = spec.split(':')
      const tomb = spec === '×'
      const hotL = hot.includes(`L${g}.${s}`)
      const hotK = hot.includes(`K${g}.${s}`)
      if (!opts.noLights)
        props.push({
          id: `L${g}.${s}`,
          x: RX + s * LW + 8,
          y: RY[g],
          w: LW - 16,
          h: LIGHT_H,
          tone: hotL ? 'red' : tomb ? 'ink' : h2 ? (opts.dimLights ? 'soft' : 'line') : 'dashed',
          text: <span className="mp-light">{tomb ? '×' : (h2 ?? '')}</span>,
        })
      props.push({
        id: `K${g}.${s}`,
        x: RX + s * LW + 3,
        y: RY[g] + 30,
        w: LW - 6,
        h: LOCK_H,
        tone: hotK ? 'red' : tomb ? 'ink' : key ? 'line' : 'soft',
        label: opts.numbers ? String(s) : undefined,
        text: <span className="mp-key">{tomb ? '†' : key}</span>,
      })
    })
  })
  return props
}

const hiker = (id: string, x: number, bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id, sprite: HIKER, x, y: FLOOR, h: 90, tag: id, bubble, ...extra })
/** A hiker standing in the strip beside row g, facing the lockers. */
const beside = (id: string, g: number, bubble?: string, extra: Partial<Actor> = {}): Actor => hiker(id, SIDE, bubble, { y: rowBottom(g), ...extra })

/* ───────────────────────── M1 · the old way ───────────────────────── */

const LOCK8 = (occ: Record<number, string>, hot: number[] = [], lights?: Record<number, string>): Prop[] => {
  const row = Array.from({ length: 8 }, (_, i) => (occ[i] ? `${occ[i]}:${lights?.[i] ?? ''}` : ''))
  return hall([row], hot.map((i) => `K0.${i}`), { noLights: !lights, numbers: true, labels: ['8 lockers, one array'] })
}
const at8 = cx

export const oldWay: Frame[] = [
  {
    caption: 'Picture a hall of 8 lockers. A hash turns the key "ann" into a locker number: 3.',
    actors: [hiker('ann', SIDE, 'hash says 3')],
    props: LOCK8({}),
  },
  {
    caption: 'ann walks straight to locker 3 and moves in.',
    actors: [hiker('ann', at8(3), 'home!', { hidden: false })],
    props: LOCK8({ 3: 'ann' }, [3]),
  },
  {
    caption: 'Later "cat" took locker 4. Now "bob" arrives, and his hash says 3 as well.',
    actors: [hiker('bob', SIDE, 'hash says 3')],
    props: LOCK8({ 3: 'ann', 4: 'cat' }),
  },
  {
    caption: 'Locker 3 is taken. bob opens the door and compares keys: it’s ann, not bob.',
    actors: [hiker('bob', at8(3), 'ann? not me')],
    props: LOCK8({ 3: 'ann', 4: 'cat' }, [3]),
  },
  {
    caption: 'So bob tries the next locker, 4. Another door, another key comparison.',
    actors: [hiker('bob', at8(4), 'cat? not me')],
    props: LOCK8({ 3: 'ann', 4: 'cat' }, [4]),
  },
  {
    caption: 'Locker 5 is empty, so bob moves in there.',
    actors: [hiker('bob', at8(5), 'home!')],
    props: LOCK8({ 3: 'ann', 4: 'cat', 5: 'bob' }, [5]),
    stop: {
      title: 'open addressing',
      body: (
        <p>
          All keys live in one flat array. On a collision you move on to the next slot (here +1: <em>linear probing</em>). A later lookup for bob has to retrace exactly the same path, and it stops at the
          first empty slot.
        </p>
      ),
    },
  },
  {
    caption: 'Looking up "dan" (also hash 3) opens lockers 3, 4 and 5 before empty locker 6 says: not here.',
    actors: [hiker('dan', at8(6), 'empty: no dan')],
    props: LOCK8({ 3: 'ann', 4: 'cat', 5: 'bob' }, [3, 4, 5]),
    stop: {
      title: 'every door is a key comparison',
      body: (
        <p>
          Opening a door means reading the key from memory and comparing it. For strings that’s a length check plus a byte compare, often a cache miss. Keys pile up into runs, so the fuller the table,
          the more doors per lookup, and a miss pays for the whole run.
        </p>
      ),
    },
  },
  {
    caption: 'The Swiss-table idea: a light above each locker hints who might be inside, so most doors never open.',
    actors: [hiker('dan', at8(6), 'no light: skip')],
    props: LOCK8({ 3: 'ann', 4: 'cat', 5: 'bob' }, [], { 3: '1c', 4: '0b', 5: '62' }),
    stop: {
      edge: true,
      title: 'Go’s old map wasn’t this either',
      body: (
        <p>
          Go 1.0 – 1.23 used <em>chaining</em>: buckets of 8 slots with overflow buckets hung off full ones, and a <code>tophash</code> byte (top 8 hash bits) per slot to skip most key compares. Go 1.24
          switched to Swiss tables: open addressing, but over <b>groups</b> of 8 lockers with a panel of lights. The rest of this page is about those.
        </p>
      ),
    },
  },
]

/* ───────────────────────── M2 · the control panel ───────────────────────── */

const G0: Row = ['ann:1c', 'bob:62', 'cat:0b', 'dot:4e', 'ed:27', 'fox:6d', 'gus:13', 'hal:35']
const G1: Row = ['ivy:2a', '', 'eve:59', '', 'jo:71', '', '', '']
const G1k: Row = ['ivy:2a', 'kim:44', 'eve:59', '', 'jo:71', '', '', '']

export const controlPanel: Frame[] = [
  {
    caption: 'The key "eve" is hashed to 64 bits. The top 57 bits are H1; the low 7 bits are H2.',
    actors: [beside('eve', 0, 'H2 = 59')],
    props: hall([G0, G1]),
    stop: {
      title: 'H1 picks the row, H2 is a fingerprint',
      body: (
        <p>
          <b>H1</b> = <code>hash &gt;&gt; 7</code> chooses the group to start at (modulo the number of groups). <b>H2</b> = <code>hash &amp; 0x7f</code> is a 7-bit fingerprint. Each light is one{' '}
          <em>control byte</em>: the H2 of the key in that locker, or “empty” (<code>0x80</code>), or “tombstone” (<code>0xFE</code>). Eight lights make one 64-bit control word per group.
        </p>
      ),
    },
  },
  {
    caption: 'H1 sends eve straight to group 1. Each light shows the fingerprint of whoever lives below it.',
    actors: [beside('eve', 1, 'group 1')],
    props: hall([G0, G1]),
  },
  {
    caption: 'eve holds her fingerprint, 59, up to all 8 lights at once. One light matches.',
    actors: [beside('eve', 1, '59? one match!')],
    props: hall([G0, G1], ['L1.2']),
    stop: {
      title: '8 compares in one go',
      body: (
        <p>
          The 8 control bytes are one 64-bit word. Go copies 59 into all 8 bytes and compares the whole word at once, with a bit trick on any CPU or two SSE2 instructions on amd64. Empty and tombstone
          lights have their top bit set, so they can never match a 7-bit fingerprint.
        </p>
      ),
    },
  },
  {
    caption: 'Only that one door is opened and the full key compared. It’s eve: found, with one key comparison.',
    actors: [beside('eve', 1, 'it’s me!', { hot: true })],
    props: hall([G0, G1], ['L1.2', 'K1.2']),
  },
  {
    caption: 'Now look up "fay". Her fingerprint is also 59, so the light matches and the door opens… it’s eve.',
    actors: [beside('fay', 1, 'eve? not me!', { hot: true })],
    props: hall([G0, G1], ['L1.2', 'K1.2']),
    stop: {
      edge: true,
      title: 'false positive',
      body: (
        <p>
          7 bits give only 128 fingerprints, so different keys share them (about 1 in 128 per full locker). A matching light only means “maybe”, and Go always compares the real key. It costs under 1/8 of
          an extra compare per lookup, even when the table is nearly full.
        </p>
      ),
    },
  },
  {
    caption: 'Group 1 also has empty lights. If fay existed, she’d have moved in here, so the search stops: not found.',
    actors: [beside('fay', 1, 'not here')],
    props: hall([G0, G1], ['L1.1', 'L1.3', 'L1.5', 'L1.6', 'L1.7']),
    stop: {
      title: 'an empty light ends every search',
      body: (
        <p>
          An insert stops at the first group with an empty slot. So if a key were further along, this group couldn’t have had room when it arrived. That’s why a table is never allowed to fill up (the
          limit is 7/8): every search must reach an empty light eventually.
        </p>
      ),
    },
  },
  {
    caption: 'New key "kim" (H2 = 44) hashes to group 0. All 8 lights are taken, and none says 44.',
    actors: [beside('kim', 0, 'full, no 44')],
    props: hall([G0, G1], ['L0.0', 'L0.1', 'L0.2', 'L0.3', 'L0.4', 'L0.5', 'L0.6', 'L0.7']),
  },
  {
    caption: 'kim walks on to the next group in the probe sequence and takes its first empty locker.',
    actors: [beside('kim', 1, 'moved in!', { hot: true })],
    props: hall([G0, G1k], ['L1.1', 'K1.1']),
    stop: {
      title: 'the probe sequence',
      body: (
        <p>
          From the starting group, the search jumps +1, +2, +3… groups (mod the table size). On a power-of-two table that visits every group exactly once. A later lookup of kim walks the same path: group
          0 (full, no match), then group 1.
        </p>
      ),
    },
  },
]

/* ───────────────────────── M3 · delete, grow, split ───────────────────────── */

const D0: Row = ['ann:1c', 'bob:62', '×', 'dot:4e', 'ed:27', 'fox:6d', 'gus:13', 'hal:35']
const D1j: Row = ['ivy:2a', 'kim:44', 'eve:59', '', 'jo:71', '', '', '']
const D1: Row = ['ivy:2a', 'kim:44', 'eve:59', '', '', '', '', '']
const R0: Row = ['ann:1c', 'bob:62', 'lu:3d', 'dot:4e', 'ed:27', 'fox:6d', 'gus:13', 'hal:35']
const FULL1: Row = ['ivy:2a', 'kim:44', 'eve:59', 'mo:08', 'ned:5b', 'oz:77', '', '']

const tbl = (id: string, x: number, w: number, text: string, tone: Prop['tone'] = 'line', label?: string): Prop => ({ id, x, y: 70, w, h: 120, tone, text, label })
const sign = (entries: string[], hot = -1): Prop[] => entries.map((e, i) => ({ id: 'sg' + i, x: 24, y: 60 + i * 32, w: 122, h: 28, tone: i === hot ? 'red' : 'line', text: <span className="mp-dir">{e}</span> }))
const mover = (bubble: string, x = 700): Actor => ({ id: 'mover', sprite: 'adventure-pushing-cart', x, y: FLOOR, h: 88, tag: 'rehash', bubble })

export const deleteGrowSplit: Frame[] = [
  {
    caption: 'delete(m, "cat"): group 0 was full, so cat’s light becomes a tombstone (×), not empty.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: SIDE, y: rowBottom(0), h: 88, tag: 'delete', bubble: 'leave a ×' }],
    props: hall([D0, D1j], ['L0.2']),
    stop: {
      title: 'why not just empty?',
      body: (
        <p>
          kim lives in group 1 only because group 0 was full when kim arrived. If cat’s light went <em>empty</em>, a search for kim would stop at group 0 and wrongly say “not found”. A tombstone means
          “nobody lives here, keep walking”. Searches walk past it; inserts may reuse it.
        </p>
      ),
    },
  },
  {
    caption: 'delete(m, "jo"): group 1 has empty lights, so nobody was ever pushed past it. jo’s light just goes empty.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: SIDE, y: rowBottom(1), h: 88, tag: 'delete', bubble: 'just empty' }],
    props: hall([D0, D1], ['L1.4']),
    stop: {
      edge: true,
      title: 'tombstone only when the group is full',
      body: (
        <p>
          A group that still has an empty slot stops every search, so no probe path runs through it. Its deleted slots can go straight back to empty, and give their room back to the table. Small maps (one
          group) never create tombstones at all.
        </p>
      ),
    },
  },
  {
    caption: 'Insert "lu" (group 0): it notes the tombstone, checks on to an empty light, then comes back and moves in.',
    actors: [beside('lu', 0, 'reuse the ×', { hot: true })],
    props: hall([R0, D1], ['L0.2', 'K0.2']),
  },
  {
    caption: 'Keep inserting. When 7/8 of the lockers are used (tombstones count too), the table must grow.',
    actors: [mover('14 of 16!', SIDE)],
    props: hall([R0, FULL1], [], { dimLights: true }),
    stop: {
      title: '7/8 full, then double',
      body: (
        <p>
          The load limit is 7/8: 14 of 16 slots. Tombstones count against it. If tombstones are ≥ 10% of the table, Go first tries to free the ones no probe path needs. Otherwise it allocates a table{' '}
          <b>twice as big</b> and re-inserts every key, all during this one insert. Tables grow 16 → 32 → … → 1024 slots.
        </p>
      ),
    },
  },
  {
    caption: 'A new table twice the size is allocated, every key is re-inserted (tombstones vanish), and the old one is dropped.',
    actors: [mover('moving 14 keys', 360)],
    props: [tbl('t0', 40, 150, '16 slots', 'soft', 'old'), tbl('t1', 420, 330, '32 slots', 'red', 'new table')],
  },
  {
    caption: 'Tables stop growing at 1024 slots. A full one splits in two by the top bit of the hash.',
    actors: [{ id: 'king', sprite: 'fairy-tale-king', x: 85, y: FLOOR, h: 88, tag: 'directory', bubble: 'top bit?' }],
    props: [...sign(['0 → A', '1 → B']), tbl('tA', 190, 280, 'A · 1024 slots'), tbl('tB', 500, 280, 'B · 1024 slots')],
    stop: {
      title: 'split, and a signpost',
      body: (
        <p>
          Past 1024 slots a table doesn’t double: it <b>splits</b> into two 1024-slot tables, sending each key left or right by one more <em>top</em> bit of its hash. A <b>directory</b> (the signpost)
          indexed by those top bits tells every key which table to search. This is extendible hashing.
        </p>
      ),
    },
  },
  {
    caption: 'When table A splits again, the signpost doubles: 00 → A0, 01 → A1, and B now owns both 10 and 11.',
    actors: [{ id: 'king', sprite: 'fairy-tale-king', x: 85, y: FLOOR, h: 88, tag: 'directory', bubble: 'directory ×2' }],
    props: [
      ...sign(['00 → A0', '01 → A1', '10 → B', '11 → B'], -1),
      { id: 'tA', x: 190, y: 60, w: 135, h: 140, tone: 'red', text: 'A0 · 1024' },
      { id: 'tA1', x: 335, y: 60, w: 135, h: 140, tone: 'red', text: 'A1 · 1024' },
      { id: 'tB', x: 500, y: 60, w: 280, h: 140, tone: 'line', text: 'B · 1024 (2 entries)' },
    ],
    stop: {
      title: 'when does the directory double?',
      body: (
        <p>
          Only when the splitting table already uses as many top bits as the directory (<code>localDepth == globalDepth</code>). Then every entry is copied into two neighbours first. A table using fewer
          bits, like B, already owns 2 entries, so when B splits the directory stays the same size.
        </p>
      ),
    },
  },
  {
    caption: 'The old map spread each doubling over later writes, 2 buckets at a time. Swiss maps keep every copy small instead.',
    actors: [
      { id: 'old', sprite: 'convict-working-hard', x: 200, y: FLOOR, h: 90, tag: 'Go ≤ 1.23', bubble: '2 buckets per write…' },
      mover('≤ 1024 slots, once', 600),
    ],
    props: [
      { id: 'tA', x: 40, y: 70, w: 340, h: 110, tone: 'soft', text: 'old + new bucket arrays, both live' },
      { id: 'tB', x: 420, y: 70, w: 340, h: 110, tone: 'line', text: 'one table rehashed, the rest untouched' },
    ],
    stop: {
      title: 'bounded, not incremental',
      body: (
        <p>
          Go ≤ 1.23 allocated a 2× bucket array and then, on every later write, moved (<em>evacuated</em>) the bucket being touched plus one more, with lookups checking the old array meanwhile. Swiss maps
          have no old array and no evacuation: a grow or split rehashes one table of at most 1024 slots (≈ 896 keys), no matter how big the map is.
        </p>
      ),
    },
  },
]

/* ───────────────────────── M0 · small maps ───────────────────────── */

const S5: Row = ['ann:1c', 'bob:62', 'cat:0b', 'dot:4e', 'eve:59', '', '', '']
const S4: Row = ['ann:1c', 'bob:62', '', 'dot:4e', 'eve:59', '', '', '']
const S8: Row = ['ann:1c', 'bob:62', 'fox:6d', 'dot:4e', 'eve:59', 'gus:13', 'hal:35', 'jo:71']
const T0: Row = ['bob:62', 'dot:4e', 'gus:13', 'ivy:2a', '', '', '', '']
const T1: Row = ['ann:1c', 'fox:6d', 'eve:59', 'hal:35', 'jo:71', '', '', '']

export const smallMaps: Frame[] = [
  {
    caption: 'm := make(map[string]int) creates just a small header. There are no lockers yet.',
    actors: [],
    props: [{ id: 'G0', x: RX - 4, y: RY[0] - 22, w: 8 * LW + 8, h: 104, tone: 'dashed', text: 'nothing allocated yet' }],
    stop: {
      title: 'lazy allocation',
      body: (
        <p>
          <code>make(map[K]V)</code>, and <code>make(map[K]V, n)</code> with n ≤ 8, allocate no storage. The first write allocates it. If the map doesn’t escape, the compiler can even put the header and
          the first group on the stack.
        </p>
      ),
    },
  },
  {
    caption: 'The first write allocates one group: 8 lockers and 8 lights. That is the whole map: no table, no directory.',
    actors: [hiker('ann', cx(0), 'first!', { hot: true })],
    props: hall([['ann:1c', '', '', '', '', '', '', '']], ['L0.0', 'K0.0'], { labels: ['small map · 1 group'] }),
  },
  {
    caption: 'With 5 keys, a lookup is one 8-light compare. There is nowhere else to look, so there is no probing.',
    actors: [hiker('eve', cx(4), 'one look')],
    props: hall([S5], ['L0.4'], { labels: ['small map · 1 group'] }),
  },
  {
    caption: 'delete(m, "cat") just empties the locker. A small map never leaves tombstones.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: cx(2), y: FLOOR, h: 88, tag: 'delete', bubble: 'just empty' }],
    props: hall([S4], ['L0.2'], { labels: ['small map · 1 group'] }),
    stop: {
      edge: true,
      title: 'no probe chain, no tombstones',
      body: <p>Tombstones protect probe chains, and a single group has none. So a small map can also use all 8 lockers: a real table must keep an empty slot somewhere to end searches.</p>,
    },
  },
  {
    caption: 'range over a small map starts at a random locker and wraps around. Insert 1…5 and you may see 34512, never 21534.',
    actors: [{ id: 'runner', sprite: 'fairy-tale-messenger-running', x: cx(2), y: FLOOR, h: 88, tag: 'range', bubble: 'start here' }],
    props: hall([['1:4a', '2:07', '3:61', '4:18', '5:33', '', '', '']], ['K0.2', 'L0.2'], { labels: ['small map · 1 group'] }),
    stop: {
      edge: true,
      title: 'random start, not a shuffle',
      body: (
        <p>
          Every <code>range</code> picks a random starting point, but a small map is then walked in slot order. So the output is a <em>rotation</em>: 12345, 34512, 51234… (verified on go1.26). Big maps
          also start at a random table and slot. Never depend on order; <code>fmt.Print</code> sorts keys for you.
        </p>
      ),
    },
  },
  {
    caption: 'After more inserts all 8 lockers are full. Then a 9th key, "ivy", arrives.',
    actors: [hiker('ivy', SIDE, 'no room!')],
    props: hall([S8], [], { labels: ['small map · 8/8'] }),
  },
  {
    caption: 'The small map becomes a real table: 16 lockers (2 groups), and every key is re-inserted, ivy too.',
    actors: [beside('ivy', 0, 'moved in!', { hot: true })],
    props: hall([T0, T1], ['L0.3', 'K0.3'], { labels: ['table · group 0', 'group 1'] }),
    stop: {
      title: 'the 9th key: group → table',
      body: (
        <>
          <p>
            Go allocates a 16-slot table (2 groups, room for 14) behind a 1-entry directory, re-inserts the 8 keys by their H1, and inserts the 9th. From here on it’s a normal table: it can probe, leave
            tombstones, double and split.
          </p>
          <p>
            Quirk: a small map holding 8 keys converts on <em>any</em> write, even overwriting an existing key (a TODO in the runtime).
          </p>
        </>
      ),
    },
  },
]

/* ───────────────────────── gotchas ───────────────────────── */

const EMPTY8: Row = Array(8).fill('')

export const gotchas: Frame[] = [
  {
    caption: 'Delete every key, or call clear(m): the lockers stay. Maps never shrink.',
    actors: [{ id: 'a', sprite: 'fairy-tale-witch-broom', x: SIDE, y: rowBottom(1), h: 88, tag: 'clear(m)', bubble: 'hall stays' }],
    props: hall([EMPTY8, EMPTY8], [], { labels: ['still allocated', 'still allocated'] }),
    stop: {
      title: 'maps never shrink',
      body: (
        <p>
          Verified: 1M entries with <code>[128]byte</code> values hold ~287 MB, and still ~287 MB after deleting them all, and after <code>clear</code>. To get memory back, copy the survivors into a fresh
          map (<code>make(map[K]V, len(old))</code>) and drop the old one. <code>maps.Clone</code> keeps the old capacity.
        </p>
      ),
    },
  },
  {
    caption: 'You can’t take &m["eve"]: when the table grows, every key moves to a new locker, and the pointer would dangle.',
    actors: [
      { id: 'a', sprite: 'fairy-tale-messenger-showing', x: cx(2), y: FLOOR, h: 88, tag: '&m["eve"]', bubble: 'eve is in 2!' },
      mover('everyone moves!', 620),
    ],
    props: hall([G1], ['K0.2']),
    stop: {
      title: 'map elements aren’t addressable',
      body: (
        <p>
          <code>&amp;m[k]</code> is a compile error, and so is <code>m[k].field = v</code> for struct values. Use <code>map[K]*T</code>, or copy, modify, store back: <code>p := m[k]; p.X = 1; m[k] = p</code>.
          But <code>m[k]++</code> and <code>m[k] = append(m[k], x)</code> are fine.
        </p>
      ),
    },
  },
  {
    caption: 'Two goroutines write the same map at once. The runtime notices and kills the program.',
    actors: [
      hiker('G1', cx(1), 'm["a"] = 1'),
      hiker('G2', cx(6), 'm["b"] = 2', { flip: true }),
      { id: 'a', sprite: 'fairy-tale-messenger-red-letter', x: cx(4), y: FLOOR, h: 88, tag: 'runtime', hot: true, bubble: 'fatal error!' },
    ],
    props: hall([G0]),
    stop: {
      title: 'concurrent map writes is fatal, not a panic',
      body: (
        <p>
          A best-effort <code>writing</code> flag turns a detected race into <code>fatal error: concurrent map writes</code>. It can’t be <code>recover</code>ed and it can miss races, so use{' '}
          <code>-race</code>. Many readers with no writer are fine. Otherwise use a mutex, sharding, or <code>sync.Map</code>.
        </p>
      ),
    },
  },
  {
    caption: 'NaN != NaN, so every m[NaN] = v adds a new entry that no lookup or delete can ever find again.',
    actors: [hiker('NaN', cx(5), 'me again?', { hot: true })],
    props: hall([['NaN:3e', 'NaN:3e', 'NaN:3e', 'NaN:3e', 'NaN:3e', 'NaN:3e', '', '']], ['K0.5', 'L0.5']),
    stop: {
      edge: true,
      title: 'NaN keys pile up',
      body: (
        <p>
          The fingerprints match, but the key comparison <code>NaN == NaN</code> is false, so every insert is “new”. <code>len(m)</code> grows, <code>m[NaN]</code> finds nothing, <code>delete</code>{' '}
          does nothing. Only <code>clear(m)</code> (or <code>range</code>) reaches them.
        </p>
      ),
    },
  },
  {
    caption: 'A nil map has no hall at all. Reads, len, delete and range act like an empty map; a write panics.',
    actors: [hiker('read', cx(1), '0, false'), hiker('write', cx(6), 'panic!', { hot: true, flip: true })],
    props: [{ id: 'G0', x: RX - 4, y: RY[0] - 22, w: 8 * LW + 8, h: 104, tone: 'dashed', text: 'var m map[string]int  // nil' }],
    stop: {
      title: 'assignment to entry in nil map',
      body: (
        <p>
          <code>var m map[string]int</code> is a nil pointer to a map header. Reading needs nothing, but writing needs storage to write into, so <code>m["x"] = 1</code> panics. Use{' '}
          <code>make</code> or a literal.
        </p>
      ),
    },
  },
]
