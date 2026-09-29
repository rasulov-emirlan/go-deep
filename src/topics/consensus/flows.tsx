import type { BoxEl, El, FlowDef, FlowStep, FlowStop, MsgEl, Tone } from '../../components/flow'

/* ---- tiny builders ---------------------------------------------------------------------------
 * Visual language for the whole page: ink = normal, grey = old / dead / history, red = what this
 * step is about, dashed = unconfirmed / in flight, ✕ = lost. Lanes are always S1 S2 S3 at the same
 * x positions (client, when present, on the far left). */

const X = { c: 50, s1: 170, s2: 310, s3: 450 }

type Opts = { add?: El[]; set?: Record<string, Record<string, unknown>>; drop?: string[] | 'all'; stop?: FlowStop }

class B {
  live = new Set<string>()
  steps: FlowStep[] = []
  h: number
  constructor(h: number) {
    this.h = h
  }
  step(caption: string, o: Opts = {}) {
    const drop = o.drop === 'all' ? [...this.live] : o.drop
    drop?.forEach((id) => this.live.delete(id))
    o.add?.forEach((e) => this.live.add(e.id))
    const s: FlowStep = { caption }
    if (o.add?.length) s.add = o.add
    if (o.set) s.set = o.set
    if (drop?.length) s.drop = drop
    if (o.stop) s.stop = o.stop
    this.steps.push(s)
    return this
  }
  def(): FlowDef {
    return { h: this.h, steps: this.steps }
  }
}

const laneOf =
  (len: number) =>
  (id: string, x: number, text: string, sub?: string, o: Partial<Extract<El, { t: 'lane' }>> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, sub, w: x === X.c ? 70 : 90, ...o })

const msg = (id: string, from: string, to: string, y: number, y2: number | undefined, text: string, o: Partial<MsgEl> = {}): El => ({ t: 'msg', id, from, to, y, y2, text, ...o })
const txt = (id: string, x: number, y: number, text: string, o: Partial<Extract<El, { t: 'text' }>> = {}): El => ({ t: 'text', id, x, y, text, ...o })
const node = (id: string, x: number, y: number, text?: string, o: Partial<Extract<El, { t: 'node' }>> = {}): El => ({ t: 'node', id, x, y, text, ...o })

