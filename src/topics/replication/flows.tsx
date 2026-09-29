import type { El, FlowDef, MsgEl, Tone } from '../../components/flow'

/* Shared map: Client x=60, then three nodes at x=200 / 340 / 480 (5-slot flows: 60 / 170 / 280 / 390 / 500). */
const X = { cl: 60, a: 200, b: 340, c: 480 }

const lane = (id: string, x: number, text: string, len: number, o: { sub?: string; w?: number; tone?: Tone; dead?: boolean } = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...o })
const msg = (id: string, from: string, to: string, y: number, y2: number, text: string, o: Partial<MsgEl> = {}): El => ({ t: 'msg', id, from, to, y, y2, text, ...o })
const txt = (id: string, x: number, y: number, text: string, o: { tone?: Tone; size?: number; anchor?: 'start' | 'middle' | 'end' } = {}): El => ({ t: 'text', id, x, y, text, ...o })

/* ---------- 01 · single leader ---------- */

export const asyncFlow: FlowDef = {
  h: 275,
  steps: [
    {
      caption: 'Single leader: every write goes to the leader, which saves it in its own log (Postgres: the WAL).',
      add: [lane('cl', X.cl, 'Client', 265), lane('ld', X.a, 'Leader', 265), lane('f1', X.b, 'F1', 265), lane('f2', X.c, 'F2', 265), msg('w1', 'cl', 'ld', 62, 74, 'INSERT')],
    },
    {
      caption: 'Async: the leader acks once its own log has it. Followers replay later and lag (Postgres: write_lag, flush_lag, replay_lag).',
      add: [msg('ack1', 'ld', 'cl', 88, 100, 'ack'), msg('s1', 'ld', 'f1', 96, 122, 'WAL', { dashed: true }), msg('s2', 'ld', 'f2', 96, 150, 'WAL', { dashed: true })],
    },
    {
      caption: 'More writes arrive and are acked at once. Followers are still catching up, so these records exist only on the leader.',
      add: [msg('w2', 'cl', 'ld', 172, 184, '3 INSERTs'), msg('ack2', 'ld', 'cl', 196, 208, '3 acks')],
    },
    {
      caption: 'The leader crashes and F1 is promoted. Those three acked writes were never shipped, so they are gone.',
      add: [txt('lost', X.a, 240, '3 acked writes\nlived only here', { tone: 'red' }), txt('prom', X.b, 240, 'promoted')],
      set: { ld: { dead: true } },
      stop: {
        title: 'Failover loses acked writes',
        edge: true,
        body: 'Async replication means RPO > 0: anything not yet shipped is lost. If the old leader returns, its extra writes diverge from the new history.',
      },
    },
  ],
}

export const syncFlow: FlowDef = {
  h: 310,
  steps: [
    {
      caption: 'Sync: the leader ships the record to a named standby and holds the client’s ack. In Postgres that list is synchronous_standby_names.',
      add: [lane('cl', X.cl, 'Client', 300), lane('ld', X.a, 'Leader', 300), lane('f1', X.b, 'F1', 300), lane('f2', X.c, 'F2', 300), msg('w1', 'cl', 'ld', 62, 74, 'INSERT'), msg('s1', 'ld', 'f1', 82, 104, 'WAL')],
    },
    {
      caption: 'Only when F1 has saved it does the client get its ack. Commit latency now includes a round trip to F1.',
      add: [msg('f1a', 'f1', 'ld', 112, 134, 'flushed'), msg('ack1', 'ld', 'cl', 142, 154, 'ack')],
      stop: {
        title: 'What “saved” means',
        body: 'synchronous_commit: remote_write = standby OS has it (lost if that OS crashes), on = standby fsynced it, remote_apply = replayed, so standby queries see it.',
      },
    },
    {
      caption: 'The sync standby dies. The leader waits for an ack that never comes, so every commit hangs.',
      add: [msg('w2', 'cl', 'ld', 172, 184, 'INSERT'), msg('s2', 'ld', 'f1', 192, 214, 'WAL', { lost: true }), txt('wait', X.cl, 238, 'waiting…', { tone: 'red' })],
      set: { f1: { dead: true } },
      stop: {
        title: 'Sync standby down',
        edge: true,
        body: 'Postgres docs: commits may never complete if a required sync standby crashes. Use a quorum list, or a monitor that relaxes the setting.',
      },
    },
    {
      caption: 'With ANY 1 (F1, F2) one confirmation is enough, so F2 unblocks the commit. RPO 0 still needs you to promote a standby that has it.',
      add: [msg('s3', 'ld', 'f2', 222, 244, 'WAL'), msg('f2a', 'f2', 'ld', 250, 272, 'flushed'), msg('ack2', 'ld', 'cl', 278, 290, 'ack')],
      drop: ['wait'],
    },
  ],
}

