import type { El, FlowDef, LaneEl } from '../../components/flow'
import { Code } from '../../components/Code'

/* Shared map for the ladder diagrams: A at x=90, B at x=280, C at x=470. Ink = normal, grey = old, red = this step. */
const X = { A: 90, B: 280, C: 470 }
const lane = (id: string, x: number, text: string, len: number, sub?: string): LaneEl => ({ t: 'lane', id, x, y: 8, len, text, sub })
const dot = (id: string, x: number, y: number, text?: string, tone: 'ink' | 'red' = 'red'): El =>
  text ? { t: 'node', id, x, y, r: 14, text, tone } : { t: 'node', id, x, y, r: 7, tone }

/* ---------- 01 · Go: two readings in one time.Time ---------- */

export const twoClocks: FlowDef = {
  h: 316,
  steps: [
    {
      caption: '`time.Now()` returns a `Time` holding two readings: the wall clock (what time is it) and the monotonic clock (only ever moves forward).',
      add: [
        { t: 'box', id: 'st', x: 20, y: 8, w: 520, h: 112, label: 'time.Time · 24 bytes' },
        { t: 'box', id: 'wall', x: 34, y: 36, w: 150, h: 72, text: 'wall', sub: 'hasMonotonic bit' },
        { t: 'box', id: 'ext', x: 196, y: 36, w: 150, h: 72, text: 'ext', sub: 'monotonic ns', tone: 'red' },
        { t: 'box', id: 'loc', x: 358, y: 36, w: 170, h: 72, text: 'loc', sub: '*Location' },
      ],
    },
    {
      caption: 'Both keep running. `t0 := time.Now()` records a reading on each: wall 10:00:00.0, monotonic 3.0 s since the process started.',
      set: { ext: { tone: 'ink' } },
      add: [
        { t: 'text', id: 'rw', x: 20, y: 176, text: 'wall', anchor: 'start' },
        { t: 'text', id: 'rm', x: 20, y: 250, text: 'mono', anchor: 'start' },
        { t: 'line', id: 'lw', x1: 80, y1: 176, x2: 535, y2: 176, arrow: true, tone: 'grey' },
        { t: 'line', id: 'lm', x1: 80, y1: 250, x2: 535, y2: 250, arrow: true, tone: 'grey' },
        { t: 'line', id: 'w0', x1: 150, y1: 164, x2: 150, y2: 188 },
        { t: 'line', id: 'm0', x1: 150, y1: 238, x2: 150, y2: 262 },
        { t: 'text', id: 'w0t', x: 150, y: 206, text: '10:00:00.0' },
        { t: 'text', id: 'm0t', x: 150, y: 280, text: 'm=+3.0' },
      ],
    },
    {
      caption: '0.2 s later, an NTP step sets the wall clock back 1 s. The monotonic reading is untouched.',
      add: [
        { t: 'text', id: 'ntp', x: 400, y: 150, text: 'NTP step −1 s', tone: 'red' },
        { t: 'line', id: 'w1', x1: 400, y1: 164, x2: 400, y2: 188, tone: 'red' },
        { t: 'line', id: 'm1', x1: 400, y1: 238, x2: 400, y2: 262 },
        { t: 'text', id: 'w1t', x: 400, y: 206, text: '09:59:59.2', tone: 'red' },
        { t: 'text', id: 'm1t', x: 400, y: 280, text: 'm=+3.2' },
      ],
    },
    {
      caption: '`time.Since(t0)` subtracts monotonic readings: +0.2 s, correct. The same subtraction on the wall readings gives −0.8 s.',
      add: [
        { t: 'msg', id: 'sm', x1: 150, x2: 400, y: 250, text: '+0.2 s' },
        { t: 'msg', id: 'sw', x1: 150, x2: 400, y: 176, text: '−0.8 s', tone: 'red', dashed: true },
      ],
    },
    {
      caption: '`t0.Round(0)`, `UTC()`, `AddDate`, JSON and `time.Unix` leave a wall-only value. `Add` keeps the monotonic reading.',
      set: {
        ext: { tone: 'grey', dashed: true, sub: 'seconds since y1' },
        m0: { tone: 'grey', dashed: true },
        m0t: { tone: 'grey' },
      },
    },
    {
      caption: '`now.Sub(t0)`: t0 has no monotonic reading, so Go silently falls back to wall time and returns −0.8 s.',
      drop: ['sm'],
      set: { sw: { dashed: false } },
      stop: {
        title: 'Negative after a JSON trip',
        edge: true,
        body: (
          <>
            <p>Monotonic time is used only if both operands carry it. Values from JSON, a DB or <code>.UTC()</code> are wall-only.</p>
            <Code>{`start := time.Now()
b, _ := json.Marshal(start)
json.Unmarshal(b, &start) // mono gone
// ...
time.Since(start) // wall math`}</Code>
          </>
        ),
      },
    },
    {
      caption: '`==` compares the struct fields, not the instant. `Equal` compares the instant.',
      drop: ['rw', 'rm', 'lw', 'lm', 'w0', 'm0', 'w0t', 'm0t', 'ntp', 'w1', 'm1', 'w1t', 'm1t', 'sw'],
      add: [
        { t: 'box', id: 'ea', x: 20, y: 160, w: 240, h: 76, label: 'a := time.Now()', text: 'ext = m=+3.0' },
        { t: 'box', id: 'eb', x: 300, y: 160, w: 240, h: 76, label: 'b := a.Round(0)', text: 'ext = seconds', tone: 'red' },
        { t: 'text', id: 'eq', x: 280, y: 200, text: '≠', tone: 'red' },
        { t: 'text', id: 'eqt', x: 150, y: 270, text: 'a == b → false', tone: 'red' },
        { t: 'text', id: 'eqe', x: 410, y: 270, text: 'a.Equal(b) → true' },
      ],
      stop: {
        title: '== and map keys',
        edge: true,
        body: (
          <>
            <p>A <code>Time</code> with a monotonic reading misses as a map key once stripped. Use <code>Equal</code>, or <code>Round(0)</code> and <code>UTC()</code> before keying.</p>
            <Code>{`m[a] = 1
_ = m[a.Round(0)] // 0: a miss`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 01 · Leap seconds and NTP ---------- */

const cells = (idp: string, y: number, texts: string[], tones: ('ink' | 'red')[]): El[] =>
  texts.map((text, i) => ({ t: 'box', id: `${idp}${i}`, x: 40 + i * 128, y, w: 120, h: 44, text, tone: tones[i] }))

export const leapSecond: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'UTC sometimes inserts a leap second, 23:59:60. Computers mostly have no 61st second, so each fleet handles it its own way.',
      add: [{ t: 'text', id: 'ul', x: 40, y: 28, text: 'UTC', anchor: 'start' }, ...cells('u', 40, ['23:59:58', '23:59:59', '23:59:60', '00:00:00'], ['ink', 'ink', 'red', 'ink'])],
    },
    {
      caption: 'One way: step the clock. It shows 23:59:59 twice, so wall time goes back a second.',
      add: [{ t: 'text', id: 'sl', x: 40, y: 118, text: 'step fleet', anchor: 'start' }, ...cells('s', 130, ['23:59:58', '23:59:59', '23:59:59', '00:00:00'], ['ink', 'ink', 'red', 'ink'])],
    },
    {
      caption: 'Cloudflare, 1 Jan 2017: DNS code timed upstreams by subtracting wall-clock readings. Negative round-trip times reached `rand.Int63n`, which panics for n ≤ 0.',
      add: [
        { t: 'text', id: 'neg', x: 280, y: 226, text: 'RTT = now − start < 0', tone: 'red' },
        { t: 'text', id: 'pan', x: 280, y: 256, text: 'rand.Int63n(RTT) panics', tone: 'red' },
      ],
      stop: {
        title: 'Cloudflare, 2017',
        edge: true,
        body: <p>The quick fix was checking <code>&lt;= 0</code>, not <code>== 0</code>. The deeper fix is Go 1.9’s monotonic time for <code>time.Now()</code> differences.</p>,
      },
    },
    {
      caption: 'Other way: smear. Google’s public NTP spreads the extra second over 24 h, noon to noon, changing the clock rate by about 11.6 ppm. No step, no repeat.',
      drop: ['ul', 'u0', 'u1', 'u2', 'u3', 'sl', 's0', 's1', 's2', 's3', 'neg', 'pan'],
      add: [
        { t: 'line', id: 'ax', x1: 40, y1: 250, x2: 530, y2: 250, tone: 'grey', arrow: true },
        { t: 'text', id: 'y0', x: 30, y: 250, text: '0', anchor: 'end' },
        { t: 'text', id: 'y1', x: 30, y: 170, text: '1 s', anchor: 'end' },
        { t: 'text', id: 'x0', x: 60, y: 276, text: 'noon' },
        { t: 'text', id: 'x1', x: 280, y: 276, text: 'midnight: leap' },
        { t: 'text', id: 'x2', x: 500, y: 276, text: 'noon' },
        { t: 'text', id: 'sr', x: 280, y: 140, text: 'smear: 24 h, ~11.6 ppm' },
        { t: 'line', id: 'ramp', x1: 60, y1: 250, x2: 500, y2: 170 },
      ],
    },
    {
      caption: 'A source that steps instead of smearing sits half a second away from a smearing one at midnight.',
      add: [
        { t: 'path', id: 'stp', d: 'M60,250 L280,250 L280,170 L500,170', tone: 'red', dashed: true },
        { t: 'line', id: 'gap', x1: 280, y1: 210, x2: 280, y2: 250, tone: 'red' },
        { t: 'text', id: 'gapt', x: 294, y: 236, text: '0.5 s apart', tone: 'red', anchor: 'start' },
      ],
      stop: {
        title: 'Never mix smear sources',
        edge: true,
        body: <p>A host with one smearing and one stepping NTP source can jitter by up to 0.5 s in the window. Pick one policy per fleet.</p>,
      },
    },
    {
      caption: 'Ordinary NTP: slew (change the rate, at most 500 ppm) for small errors, step for big ones. 100 ms of slewing takes 200 s.',
      drop: ['ax', 'y0', 'y1', 'x0', 'x1', 'x2', 'sr', 'ramp', 'stp', 'gap', 'gapt'],
      add: [
        { t: 'text', id: 'gt', x: 280, y: 60, text: 'clock offset (not to scale)' },
        { t: 'box', id: 'g1', x: 30, y: 100, w: 150, h: 56, text: 'slew', sub: '≤ 128 ms', tone: 'soft' },
        { t: 'box', id: 'g2', x: 190, y: 100, w: 210, h: 56, text: 'step', sub: '> 128 ms', tone: 'red' },
        { t: 'box', id: 'g3', x: 410, y: 100, w: 120, h: 56, text: 'gives up', sub: '> 1000 s', tone: 'grey' },
        { t: 'text', id: 'gx', x: 280, y: 210, text: 'ntpd defaults: 128 ms, 1000 s' },
      ],
    },
  ],
}

/* ---------- 02 · Last-write-wins with skewed clocks ---------- */

export const lww: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Three machines, three clocks. A reads 100 ms, B reads 98. A few ms of skew is normal; VMs and WANs can be far worse.',
      add: [lane('A', X.A, 'A', 300, 'clock 100'), lane('S', X.B, 'Store', 300, 'keeps highest'), lane('B', X.C, 'B', 300, 'clock 98')],
    },
    {
      caption: 'A writes `x=1` and stamps it with its own clock: 100.',
      add: [{ t: 'msg', id: 'w1', from: 'A', to: 'S', y: 90, y2: 112, text: 'x=1 @100' }],
    },
    {
      caption: 'B reads `x=1`. B now knows about A’s write.',
      add: [{ t: 'msg', id: 'r1', from: 'S', to: 'B', y: 130, y2: 152, text: 'x=1' }],
    },
    {
      caption: 'Because of what it read, B writes `x=2`: clearly later. But B’s clock says 99, so the stamp is 99.',
      set: { B: { sub: 'clock 99' } },
      add: [{ t: 'msg', id: 'w2', from: 'B', to: 'S', y: 180, y2: 204, text: 'x=2 @99', tone: 'red' }],
    },
    {
      caption: 'Last-write-wins keeps the highest stamp: 100 beats 99. The causally later write vanishes, and nobody gets an error.',
      set: { w2: { tone: 'grey', dashed: true } },
      add: [
        { t: 'text', id: 'k1', x: 280, y: 250, text: '100 > 99', tone: 'red' },
        { t: 'text', id: 'k2', x: 280, y: 274, text: 'x=2 discarded', tone: 'red' },
      ],
      stop: {
        title: 'Which write was last?',
        edge: true,
        body: <p>B read <code>x=1</code> first, so <code>x=2</code> is causally later. Timestamps give a plausible order, never a causal one. Cassandra’s docs say its correctness depends on NTP.</p>,
      },
    },
    {
      caption: 'Worse: a writer whose clock runs 2 h fast stamps `x=9 @+2h`. It shadows every normal write and delete until real time catches up.',
      drop: ['r1', 'w1', 'w2', 'k1', 'k2'],
      set: { A: { sub: 'clock +2 h' } },
      add: [
        { t: 'msg', id: 'w3', from: 'A', to: 'S', y: 100, y2: 124, text: 'x=9 @+2h', tone: 'red' },
        { t: 'text', id: 'k3', x: 280, y: 200, text: 'x=9 wins for 2 h', tone: 'red' },
      ],
    },
  ],
}