/** rounded-rectangle outline as an SVG path */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`
const region = (id: string, x: number, y: number, w: number, h: number, tone: Tone = 'ink'): El => ({ t: 'path', id, d: rr(x, y, w, h, 30), tone, dashed: true })

/** diff two full pictures into add / set / drop (used for the log grids, which are easier to write as whole states) */
function diff(prev: El[], cur: El[]): Pick<Opts, 'add' | 'set' | 'drop'> {
  const p = new Map(prev.map((e) => [e.id, e]))
  const c = new Map(cur.map((e) => [e.id, e]))
  const add = cur.filter((e) => !p.has(e.id))
  const drop = prev.filter((e) => !c.has(e.id)).map((e) => e.id)
  const set: Record<string, Record<string, unknown>> = {}
  for (const e of cur) {
    const o = p.get(e.id) as Record<string, unknown> | undefined
    if (!o) continue
    const n = e as unknown as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) patch[k] = n[k]
    if (Object.keys(patch).length) set[e.id] = patch
  }
  return { add, drop, set }
}

/** a log cell: [term, tone, dashed] */
type C = [string, Tone?, boolean?]
const cells = (row: string, y: number, x0: number, pitch: number, w: number, cs: (C | null)[]): El[] =>
  cs.flatMap((c, i): BoxEl[] => (c ? [{ t: 'box', id: `${row}${i + 1}`, x: x0 + i * pitch, y, w, h: 34, text: c[0], tone: c[1] ?? 'ink', dashed: !!c[2] }] : []))

/* ================================================================================================
 * 01  Why a majority
 * ============================================================================================== */

const dots = (n: number, y: number, hot = false): El[] => {
  const q = Math.floor(n / 2) + 1
  const out: El[] = [txt(`tn${n}`, 20, y, `n=${n}`, { anchor: 'start' })]
  for (let k = 0; k < n; k++) out.push(node(`d${n}_${k}`, 118 + k * 34, y, undefined, { r: 11, tone: k < q ? 'ink' : 'grey', dashed: k >= q }))
  out.push(txt(`i${n}`, 350, y, `need ${q} · survive ${n - q}`, { anchor: 'start', tone: hot ? 'red' : 'ink' }))
  return out
}

const LA = laneOf(310)
export const quorum: FlowDef = new B(300)
  .step('Simplest design: one primary, one async replica. The primary tells the client "ok" first and copies to the replica later.', {
    add: [
      LA('c', X.c, 'client'),
      LA('s1', X.s1, 'S1', 'primary'),
      LA('s2', X.s2, 'S2', 'replica'),
      msg('w', 'c', 's1', 90, 106, 'write x=1'),
      msg('ok', 's1', 'c', 130, 146, 'ok'),
      msg('rep', 's1', 's2', 130, 156, 'copy later', { dashed: true }),
    ],
  })
  .step('The primary crashes before the copy arrives. The replica is promoted, and the write the client was told succeeded is gone.', {
    set: { s1: { dead: true }, rep: { lost: true, tone: 'red' }, s2: { sub: 'promoted' } },
    add: [txt('gone', X.s2, 236, 'x=1 is lost', { tone: 'red' })],
  })
  .step('Next try: wait for ALL replicas before acking. Now one dead replica (S3) means no write can ever finish.', {
    drop: ['w', 'ok', 'rep', 'gone'],
    set: { s1: { dead: false }, s2: { sub: 'replica' } },
    add: [
      LA('s3', X.s3, 'S3', 'replica', { dead: true }),
      msg('w2', 'c', 's1', 90, 106, 'write x=1'),
      msg('r2', 's1', 's2', 130, 152, 'copy'),
      msg('r3', 's1', 's3', 130, 152, 'copy', { lost: true, tone: 'red' }),
      txt('stall', 250, 250, 'no ack: waiting for S3', { tone: 'red' }),
    ],
  })
  .step('Wait for a majority instead: 2 of 3. S1 and S2 are enough, the dead S3 no longer blocks, and the write now lives on two nodes.', {
    drop: ['stall'],
    add: [msg('a2', 's2', 's1', 176, 196, 'ack'), msg('ok2', 's1', 'c', 216, 236, 'ok')],
  })
  .step('Why it is safe: any two majorities of the same cluster share a node. S2 acked the write and sits in both majorities.', {
    drop: 'all',
    add: [
      region('ra', 130, 112, 220, 76),
      region('rb', 270, 112, 220, 76, 'red'),
      node('n1', X.s1, 150, 'S1'),
      node('n2', X.s2, 150, 'S2', { tone: 'red' }),
      node('n3', X.s3, 150, 'S3'),
      txt('ta', 240, 214, 'acked the write'),
      txt('tb', 380, 240, 'a later election', { tone: 'red' }),
      txt('tc', X.s2, 76, 'S2 is in both', { tone: 'red' }),
    ],
  })
  .step('Majority = ⌊n/2⌋+1. Solid dots must agree; dashed ones may be down. 3 nodes survive one failure, 5 survive two.', {
    drop: 'all',
    add: [txt('hd', 280, 26, 'solid = must agree · dashed = may be down', { size: 13, tone: 'grey' }), ...dots(3, 80), ...dots(5, 180)],
  })
  .step('A 4th node buys nothing: it needs 3 of 4 and still survives one failure. 7 nodes survive three.', {
    add: [...dots(4, 130, true), ...dots(7, 230)],
    stop: {
      title: 'Even sizes buy nothing',
      edge: true,
      body: (
        <>
          <p>Two nodes are worse than one: quorum 2, survives 0. Bigger clusters also wait on a slower majority, so writes get slower, not faster.</p>
          <p>The minority side can&rsquo;t decide, so it stops. That is CP, and it is why you can&rsquo;t just &ldquo;force&rdquo; a smaller quorum.</p>
        </>
      ),
    },
  })
  .def()

/* ================================================================================================
 * 02  Elections
 * ============================================================================================== */

const LB = laneOf(364)
const timer = (id: string, x: number, ms: string): El => node(id, x, 100, 'T0', { r: 28, sub: ms, dashed: true })

export const election: FlowDef = new B(372)
  .step('Each follower runs a random election timer (the paper suggests 150–300 ms). Whoever hears no heartbeat first stands for election. Safety never depends on this.', {
    add: [LB('l1', X.s1, 'S1', 'follower'), LB('l2', X.s2, 'S2', 'follower'), LB('l3', X.s3, 'S3', 'follower'), timer('n1', X.s1, '212ms'), timer('n2', X.s2, '158ms'), timer('n3', X.s3, '287ms')],
    stop: {
      title: 'Why random timers?',
      edge: true,
      body: (
        <>
          <p>Equal timers would make every node a candidate at once and split the vote forever. Random ones make that unlikely, not impossible: Raft only promises progress when timing behaves.</p>
          <p>Rule of thumb: broadcast time ≪ election timeout ≪ time between failures. A GC or fsync stall longer than the timeout causes a needless election.</p>
        </>
      ),
    },
  })
  .step('S2 fires first: it moves to term 1 (Raft’s logical clock), votes for itself and becomes a candidate.', {
    set: { n2: { text: 'T1', sub: '', tone: 'red', dashed: false }, l2: { sub: 'candidate', tone: 'red' } },
  })
  .step('It asks for votes with RequestVote. Seeing term 1, S1 and S3 adopt it.', {
    set: { n1: { text: 'T1', sub: '', dashed: false }, n3: { text: 'T1', sub: '', dashed: false } },
    add: [msg('rv1', 'l2', 'l1', 150, 172, 'RequestVote', { tone: 'red' }), msg('rv3', 'l2', 'l3', 150, 172, 'RequestVote', { tone: 'red' })],
  })
  .step('Both say yes. 2 of 3 (counting itself) is a majority, so S2 leads term 1. One vote per term means at most one leader per term.', {
    set: { l2: { sub: 'leader', tone: 'ink' }, n2: { tone: 'ink' } },
    add: [msg('g1', 'l1', 'l2', 190, 212, 'vote granted'), msg('g3', 'l3', 'l2', 190, 212, 'vote granted')],
    stop: {
      title: 'Who gets a vote',
      edge: true,
      body: (
        <>
          <p>A voter says yes only if it has not voted this term and the candidate&rsquo;s log is at least as up to date: last entry&rsquo;s term first, then length. A longer log of older terms loses.</p>
          <p>The vote and the term are fsynced before replying, or a restart could vote twice.</p>
        </>
      ),
    },
  })
  .step('The leader sends empty AppendEntries as heartbeats. Each one resets the followers’ election timers.', {
    add: [msg('hb1', 'l2', 'l1', 236, 256, 'heartbeat'), msg('hb3', 'l2', 'l3', 236, 256, 'heartbeat')],
  })
  .step('S2 is cut off. Its heartbeats are lost, so S1 and S3 hear nothing and their timers keep running.', {
    drop: ['rv1', 'rv3', 'g1', 'g3', 'hb1', 'hb3'],
    add: [msg('x1', 'l2', 'l1', 140, 158, 'heartbeat', { lost: true, tone: 'red' }), msg('x3', 'l2', 'l3', 140, 158, 'heartbeat', { lost: true, tone: 'red' })],
  })
  .step('S3’s timer fires: term 2, a vote for itself, RequestVote to both. S2 can’t be reached.', {
    set: { n3: { text: 'T2', tone: 'red' }, l3: { sub: 'candidate', tone: 'red' } },
    add: [msg('rq1', 'l3', 'l1', 204, 226, 'RequestVote', { tone: 'red' }), msg('rq2', 'l3', 'l2', 240, 258, 'RequestVote', { lost: true, tone: 'red' })],
  })
  .step('S1 votes yes. S3 has 2 of 3 and leads term 2 without S2, which still believes it leads term 1.', {
    set: { n1: { text: 'T2' }, n3: { tone: 'ink' }, l3: { sub: 'leader', tone: 'ink' } },
    add: [msg('gv', 'l1', 'l3', 282, 304, 'vote granted')],
  })
  .step('The network heals. S2 sees term 2, higher than its own, adopts it and steps down. Any higher term does that.', {
    set: { n2: { text: 'T2', tone: 'red' }, l2: { sub: 'follower', tone: 'ink' } },
    add: [msg('hb', 'l3', 'l2', 322, 342, 'heartbeat T2', { tone: 'red' })],
  })
  .def()

/* ---- Pre-Vote ---- */

const LP = laneOf(324)
const term = (id: string, x: number, t: string, tone: Tone = 'ink'): El => node(id, x, 100, t, { r: 28, tone })

export const prevote: FlowDef = new B(332)
  .step('A network cut isolates S3. S2 leads term 5; its heartbeats reach S1 but not S3.', {
    add: [
      LP('l1', X.s1, 'S1', 'follower'),
      LP('l2', X.s2, 'S2', 'leader'),
      LP('l3', X.s3, 'S3', 'follower'),
      term('n1', X.s1, 'T5'),
      term('n2', X.s2, 'T5'),
      term('n3', X.s3, 'T5'),
      msg('h1', 'l2', 'l1', 150, 168, 'heartbeat'),
      msg('hx', 'l2', 'l3', 150, 168, 'heartbeat', { lost: true, tone: 'red' }),
    ],
  })
  .step('S3 times out, becomes a candidate and bumps its term. Each failed retry adds one more: 6, 7, 8, 9…', {
    set: { n3: { text: 'T9', tone: 'red' }, l3: { sub: 'candidate', tone: 'red' } },
    add: [msg('rx', 'l3', 'l2', 200, 216, 'RequestVote', { lost: true, tone: 'red' })],
  })
  .step('The link heals. S3’s RequestVote arrives carrying term 9.', {
    add: [msg('rv', 'l3', 'l2', 236, 252, 'RequestVote', { tone: 'red' })],
  })
  .step('S2 sees 9 > 5, adopts it and steps down, though it refuses the vote (S3’s log is stale). No leader until a new election.', {
    set: { n2: { text: 'T9', tone: 'red' }, l2: { sub: 'follower', tone: 'ink' } },
    add: [msg('no', 'l2', 'l3', 276, 292, 'no vote, T9')],
  })
  .step('With Pre-Vote, S3 first sends PreVote (“would you vote for me?”), which changes no term. It gets no answer, so it stays at term 5.', {
    drop: ['rx', 'rv', 'no'],
    set: { n2: { text: 'T5', tone: 'ink' }, l2: { sub: 'leader' }, n3: { text: 'T5' }, l3: { sub: 'follower' } },
    add: [msg('px', 'l3', 'l2', 204, 220, 'PreVote', { lost: true, tone: 'red' })],
  })
  .step('The link heals. S2 refuses S3’s PreVote. S3 stays a follower at term 5 and the healthy leader is never disturbed.', {
    add: [msg('pv', 'l3', 'l2', 244, 260, 'PreVote', { tone: 'red' }), msg('pn', 'l2', 'l3', 284, 300, 'no')],
    stop: {
      title: 'Pre-Vote isn’t free',
      edge: true,
      body: (
        <>
          <p>Peers say yes to a pre-vote only if the candidate&rsquo;s log is up to date and they haven&rsquo;t heard from a leader lately. It is a thesis extension, not in the 2014 paper.</p>
          <p>Partial or one-way link failures can still leave a cluster leaderless. Pair it with CheckQuorum: a leader that hears from no majority steps down.</p>
        </>
      ),
    },
  })
  .def()

/* ================================================================================================
 * 03  Log replication, repair, commit
 * ============================================================================================== */

// ---- replication grid: S2 above, leader S1 in the middle, S3 below ----
const G = { x0: 80, pitch: 52, w: 44 }
const colX = (i: number) => G.x0 + (i - 1) * G.pitch + G.w / 2
const RY = { a: 40, b: 140, c: 240 } // S2, S1 (leader), S3

const gridBase: El[] = [
  ...Array.from({ length: 8 }, (_, i) => txt(`h${i + 1}`, colX(i + 1), 22, String(i + 1), { size: 13, tone: 'grey' })),
  txt('la', 12, RY.a + 11, 'S2', { anchor: 'start' }),
  txt('lb', 12, RY.b + 11, 'S1', { anchor: 'start' }),
  txt('ld', 12, RY.b + 27, 'leader', { anchor: 'start', size: 12, tone: 'grey' }),
  txt('lc', 12, RY.c + 11, 'S3', { anchor: 'start' }),
]
const logState = (s1: (C | null)[], s2: (C | null)[], s3: (C | null)[], extra: El[] = []): El[] => [
  ...gridBase,
  ...cells('b', RY.b, G.x0, G.pitch, G.w, s1),
  ...cells('a', RY.a, G.x0, G.pitch, G.w, s2),
  ...cells('c', RY.c, G.x0, G.pitch, G.w, s3),
  ...extra,
]
/** AppendEntries "prev" check arrow: from the leader row to a follower row at column i */
const check = (id: string, i: number, up: boolean, label: string): El[] => [
  { t: 'line', id, x1: colX(i), y1: up ? RY.b : RY.b + 34, x2: colX(i), y2: up ? RY.a + 38 : RY.c - 4, tone: 'red', arrow: true },
  txt(`${id}t`, colX(i) + 8, up ? 107 : 207, label, { anchor: 'start', tone: 'red', size: 14 }),
]

const D = true
const lead0: C[] = [['1'], ['1'], ['1'], ['3', 'ink', D], ['3', 'ink', D]]
const s2old: C[] = [['1'], ['1'], ['1'], ['2', 'grey', D], ['2', 'grey', D]]
const s3short: C[] = [['1'], ['1'], ['1']]
const lead6: C[] = [...lead0, ['3', 'red', D]]
const rj = (text: string): El => txt('rj', 396, RY.a + 17, text, { anchor: 'start', tone: 'red', size: 14 })

const logStates: { caption: string; els: El[]; stop?: FlowStop }[] = [
  { caption: 'After elections, logs differ. Numbers are terms. S2 holds two uncommitted entries from old term 2; S3 is just behind. Dashed = not yet committed.', els: logState(lead0, s2old, s3short) },
  { caption: 'A client command arrives. The leader appends it at index 6 in its own log, in term 3. Nothing is committed yet.', els: logState(lead6, s2old, s3short) },
  { caption: 'It sends AppendEntries with a check: “do you hold index 5 from term 3?” (prevLogIndex, prevLogTerm).', els: logState(lead6, s2old, s3short, check('ae', 5, true, 'prev=(5,T3)')) },
  {
    caption: 'S2 has term 2 at index 5, not 3, so it rejects. The leader lowers its nextIndex for S2 by one and retries.',
    els: logState(lead6, [...s2old.slice(0, 4), ['2', 'red', D]], s3short, [...check('ae', 5, true, 'prev=(5,T3)'), rj('reject: T2≠T3')]),
  },
  {
    caption: 'Retry with prev=(4,T3): index 4 is term 2 too, rejected again. Real implementations can jump back several entries using a conflict hint.',
    els: logState(lead6, [...s2old.slice(0, 3), ['2', 'red', D], ['2', 'grey', D]], s3short, [...check('ae2', 4, true, 'prev=(4,T3)'), rj('reject: T2≠T3')]),
  },
  {
    caption: 'Index 3 matches (term 1). S2 deletes its conflicting entries 4 and 5 and takes the leader’s 4, 5 and 6.',
    els: logState(lead6, [['1'], ['1'], ['1'], ['3', 'ink', D], ['3', 'ink', D], ['3', 'red', D]], s3short, [...check('ae3', 3, true, 'prev=(3,T1)'), rj('match: overwrite')]),
    stop: {
      title: 'Log Matching Property',
      edge: true,
      body: (
        <>
          <p>Same index and same term means same command and an identical history before it. That is why one check at prevLogIndex is enough.</p>
          <p>Only followers are rewritten. A leader never overwrites or deletes its own log.</p>
        </>
      ),
    },
  },
  {
    caption: 'S3 is only short. After the same walk back it accepts the missing entries 4, 5 and 6.',
    els: logState(lead6, [['1'], ['1'], ['1'], ['3', 'ink', D], ['3', 'ink', D], ['3', 'ink', D]], [['1'], ['1'], ['1'], ['3', 'red', D], ['3', 'red', D], ['3', 'red', D]], check('ae4', 3, false, 'prev=(3,T1)')),
  },
  {
    caption: 'Entry 6 is on all three servers and belongs to the leader’s own term, so commitIndex moves to 6. Entries 1–5 commit with it.',
    els: logState(
      [['1'], ['1'], ['1'], ['3'], ['3'], ['3']],
      [['1'], ['1'], ['1'], ['3'], ['3'], ['3']],
      [['1'], ['1'], ['1'], ['3'], ['3'], ['3']],
      [{ t: 'path', id: 'cl', d: 'M392,28 V282', tone: 'red', width: 2 }, txt('ci', 280, 306, 'commitIndex = 6 · then applied', { tone: 'red' })],
    ),
    stop: {
      title: 'Committed isn’t replied',
      edge: true,
      body: (
        <>
          <p>The leader can commit and crash before answering. The client retries and the command runs twice.</p>
          <p>Fix: client session ids plus serial numbers, deduplicated inside the state machine (Ongaro’s thesis, ch. 6).</p>
        </>
      ),
    },
  },
]

export const replication: FlowDef = (() => {
  const b = new B(322)
  logStates.forEach((s, i) => b.step(s.caption, { ...diff(i ? logStates[i - 1].els : [], s.els), stop: s.stop }))
  return b.def()
})()

// ---- Figure 8 ----
const F = { x0: 80, pitch: 60, w: 52, y0: 50, dy: 46 }
const fy = (r: number) => F.y0 + r * F.dy
type Row = { cs: (C | null)[]; note: string; noteTone?: Tone; labelTone?: Tone }
const fig8State = (rows: Row[], title: string, badge: string): El[] => [
  ...[1, 2, 3].map((i) => txt(`fh${i}`, F.x0 + (i - 1) * F.pitch + F.w / 2, 28, String(i), { size: 13, tone: 'grey' })),
  ...rows.flatMap((r, k): El[] => [
    txt(`fl${k}`, 12, fy(k) + 17, `S${k + 1}`, { anchor: 'start', tone: r.labelTone ?? 'ink' }),
    ...cells(`f${k}_`, fy(k), F.x0, F.pitch, F.w, r.cs),
    txt(`fn${k}`, 290, fy(k) + 17, r.note, { anchor: 'start', tone: r.noteTone ?? 'ink' }),
  ]),
  txt('ft', 8, 300, title, { anchor: 'start', size: 14 }),
  txt('fb', 8, 328, badge, { anchor: 'start', tone: 'red' }),
]
const dead = (cs: C[]): C[] => cs.map(([t, , d]) => [t, 'grey', d])
const old = (d = true): C => ['2', 'red', d]
const crashed: Pick<Row, 'note' | 'noteTone' | 'labelTone'> = { note: '✕ crashed', noteTone: 'grey', labelTone: 'grey' }

const f8: { caption: string; els: El[]; stop?: FlowStop }[] = [
  {
    caption: 'Five servers, three index slots. (a) S1 leads term 2 and has copied its entry for index 2 (term 2) to S2 only.',
    els: fig8State(
      [
        { cs: [['1'], old()], note: 'leader, term 2' },
        { cs: [['1'], old()], note: '' },
        { cs: [['1']], note: '' },
        { cs: [['1']], note: '' },
        { cs: [['1']], note: '' },
      ],
      '(a) S1 leads term 2, copies idx 2 to S2',
      '',
    ),
  },
  {
    caption: '(b) S1 crashes. S5 wins term 3 with votes from S3, S4 and itself (S2 refuses: its log is newer) and writes a different entry at index 2.',
    els: fig8State(
      [
        { cs: dead([['1'], ['2', 'red', D]]), ...crashed },
        { cs: [['1'], old()], note: 'refuses S5' },
        { cs: [['1']], note: 'votes S5' },
        { cs: [['1']], note: 'votes S5' },
        { cs: [['1'], ['3', 'ink', D]], note: 'leader, term 3' },
      ],
      '(b) S1 crashes, S5 wins term 3',
      '',
    ),
  },
  {
    caption: '(c) S5 crashes; S1 restarts and wins term 4. It keeps copying its old term-2 entry until 3 of 5 servers hold it. Counting says committed, but…',
    els: fig8State(
      [
        { cs: [['1'], old()], note: 'leader, term 4' },
        { cs: [['1'], old()], note: '' },
        { cs: [['1'], old()], note: 'gets idx 2 (T2)' },
        { cs: [['1']], note: '' },
        { cs: dead([['1'], ['3', 'ink', D]]), ...crashed },
      ],
      '(c) S1 back as leader of term 4',
      'idx 2 is on 3 of 5 servers: NOT committed',
    ),
    stop: {
      title: 'Why not just count?',
      edge: true,
      body: (
        <>
          <p>A majority holding an old-term entry can still lose an election to a node with a higher last term. So Raft counts replicas only for entries of the leader&rsquo;s current term.</p>
          <p>Older entries commit along with a later current-term entry (Log Matching).</p>
        </>
      ),
    },
  },
  {
    caption: '(d1) If S1 crashes now, S5 can win: its last term (3) beats the voters’ 2. It overwrites index 2 and the “majority” entry is gone.',
    els: fig8State(
      [
        { cs: dead([['1'], ['2', 'red', D]]), ...crashed },
        { cs: [['1'], ['3', 'red', D]], note: 'votes S5' },
        { cs: [['1'], ['3', 'red', D]], note: 'votes S5' },
        { cs: [['1'], ['3', 'red', D]], note: 'votes S5' },
        { cs: [['1'], ['3', 'ink', D]], note: 'leader, term 5' },
      ],
      '(d1) S1 crashes, S5 wins term 5',
      'idx 2 (T2) overwritten: the entry is LOST',
    ),
  },
  {
    caption: '(d2) Rewind to (c). Now S1 first replicates a new term-4 entry to a majority. That entry commits, and index 2 with it.',
    els: fig8State(
      [
        { cs: [['1'], ['2'], ['4', 'red']], note: 'leader, term 4' },
        { cs: [['1'], ['2'], ['4', 'red']], note: '' },
        { cs: [['1'], ['2'], ['4', 'red']], note: '' },
        { cs: [['1']], note: '' },
        { cs: dead([['1'], ['3', 'ink', D]]), ...crashed },
      ],
      '(d2) S1 replicates a term-4 entry',
      'idx 3 (T4) on 3 of 5: committed, idx 2 with it',
    ),
  },
  {
    caption: '(e) S1 crashes anyway. S5’s last term is 3 but S2 and S3 hold term 4, so they refuse. S5 gets 2 votes of 5 and cannot win.',
    els: fig8State(
      [
        { cs: dead([['1'], ['2'], ['4']]), ...crashed },
        { cs: [['1'], ['2'], ['4']], note: 'refuses S5' },
        { cs: [['1'], ['2'], ['4']], note: 'refuses S5' },
        { cs: [['1']], note: 'votes S5' },
        { cs: [['1'], ['3', 'ink', D]], note: 'asks votes: 2 of 5', noteTone: 'red' },
      ],
      '(e) S1 crashes, S5 campaigns',
      'S5 cannot win: index 2 is safe',
    ),
    stop: {
      title: 'The leader no-op',
      edge: true,
      body: (
        <>
          <p>A new leader can only commit what it wrote this term. So etcd-raft appends an empty entry the moment it becomes leader; committing it commits everything before it.</p>
          <p>Read-only queries need that entry too (next section).</p>
        </>
      ),
    },
  },
]

export const figure8: FlowDef = (() => {
  const b = new B(352)
  f8.forEach((s, i) => b.step(s.caption, { ...diff(i ? f8[i - 1].els : [], s.els), stop: s.stop }))
  return b.def()
})()

/* ================================================================================================
 * 04  Reads and membership
 * ============================================================================================== */

const LR = laneOf(352)
const val = (id: string, x: number, t: string, tone: Tone = 'ink'): El => ({ t: 'box', id, x: x - 35, y: 64, w: 70, h: 26, text: t, tone })

const readsLadder: El[] = [
  LR('c', X.c, 'client'),
  LR('s1', X.s1, 'S1', 'T2'),
  LR('s2', X.s2, 'S2', 'T1 leader'),
  LR('s3', X.s3, 'S3', 'T2 leader'),
  val('v1', X.s1, 'x=2'),
  val('v2', X.s2, 'x=1', 'grey'),
  val('v3', X.s3, 'x=2'),
  txt('cut', X.s2, 108, 'cut off', { tone: 'red', size: 13 }),
  { t: 'path', id: 'p1', d: 'M240,100 V344', tone: 'red', dashed: true },
  { t: 'path', id: 'p2', d: 'M380,100 V344', tone: 'red', dashed: true },
]

export const reads: FlowDef = new B(352)
  .step('S2 was the leader of term 1 but is cut off. S3 won term 2 and holds the newer x=2. S2 has not heard.', { add: readsLadder })
  .step('A read served by “the leader” is not enough: S2 is a deposed leader, unaware of term 2, and returns stale x=1.', {
    set: { v2: { tone: 'red' } },
    add: [msg('g', 'c', 's2', 140, 158, 'GET x'), msg('r', 's2', 'c', 180, 198, 'x=1', { tone: 'red' })],
  })
  .step('ReadIndex, step 1: ask the current leader. S3 has committed an entry of its own term, so it notes readIndex = commitIndex (7 here).', {
    drop: ['g', 'r', 'p1', 'p2', 'cut'],
    set: { v2: { tone: 'grey' } },
    add: [msg('g2', 'c', 's3', 130, 150, 'GET x'), { t: 'box', id: 'ri', x: 338, y: 166, w: 106, h: 26, text: 'readIndex=7', tone: 'red' }],
  })
  .step('Step 2: confirm it is still leader with a heartbeat round. S1 answers; with itself that is 2 of 3. S2 is unreachable.', {
    add: [msg('hb', 's3', 's1', 214, 234, 'heartbeat'), msg('hx', 's3', 's2', 246, 262, 'heartbeat', { lost: true, tone: 'red' }), msg('ak', 's1', 's3', 284, 304, 'ack')],
  })
  .step('Step 3: wait until index 7 is applied, then answer from the state machine: x=2. No log write, one heartbeat round.', {
    add: [msg('an', 's3', 'c', 318, 336, 'x=2')],
    stop: {
      title: 'Reads off followers',
      edge: true,
      body: (
        <>
          <p>A follower can ask the leader for its readIndex, wait until it has applied that index, then answer: still linearizable. etcd does this by default.</p>
          <p>
            <code>Serializable: true</code> skips it: a local read that may lag.
          </p>
        </>
      ),
    },
  })
  .step('Lease read: after a majority acks a heartbeat, the leader assumes no rival can win until the lease ends. Reads inside it need no messages.', {
    drop: 'all',
    add: [
      { t: 'line', id: 'ax', x1: 30, y1: 200, x2: 540, y2: 200, tone: 'grey', arrow: true },
      txt('rt', 536, 222, 'real time', { anchor: 'end', size: 13, tone: 'grey' }),
      { t: 'box', id: 'lb', x: 80, y: 100, w: 220, h: 34, text: 'lease: read locally', tone: 'ink' },
      { t: 'line', id: 'ta', x1: 80, y1: 134, x2: 80, y2: 200, tone: 'ink' },
      txt('tat', 86, 168, 'majority acked', { anchor: 'start' }),
      { t: 'line', id: 'te', x1: 300, y1: 134, x2: 300, y2: 200, tone: 'grey' },
      txt('tet', 300, 222, 'lease ends', { tone: 'grey' }),
    ],
  })
  .step('Now the leader freezes: a VM pause, a long GC stop or a clock step. Its own clock no longer matches real time.', {
    add: [{ t: 'box', id: 'pz', x: 170, y: 246, w: 230, h: 34, text: 'VM pause / clock jump', tone: 'grey', dashed: true }],
  })
  .step('Meanwhile the lease ran out and S1 won an election. The old leader wakes, still trusts its lease and serves stale data.', {
    add: [
      { t: 'line', id: 'tr', x1: 330, y1: 170, x2: 330, y2: 200, tone: 'red' },
      txt('trt', 336, 158, 'S1 elected', { anchor: 'start', tone: 'red' }),
      txt('st', 280, 308, 'wakes up, still trusts its lease:\nanswers with stale data', { tone: 'red' }),
    ],
    stop: {
      title: 'Lease vs ReadIndex',
      edge: true,
      body: (
        <>
          <p>Lease reads save the heartbeat round but make safety depend on bounded clock drift. If that breaks, the answer can be arbitrarily stale.</p>
          <p>etcd-raft defaults to ReadIndex; its lease option needs CheckQuorum.</p>
        </>
      ),
    },
  })
  .def()

// ---- membership ----
const M = [80, 190, 300, 410, 520]
const mnode = (i: number, o: Partial<Extract<El, { t: 'node' }>> = {}): El => node(`m${i + 1}`, M[i], 150, `S${i + 1}`, o)

export const membership: FlowDef = new B(290)
  .step('Naive change: switch every server from C_old = {S1,S2,S3} to C_new = {S3,S4,S5} at once. They can’t all switch at the same instant.', {
    add: [
      { t: 'path', id: 'ro', d: rr(44, 104, 292, 92, 34), tone: 'ink', dashed: true },
      { t: 'path', id: 'rn', d: rr(264, 104, 292, 92, 34), tone: 'red', dashed: true },
      txt('lo', 44, 90, 'C_old', { anchor: 'start', size: 13 }),
      txt('ln', 556, 90, 'C_new', { anchor: 'end', size: 13, tone: 'red' }),
      mnode(0),
      mnode(1),
      mnode(2),
      mnode(3, { dashed: true }),
      mnode(4, { dashed: true }),
    ],
  })
  .step('They learn at different times. S1+S2 are still a majority of C_old, S4+S5 already a majority of C_new: two leaders in one term.', {
    set: { m1: { tone: 'red' }, m2: { tone: 'red' }, m4: { tone: 'red', dashed: false }, m5: { tone: 'red', dashed: false } },
    add: [txt('a1', 135, 226, 'majority of old', { tone: 'red' }), txt('a2', 465, 226, 'majority of new', { tone: 'red' })],
  })
  .step('Joint consensus: while C_old,new is in force, every vote and commit needs a majority of both. {S1,S2} has no C_new vote, so it can’t decide alone.', {
    drop: ['a1', 'a2'],
    set: { m1: { tone: 'ink' }, m2: { tone: 'ink' }, m4: { tone: 'ink', dashed: true }, m5: { tone: 'ink', dashed: true }, rn: { tone: 'ink' } },
    add: [txt('jt', 300, 240, 'needs 2 of C_old AND 2 of C_new', { tone: 'red' })],
  })
  .step('The leader then appends C_new; a server uses the newest config in its log the moment it is appended. When C_new commits, S1 and S2 leave.', {
    drop: ['ro', 'lo'],
    set: { m1: { tone: 'grey', dashed: true }, m2: { tone: 'grey', dashed: true }, m4: { dashed: false }, m5: { dashed: false }, rn: { tone: 'red' }, jt: { text: 'needs 2 of C_new only' } },
  })
  .step('Alternative: change one server at a time. Majorities of 3 (2) and 4 (3) always overlap, since 2 + 3 > 4, so no joint phase is needed.', {
    drop: 'all',
    add: [
      { t: 'path', id: 'sn', d: rr(30, 100, 442, 100, 40), tone: 'red', dashed: true },
      { t: 'path', id: 'so', d: rr(44, 108, 292, 84, 32), tone: 'ink', dashed: true },
      txt('sl', 44, 86, 'C_old (3)', { anchor: 'start', size: 13 }),
      txt('sm', 472, 86, 'C_new (4)', { anchor: 'end', size: 13, tone: 'red' }),
      mnode(0),
      mnode(1),
      mnode(2),
      mnode(3, { tone: 'red', dashed: true }),
      txt('st1', 410, 226, 'joins as a learner', { tone: 'red', size: 13 }),
    ],
    stop: {
      title: 'One change at a time',
      edge: true,
      body: (
        <>
          <p>Add before remove: 3→4→3 keeps one-failure tolerance, while remove-then-add passes through 2 nodes that must both answer.</p>
          <p>A new server joins as a learner (non-voting) until its log catches up. etcd-raft allows one config change in flight.</p>
        </>
      ),
    },
  })
  .step('Later, S3 is removed. It hears no heartbeats, times out, and keeps starting elections with ever-higher terms that can knock the healthy leader down.', {
    drop: ['sn', 'so', 'sl', 'sm', 'st1'],
    set: { m3: { tone: 'grey', dashed: true }, m4: { tone: 'ink', dashed: false } },
    add: [
      { t: 'line', id: 'q1', x1: 274, y1: 150, x2: 218, y2: 150, tone: 'red', arrow: true },
      { t: 'line', id: 'q2', x1: 326, y1: 150, x2: 382, y2: 150, tone: 'red', arrow: true },
      txt('qt', 300, 100, 'RequestVote, higher term', { tone: 'red' }),
      txt('rm', 300, 204, 'removed', { tone: 'grey', size: 13 }),
    ],
    stop: {
      title: 'Removed servers disrupt',
      edge: true,
      body: (
        <>
          <p>Fix (Ongaro&rsquo;s thesis): ignore RequestVote while a leader was heard from within the minimum election timeout. etcd-raft implements this as a lease check.</p>
        </>
      ),
    },
  })
  .def()