const fo = 340
export const failoverFlow: FlowDef = {
  h: fo,
  steps: [
    {
      caption: 'Followers stop hearing the leader’s heartbeat. A crash and a partition look identical, so after a timeout they elect a new leader.',
      add: [
        lane('cl', X.cl, 'Client', 330),
        lane('ld', X.a, 'Leader', 330, { sub: 'epoch 1', w: 84 }),
        lane('f1', X.b, 'F1', 330, { sub: 'follower', w: 84 }),
        lane('f2', X.c, 'F2', 330, { sub: 'follower', w: 84 }),
        { t: 'line', id: 'cut', x1: 270, y1: 62, x2: 270, y2: 320, tone: 'red', dashed: true },
        msg('hb', 'f1', 'ld', 84, 98, 'heartbeat', { lost: true }),
      ],
    },
    {
      caption: 'F1 wins the election with a higher epoch (Postgres: a new timeline). The old leader has no idea it was replaced.',
      set: { f1: { sub: 'leader e2', tone: 'red' } },
    },
    {
      caption: 'Clients can still reach both. Split-brain: two nodes accept writes, and their data diverges.',
      add: [msg('wa', 'cl', 'ld', 130, 142, 'write A', { tone: 'red' }), msg('wb', 'cl', 'f1', 156, 170, 'write B', { tone: 'red' })],
      stop: {
        title: 'Split-brain',
        edge: true,
        body: 'Flipping a virtual IP without fencing causes exactly this. Prevent it with quorum elections, leases or STONITH.',
      },
    },
    {
      caption: 'Fencing: followers refuse anything stamped with an old epoch, and a leader that cannot reach a quorum must stop writing.',
      add: [msg('old', 'ld', 'f2', 200, 224, 'WAL e1', { lost: true })],
      set: { ld: { sub: 'fenced', tone: 'grey' } },
      stop: {
        title: 'The paused leader',
        edge: true,
        body: 'A leader frozen by GC or a VM pause wakes up still believing it leads. The storage layer must check the fencing token itself.',
      },
    },
    {
      caption: 'Two histories now share one past and split at the promotion point. Write A exists only on the old leader’s branch.',
      drop: ['cl', 'ld', 'f1', 'f2', 'cut', 'hb', 'wa', 'wb', 'old'],
      add: [
        txt('pp', 200, 50, 'promotion point'),
        { t: 'line', id: 'tl1', x1: 30, y1: 130, x2: 200, y2: 130 },
        txt('tl1t', 115, 108, 'timeline 1', { tone: 'grey' }),
        { t: 'line', id: 'tlo', x1: 200, y1: 130, x2: 500, y2: 130, tone: 'grey' },
        txt('tlot', 350, 152, 'old leader: write A', { tone: 'red' }),
        { t: 'path', id: 'tln', d: 'M200 130 L240 210 L520 210' },
        txt('tlnt', 390, 234, 'timeline 2: write B'),
        { t: 'node', id: 'fk', x: 200, y: 130, r: 7, tone: 'red' },
      ],
    },
    {
      caption: 'pg_rewind finds the fork, copies back the blocks that changed since, and the old leader rejoins as a follower. The alternative is a full re-clone.',
      add: [{ t: 'line', id: 'rw', x1: 500, y1: 100, x2: 208, y2: 100, tone: 'red', arrow: true, text: 'pg_rewind' }],
    },
  ],
}