/* ---------- 03 · Lamport clocks ---------- */

export const lamport: FlowDef = {
  h: 350,
  steps: [
    {
      caption: 'Lamport clock: each process keeps a counter. A local event or a send adds 1.',
      add: [
        lane('A', X.A, 'A', 290),
        lane('B', X.B, 'B', 290),
        lane('C', X.C, 'C', 290),
        { t: 'text', id: 'rule', x: 280, y: 320, text: 'local or send: L = L + 1\nreceive: L = max(L, m) + 1' },
        dot('a1', X.A, 90, '1'),
      ],
    },
    {
      caption: 'A sends its `L=1` to B. B receives it and sets its counter to max(0, 1) + 1 = 2.',
      set: { a1: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'm1', from: 'A', to: 'B', y: 90, y2: 150, text: 'L=1' }, dot('b2', X.B, 150, '2')],
    },
    {
      caption: 'C has two local events and never hears from anyone. Its second event also gets `L=2`.',
      set: { b2: { tone: 'ink' } },
      add: [dot('c1', X.C, 100, '1', 'ink'), dot('c2', X.C, 200, '2')],
    },
    {
      caption: 'Equal counters? Break the tie with the process id: (2,B) before (2,C). One total order, consistent with causality but arbitrary otherwise.',
      set: { c2: { tone: 'ink' } },
      add: [
        { t: 'line', id: 'tie', x1: 296, y1: 156, x2: 455, y2: 196, tone: 'red', dashed: true },
        { t: 'text', id: 'tiet', x: 375, y: 250, text: '(2,B) < (2,C)', tone: 'red' },
      ],
    },
    {
      caption: 'C’s first event (`L=1`) and B’s receive (`L=2`) never exchanged a message. Smaller counter, yet neither caused the other.',
      drop: ['tie', 'tiet'],
      add: [{ t: 'line', id: 'cc', x1: 296, y1: 145, x2: 456, y2: 105, tone: 'red', dashed: true, text: '1 < 2, concurrent' }],
      stop: {
        title: 'Smaller L means earlier?',
        edge: true,
        body: <p>Only one way: a → b implies L(a) &lt; L(b). Lamport clocks can’t tell “before” from “concurrent”. Vector clocks can.</p>,
      },
    },
  ],
}

