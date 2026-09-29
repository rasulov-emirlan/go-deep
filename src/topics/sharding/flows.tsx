import type { El, FlowDef } from '../../components/flow'

/* ---------- small helpers ---------- */
const rad = (d: number) => (d * Math.PI) / 180
/** point on a circle, angle in degrees clockwise from 12 o'clock */
const pt = (cx: number, cy: number, r: number, deg: number) => ({ x: +(cx + r * Math.sin(rad(deg))).toFixed(1), y: +(cy - r * Math.cos(rad(deg))).toFixed(1) })
/** arc drawn clockwise from angle a to angle b */
const arc = (cx: number, cy: number, r: number, a: number, b: number) => {
  const s = pt(cx, cy, r, a)
  const e = pt(cx, cy, r, b)
  const d = (((b - a) % 360) + 360) % 360
  return `M${s.x},${s.y} A${r},${r} 0 ${d > 180 ? 1 : 0} 1 ${e.x},${e.y}`
}
const circle = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`

/* =====================================================================================
   01  hash % N
   ===================================================================================== */
const modPos = (h: number, n: number) => {
  const c = h % n
  const k = Math.floor(h / n)
  return { x: 70 + 140 * c + (k % 2 ? 24 : -24), y: 112 + Math.floor(k / 2) * 40 }
}
const H12 = Array.from({ length: 12 }, (_, h) => h)

export const modFlow: FlowDef = {
  h: 222,
  steps: [
    {
      caption: 'Pretend each key hashes to 0…11. Shard = hash mod 3. Simple, and every shard holds four keys.',
      add: [
        { t: 'text', id: 'title', x: 280, y: 26, text: 'hash(key) = 0 … 11', tone: 'grey' },
        ...[0, 1, 2].map((c): El => ({ t: 'box', id: `s${c}`, x: 15 + 140 * c, y: 50, w: 110, h: 122, label: `shard ${c}` })),
        ...H12.map((h): El => ({ t: 'node', id: `k${h}`, r: 15, text: String(h), ...modPos(h, 3) })),
      ],
    },
    {
      caption: 'Add a fourth shard: hash mod 4. Nine of the twelve keys land somewhere new. That is 75% of the data.',
      add: [{ t: 'box', id: 's3', x: 435, y: 50, w: 110, h: 122, label: 'shard 3', tone: 'red', dashed: true }],
      set: Object.fromEntries(H12.map((h) => [`k${h}`, { ...modPos(h, 4), tone: h % 3 !== h % 4 ? 'red' : 'ink' }])),
    },
    {
      caption: 'Same trick on a real fleet: 91% of keys move going 10 → 11 nodes, 99% going 100 → 101. The minimum would be 1/(N+1).',
      drop: ['title', ...H12.map((h) => `k${h}`), 's0', 's1', 's2', 's3'],
      add: [
        { t: 'text', id: 'lg1', x: 20, y: 22, anchor: 'start', size: 13, tone: 'red', text: '■ keys that move' },
        { t: 'text', id: 'lg2', x: 190, y: 22, anchor: 'start', size: 13, tone: 'grey', text: '■ the minimum: 1/(N+1)' },
        ...(
          [
            ['3→4', 75, 25],
            ['10→11', 90.9, 9.1],
            ['100→101', 99, 1],
          ] as const
        ).flatMap(([l, m, ideal], i): El[] => {
          const y = 70 + i * 62
          return [
            { t: 'text', id: `l${i}`, x: 20, y, anchor: 'start', text: l },
            { t: 'box', id: `m${i}`, x: 100, y: y - 16, w: m * 3.6, h: 22, tone: 'red' },
            { t: 'text', id: `mv${i}`, x: 100 + m * 3.6 + 8, y: y - 5, anchor: 'start', tone: 'red', text: m === 75 ? '75%' : m.toFixed(1) + '%' },
            { t: 'box', id: `i${i}`, x: 100, y: y + 10, w: Math.max(ideal * 3.6, 2), h: 9, tone: 'grey' },
            { t: 'text', id: `iv${i}`, x: 100 + m * 3.6 + 8, y: y + 15, anchor: 'start', size: 13, tone: 'grey', text: 'min ' + (ideal === 25 ? '25%' : ideal.toFixed(1) + '%') },
          ]
        }),
      ],
      stop: {
        title: 'Why does one node move everything?',
        body: (
          <>
            <code>h mod N</code> and <code>h mod (N+1)</code> agree for only about one hash in N+1. Every other key lands on a different node.
          </>
        ),
      },
    },
    {
      caption: 'For a cache that is an outage: hit rate falls to about 9% and the database takes the flood.',
      drop: ['lg1', 'lg2', ...[0, 1, 2].flatMap((i) => [`l${i}`, `m${i}`, `mv${i}`, `i${i}`, `iv${i}`])],
      add: [
        { t: 'box', id: 'app', x: 20, y: 60, w: 100, h: 56, text: 'app' },
        { t: 'box', id: 'cache', x: 230, y: 60, w: 110, h: 56, text: 'cache', sub: '11 nodes' },
        { t: 'box', id: 'db', x: 440, y: 60, w: 100, h: 56, text: 'DB', tone: 'red' },
        { t: 'line', id: 'a1', x1: 120, y1: 88, x2: 230, y2: 88, arrow: true, text: 'GET' },
        { t: 'line', id: 'a2', x1: 340, y1: 88, x2: 440, y2: 88, arrow: true, tone: 'red', text: '91% miss' },
        { t: 'text', id: 'hit', x: 285, y: 150, tone: 'red', text: 'hit rate → ~9%' },
      ],
    },
    {
      caption: 'The rolling deploy: half the pods know N=10, half know N=11. The same key now has two homes.',
      drop: ['app', 'cache', 'db', 'a1', 'a2', 'hit'],
      add: [
        { t: 'box', id: 'p1', x: 20, y: 30, w: 150, h: 50, text: 'pod', sub: 'N = 10' },
        { t: 'box', id: 'p2', x: 20, y: 130, w: 150, h: 50, text: 'pod', sub: 'N = 11' },
        { t: 'box', id: 'n3', x: 400, y: 30, w: 140, h: 50, text: 'node 3' },
        { t: 'box', id: 'n7', x: 400, y: 130, w: 140, h: 50, text: 'node 7', tone: 'red' },
        { t: 'line', id: 'r1', x1: 170, y1: 55, x2: 400, y2: 55, arrow: true, text: '73 % 10 = 3' },
        { t: 'line', id: 'r2', x1: 170, y1: 155, x2: 400, y2: 155, arrow: true, tone: 'red', text: '73 % 11 = 7' },
        { t: 'text', id: 'same', x: 285, y: 112, tone: 'grey', text: 'same key, hash 73' },
      ],
      stop: {
        edge: true,
        title: 'Everyone needs the same map',
        body: 'A hash scheme is only consistent while all clients share one membership view. Ship the shard map as a versioned value with an epoch, never as a bare N in config. The same holds for a ring.',
      },
    },
  ],
}

/* =====================================================================================
   02  the ring
   ===================================================================================== */
const RC = { cx: 165, cy: 185, r: 135 }
const ringPath: El = { t: 'path', id: 'ring', d: circle(RC.cx, RC.cy, RC.r), tone: 'grey', z: -2 }
const P = (deg: number) => pt(RC.cx, RC.cy, RC.r, deg)

// 15 points, 5 per node, spread around the ring with a little jitter
const LET = 'ABCBACCABABCACB'
const JIT = [0.8, -1.2, 1.5, -0.6, 1, -1.4, 0.4, -0.9, 1.3, -0.3, 1.1, -1.5, 0.6, -0.7, 1.2]
const vAng = (i: number) => 24 * i + 6 + JIT[i]
const D_GAPS = [1, 4, 7, 10, 13] // node D's points sit between point g and g+1
const dAng = (g: number) => 24 * g + 18
const allPts = [
  ...LET.split('').map((l, i) => ({ id: `v${i}`, l, a: vAng(i) })),
  ...D_GAPS.map((g, i) => ({ id: `d${i}`, l: 'D', a: dAng(g) })),
].sort((a, b) => a.a - b.a)
const prevOf = (id: string) => {
  const i = allPts.findIndex((p) => p.id === id)
  return allPts[(i + allPts.length - 1) % allPts.length]
}
const vDots = LET.split('').map((l, i): El => ({ t: 'node', id: `v${i}`, r: 10, text: l, ...P(vAng(i)) }))
const dDots = (tone: 'red' | 'ink'): El[] => D_GAPS.map((g, i) => ({ t: 'node', id: `d${i}`, r: 10, text: 'D', tone, ...P(dAng(g)) }))
const cvRows: [string, number, string][] = [
  ['v=1', 88, '88%'],
  ['v=10', 29, '29%'],
  ['v=100', 9.6, '9.6%'],
  ['v=1000', 2.9, '2.9%'],
]
const cvIds = ['cvh', ...cvRows.flatMap((_, i) => [`cl${i}`, `cb${i}`, `cv${i}`])]
const CVX = 345

export const ringFlow: FlowDef = {
  h: 350,
  steps: [
    {
      caption: 'A hash ring: hash space bent into a circle. Hash each node to a point on it.',
      add: [
        ringPath,
        { t: 'text', id: 'mid', x: RC.cx, y: RC.cy, tone: 'grey', text: 'hash\nring ↻' },
        { t: 'node', id: 'A', r: 15, text: 'A', ...P(300) },
        { t: 'node', id: 'B', r: 15, text: 'B', ...P(20) },
        { t: 'node', id: 'C', r: 15, text: 'C', ...P(80) },
      ],
    },
    {
      caption: 'Hash a key to a point too. Its owner is the first node clockwise from it.',
      set: { mid: { text: 'key → first\nnode ↻' } },
      add: [
        ...([
          ['k1', 150, 300],
          ['k2', 200, 300],
          ['k3', 250, 300],
          ['k4', 40, 80],
          ['k5', 340, 20],
        ] as const).flatMap(([id, a, to]): El[] => [
          { t: 'path', id: id + 'a', d: arc(RC.cx, RC.cy, RC.r, a, to), dashed: true, width: 3, z: -1 },
          { t: 'node', id, r: 5, ...P(a), tone: 'red' },
        ]),
      ],
    },
    {
      caption: 'Points land at random, so the gaps are uneven. In this draw, A owns the whole long arc: 61% of the keys.',
      add: [
        { t: 'path', id: 'own', d: arc(RC.cx, RC.cy, RC.r, 80, 300), tone: 'red', width: 7, z: -1 },
        { t: 'text', id: 'r3', x: 345, y: 110, anchor: 'start', text: 'A owns 61%\nB owns 22%\nC owns 17%', tone: 'red' },
      ],
      stop: {
        title: 'Why is one point per node unbalanced?',
        body: 'Random points make exponentially distributed gaps. In simulated 10-node rings with one point each, the busiest node held about 2.9× its fair share on average (a single lucky draw can look better).',
      },
    },
    {
      caption: 'Give every node many points, called virtual nodes (vnodes). Here 5 each. Arcs shrink, so no node gets a giant one.',
      drop: ['A', 'B', 'C', 'own', 'r3', 'mid', ...['k1', 'k2', 'k3', 'k4', 'k5'].flatMap((k) => [k, k + 'a'])],
      add: vDots,
    },
    {
      caption: 'Measured on 10 nodes, averaged over 100 random rings: the spread of load (std-dev ÷ mean) falls roughly like 1/√v.',
      add: [
        { t: 'text', id: 'cvh', x: CVX, y: 60, anchor: 'start', size: 13, tone: 'grey', text: 'load spread, 10 nodes\n(std-dev ÷ mean)' },
        ...cvRows.flatMap(([l, cv, v], i): El[] => {
          const y = 128 + i * 52
          return [
            { t: 'text', id: `cl${i}`, x: CVX, y, anchor: 'start', text: l },
            { t: 'box', id: `cb${i}`, x: CVX + 68, y: y - 10, w: Math.max(cv, 3), h: 20, tone: i === 0 ? 'red' : 'ink' },
            { t: 'text', id: `cv${i}`, x: CVX + 68 + Math.max(cv, 3) + 6, y, anchor: 'start', text: v, tone: i === 0 ? 'red' : 'ink' },
          ]
        }),
      ],
    },
    {
      caption: 'Add node D with its own points. It takes a small slice from many peers, in parallel. Ring test: 10.3% of keys moved (ideal 9.1%).',
      drop: cvIds,
      add: [
        ...dDots('red'),
        ...D_GAPS.map((g, i): El => {
          const prev = prevOf(`d${i}`)
          return { t: 'path', id: `da${i}`, d: arc(RC.cx, RC.cy, RC.r, prev.a, dAng(g)), tone: 'red', width: 7, z: -1 }
        }),
        { t: 'text', id: 'r6', x: 345, y: 120, anchor: 'start', tone: 'red', text: '10 → 11 nodes\n200 points each\n10.3% moved' },
      ],
    },
    {
      caption: 'Now C dies. Each of its slices goes to whoever is next clockwise: different successors, so no one node takes it all.',
      drop: [...D_GAPS.map((_, i) => `da${i}`), 'r6'],
      set: {
        ...Object.fromEntries(D_GAPS.map((_, i) => [`d${i}`, { tone: 'ink' }])),
        ...Object.fromEntries(LET.split('').flatMap((l, i) => (l === 'C' ? [[`v${i}`, { tone: 'grey', dashed: true }]] : []))),
      },
      add: [
        ...LET.split('').flatMap((l, i): El[] => {
          if (l !== 'C') return []
          const prev = prevOf(`v${i}`)
          return [{ t: 'path', id: `ca${i}`, d: arc(RC.cx, RC.cy, RC.r, prev.a, vAng(i)), tone: 'red', width: 7, z: -1 }]
        }),
        { t: 'text', id: 'r7', x: 345, y: 120, anchor: 'start', tone: 'red', text: 'one node out\n200 points each\n10.2% moved\n= what it owned' },
      ],
      stop: {
        edge: true,
        title: 'One point: one successor eats it',
        body: 'On a plain ring (one point per node) a dead node’s whole arc falls on a single neighbour, which may then overload and die too. Vnodes spread the load, as Dynamo and Cassandra do.',
      },
    },
  ],
}

/* ---- replicas & weights ---- */
const REP = 'AABCDBDACBDC'
const repAng = (i: number) => 30 * (i + 1)
const repDots = (tones: Record<number, 'red' | 'grey'> = {}): El[] =>
  REP.split('').map((l, i) => ({ t: 'node', id: `p${i}`, r: 10, text: l, ...P(repAng(i)), ...(tones[i] ? { tone: tones[i] } : {}) }))

export const replicaFlow: FlowDef = {
  h: 350,
  steps: [
    {
      caption: 'Replication on a ring: a key lives on R = 3 nodes, found by walking clockwise from its point. Here every node has 3 points.',
      add: [
        ringPath,
        ...repDots(),
        { t: 'node', id: 'key', r: 6, tone: 'red', ...P(15) },
        { t: 'text', id: 'r1', x: 345, y: 110, anchor: 'start', text: 'key k\ncopies: R = 3' },
      ],
    },
    {
      caption: 'Naive: take the next 3 points. Two of them are node A, so only 2 machines hold the key.',
      set: { p0: { tone: 'red' }, p1: { tone: 'red' }, p2: { tone: 'red' }, r1: { tone: 'red', text: 'copies on\nA, A, B\n= 2 machines' } },
      stop: {
        edge: true,
        title: 'A data-loss bug, not a perf nit',
        body: 'Lose machine A and two of the three copies go together. With 10 machines and many points each, about 28% of keys (1 − 0.9 × 0.8) get fewer than 3 distinct machines.',
      },
    },
    {
      caption: 'Correct: skip points of a machine you already have. Ideally also skip the same rack or zone.',
      set: { p1: { tone: 'grey', dashed: true }, p3: { tone: 'red' }, r1: { tone: 'red', text: 'copies on\nA, B, C\n= 3 machines' } },
    },
    {
      caption: 'A machine twice as big gets twice the points, so it owns about twice the keys.',
      set: { p0: { tone: 'ink' }, p2: { tone: 'ink' }, p3: { tone: 'ink' }, p1: { tone: 'ink', dashed: false }, r1: { tone: 'ink', text: 'D gets 6 points\n(others 3)' } },
      add: ([135, 195, 255] as const).map((a, i): El => ({ t: 'node', id: `w${i}`, r: 10, text: 'D', tone: 'red', ...P(a) })),
    },
  ],
}

/* =====================================================================================
   03  other ways to place keys
   ===================================================================================== */
const rvx = (i: number) => 25 + 135 * i
const scores = ['.42', '.91', '.17', '.66']
const jx = (i: number) => 20 + 86 * i
const jw = 66

const slotX = (i: number) => 20 + 74 * i
const SLOT_OWNER = 'BABACCA' // final Maglev table for M = 7 (slots 0..6)

export const placeFlow: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'Rendezvous hashing: score every node with hash(node, key). Highest score owns the key. No ring, no table. Cost: N hashes per lookup.',
      add: [
        { t: 'text', id: 'key', x: 280, y: 28, text: 'key k: scores (made up)', tone: 'grey' },
        ...['A', 'B', 'C', 'D'].map((n, i): El => ({ t: 'box', id: 'n' + n, x: rvx(i), y: 70, w: 110, h: 60, text: n, sub: scores[i], tone: n === 'B' ? 'red' : 'ink' })),
      ],
    },
    {
      caption: 'B leaves. Only B’s keys move, each to its own runner-up. Nothing else changes. Test: removing a node moved exactly its 10.0% share.',
      set: { nB: { tone: 'grey', dashed: true, sub: 'gone' }, nD: { tone: 'red' } },
      add: [{ t: 'text', id: 'ru', x: rvx(3) + 55, y: 160, tone: 'red', text: 'runner-up' }],
    },
    {
      caption: 'Jump hash: buckets are numbered 0…n−1, no state. Grow to n+1 and 1/(n+1) of the keys (on average) hop into the new bucket, from every old one.',
      drop: ['key', 'nA', 'nB', 'nC', 'nD', 'ru'],
      add: [
        ...[0, 1, 2, 3, 4].map((i): El => ({ t: 'box', id: 'b' + i, x: jx(i), y: 90, w: jw, h: 50, text: String(i), sub: '1/6' })),
        { t: 'box', id: 'b5', x: jx(5), y: 90, w: jw, h: 50, text: '5', sub: '1/6', tone: 'red' },
        ...[0, 1, 2, 3, 4].map((i): El => ({ t: 'line', id: 'g' + i, x1: jx(i) + jw / 2, y1: 140, x2: jx(i) + jw / 2, y2: 178, tone: 'red' })),
        { t: 'line', id: 'bus', x1: jx(0) + jw / 2, y1: 178, x2: jx(5) + jw / 2, y2: 178, tone: 'red' },
        { t: 'line', id: 'up', x1: jx(5) + jw / 2, y1: 178, x2: jx(5) + jw / 2, y2: 144, tone: 'red', arrow: true },
        { t: 'text', id: 'jl', x: 280, y: 212, tone: 'red', text: 'each old bucket gives up 1/6 of what it holds' },
      ],
    },
    {
      caption: 'Bucket 2 dies. Jump hash can only drop the last number, so the last machine takes over number 2 and needs bucket 2’s data (from a replica).',
      drop: [...[0, 1, 2, 3, 4].map((i) => 'g' + i), 'bus', 'up', 'jl'],
      set: { b2: { tone: 'grey', dashed: true, sub: 'dead' }, b5: { text: '5→2', sub: 'copy' } },
      add: [
        { t: 'line', id: 'u1', x1: jx(5) + jw / 2, y1: 90, x2: jx(5) + jw / 2, y2: 50, tone: 'red' },
        { t: 'line', id: 'u2', x1: jx(5) + jw / 2, y1: 50, x2: jx(2) + jw / 2, y2: 50, tone: 'red' },
        { t: 'line', id: 'u3', x1: jx(2) + jw / 2, y1: 50, x2: jx(2) + jw / 2, y2: 94, tone: 'red', arrow: true },
      ],
      stop: {
        edge: true,
        title: 'Why can’t jump hash drop bucket 2?',
        body: 'It only maps a key to a number below n. Fine for storage shards (shard i = replica set i), wrong for caches where any node can die. Test: 10 → 9 moved only bucket 9’s keys.',
      },
    },
    {
      caption: 'Maglev fills a table of 7 slots. Backends take turns claiming their next free preferred slot. Round 1: A takes 3, B takes 0, C takes 4.',
      drop: [...[0, 1, 2, 3, 4, 5].map((i) => 'b' + i), 'u1', 'u2', 'u3'],
      add: [
        ...[0, 1, 2, 3, 4, 5, 6].map((i): El => ({ t: 'box', id: 's' + i, x: slotX(i), y: 50, w: 64, h: 56, label: String(i), text: i === 3 ? 'A' : i === 0 ? 'B' : i === 4 ? 'C' : '', tone: [3, 0, 4].includes(i) ? 'red' : 'grey', dashed: ![3, 0, 4].includes(i) })),
        { t: 'text', id: 'pa', x: 20, y: 150, anchor: 'start', size: 14, text: 'A prefers: 3 0 4 1 5 2 6' },
        { t: 'text', id: 'pb', x: 20, y: 178, anchor: 'start', size: 14, text: 'B prefers: 0 2 4 6 1 3 5' },
        { t: 'text', id: 'pc', x: 20, y: 206, anchor: 'start', size: 14, text: 'C prefers: 3 4 5 6 0 1 2' },
      ],
    },
    {
      caption: 'Rounds 2 and 3 fill the rest: 3/2/2 slots. Lookup is one array read: 1234 mod 7 = 2, slot 2 is B. A change means rebuilding the table.',
      set: Object.fromEntries(SLOT_OWNER.split('').map((l, i) => [`s${i}`, { text: l, tone: i === 2 ? 'red' : 'ink', dashed: false }])),
      add: [
        { t: 'text', id: 'hh', x: slotX(2) + 32, y: 18, tone: 'red', text: '1234 mod 7 = 2' },
        { t: 'line', id: 'hl', x1: slotX(2) + 32, y1: 28, x2: slotX(2) + 32, y2: 48, tone: 'red', arrow: true },
      ],
    },
  ],
}

/* ---- Redis fixed slots ---- */
const seg = (i: number) => 20 + 175 * i
export const slotFlow: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'Redis Cluster does not use a ring. Slot = CRC16(key) mod 16384, and a table says which master owns each slot. Example: 3 masters.',
      add: [
        { t: 'text', id: 'hd', x: 280, y: 24, tone: 'grey', text: '16384 slots, split by range' },
        ...['A', 'B', 'C'].map((n, i): El => ({ t: 'box', id: 'm' + n, x: seg(i), y: 110, w: 170, h: 60, text: 'master ' + n, sub: '~5.4k slots' })),
        { t: 'text', id: 'k1', x: 400, y: 62, tone: 'red', text: 'user:42 → slot 15880' },
        { t: 'line', id: 'k1l', x1: 460, y1: 74, x2: 460, y2: 106, tone: 'red', arrow: true },
        { t: 'text', id: 'k1o', x: 460, y: 196, tone: 'red', text: 'served by C' },
      ],
    },
    {
      caption: 'Add master D: hand over some whole slots from each master. Keys are never rehashed; only the slot table changes.',
      drop: ['k1', 'k1l', 'k1o'],
      add: [
        { t: 'text', id: 'nd', x: 280, y: 62, tone: 'red', text: 'D takes ~1/4 of each' },
        ...[0, 1, 2].map((i): El => ({ t: 'line', id: 'd' + i, x1: seg(i) + 85, y1: 172, x2: seg(i) + 85, y2: 206, tone: 'red' })),
        { t: 'box', id: 'mD', x: 60, y: 206, w: 440, h: 38, text: 'master D', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'Multi-key commands need one slot. `{tag}` hashes only the tag: {u1}:cart and {u1}:prefs share a slot. Without it: CROSSSLOT.',
      drop: ['nd', 'd0', 'd1', 'd2', 'mD', 'hd'],
      set: { mA: { y: 150 }, mB: { y: 150 }, mC: { y: 150 } },
      add: [
        { t: 'text', id: 'tg', x: 20, y: 24, anchor: 'start', text: '{u1}:cart   → slot 4574' },
        { t: 'text', id: 'tg2', x: 20, y: 52, anchor: 'start', text: '{u1}:prefs  → slot 4574' },
        { t: 'text', id: 'ng', x: 20, y: 84, anchor: 'start', tone: 'red', text: 'cart:u1 → 13083\nprefs:u1 → 5853  (no tag)' },
      ],
    },
    {
      caption: 'The price: a tag pins all its keys to one slot on one master. A whale tag is a hot shard, and a slot cannot be split.',
      set: { tg: { tone: 'grey' }, tg2: { tone: 'grey' }, ng: { tone: 'grey' }, mA: { tone: 'grey' }, mC: { tone: 'grey' }, mB: { tone: 'red', sub: 'all {bigcorp}' } },
      add: [{ t: 'text', id: 'wh', x: 280, y: 232, tone: 'red', text: '{bigcorp}:* → slot 8179 → B only' }],
      stop: {
        edge: true,
        title: 'Tags concentrate load',
        body: 'Tag per user or order, not per giant tenant. Also: migrating a slot with huge keys blocks the source, since MIGRATE is synchronous per key.',
      },
    },
  ],
}

/* =====================================================================================
   04  moving data live
   ===================================================================================== */
export const reshardFlow: FlowDef = {
  h: 430,
  steps: [
    {
      caption: 'Resharding live. First, backfill: copy a snapshot of the old shards to the new ones while the app keeps writing to the old.',
      add: [
        { t: 'lane', id: 'app', x: 70, y: 10, len: 415, text: 'app' },
        { t: 'lane', id: 'old', x: 280, y: 10, len: 415, text: 'old', sub: 'shards' },
        { t: 'lane', id: 'new', x: 490, y: 10, len: 415, text: 'new', sub: 'shards' },
        { t: 'msg', id: 'w', from: 'app', to: 'old', y: 90, text: 'writes' },
        { t: 'msg', id: 'snap', from: 'old', to: 'new', y: 112, y2: 140, text: 'snapshot', tone: 'red' },
      ],
    },
    {
      caption: 'Then stream every later change (binlog, change data capture) so the new side catches up. Old stays the truth.',
      set: { snap: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'cdc', from: 'old', to: 'new', y: 176, y2: 190, text: 'change stream', tone: 'red', dashed: true }],
      stop: {
        edge: true,
        title: 'Why not dual-write from the app?',
        body: 'Two commits with no atomicity: one can fail or reorder, and the sides drift. Copying from the log keeps one authoritative writer until cutover.',
      },
    },
    {
      caption: 'Verify before you switch: compare row counts and checksums on both sides.',
      set: { cdc: { tone: 'ink' } },
      add: [{ t: 'text', id: 'vf', x: 385, y: 232, tone: 'red', text: 'verify rows\n+ checksums' }],
    },
    {
      caption: 'Cut over reads first. If the numbers look wrong, switching back is quick.',
      drop: ['vf'],
      add: [{ t: 'msg', id: 'rd', from: 'app', to: 'new', y: 250, y2: 265, text: 'reads', tone: 'red' }],
    },
    {
      caption: 'Then writes: block them briefly, let the stream drain, flip the routing. Writes wait only for this short pause.',
      set: { rd: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'pause', from: 'app', to: 'old', y: 296, text: 'write paused', tone: 'red', lost: true }],
    },
    {
      caption: 'The app now writes to the new shards. The old ones are no longer the source of truth.',
      set: { pause: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'w2', from: 'app', to: 'new', y: 336, y2: 350, text: 'writes', tone: 'red' }],
    },
    {
      caption: 'Keep replication running backwards, new → old. If the cutover goes badly you can switch back without losing writes.',
      set: { w2: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'rev', from: 'new', to: 'old', y: 384, y2: 398, text: 'reverse stream', tone: 'red', dashed: true }],
    },
  ],
}

export const askFlow: FlowDef = {
  h: 360,
  steps: [
    {
      caption: 'Redis slot 7 is moving from A to B. A client asks A for a key A does not hold. A answers with a one-off redirect.',
      add: [
        { t: 'lane', id: 'c', x: 70, y: 10, len: 340, text: 'client' },
        { t: 'lane', id: 'a', x: 280, y: 10, len: 340, text: 'A', sub: 'MIGRATING', w: 96 },
        { t: 'lane', id: 'b', x: 490, y: 10, len: 340, text: 'B', sub: 'IMPORTING', w: 96 },
        { t: 'msg', id: 'g1', from: 'c', to: 'a', y: 90, y2: 100, text: 'GET k' },
        { t: 'msg', id: 'ask', from: 'a', to: 'c', y: 130, y2: 140, text: '-ASK 7 B', tone: 'red' },
      ],
    },
    {
      caption: 'The client sends ASKING to B, then repeats the command. B accepts it only because of ASKING.',
      set: { ask: { tone: 'ink' } },
      add: [
        { t: 'msg', id: 'as', from: 'c', to: 'b', y: 176, y2: 190, text: 'ASKING', tone: 'red' },
        { t: 'msg', id: 'g2', from: 'c', to: 'b', y: 216, y2: 230, text: 'GET k' },
      ],
    },
    {
      caption: 'B answers. The client’s slot table is not updated: the next request for slot 7 still goes to A first.',
      set: { as: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'v', from: 'b', to: 'c', y: 262, y2: 276, text: 'value' }],
    },
    {
      caption: 'When migration has finished, A answers -MOVED. That is permanent: the client rewrites its slot table.',
      drop: ['g1', 'ask', 'as', 'g2', 'v'],
      set: { a: { sub: 'migrated' }, b: { sub: 'owns 7' } },
      add: [
        { t: 'msg', id: 'g3', from: 'c', to: 'a', y: 100, y2: 110, text: 'GET k' },
        { t: 'msg', id: 'mv', from: 'a', to: 'c', y: 150, y2: 160, text: '-MOVED 7 B', tone: 'red' },
        { t: 'text', id: 'upd', x: 70, y: 200, anchor: 'start', size: 14, tone: 'red', text: 'slot 7 → B\n(table updated)' },
      ],
      stop: {
        edge: true,
        title: 'MOVED vs ASK?',
        body: 'ASK: this one request, mid-migration; the table stays. MOVED: the slot has a new owner for good; refresh the table. Clients such as go-redis follow both.',
      },
    },
  ],
}

/* =====================================================================================
   05  what sharding costs
   ===================================================================================== */
const bar = (id: string, x: number, w: number, hgt: number, tone: 'soft' | 'red'): El => ({ t: 'box', id, x, y: 190 - hgt, w, h: hgt, tone })

export const hotFlow: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'Hashing evens out keys, not traffic. In a 10-node Zipf-traffic simulation, the hottest node took about 25–27% of requests, not 10%.',
      add: [
        ...[0, 1, 2].map((i): El => ({ t: 'box', id: 'h' + i, x: 20 + 180 * i, y: 50, w: 160, h: 150, label: `shard ${i}` })),
        bar('b0', 60, 80, 34, 'soft'),
        bar('b1', 240, 80, 84, 'red'),
        bar('b2', 420, 80, 30, 'soft'),
        { t: 'node', id: 'hk', r: 14, text: 'k', tone: 'red', x: 280, y: 84, z: 5 },
        { t: 'text', id: 'hkt', x: 280, y: 28, tone: 'red', text: 'one hot key → one shard' },
      ],
    },
    {
      caption: 'Reshard into six. The hot key still lives on exactly one shard, and that shard is still hot.',
      drop: ['h0', 'h1', 'h2', 'b0', 'b1', 'b2'],
      set: { hk: { x: 232 } },
      add: [
        ...[0, 1, 2, 3, 4, 5].map((i): El => ({ t: 'box', id: 'q' + i, x: 12 + 90 * i, y: 50, w: 80, h: 150, label: `s${i}` })),
        ...[0, 1, 2, 3, 4, 5].map((i) => bar('u' + i, 26 + 90 * i, 52, i === 2 ? 84 : 26, i === 2 ? 'red' : 'soft')),
      ],
      stop: {
        title: 'How do you fix a hot key?',
        body: 'Split its traffic, not its data: salt the key, cache reads, coalesce with singleflight, or give a whale tenant its own shard.',
      },
    },
    {
      caption: 'Salt it: write k#0 … k#7 instead of k. Writes scatter across shards. In the simulation the hottest node fell to about 16–19%.',
      drop: ['hk', 'hkt'],
      set: { u2: { h: 40, y: 150 }, u0: { h: 44, y: 146 }, u4: { h: 44, y: 146 }, u5: { h: 36, y: 154 } },
      add: (
        [
          ['0', 0, -18],
          ['1', 0, 18],
          ['2', 1, 0],
          ['3', 2, -18],
          ['4', 2, 18],
          ['5', 3, 0],
          ['6', 4, 0],
          ['7', 5, 0],
        ] as const
      ).map(([s, box, dx]): El => ({ t: 'node', id: 'sa' + s, r: 14, text: '#' + s, tone: 'red', x: 52 + 90 * box + dx, y: 84 })),
    },
    {
      caption: 'Cost: a read must ask all 8 suffixes and combine them. Fine for counters, poor for strict reads. Other fixes: short-TTL cache, singleflight.',
      add: [
        { t: 'box', id: 'rd', x: 130, y: 236, w: 300, h: 40, text: 'read = 8 lookups + sum', tone: 'red' },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): El => {
          const boxX = [0, 0, 1, 2, 2, 3, 4, 5][i]
          const dx = [-18, 18, 0, -18, 18, 0, 0, 0][i]
          return { t: 'line', id: 'sl' + i, x1: 52 + 90 * boxX + dx, y1: 100, x2: 130 + 300 * ((i + 0.5) / 8), y2: 236, tone: 'red', arrow: true }
        }),
      ],
    },
  ],
}

export const scatterFlow: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'A query without the shard key is scatter-gather: ask every shard. Load is multiplied by the number of shards.',
      add: [
        { t: 'lane', id: 'app', x: 60, y: 10, len: 300, text: 'app' },
        { t: 'lane', id: 's1', x: 220, y: 10, len: 300, text: 'S1' },
        { t: 'lane', id: 's2', x: 350, y: 10, len: 300, text: 'S2' },
        { t: 'lane', id: 's3', x: 480, y: 10, len: 300, text: 'S3' },
        { t: 'msg', id: 'q1', from: 'app', to: 's1', y: 68, y2: 80, text: 'query all' },
        { t: 'msg', id: 'q2', from: 'app', to: 's2', y: 88, y2: 100 },
        { t: 'msg', id: 'q3', from: 'app', to: 's3', y: 108, y2: 120 },
      ],
    },
    {
      caption: 'The answer arrives when the slowest shard replies. Latency is the max of N, not the average.',
      add: [
        { t: 'msg', id: 'r1', from: 's1', to: 'app', y: 150, y2: 165, text: 'rows' },
        { t: 'msg', id: 'r2', from: 's2', to: 'app', y: 150, y2: 185 },
        { t: 'msg', id: 'r3', from: 's3', to: 'app', y: 150, y2: 250, text: 'slow', tone: 'red' },
      ],
    },
    {
      caption: 'Tail latency compounds: 100 shards, each slow 1% of the time, means 1 − 0.99^100 = 63% of requests wait on a slow one.',
      add: [{ t: 'text', id: 'tail', x: 280, y: 300, tone: 'red', text: '1 − 0.99^100 = 63%' }],
      stop: {
        edge: true,
        title: 'The fan-out is the tail',
        body: 'Each request waits for the max of the fan-out. Every added shard raises the odds that one of them is slow.',
      },
    },
    {
      caption: 'ORDER BY … LIMIT 10 OFFSET 1000: each shard must return its top 1010 rows, then the app merges. Deep pages get expensive.',
      drop: ['q1', 'q2', 'q3', 'r1', 'r2', 'r3', 'tail'],
      add: [
        { t: 'msg', id: 'm1', from: 'app', to: 's1', y: 68, y2: 80, text: 'top 1010 each' },
        { t: 'msg', id: 'm2', from: 'app', to: 's2', y: 88, y2: 100 },
        { t: 'msg', id: 'm3', from: 'app', to: 's3', y: 108, y2: 120 },
        { t: 'text', id: 'mg', x: 60, y: 200, anchor: 'start', tone: 'red', text: 'merge 3 × 1010 rows,\nkeep 10' },
      ],
    },
  ],
}

const shardBox = (i: number): El => ({ t: 'box', id: 'sh' + i, x: 20 + 180 * i, y: 140, w: 160, h: 70, label: `shard ${i + 1}`, text: 'rows', sub: 'own index' })
const IX = (i: number) => 100 + 180 * i

export const indexFlow: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'Local secondary index: each shard indexes its own rows. Writes stay on one shard, but looking up by email must ask every shard.',
      add: [
        { t: 'text', id: 'q', x: 280, y: 20, text: 'WHERE email = x', tone: 'red' },
        ...[0, 1, 2].map((i) => shardBox(i)),
        ...[0, 1, 2].map((i): El => ({ t: 'line', id: 'ql' + i, x1: 280 + (i - 1) * 50, y1: 34, x2: IX(i), y2: 138, tone: 'red', arrow: true })),
      ],
    },
    {
      caption: 'Global index: the index is itself partitioned, by email. A lookup hits one index shard, then the one shard holding the row.',
      drop: ['ql0', 'ql1', 'ql2'],
      set: { sh0: { sub: '' }, sh1: { sub: '' }, sh2: { sub: '' } },
      add: [
        ...(['e: a–h', 'e: i–q', 'e: r–z'] as const).map((t, i): El => ({ t: 'box', id: 'ix' + i, x: IX(i) - 50, y: 52, w: 100, h: 34, text: t, tone: i === 1 ? 'red' : 'ink' })),
        { t: 'line', id: 'g1', x1: 280, y1: 34, x2: 280, y2: 50, tone: 'red', arrow: true },
        { t: 'line', id: 'g2', x1: 250, y1: 86, x2: IX(0) + 20, y2: 138, tone: 'red', arrow: true },
      ],
    },
    {
      caption: 'The cost moves to writes. Inserting one row updates another shard’s index: a distributed transaction, or an index that lags a little.',
      drop: ['g1', 'g2', 'q'],
      set: { ix1: { tone: 'ink' }, ix2: { tone: 'red' } },
      add: [
        { t: 'text', id: 'ins', x: IX(0) + 65, y: 20, tone: 'red', text: 'INSERT' },
        { t: 'line', id: 'w1', x1: IX(0) + 65, y1: 30, x2: IX(0) + 65, y2: 138, tone: 'red', arrow: true },
        { t: 'line', id: 'w2', x1: 60, y1: 138, x2: IX(2) - 10, y2: 88, tone: 'red', arrow: true, dashed: true },
      ],
    },
    {
      caption: 'Best fix is the key itself: pick it so a transaction stays on one shard, co-locate tables that join on it, copy small reference tables everywhere.',
      drop: ['ins', 'w1', 'w2', 'ix0', 'ix1', 'ix2'],
      set: Object.fromEntries([0, 1, 2].map((i) => [`sh${i}`, { text: 'user rows\n+ orders', tone: 'ink' }])),
      add: [0, 1, 2].map((i): El => ({ t: 'box', id: 'ref' + i, x: IX(i) - 50, y: 90, w: 100, h: 34, text: 'countries', tone: 'red', dashed: true })),
    },
  ],
}