export const lagFlow: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'A write reaches replica R1 almost at once, but R2 much later. Both are eventually right, just not at the same moment.',
      add: [lane('cl', X.cl, 'Client', 280), lane('ld', X.a, 'Leader', 280), lane('r1', X.b, 'R1', 280), lane('r2', X.c, 'R2', 280), msg('w', 'cl', 'ld', 62, 74, 'x = 2'), msg('s1', 'ld', 'r1', 82, 104, 'WAL', { dashed: true }), msg('s2', 'ld', 'r2', 82, 236, 'WAL', { dashed: true })],
    },
    {
      caption: 'A read routed to R1 sees the new value.',
      add: [msg('q1', 'cl', 'r1', 118, 130, 'read x'), msg('a1', 'r1', 'cl', 136, 148, 'x = 2')],
    },
    {
      caption: 'The next read lands on R2, which has not replayed the write yet. The client sees x = 1: time went backwards.',
      add: [msg('q2', 'cl', 'r2', 168, 182, 'read x'), msg('a2', 'r2', 'cl', 188, 202, 'x = 1', { tone: 'red' })],
      stop: {
        title: 'Which guarantee broke?',
        edge: true,
        body: 'Monotonic reads: time ran backwards. Read-your-writes fails the same way after your own write. Consistent prefix: an answer shows before its question when shards replicate independently.',
      },
    },
    {
      caption: 'Fixes: pin a session to one replica, or send the last write’s log position (LSN) and let the replica wait until it has replayed it.',
      add: [msg('q3', 'cl', 'r2', 210, 226, '≥ LSN 7', { dashed: true }), msg('a3', 'r2', 'cl', 244, 258, 'x = 2')],
    },
  ],
}

/* ---------- 02 · quorums ---------- */

export const counterFlow: FlowDef = {
  h: 335,
  steps: [
    {
      caption: 'N=3 copies, W=3 acks, R=2 replies per read: W+R > N. The client sends v1 to all three; it reaches A fast, B and C very slowly.',
      add: [
        lane('cl', X.cl, 'Client', 325),
        lane('a', X.a, 'A', 325),
        lane('b', X.b, 'B', 325),
        lane('c', X.c, 'C', 325),
        msg('wa', 'cl', 'a', 56, 74, 'v1', { dashed: true }),
        msg('wb', 'cl', 'b', 56, 270, 'v1', { dashed: true }),
        msg('wc', 'cl', 'c', 56, 292, 'v1', { dashed: true }),
      ],
    },
    {
      caption: 'Client X reads A, which already has v1.',
      add: [msg('xq1', 'cl', 'a', 96, 108, 'X read'), msg('xa1', 'a', 'cl', 112, 124, 'v1', { tone: 'red' })],
    },
    {
      caption: 'X also asks B (R=2), which still has v0. X returns the newest of the two: v1.',
      add: [msg('xq2', 'cl', 'b', 138, 156, 'X read'), msg('xa2', 'b', 'cl', 160, 178, 'v0'), txt('xr', X.cl, 200, 'X gets v1')],
    },
    {
      caption: 'Y starts after X has finished, and asks B. B still has v0.',
      add: [msg('yq1', 'cl', 'b', 216, 230, 'Y read'), msg('ya1', 'b', 'cl', 234, 246, 'v0')],
    },
    {
      caption: 'Y asks C: v0 again, so Y returns v0, older than what X already saw. W+R > N, yet reads went backwards.',
      add: [msg('yq2', 'cl', 'c', 252, 266, 'Y read'), msg('ya2', 'c', 'cl', 270, 284, 'v0', { tone: 'red' }), txt('yr', X.cl, 310, 'Y gets v0', { tone: 'red' })],
    },
    {
      caption: 'The write completes only now, after both reads. Until it completes, quorum overlap gives no ordering guarantee.',
      set: { wb: { dashed: false }, wc: { dashed: false } },
      stop: {
        title: 'More ways quorums lie',
        edge: true,
        body: 'A write that times out is unknown, not failed: it may still land on some replicas. Sloppy quorums, clock-skewed LWW and stale restores break overlap too. Real fixes: read repair before returning, or consensus.',
      },
    },
  ],
}