/* ---------- 03 · Vector clocks ---------- */

const lbl = (id: string, x: number, y: number, text: string, end = false, tone: 'ink' | 'red' | 'grey' = 'red'): El => ({ t: 'text', id, x, y, text, anchor: end ? 'end' : 'start', tone })

export const vector: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Vector clock: one counter per process. A local event or send bumps your own slot. A receive takes the slot-wise max, then bumps your own.',
      add: [lane('A', X.A, 'A', 300), lane('B', X.B, 'B', 300), lane('C', X.C, 'C', 300), dot('a1', X.A, 90), lbl('a1t', 74, 90, '[1,0,0]', true)],
    },
    {
      caption: 'A sends to B. B takes max([0,0,0], [1,0,0]) = [1,0,0], then bumps its own slot: [1,1,0].',
      set: { a1: { tone: 'ink' }, a1t: { tone: 'ink' } },
      add: [{ t: 'msg', id: 'm1', from: 'A', to: 'B', y: 90, y2: 150, text: '[1,0,0]' }, dot('b1', X.B, 150), lbl('b1t', 294, 150, '[1,1,0]')],
    },
    {
      caption: 'C does an event on its own: [0,0,1].',
      set: { b1: { tone: 'ink' }, b1t: { tone: 'ink' } },
      add: [dot('c1', X.C, 110), lbl('c1t', 484, 110, '[0,0,1]')],
    },
    {
      caption: 'a happened before b only if every slot of a is ≤ the same slot of b. [1,0,0] ≤ [1,1,0], so A’s event came before B’s.',
      set: { c1: { tone: 'ink' }, c1t: { tone: 'ink' } },
      add: [{ t: 'text', id: 'o1', x: 280, y: 226, text: '[1,0,0] ≤ [1,1,0]: A → B' }],
    },
    {
      caption: '[1,1,0] vs [0,0,1]: neither is ≤ the other. Exactly then, the events are concurrent. Lamport clocks could not say this.',
      add: [{ t: 'text', id: 'o2', x: 280, y: 262, text: '[1,1,0] vs [0,0,1]: concurrent', tone: 'red' }],
    },
    {
      caption: 'Dynamo-style stores use this: writes stamped [2,1,0] and [1,2,0] are concurrent, so the store keeps both as siblings and the application merges them.',
      drop: ['A', 'B', 'C', 'a1', 'a1t', 'm1', 'b1', 'b1t', 'c1', 'c1t', 'o1', 'o2'],
      add: [
        { t: 'box', id: 'v1', x: 30, y: 30, w: 220, h: 80, label: 'replica 1', text: 'x = 5', sub: '[2,1,0]' },
        { t: 'box', id: 'v2', x: 310, y: 30, w: 220, h: 80, label: 'replica 2', text: 'x = 7', sub: '[1,2,0]' },
        { t: 'line', id: 'l1', x1: 140, y1: 112, x2: 200, y2: 190, dashed: true, arrow: true },
        { t: 'line', id: 'l2', x1: 420, y1: 112, x2: 360, y2: 190, dashed: true, arrow: true },
        { t: 'text', id: 'cn', x: 280, y: 138, text: 'concurrent', tone: 'red' },
        { t: 'box', id: 'sib', x: 110, y: 194, w: 340, h: 80, label: 'a read returns siblings', text: 'x = {5, 7}', sub: 'app merges', tone: 'red' },
      ],
    },
    {
      caption: 'The price: one slot per writer. With client ids, vectors keep growing. Dynamo caps them (about 10 entries) and drops the oldest.',
      drop: ['v1', 'v2', 'l1', 'l2', 'cn', 'sib'],
      add: [
        { t: 'text', id: 'vt', x: 20, y: 40, text: 'one vector, one slot per client', anchor: 'start' },
        ...Array.from({ length: 12 }, (_, i): El => ({ t: 'box', id: `s${i}`, x: 20 + i * 43, y: 70, w: 36, h: 44, text: String([3, 1, 2, 5, 1, 4, 2, 1, 6, 2, 1, 3][i]), tone: i < 2 ? 'grey' : 'ink', dashed: i < 2 })),
        { t: 'text', id: 'cut', x: 20, y: 150, text: 'dropped', tone: 'red', anchor: 'start' },
        { t: 'text', id: 'keep', x: 300, y: 150, text: '10 kept' },
        { t: 'text', id: 'oldest', x: 280, y: 210, text: 'old entries dropped =\ncausal history lost' },
      ],
    },
    {
      caption: 'D2 descends from D1, so D2 has D1’s entry. Prune it, and D2 = {b:1} suddenly looks concurrent with D1 = {a:1}.',
      drop: ['vt', 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 'cut', 'keep', 'oldest'],
      add: [
        { t: 'box', id: 'p1', x: 40, y: 50, w: 190, h: 70, label: 'D1', text: '{a:1}' },
        { t: 'box', id: 'p2', x: 330, y: 50, w: 190, h: 70, label: 'D2', text: '{a:1, b:1}' },
        { t: 'line', id: 'pa', x1: 232, y1: 85, x2: 328, y2: 85, arrow: true, text: 'D2 ≥ D1' },
      ],
      stop: {
        title: 'Pruning invents conflicts',
        edge: true,
        body: <p>Dropping an entry forgets who wrote what, so a descendant can look concurrent with its ancestor. Per-server ids, not per-client ids, keep vectors small.</p>,
      },
    },
  ],
}

