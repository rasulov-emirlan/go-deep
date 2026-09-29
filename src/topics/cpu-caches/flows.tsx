import type { El, FlowDef } from '../../components/flow'
import { Code } from '../../components/Code'

/*
 * Visual language for this topic: ink = normal, grey = old / inactive / absent, red = what this step is about
 * (a miss, a slow path, the surprising result), dashed = pending / not yet visible. Cache-line states use
 * the same code: I = grey dashed, E and S = ink, M = red. Numbers are ratios or ranges, never one exact figure.
 */
const text = (id: string, x: number, y: number, t: string, more: Partial<El> = {}): El => ({ t: 'text', id, x, y, text: t, ...more }) as El
const name = (id: string, y: number, t: string) => text(id, 8, y, t, { anchor: 'start' })
const bar = (id: string, x: number, y: number, w: number, more: Partial<El> = {}): El => ({ t: 'box', id, x, y, w, h: 28, ...more }) as El
const lane = (id: string, t: string, x: number, len: number, more: Partial<El> = {}): El => ({ t: 'lane', id, x, y: 8, len, text: t, ...more }) as El

/* ---------- 01 · the latency ladder, drawn linearly: 3 units per ns ---------- */
const S = 3
const X0 = 70
const rowY = (i: number) => 48 + i * 50

export const ladder: FlowDef = {
  h: 350,
  steps: [
    {
      caption: 'A core can finish several instructions per nanosecond. Its nearest memory, L1, answers in about 1 ns. Bars are linear, so L1 is a sliver.',
      add: [name('n1', rowY(0), 'L1'), bar('b1', X0, rowY(0) - 14, 1 * S), text('v1', X0 + 12, rowY(0), '≈1 ns · 4–5 cycles', { anchor: 'start' })],
    },
    {
      caption: 'L2 is bigger and a few times slower. Each level down holds more, answers later, and is usually shared by more cores.',
      add: [name('n2', rowY(1), 'L2'), bar('b2', X0, rowY(1) - 14, 4 * S), text('v2', X0 + 24, rowY(1), '≈3–5 ns', { anchor: 'start' })],
    },
    {
      caption: 'L3 is shared by the cores of a socket. Still on the chip, still tens of times smaller than what comes next.',
      add: [name('n3', rowY(2), 'L3'), bar('b3', X0, rowY(2) - 14, 15 * S), text('v3', X0 + 57, rowY(2), '≈10–20 ns · shared', { anchor: 'start' })],
    },
    {
      caption: 'Then DRAM, off the chip. About 70–100 ns: hundreds of instruction slots spent waiting. Caches exist to avoid this trip.',
      add: [name('n4', rowY(3), 'DRAM'), bar('b4', X0 + 20, rowY(3) - 14, 90 * S, { tone: 'red', text: '≈70–100 ns' })],
      stop: {
        title: 'The memory wall',
        body: <p>Cores got faster far quicker than DRAM latency fell. Bandwidth is high; the wait for the first byte is not. So small fast memories sit in between.</p>,
      },
    },
    {
      caption: 'On a two-socket server, the other socket’s DRAM is about 1.5–2× local: one Skylake box measured 80 ns local against 138 ns remote.',
      add: [name('n5', rowY(4), 'Far'), bar('b5', X0 + 20, rowY(4) - 14, 135 * S, { tone: 'red', dashed: true, text: '≈1.5–2× DRAM' })],
    },
    {
      caption: 'Measured on a 4-core box: a random pointer chase over 512 MiB ran about 80–110× slower per load than one that fits in L1.',
      add: [
        text('h1', 280, 290, 'if 1 ns were 1 s: L3 ≈ 15 s, DRAM ≈ 1.5 min', { tone: 'grey' }),
        text('h2', 280, 316, 'chase, 4-core box: L1-size vs 512 MiB\n≈ 1 : 80–110', { tone: 'red' }),
      ],
      stop: {
        edge: true,
        title: 'Quote ratios, not nanoseconds',
        body: <p>The classic “L1 = 0.5 ns” table is from 2012 hardware. Today’s L1 is about 1 ns and DRAM 70–100 ns; each level is still roughly 3–10× the last.</p>,
      },
    },
  ],
}