/* ---------- 03 · hints and repair ---------- */

export const repairFlow: FlowDef = {
  h: 235,
  steps: [
    {
      caption: 'N=3, W=2: A and B took write v1, C missed it. A read with R=2 asks B and C.',
      add: [
        lane('cl', X.cl, 'Client', 225),
        lane('a', X.a, 'A', 225, { sub: 'v1' }),
        lane('b', X.b, 'B', 225, { sub: 'v1' }),
        lane('c', X.c, 'C', 225, { sub: 'v0' }),
        msg('q1', 'cl', 'b', 70, 84, 'read K'),
        msg('q2', 'cl', 'c', 92, 112, 'read K'),
      ],
    },
    {
      caption: 'The coordinator compares the replies and returns the newest, v1. It also now knows C is stale.',
      add: [msg('r1', 'b', 'cl', 126, 140, 'v1'), msg('r2', 'c', 'cl', 146, 166, 'v0', { tone: 'red' }), txt('ret', X.cl, 186, 'returns v1')],
      set: { c: { tone: 'red' } },
    },
    {
      caption: 'Read repair: the coordinator writes v1 back to C. Replicas converge without a separate job.',
      add: [msg('rr', 'cl', 'c', 200, 216, 'repair v1')],
      set: { c: { tone: 'ink', sub: 'v1' } },
    },
    {
      caption: 'Read repair only fixes keys that get read. A cold key stays stale until background anti-entropy compares the replicas.',
      drop: ['q1', 'q2', 'r1', 'r2', 'ret', 'rr'],
      add: [txt('cold', 280, 140, 'K2: never read, never repaired', { tone: 'red' })],
      set: { a: { sub: 'K2 v1' }, b: { sub: 'K2 v1' }, c: { sub: 'K2 v0', tone: 'red' } },
    },
  ],
}

const G5 = { cl: 60, a: 170, b: 280, c: 390, d: 500 }
export const handoffFlow: FlowDef = {
  h: 335,
  steps: [
    {
      caption: 'Key K lives on A, B and C. C is down, but W=2 is still met by A and B.',
      add: [lane('cl', G5.cl, 'Client', 250), lane('a', G5.a, 'A', 250), lane('b', G5.b, 'B', 250), lane('c', G5.c, 'C', 250, { dead: true }), msg('w1', 'cl', 'a', 62, 74, 'v1'), msg('w2', 'cl', 'b', 82, 96, 'v1')],
    },
    {
      caption: 'Sloppy quorum: to stay writable, the third copy goes to stand-in D with a hint “for C”. D is not in K’s read set, so W+R>N no longer guarantees overlap.',
      add: [lane('d', G5.d, 'D', 250, { sub: 'stand-in', w: 84 }), msg('w3', 'cl', 'd', 118, 138, 'v1 hint:C', { tone: 'red' })],
    },
    {
      caption: 'C comes back. D forwards the hinted write to C, so all three home replicas hold v1 again.',
      add: [msg('h', 'd', 'c', 176, 194, 'hint v1')],
      set: { c: { dead: false } },
    },
    {
      caption: 'Hints are only stored while C has been down for less than max_hint_window (3 h in Cassandra’s cassandra.yaml). Past that, only repair fixes C.',
      add: [
        { t: 'line', id: 'ax', x1: 40, y1: 290, x2: 307, y2: 290, tone: 'grey' },
        { t: 'line', id: 'hw', x1: 40, y1: 290, x2: 200, y2: 290 },
        { t: 'line', id: 'nh', x1: 200, y1: 290, x2: 307, y2: 290, tone: 'red' },
        txt('t0', 40, 314, 'C dies', { anchor: 'start' }),
        txt('t3', 200, 314, '3 h'),
        txt('t5', 307, 314, 'C back', { anchor: 'start' }),
        txt('thw', 120, 270, 'hints stored'),
        txt('tnh', 253, 270, 'no hints', { tone: 'red' }),
      ],
      stop: {
        title: 'C down for 5 hours',
        edge: true,
        body: 'Writes after hour 3 were never hinted, so C stays stale until nodetool repair. Note: CL ANY counts a stored hint as an ack.',
      },
    },
  ],
}