/* ---------- 04 · Hybrid logical clocks ---------- */

export const hlc: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Hybrid logical clock: a pair `(l, c)`. `l` follows the highest physical time seen; `c` is a counter for events sharing an `l`.',
      add: [lane('A', X.A, 'A', 320, 'clock 100'), lane('B', X.B, 'B', 320, 'clock 90')],
    },
    {
      caption: 'A stamps an event `(100,0)` and sends it to B.',
      add: [dot('a1', X.A, 92, undefined, 'red'), { t: 'msg', id: 'm1', from: 'A', to: 'B', y: 92, y2: 152, text: '(100,0)' }],
    },
    {
      caption: 'B’s own clock reads 90, but the message says 100. B takes `l = max(90, 100) = 100` and bumps the counter: `(100,1)`.',
      set: { a1: { tone: 'ink' } },
      add: [dot('b1', X.B, 152), lbl('b1t', 294, 152, '(100,1)')],
    },
    {
      caption: 'B’s clock ticks to 91 and B stamps another event. Still behind, so `l` stays 100 and `c` grows: `(100,2)`. Time never goes backwards.',
      set: { B: { sub: 'clock 91' }, b1: { tone: 'ink' }, b1t: { tone: 'ink' } },
      add: [dot('b2', X.B, 218), lbl('b2t', 294, 218, '(100,2)')],
    },
    {
      caption: 'Once B’s own clock passes 100, `l` follows the wall clock again and `c` resets: `(101,0)`.',
      set: { B: { sub: 'clock 101' }, b2: { tone: 'ink' }, b2t: { tone: 'ink' } },
      add: [dot('b3', X.B, 284), lbl('b3t', 294, 284, '(101,0)')],
    },
    {
      caption: 'The gap `l` minus wall time stays within the clock skew, so an HLC fits in a timestamp and stays close to real time.',
      set: { b3: { tone: 'ink' }, b3t: { tone: 'ink' } },
      stop: {
        title: 'HLC is not real-time order',
        edge: true,
        body: <p>HLC guarantees causal order and bounded drift from the wall clock. It does not give external consistency: that needs waiting or uncertainty handling.</p>,
      },
    },
  ],
}