/* ---------- 01 · the cache line, and the set it maps to ---------- */
const cellX = (i: number) => 24 + (i % 8) * 64
const cellY = (i: number) => (i < 8 ? 62 : 152)
const cells = (from: number, to: number, more: Partial<El> = {}): El[] =>
  Array.from({ length: to - from }, (_, k) => ({ t: 'box', id: `c${from + k}`, x: cellX(from + k), y: cellY(from + k), w: 58, h: 42, text: `a[${from + k}]`, ...more }) as El)
const WAYS = 12
const way = (r: number, k: number, y: number, more: Partial<El> = {}): El => ({ t: 'box', id: `w${r}-${k}`, x: 90 + k * 38, y, w: 34, h: 30, tone: 'grey', dashed: true, ...more }) as El
const ways = (r: number, y: number, more: Partial<El> = {}) => Array.from({ length: WAYS }, (_, k) => way(r, k, y, more))

export const lines: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Memory moves between levels in 64-byte lines on x86, never single bytes. Eight `int64`s share one line.',
      add: [
        { t: 'box', id: 'lineA', x: 16, y: 34, w: 528, h: 78, tone: 'soft', label: 'line 0 · 64 B' },
        { t: 'box', id: 'lineB', x: 16, y: 124, w: 528, h: 78, tone: 'soft', label: 'line 1 · 64 B' },
        ...cells(0, 16),
      ],
    },
    {
      caption: 'The loop reads `a[0]`: a miss. The core waits for DRAM, and all 64 bytes come back and fill the cache.',
      set: { c0: { tone: 'red' }, lineA: { tone: 'red' } },
      add: [text('note', 280, 236, 'miss: ≈ 70–100 ns, whole line arrives', { tone: 'red' })],
    },
    {
      caption: '`a[1]` to `a[7]` hit at about 1 ns each. `a[8]` starts the next line and misses again: one miss per eight, before any prefetching.',
      set: { c0: { tone: 'ink' }, lineA: { tone: 'ink' }, c8: { tone: 'red' }, lineB: { tone: 'red' }, note: { text: '7 hits, then a miss', tone: 'grey' } },
    },
    {
      caption: 'Which slot in the cache? Address bits above the line pick a set. E.g. 48 KiB, 12-way gives 64 sets, so addresses 4 KiB apart share one.',
      drop: ['lineA', 'lineB', 'note', ...Array.from({ length: 16 }, (_, i) => `c${i}`)],
      add: [
        name('s0', 76, 'set 0'),
        ...ways(0, 62, { tone: 'red', dashed: false }),
        name('s1', 126, 'set 1'),
        ...ways(1, 112),
        text('dots', 50, 168, '⋮', { anchor: 'start' }),
        name('s63', 216, 'set 63'),
        ...ways(63, 202),
        text('str', 280, 276, 'stride 4096 B: a[0], a[512], a[1024]…\nall land in set 0', { tone: 'red' }),
      ],
      stop: {
        edge: true,
        title: 'Power-of-two strides',
        body: (
          <>
            <p>Walk a column of a 4096-byte-wide matrix: only 12 lines fit, so they evict each other while the rest sits empty. Pad the rows.</p>
            <Code>{`make([]int64, 512)   // 4096 B
make([]int64, 512+8) // +1 line`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 02 · independent loads overlap, dependent ones queue ---------- */
const L = 90
export const chase: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'A slice walk: `a[i]` addresses are independent. The prefetcher fetches ahead, and the core keeps ~10 misses in flight at once.',
      add: [
        text('t1', 10, 16, 'slice: independent loads', { anchor: 'start' }),
        ...[0, 1, 2, 3].map((k) => bar(`s${k}`, 40 + k * 14, 30 + k * 30, L, { h: 24, text: `a[${k}]` })),
        { t: 'line', id: 'ax1', x1: 30, y1: 160, x2: 545, y2: 160, arrow: true },
        text('axl', 545, 178, 'time', { anchor: 'end', tone: 'grey' }),
      ],
    },
    {
      caption: 'A pointer chase: the next address is inside the previous load. Each miss waits for the last, and a prefetcher cannot guess `next`.',
      add: [
        text('t2', 10, 204, 'linked list: dependent loads', { anchor: 'start', tone: 'red' }),
        ...[0, 1, 2, 3].map((k) => bar(`p${k}`, 40 + k * L, 218 + k * 27, L, { h: 22, tone: 'red', text: k ? 'p.next' : 'head' })),
      ],
    },
    {
      caption: 'Traversing 128 MiB of 64-byte nodes on a 4-core box. The slice is 1×. A list built in traversal order takes 3–4×.',
      drop: ['t1', 't2', 'ax1', 'axl', ...[0, 1, 2, 3].flatMap((k) => [`s${k}`, `p${k}`])],
      add: [
        name('m1', 56, 'slice'),
        bar('r1', 148, 42, 6.5),
        text('q1', 162, 56, '1×', { anchor: 'start' }),
        name('m2', 116, 'list, in order'),
        bar('r2', 148, 102, 24),
        text('q2', 182, 116, '≈3–4×', { anchor: 'start' }),
        text('cap', 280, 250, '2 M nodes × 64 B, sum one field', { tone: 'grey' }),
      ],
    },
    {
      caption: 'The same list with shuffled links: every hop is a full serial miss. Tens of times slower than the slice; the pointers were never the problem.',
      add: [name('m3', 176, 'list, shuffled'), bar('r3', 148, 162, 292, { tone: 'red', text: '≈35–57×' })],
      stop: {
        edge: true,
        title: 'Layout decides the cost',
        body: <p>A list built in a tight loop usually lands in address order, so it is “accidentally OK”. A long-lived shuffled one is not. Big random walks also miss the TLB, the page-translation cache.</p>,
      },
    },
  ],
}

/* ---------- 02 · branch prediction and the Go CMOV caveat ---------- */
const stages = ['fetch', 'decode', 'issue', 'exec', 'memory', 'retire']
const stageX = (i: number) => 14 + i * 90
export const branch: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'A pipeline works on many instructions at once, 15–20 stages deep on modern cores. At a branch it does not wait: it guesses, and keeps fetching.',
      add: [
        ...stages.map((s, i) => ({ t: 'box', id: `st${i}`, x: stageX(i), y: 40, w: 84, h: 38, text: s }) as El),
        { t: 'box', id: 'br', x: stageX(3), y: 110, w: 84, h: 38, text: 'if v>=128' },
        ...[0, 1, 2].map((i) => ({ t: 'box', id: `g${i}`, x: stageX(i), y: 110, w: 84, h: 38, tone: 'grey', dashed: true, text: 'guess' }) as El),
        text('gl', 280, 190, 'predictor: “taken”, fetch that path', { tone: 'grey' }),
      ],
    },
    {
      caption: 'Wrong guess: the guessed work is thrown away and the pipeline refills. About 15–20 cycles lost. On random data, a branch is wrong about half the time.',
      set: { br: { tone: 'red', text: 'not taken!' }, g0: { tone: 'red' }, g1: { tone: 'red' }, g2: { tone: 'red' }, gl: { text: 'flush ≈15–20 cycles', tone: 'red' } },
    },
    {
      caption: 'In Go, `if v >= 128 { t += v }` compiles to a branchless conditional move. There is no branch to predict: sorted and unsorted ran about equal.',
      drop: [...stages.map((_, i) => `st${i}`), 'br', 'g0', 'g1', 'g2', 'gl'],
      add: [
        name('k1', 60, 'unsorted'),
        bar('u1', 100, 46, 37, { tone: 'grey' }),
        name('k2', 100, 'sorted'),
        bar('u2', 100, 86, 31, { tone: 'grey' }),
        text('e1', 156, 80, '≈ equal: CMOV', { anchor: 'start' }),
      ],
      stop: {
        edge: true,
        title: 'The branch may be gone',
        body: (
          <>
            <p>The classic “sorted is faster” demo can show nothing in Go. Check the assembly before trusting it.</p>
            <Code>{`go build -gcflags=-S . 2>&1 |
  grep CMOV`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Force a real branch (a `//go:noinline` call in the taken path): unsorted is 3.4–4× slower. The predictor learns sorted data. Caches are not why.',
      add: [
        name('k3', 176, 'unsorted'),
        bar('u3', 100, 162, 249, { tone: 'red', text: '≈3.4–4×' }),
        name('k4', 216, 'sorted'),
        bar('u4', 100, 202, 63),
        text('cap', 280, 270, 'N = 65536, 4-core box', { tone: 'grey' }),
      ],
    },
  ],
}

/* ---------- 03 · MESI between two cores ---------- */
const LX = { c0: 90, l3: 280, c1: 470 }
const node = (id: string, x: number, y: number, s: 'I' | 'E' | 'S' | 'M'): El =>
  ({ t: 'node', id, x, y, r: 17, text: s, tone: s === 'M' ? 'red' : s === 'I' ? 'grey' : 'ink', dashed: s === 'I' }) as El
const msg = (id: string, from: string, to: string, y: number, t: string, more: Partial<El> = {}): El => ({ t: 'msg', id, from, to, y, y2: y + 12, text: t, ...more }) as El

export const mesi: FlowDef = {
  h: 390,
  steps: [
    {
      caption: 'Each core tracks every cached line in one of four states. Both start Invalid. Core 0 reads X, nobody else has it, so it gets Exclusive.',
      add: [
        lane('c0', 'Core 0', LX.c0, 335),
        lane('l3', 'L3', LX.l3, 335, { sub: 'line X: a, b', w: 120 }),
        lane('c1', 'Core 1', LX.c1, 335),
        text('leg', 280, 362, 'M dirty, only copy · E clean, only copy\nS clean, maybe shared · I no copy', { size: 14, tone: 'grey' }),
        node('n0a', LX.c0, 84, 'I'),
        node('n1a', LX.c1, 84, 'I'),
        msg('m1', 'c0', 'l3', 104, 'read X'),
        msg('m2', 'l3', 'c0', 138, 'line'),
        node('n0b', LX.c0, 178, 'E'),
      ],
    },
    {
      caption: 'Core 1 reads X too. Core 0’s copy drops from Exclusive to Shared; both now hold clean copies.',
      add: [msg('m3', 'c1', 'l3', 212, 'read X'), msg('m4', 'l3', 'c1', 246, 'line'), node('n0c', LX.c0, 292, 'S'), node('n1b', LX.c1, 292, 'S')],
      set: { n0b: { tone: 'grey' } },
    },
    {
      caption: 'Core 0 writes `a`. It must first invalidate the other copy and wait for the ack (read-for-ownership). Then it is Modified, Core 1 Invalid.',
      drop: ['n0a', 'n1a', 'm1', 'm2', 'm3', 'm4', 'n0b', 'n0c', 'n1b'],
      add: [
        node('p0', LX.c0, 84, 'S'),
        node('p1', LX.c1, 84, 'S'),
        msg('inv', 'c0', 'c1', 108, 'invalidate', { tone: 'red' }),
        msg('ack', 'c1', 'c0', 146, 'ack'),
        node('q0', LX.c0, 192, 'M'),
        node('q1', LX.c1, 192, 'I'),
      ],
      stop: {
        edge: true,
        title: 'Writing to E is free',
        body: <p>An Exclusive line turns Modified silently, with no traffic. Only a write to a Shared line pays the invalidate round trip.</p>,
      },
    },
    {
      caption: 'Core 1 reads `b`, a different variable in the same line. It misses; Core 0 hands over the dirty line and both go Shared.',
      add: [msg('rb', 'c1', 'c0', 224, 'read b'), msg('lb', 'c0', 'c1', 258, 'dirty line', { tone: 'red' }), node('r0', LX.c0, 306, 'S'), node('r1', LX.c1, 306, 'S')],
      set: { q0: { tone: 'grey' }, q1: { tone: 'grey' } },
    },
    {
      caption: 'Core 1 now writes `b`: the same dance in reverse. Loop both writers and the line ping-pongs, each core mostly waiting.',
      drop: ['p0', 'p1', 'inv', 'ack', 'q0', 'q1', 'rb', 'lb', 'r0', 'r1'],
      add: [
        node('t0', LX.c0, 84, 'S'),
        node('t1', LX.c1, 84, 'S'),
        msg('inv2', 'c1', 'c0', 108, 'invalidate', { tone: 'red' }),
        msg('ack2', 'c0', 'c1', 146, 'ack'),
        node('u0', LX.c0, 192, 'I'),
        node('u1', LX.c1, 192, 'M'),
        text('loop', 280, 250, 'repeat: the line ping-pongs', { tone: 'red' }),
      ],
      stop: {
        title: 'No shared data, still slow',
        body: <p>Coherence tracks whole 64-byte lines, not variables. <code>a</code> and <code>b</code> never share a value, only a line. That is false sharing.</p>,
      },
    },
    {
      caption: 'Give `a` and `b` their own lines (padding, or per-goroutine shards) and both cores stay Modified. No messages, no waiting.',
      drop: ['t0', 't1', 'inv2', 'ack2', 'u0', 'u1', 'loop'],
      set: { l3: { sub: 'lines A and B' } },
      add: [
        node('v0', LX.c0, 110, 'M'),
        node('v1', LX.c1, 110, 'M'),
        text('la', LX.c0, 148, 'line A'),
        text('lb2', LX.c1, 148, 'line B'),
        text('nm', 280, 230, 'no messages between cores', { tone: 'grey' }),
      ],
    },
  ],
}

/* ---------- 03 · a shared atomic counter and how it scales ---------- */
const core = (id: string, x: number, t: string): El => ({ t: 'node', id, x, y: 190, r: 24, text: t }) as El
export const counter: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'Uncontended, `atomic.Add` is about 20–28× a plain add, even with the line in L1. It needs the line Modified and, on x86, drains the store buffer.',
      add: [
        name('a1', 50, 'plain c++'),
        bar('x1', 110, 36, 10),
        text('y1', 128, 50, '1×', { anchor: 'start' }),
        name('a2', 110, 'atomic.Add'),
        bar('x2', 110, 96, 240, { tone: 'red' }),
        text('y2', 358, 110, '≈20–28×', { anchor: 'start' }),
        text('c1', 280, 190, 'single goroutine, 4-core box', { tone: 'grey' }),
      ],
    },
    {
      caption: 'Now four goroutines add to one counter. The line must be Modified in the core that adds. Here it sits in Core 0.',
      drop: ['a1', 'x1', 'y1', 'a2', 'x2', 'y2', 'c1'],
      add: [
        { t: 'box', id: 'ln', x: 20, y: 60, w: 100, h: 46, tone: 'red', text: 'counter', sub: 'line · M' },
        core('k0', 70, 'C0'),
        core('k1', 210, 'C1'),
        core('k2', 350, 'C2'),
        core('k3', 490, 'C3'),
        { t: 'line', id: 'lk0', x1: 70, y1: 106, x2: 70, y2: 164, arrow: true, tone: 'red' },
      ],
    },
    {
      caption: 'The next add is on Core 1. It first pulls the line from Core 0. The line moves once per add, so more cores means more waiting, not more work.',
      set: { ln: { x: 160 }, lk0: { tone: 'grey', dashed: true } },
      add: [{ t: 'line', id: 'lk1', x1: 210, y1: 106, x2: 210, y2: 164, arrow: true, tone: 'red' }, { t: 'line', id: 'mv', x1: 120, y1: 84, x2: 158, y2: 84, arrow: true, tone: 'red' }],
    },
    {
      caption: 'Measured, ns per add across all goroutines: 1 core is the baseline; 2 cores cost about 1.5–1.9× per op, 4 cores about 1.8–2.2×.',
      drop: ['ln', 'k0', 'k1', 'k2', 'k3', 'lk0', 'lk1', 'mv'],
      add: [
        name('d1', 50, '1 core'),
        bar('z1', 90, 36, 100),
        text('e1', 200, 50, '1×', { anchor: 'start' }),
        name('d2', 100, '2 cores'),
        bar('z2', 90, 86, 170, { tone: 'red' }),
        text('e2', 270, 100, '≈1.5–1.9×', { anchor: 'start' }),
        name('d3', 150, '4 cores'),
        bar('z3', 90, 136, 200, { tone: 'red' }),
        text('e3', 300, 150, '≈1.8–2.2×', { anchor: 'start' }),
        text('c2', 280, 220, 'time per op, one shared atomic', { tone: 'grey' }),
      ],
    },
    {
      caption: 'At 4 cores, relative to one shared atomic: false-shared shards cost the same, a mutex 2.5–3×, and padded shards are 3–6× faster.',
      drop: ['d1', 'z1', 'e1', 'd2', 'z2', 'e2', 'd3', 'z3', 'e3', 'c2'],
      add: [
        name('f1', 50, 'shared atomic'),
        bar('g1', 150, 36, 100),
        text('h1', 260, 50, '1×', { anchor: 'start' }),
        name('f2', 100, 'unpadded shards'),
        bar('g2', 150, 86, 90, { tone: 'red' }),
        text('h2', 250, 100, '≈ same', { anchor: 'start' }),
        name('f3', 150, 'shared mutex'),
        bar('g3', 150, 136, 275, { tone: 'red' }),
        text('h3', 433, 150, '≈2.5–3×', { anchor: 'start' }),
        name('f4', 200, 'padded shards'),
        bar('g4', 150, 186, 22),
        text('h4', 182, 200, '3–6× faster', { anchor: 'start' }),
        text('c3', 280, 258, 'time per op at 4 cores, shared atomic = 1×', { tone: 'grey' }),
      ],
      stop: {
        edge: true,
        title: 'Lock-free is not fast',
        body: (
          <>
            <p>Stripe the counter per P or goroutine, pad each shard, sum on read. Reads are inexact: fine for metrics, not for limits.</p>
            <Code>{`type shard struct {
    n atomic.Int64
    _ [56]byte // 120 on arm64
}
var s [8]shard
s[id%8].n.Add(1)`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 04 · the store buffer: x86-TSO ---------- */
const TX = { t1: 90, mem: 280, t2: 470 }
const sb = (id: string, x: number, t: string, more: Partial<El> = {}): El => ({ t: 'box', id, x, y: 80, w: 130, h: 34, text: t, dashed: true, ...more }) as El

export const storeBuffer: FlowDef = {
  h: 400,
  steps: [
    {
      caption: '`x` and `y` start at 0. T1 runs `x=1; r1=y`, T2 runs `y=1; r2=x`. One after another, r1 and r2 cannot both be 0.',
      add: [
        lane('t1', 'T1', TX.t1, 385, { sub: 'x=1; r1=y', w: 120 }),
        lane('mem', 'memory', TX.mem, 385, { sub: 'x=0  y=0', w: 110 }),
        lane('t2', 'T2', TX.t2, 385, { sub: 'y=1; r2=x', w: 120 }),
        sb('sb1', 25, 'store buffer'),
        sb('sb2', 405, 'store buffer'),
      ],
    },
    {
      caption: 'T1 runs `x=1`. The core does not wait for the write to spread; it parks it in its store buffer and moves on. Other cores cannot see it yet.',
      set: { sb1: { text: 'x=1', tone: 'red', dashed: false } },
    },
    {
      caption: 'Next T1 runs `r1=y`. The load does not wait for the buffered store: it reads memory right away and gets 0.',
      add: [msg('ld1', 't1', 'mem', 150, 'load y'), msg('rp1', 'mem', 't1', 186, '0', { tone: 'red' })],
    },
    {
      caption: 'T2 does the mirror image at the same time: `y=1` waits in its buffer, then `r2=x` reads 0. Both loads ran before either store was visible.',
      set: { sb2: { text: 'y=1', tone: 'red', dashed: false } },
      add: [msg('ld2', 't2', 'mem', 224, 'load x'), msg('rp2', 'mem', 't2', 260, '0', { tone: 'red' })],
      stop: {
        title: 'r1 = r2 = 0: a CPU bug?',
        body: <p>No. A later load may run before an older store becomes visible. That store→load reordering is the one x86-TSO allows.</p>,
      },
    },
    {
      caption: 'Only now do the buffers drain and the stores reach memory: too late for the loads that already ran.',
      set: { sb1: { text: 'empty', tone: 'grey' }, sb2: { text: 'empty', tone: 'grey' } },
      add: [msg('dr1', 't1', 'mem', 306, 'x=1'), msg('dr2', 't2', 'mem', 306, 'y=1')],
    },
    {
      caption: 'A fence between store and load (`MFENCE`, a `LOCK` op, a Go atomic) drains the buffer first. Now at least one load sees 1.',
      drop: ['ld1', 'rp1', 'ld2', 'rp2', 'dr1', 'dr2'],
      add: [
        { t: 'box', id: 'f1', x: 25, y: 132, w: 130, h: 30, tone: 'red', text: 'fence' },
        { t: 'box', id: 'f2', x: 405, y: 132, w: 130, h: 30, tone: 'red', text: 'fence' },
        msg('d1', 't1', 'mem', 186, 'x=1'),
        msg('d2', 't2', 'mem', 186, 'y=1'),
        msg('l1', 't1', 'mem', 236, 'load y'),
        msg('l2', 't2', 'mem', 236, 'load x'),
        text('res', 280, 320, 'r1 = r2 = 0 is now impossible', { tone: 'red' }),
      ],
    },
  ],
}

/* ---------- 04 · x86 vs ARM, and what Go actually promises ---------- */
const PX = { p: 100, mem: 280, c: 460 }
const mp = (): El[] => [
  lane('p', 'Producer', PX.p, 320, { sub: 'data=42; flag=1', w: 140 }),
  lane('mem', 'memory', PX.mem, 320, { w: 100 }),
  lane('c', 'Consumer', PX.c, 320, { sub: 'if flag: data', w: 140 }),
]
const goBox = (id: string, x: number, t: string): El => ({ t: 'box', id, x, y: 80, w: 160, h: 56, text: t, sub: 'happens-before' }) as El

export const goModel: FlowDef = {
  h: 360,
  steps: [
    {
      caption: 'Message passing: the producer writes `data`, then `flag`. The consumer waits for the flag, then reads `data`. On x86, stores become visible in order.',
      add: [...mp(), msg('a1', 'p', 'mem', 100, 'data=42'), msg('a2', 'p', 'mem', 138, 'flag=1')],
    },
    {
      caption: 'x86-TSO never reorders a store with an older store, or a load with an older load. A consumer that sees the flag also sees the data.',
      add: [msg('b1', 'c', 'mem', 190, 'read flag'), msg('b2', 'mem', 'c', 222, '1'), msg('b3', 'c', 'mem', 254, 'read data'), msg('b4', 'mem', 'c', 286, '42')],
    },
    {
      caption: 'ARM, POWER and RISC-V are weaker. The flag may become visible before the data, so the consumer can see 1 and still read stale 0.',
      drop: ['a1', 'a2', 'b1', 'b2', 'b3', 'b4'],
      add: [
        { t: 'msg', id: 'w1', from: 'p', to: 'mem', y: 100, y2: 262, text: 'data=42', tone: 'grey', dashed: true, below: true },
        { t: 'msg', id: 'w2', from: 'p', to: 'mem', y: 134, y2: 146, text: 'flag=1', tone: 'red' },
        msg('r1', 'c', 'mem', 172, 'read flag'),
        msg('r2', 'mem', 'c', 196, '1'),
        msg('r3', 'c', 'mem', 220, 'read data'),
        msg('r4', 'mem', 'c', 244, '0', { tone: 'red' }),
      ],
    },
    {
      caption: 'Go’s promise: a data-race-free program behaves as if goroutines ran in one interleaving. Channels, mutexes, WaitGroup, Once and atomics create the order.',
      drop: ['p', 'mem', 'c', 'w1', 'w2', 'r1', 'r2', 'r3', 'r4'],
      add: [text('rf', 280, 40, 'race-free ⇒ sequentially consistent'), goBox('g1', 14, 'channel'), goBox('g2', 200, 'Mutex'), goBox('g3', 386, 'atomic')],
    },
    {
      caption: 'Go atomics are sequentially consistent only: no relaxed or acquire/release variants. Anything else is a race, and x86 may hide it until ARM.',
      add: [
        { t: 'box', id: 'rc', x: 100, y: 190, w: 360, h: 60, tone: 'red', dashed: true, text: 'plain bool flag', sub: 'no ordering: a data race' },
        text('rc2', 280, 290, 'works on x86, breaks on ARM', { tone: 'red' }),
      ],
      stop: {
        edge: true,
        title: 'Works on my x86 laptop',
        body: (
          <>
            <p>Race-free is the rule, not “what x86 did”. The compiler may also hoist the load. Run <code>go test -race</code>.</p>
            <Code>{`var done bool
go func() { done = true }()
for !done {} // may spin forever`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 04 · NUMA and vCPUs ---------- */
const socket = (id: string, y: number, label: string): El => ({ t: 'box', id, x: 10, y, w: 540, h: 120, tone: 'soft', label }) as El
const cnode = (id: string, x: number, y: number, t: string, more: Partial<El> = {}): El => ({ t: 'node', id, x, y, r: 20, text: t, ...more }) as El
const numaIds = ['sk0', 'sk1', 'c0', 'c1', 'c2', 'c3', 'd0', 'd1', 'loc', 'rem', 'rem2', 'hop', 'go', 'fix1', 'fix2', 'fixt']

export const numa: FlowDef = {
  h: 350,
  steps: [
    {
      caption: 'A two-socket server gives each socket its own memory. A core reads its own socket’s DRAM at full speed.',
      add: [
        socket('sk0', 10, 'socket 0'),
        socket('sk1', 210, 'socket 1'),
        cnode('c0', 60, 84, 'c0'),
        cnode('c1', 130, 84, 'c1'),
        cnode('c2', 60, 284, 'c2'),
        cnode('c3', 130, 284, 'c3'),
        { t: 'box', id: 'd0', x: 330, y: 55, w: 190, h: 60, text: 'DRAM 0' },
        { t: 'box', id: 'd1', x: 330, y: 255, w: 190, h: 60, text: 'DRAM 1' },
        { t: 'line', id: 'loc', x1: 152, y1: 85, x2: 328, y2: 85, arrow: true, text: '≈80 ns' },
      ],
    },
    {
      caption: 'A core reading the other socket’s DRAM crosses the interconnect: about 1.5–2× the latency, and less bandwidth.',
      add: [{ t: 'line', id: 'rem', x1: 152, y1: 276, x2: 425, y2: 117, arrow: true, tone: 'red', text: '≈1.5–2×' }],
    },
    {
      caption: 'Linux places a page on the node of the thread that first writes it. One init thread fills the whole table, so all of it lands in DRAM 0.',
      drop: ['rem'],
      set: { c0: { text: 'init', tone: 'red' }, d0: { tone: 'red', text: 'DRAM 0', sub: 'whole table' } },
    },
    {
      caption: 'Workers on socket 1 read that table across the link on every access, all sharing it. A bigger machine, a slower service.',
      set: { c2: { text: 'w1' }, c3: { text: 'w2' } },
      add: [
        { t: 'line', id: 'rem', x1: 152, y1: 276, x2: 425, y2: 117, arrow: true, tone: 'red', text: '≈1.5–2×' },
        { t: 'line', id: 'rem2', x1: 78, y1: 266, x2: 380, y2: 117, arrow: true, tone: 'red' },
      ],
    },
    {
      caption: 'Go’s runtime is not NUMA-aware: goroutines move between threads on any node, and the heap is not split by node.',
      add: [{ t: 'line', id: 'hop', x1: 130, y1: 106, x2: 130, y2: 260, arrow: true, dashed: true, text: 'goroutine hops' }],
      stop: {
        edge: true,
        title: 'The fix is outside Go',
        body: (
          <>
            <p>Run one process per node, or interleave pages. Kubernetes has a topology manager for this.</p>
            <Code>{`numactl --cpunodebind=1 \\
  --membind=1 ./svc
numactl --interleave=all ./svc`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'SMT: one physical core runs two hardware threads that share execution units and L1/L2. A cloud vCPU is usually one such thread.',
      drop: numaIds,
      add: [
        { t: 'box', id: 'core', x: 60, y: 20, w: 440, h: 250, tone: 'soft', label: 'one physical core' },
        { t: 'box', id: 'ta', x: 90, y: 60, w: 170, h: 56, text: 'vCPU a', sub: 'hardware thread' },
        { t: 'box', id: 'tb', x: 300, y: 60, w: 170, h: 56, text: 'vCPU b', sub: 'hardware thread' },
        { t: 'box', id: 'sh', x: 90, y: 160, w: 380, h: 80, tone: 'red', text: 'shared: execution units, L1, L2', sub: 'a busy sibling slows you down' },
      ],
      stop: {
        edge: true,
        title: 'A vCPU is not a core',
        body: <p>On x86 AWS instances, 4 vCPUs are usually 2 cores, so <code>GOMAXPROCS=4</code> may buy about 2 cores of CPU-bound throughput. Noisy neighbours show up as steal time (<code>%st</code>).</p>,
      },
    },
  ],
}