/** Two 4-leaf Merkle trees; `cx` is the tree's center, ids get `p` as prefix. */
function tree(p: string, cx: number, name: string): El[] {
  const els: El[] = [txt(p + 'name', cx, 22, name, { tone: 'grey' })]
  const leaves = [-90, -30, 30, 90].map((d) => cx + d)
  const mids = [cx - 60, cx + 60]
  const root = { x: cx, y: 70 }
  const line = (id: string, x1: number, y1: number, x2: number, y2: number): El => ({ t: 'line', id, x1, y1, x2, y2, tone: 'grey', z: -1 })
  mids.forEach((mx, i) => {
    els.push(line(`${p}lm${i}`, root.x, root.y, mx, 135))
    els.push(line(`${p}ll${2 * i}`, mx, 135, leaves[2 * i], 200), line(`${p}ll${2 * i + 1}`, mx, 135, leaves[2 * i + 1], 200))
  })
  els.push({ t: 'node', id: p + 'root', x: root.x, y: root.y, r: 15 })
  mids.forEach((mx, i) => els.push({ t: 'node', id: `${p}m${i}`, x: mx, y: 135, r: 15 }))
  leaves.forEach((lx, i) => els.push({ t: 'node', id: `${p}l${i}`, x: lx, y: 200, r: 15, text: String(i + 1) }))
  return els
}

export const merkleFlow: FlowDef = {
  h: 285,
  steps: [
    {
      caption: 'Each replica hashes its key ranges (the leaves), then hashes the hashes upward into one root: a Merkle tree.',
      add: [...tree('a', 140, 'Replica A'), ...tree('c', 420, 'Replica C')],
    },
    {
      caption: 'Compare roots only. Equal roots mean identical replicas; different roots mean somewhere they diverged, so descend.',
      add: [{ t: 'line', id: 'cmp', x1: 165, y1: 70, x2: 395, y2: 70, tone: 'red', dashed: true, text: '≠' }],
      set: { aroot: { tone: 'red' }, croot: { tone: 'red' } },
    },
    {
      caption: 'Compare the children. The left halves match and are skipped without reading a key; only the right half differs.',
      set: { am0: { tone: 'grey' }, cm0: { tone: 'grey' }, am1: { tone: 'red' }, cm1: { tone: 'red' } },
    },
    {
      caption: 'Range 4 is the mismatch. Only that range is streamed, so repair cost tracks the difference, not the data size (nodetool repair).',
      set: { al3: { tone: 'red' }, cl3: { tone: 'red' } },
      add: [{ t: 'line', id: 'sync', x1: 108, y1: 250, x2: 452, y2: 250, tone: 'red', arrow: true, text: 'stream range 4' }],
    },
  ],
}

/* ---------- 04 · conflicts and CRDTs ---------- */