/* ---------- 04 · CockroachDB uncertainty ---------- */

export const uncertainty: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'A CockroachDB read runs at timestamp T. It should see everything committed before T.',
      add: [
        { t: 'line', id: 'ax', x1: 30, y1: 150, x2: 540, y2: 150, tone: 'grey', arrow: true },
        { t: 'line', id: 'tk', x1: 120, y1: 136, x2: 120, y2: 164 },
        { t: 'text', id: 'tt', x: 120, y: 88, text: 'read at T' },
      ],
    },
    {
      caption: 'Clocks can differ by up to `--max-offset` (default 500 ms). A value stamped inside (T, T+500 ms] might really have been written before T.',
      add: [
        { t: 'box', id: 'win', x: 120, y: 100, w: 360, h: 100, tone: 'soft', label: 'uncertainty window', z: -1 },
        { t: 'line', id: 'tk2', x1: 480, y1: 136, x2: 480, y2: 164 },
        { t: 'text', id: 'tt2', x: 480, y: 222, text: 'T+500 ms' },
      ],
    },
    {
      caption: 'The read meets a value stamped T+300 ms. Written before T by a fast clock, or really after? The node cannot tell.',
      add: [dot('val', 336, 150), { t: 'text', id: 'valt', x: 336, y: 126, text: 'value @T+300', tone: 'red' }],
    },
    {
      caption: 'So the transaction pushes its timestamp above the value, then re-checks its earlier reads. If they still hold, it goes on; if not, it restarts.',
      add: [{ t: 'line', id: 'push', x1: 122, y1: 182, x2: 340, y2: 182, tone: 'red', arrow: true, text: 'push T' }],
      stop: {
        title: 'Why do reads restart?',
        edge: true,
        body: <p>Skew makes “later timestamp” ambiguous. CockroachDB raises <code>ReadWithinUncertaintyIntervalError</code> internally and retries above the value.</p>,
      },
    },
    {
      caption: 'The bound is enforced: a node whose clock is off by 400 ms (80% of max-offset) from at least half the cluster shuts itself down.',
      drop: ['ax', 'tk', 'tt', 'win', 'tk2', 'tt2', 'val', 'valt', 'push'],
      add: [
        { t: 'text', id: 'gt', x: 280, y: 62, text: 'offset from the cluster' },
        { t: 'box', id: 'g1', x: 40, y: 90, w: 384, h: 46, text: 'within bound', tone: 'soft' },
        { t: 'box', id: 'g2', x: 424, y: 90, w: 96, h: 46, text: 'exits', tone: 'red' },
        { t: 'text', id: 'l0', x: 40, y: 166, text: '0', anchor: 'start' },
        { t: 'text', id: 'l1', x: 424, y: 166, text: '400 ms' },
        { t: 'text', id: 'l2', x: 520, y: 166, text: '500', anchor: 'end' },
      ],
      stop: {
        title: 'The skew bound is a promise',
        edge: true,
        body: <p>Uncertainty windows are only correct while real skew stays under the bound. VM pauses, live migration and bad NTP peers break it, so the node stops instead.</p>,
      },
    },
  ],
}