const R1 = { x: 10, w: 220 }
const R2 = { x: 330, w: 220 }
export const crdtFlow: FlowDef = {
  h: 275,
  steps: [
    {
      caption: 'Two replicas accept different values for x at the same time. How do they converge?',
      add: [
        { t: 'box', id: 'r1', x: R1.x, y: 30, w: R1.w, h: 90, label: 'replica 1', text: 'x = 5', sub: 'written at t10' },
        { t: 'box', id: 'r2', x: R2.x, y: 30, w: R2.w, h: 90, label: 'replica 2', text: 'x = 7', sub: 'written at t12' },
        txt('conc', 280, 160, 'concurrent, no contact', { tone: 'grey' }),
      ],
    },
    {
      caption: 'Last-write-wins keeps the highest timestamp. Both now say 7, and the 5 vanished without a trace.',
      drop: ['conc'],
      add: [{ t: 'line', id: 'mg', x1: 330, y1: 75, x2: 232, y2: 75, arrow: true, text: 'merge' }, txt('lost', 280, 160, '5 silently lost', { tone: 'red' })],
      set: { r1: { text: 'x = 7', sub: 'took t12', tone: 'red' } },
      stop: {
        title: 'Keep both: siblings',
        body: 'Dynamo-style stores keep concurrent versions as siblings and make the app merge them, e.g. a cart as a union. Deleted items can reappear.',
      },
    },
    {
      caption: 'A G-counter gives each replica its own slot and only ever increments its own. Value = sum of the slots.',
      drop: ['mg', 'lost'],
      set: { r1: { label: 'replica 1 · counter', text: '[3, 0]', sub: 'slots R1, R2', tone: 'ink' }, r2: { label: 'replica 2 · counter', text: '[0, 2]', sub: 'slots R1, R2' } },
    },
    {
      caption: 'Merge = element-wise max. Order and repeats do not matter (commutative, associative, idempotent), so replicas converge on 5.',
      add: [{ t: 'line', id: 'm1', x1: 232, y1: 60, x2: 328, y2: 60, arrow: true, text: 'merge' }, { t: 'line', id: 'm2', x1: 328, y1: 96, x2: 232, y2: 96, arrow: true }],
      set: { r1: { text: '[3, 2] = 5', tone: 'red' }, r2: { text: '[3, 2] = 5', tone: 'red' } },
    },
    {
      caption: 'OR-set: remove deletes only the add-tags it has seen. A concurrent re-add carries a new tag, so add wins.',
      drop: ['m1', 'm2'],
      set: {
        r1: { label: 'replica 1 · set', text: 'x#1, x#2', sub: 're-added x as #2', tone: 'ink' },
        r2: { label: 'replica 2 · set', text: 'x#1 removed', sub: 'had only seen #1', tone: 'ink' },
      },
      add: [{ t: 'box', id: 'res', x: 150, y: 170, w: 260, h: 60, text: 'merged: x is in', sub: 'tag #2 was unseen', tone: 'red' }],
      stop: {
        title: 'What CRDTs can’t do',
        edge: true,
        body: 'They converge (strong eventual consistency), but cannot enforce “balance ≥ 0” or unique names. Invariants need coordination.',
      },
    },
  ],
}

/* ---------- 05 · Kafka ISR ---------- */