/* ---------- 05 · TrueTime commit wait ---------- */

export const truetime: FlowDef = {
  h: 290,
  steps: [
    {
      caption: '`TT.now()` returns an interval `[earliest, latest]` guaranteed to contain true time. Its width is a few milliseconds.',
      add: [
        { t: 'line', id: 'ax', x1: 30, y1: 215, x2: 540, y2: 215, tone: 'grey', arrow: true },
        { t: 'text', id: 'rt', x: 540, y: 250, text: 'real time →', anchor: 'end', tone: 'grey' },
        { t: 'box', id: 't1', x: 100, y: 120, w: 120, h: 52, text: 'T1', sub: '[100, 108]' },
        { t: 'line', id: 'lo', x1: 100, y1: 172, x2: 100, y2: 215, tone: 'grey', dashed: true },
        { t: 'line', id: 'hi', x1: 220, y1: 172, x2: 220, y2: 215, tone: 'grey', dashed: true },
        { t: 'node', id: 'now', x: 160, y: 215, r: 6, tone: 'red' },
        { t: 'text', id: 'e', x: 100, y: 240, text: 'earliest' },
        { t: 'text', id: 'l', x: 220, y: 240, text: 'latest' },
      ],
    },
    {
      caption: 'T1 picks its commit timestamp `s` = `latest`. So `s` is never in the past.',
      add: [{ t: 'text', id: 's', x: 226, y: 104, text: 's = 108', tone: 'red', anchor: 'end' }],
      set: { hi: { tone: 'red' } },
    },
    {
      caption: 'Naive: ack at once. T2 starts right after with a tighter interval [103, 107] and picks s2 = 107, below T1’s 108. Real-time order is broken.',
      add: [
        { t: 'text', id: 'ack', x: 160, y: 196, text: 'ack', tone: 'red' },
        { t: 'box', id: 't2n', x: 145, y: 40, w: 60, h: 36, text: 'T2', tone: 'red' },
        { t: 'text', id: 't2nt', x: 215, y: 58, text: '[103,107] → s2 = 107', tone: 'red', anchor: 'start' },
      ],
    },
    {
      caption: 'Fix: commit wait. T1 holds its locks until `TT.after(s)` is true, meaning `s` has definitely passed. That is about 2ε, overlapped with the Paxos round.',
      drop: ['ack', 't2n', 't2nt'],
      set: { s: { tone: 'grey' } },
      add: [{ t: 'box', id: 'cw', x: 160, y: 180, w: 120, h: 28, text: 'commit wait', tone: 'red', dashed: true }],
    },
    {
      caption: 'Only then T1 acks. T2 starts later, its interval [110, 118] is past `s`, so s2 > s. Timestamp order matches real-time order, with no coordination round.',
      set: { s: { tone: 'ink' }, cw: { tone: 'grey' } },
      add: [
        { t: 'text', id: 'ack2', x: 296, y: 196, text: 'ack', tone: 'red', anchor: 'start' },
        { t: 'box', id: 't2', x: 250, y: 120, w: 120, h: 52, text: 'T2', sub: '[110, 118]' },
        { t: 'text', id: 's2', x: 440, y: 100, text: 's2 = 118 > 108', tone: 'red' },
      ],
      stop: {
        title: 'Uncertainty costs latency',
        edge: true,
        body: <p>A bigger ε means longer commit waits, never a wrong order. CockroachDB has no atomic clocks: it assumes bounded skew and restarts reads instead.</p>,
      },
    },
  ],
}