const st = (text: string, sub: string, tone: Tone = 'ink'): Record<string, unknown> => ({ text, sub, tone })
export const isrFlow: FlowDef = {
  h: 430,
  steps: [
    {
      caption: 'RF=3, min.insync.replicas=2. The producer sends m1 with acks=all. The ISR (in-sync replicas) are those keeping up with the leader.',
      add: [
        lane('pr', X.cl, 'Prod', 366),
        lane('ld', X.a, 'Leader', 366, { sub: 'HWM 0', w: 84 }),
        lane('f1', X.b, 'F1', 366),
        lane('f2', X.c, 'F2', 366),
        { t: 'box', id: 'isr', x: 20, y: 378, w: 520, h: 46, text: 'ISR = {Leader, F1, F2}', sub: 'min.insync.replicas = 2' },
        msg('m1', 'pr', 'ld', 70, 82, 'm1 acks=all'),
      ],
    },
    {
      caption: 'Followers pull m1 from the leader. A record is committed once every replica currently in the ISR has it.',
      add: [msg('p1', 'ld', 'f1', 96, 112, 'm1'), msg('p2', 'ld', 'f2', 96, 126, 'm1')],
    },
    {
      caption: 'All ISR members have m1, so it is committed. The high watermark (HWM) moves, consumers may read up to it, and the producer gets its ack.',
      add: [msg('k1', 'ld', 'pr', 134, 146, 'ack')],
      set: { ld: { sub: 'HWM 1' } },
    },
    {
      caption: 'F2 stops fetching. After replica.lag.time.max.ms (30 s by default) the leader drops it from the ISR. Until then writes wait for F2.',
      add: [txt('sil', X.c, 170, 'silent 30 s', { tone: 'red' })],
      set: { f2: { tone: 'grey' }, isr: st('ISR = {Leader, F1}', 'min.insync.replicas = 2', 'red') },
    },
    {
      caption: 'm2 needs acks only from Leader and F1. ISR size 2 still meets min.insync.replicas 2, so the write succeeds.',
      add: [msg('m2', 'pr', 'ld', 190, 202, 'm2'), msg('p3', 'ld', 'f1', 208, 222, 'm2'), msg('k2', 'ld', 'pr', 228, 240, 'ack')],
    },
    {
      caption: 'F1 dies: ISR = {Leader}, below the minimum. Kafka rejects m3 with NotEnoughReplicas: durability over availability.',
      add: [msg('m3', 'pr', 'ld', 262, 274, 'm3'), msg('e3', 'ld', 'pr', 282, 294, 'rejected', { tone: 'red' })],
      set: { f1: { dead: true }, isr: st('ISR = {Leader}', 'size 1 < min 2: writes rejected', 'red') },
      stop: {
        title: 'min.insync.replicas = 1?',
        edge: true,
        body: 'The default is 1, so acks=all can succeed with the leader alone. If the ISR shrinks after the append you get NotEnoughReplicasAfterAppend: the record may still commit, so retry only with an idempotent producer.',
      },
    },
    {
      caption: 'The leader dies. unclean=false: partition offline until Leader or an ISR member returns. unclean=true: F2 leads without m2.',
      add: [txt('u0', X.a, 335, 'unclean=false:\nstays offline'), txt('u1', X.c, 335, 'unclean=true:\nF2 leads, m2 lost', { tone: 'red' })],
      set: { ld: { dead: true }, f2: { tone: 'red' } },
      stop: {
        title: 'Unclean leader election',
        edge: true,
        body: 'With unclean.leader.election.enable=true (default false) an out-of-sync replica may lead, and acked m2 is silently lost. After any leader change followers truncate by leader epoch (KIP-101), not by high watermark alone.',
      },
    },
    {
      caption: 'Kafka needs f+1 copies to survive f failures but waits for its slowest ISR member. Raft needs 2f+1 and waits only for a majority.',
      drop: ['pr', 'ld', 'f1', 'f2', 'isr', 'm1', 'p1', 'p2', 'k1', 'sil', 'm2', 'p3', 'k2', 'm3', 'e3', 'u0', 'u1'],
      add: [
        { t: 'box', id: 'kb', x: 15, y: 120, w: 255, h: 130, label: 'Kafka ISR', text: 'f+1 copies survive\nf failures. Latency:\nslowest ISR member.' },
        { t: 'box', id: 'rb', x: 290, y: 120, w: 255, h: 130, label: 'Raft (majority)', text: '2f+1 copies survive\nf failures. Latency:\nfastest majority.' },
      ],
    },
  ],
}
