import { Code } from '../../components/Code'
import type { El, FlowDef, Tone } from '../../components/flow'

/* ---------- small helpers ---------- */
const lane = (id: string, x: number, text: string, len: number, sub?: string): El => ({ t: 'lane', id, x, y: 10, len, text, sub })
const dot = (id: string, x: number, y: number, tone: Tone = 'ink'): El => ({ t: 'path', id, d: `M${x - 5},${y} a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0`, tone, fill: true })
const label = (id: string, x: number, y: number, text: string, tone: Tone = 'ink'): El => ({ t: 'text', id, x, y, text, tone })
const axis = (): El[] => [
  { t: 'line', id: 'axis', x1: 40, y1: 222, x2: 540, y2: 222, arrow: true, tone: 'grey' },
  { t: 'text', id: 'axl', x: 540, y: 243, text: 'real time', anchor: 'end', tone: 'grey' },
]

/* ---------- 01 · the ladder of models ---------- */
const row = (id: string, x: number, y: number, w: number, text: string, sub: string, tone: Tone = 'red'): El => ({ t: 'box', id, x, y, w, h: 44, text, sub, tone })
const down = (id: string, x: number, y: number): El => ({ t: 'line', id, x1: x, y1: y + 44, x2: x, y2: y + 62, arrow: true, tone: 'grey' })

export const ladder: FlowDef = {
  h: 364,
  steps: [
    {
      caption: 'Strongest at the top. Strict serializable: transactions act as if run one at a time, in an order that respects real time.',
      add: [row('r0', 130, 6, 300, 'strict serializable', 'many objects + real time')],
    },
    {
      caption: 'It has two halves. Linearizable: one object, real-time order. Serializable: many objects, any serial order, the clock ignored.',
      set: { r0: { tone: 'ink' } },
      add: [
        down('a1', 150, 6),
        down('a2', 410, 6),
        row('r1a', 20, 68, 250, 'linearizable', 'one object · real time'),
        row('r1b', 290, 68, 250, 'serializable', 'many objects · any order'),
      ],
    },
    {
      caption: 'Sequential: everyone sees one order that keeps each client’s own order, but ignores the clock.',
      set: { r1a: { tone: 'ink' }, r1b: { tone: 'ink' } },
      add: [down('a3', 150, 68), down('a4', 410, 68), row('r2', 130, 130, 300, 'sequential', 'client order, no clock')],
    },
    {
      caption: 'Causal: if a happened before b, everyone sees a first; unrelated writes may differ. Below it, per-client session guarantees.',
      set: { r2: { tone: 'ink' } },
      add: [
        down('a5', 280, 130),
        row('r3', 130, 192, 300, 'causal', 'cause before effect'),
        down('a6', 280, 192),
        row('r4', 130, 254, 300, 'PRAM · sessions', 'own writes, monotonic reads'),
      ],
    },
    {
      caption: 'Eventual is a real promise: with no new writes, replicas converge. It says nothing about reads before that.',
      set: { r3: { tone: 'ink' }, r4: { tone: 'ink' } },
      add: [down('a7', 280, 254), row('r5', 130, 316, 300, 'eventual', 'converges when writes stop')],
      stop: {
        title: 'Where availability ends',
        edge: true,
        body: (
          <>
            Jepsen’s map: sequential and stronger cannot stay fully available under partitions; read-your-writes and up are at best “sticky” available. Convergence needs a conflict rule: last-write-wins, or CRDTs.
          </>
        ),
      },
    },
  ],
}

/* ---------- 01 · linearizable vs sequential ---------- */
export const linVsSeq: FlowDef = {
  h: 252,
  steps: [
    {
      caption: 'One register `x`, starting at 0. Every operation is an interval, from the client’s call to the reply.',
      add: [...axis(), label('la', 22, 53, 'A'), { t: 'box', id: 'wr', x: 60, y: 30, w: 150, h: 36, text: 'write 1' }],
    },
    {
      caption: 'A read that overlaps the write may return 0 or 1. Pick one point inside each interval (dots): write, then read → 1. Legal.',
      add: [label('lb', 22, 113, 'B'), { t: 'box', id: 'rd1', x: 150, y: 90, w: 150, h: 36, text: 'read → 1' }, dot('d1', 130, 30), dot('d2', 225, 90)],
    },
    {
      caption: 'A read that starts after the write finished, yet returns 0. No points fit: not linearizable. Real time says the write came first.',
      drop: ['rd1', 'd1', 'd2'],
      add: [
        { t: 'box', id: 'rd0', x: 270, y: 90, w: 150, h: 36, text: 'read → 0', tone: 'red' },
        { t: 'line', id: 'rt', x1: 210, y1: 48, x2: 270, y2: 108, arrow: true, tone: 'red' },
        label('mst', 345, 80, 'must see it', 'red'),
      ],
    },
    {
      caption: 'Order the read before the write anyway. Each client’s own order holds, so it is sequentially consistent, just not linearizable.',
      add: [
        label('lo', 30, 183, 'order'),
        { t: 'box', id: 's1', x: 80, y: 160, w: 130, h: 36, text: 'read → 0', tone: 'soft', dashed: true },
        { t: 'box', id: 's2', x: 250, y: 160, w: 130, h: 36, text: 'write 1', tone: 'soft', dashed: true },
        { t: 'line', id: 'so', x1: 210, y1: 178, x2: 250, y2: 178, arrow: true, tone: 'grey' },
      ],
      stop: {
        title: 'Only the clock differs',
        edge: true,
        body: 'Sequential consistency drops the real-time edge. A finished write can stay invisible to another client’s later read. Linearizable puts the edge back.',
      },
    },
  ],
}

/* ---------- 01 · serializable vs strict ---------- */
export const serVsStrict: FlowDef = {
  h: 252,
  steps: [
    {
      caption: 'Transaction T1 writes two objects, x and y, and commits.',
      add: [...axis(), label('l1', 22, 53, 'T1'), { t: 'box', id: 't1', x: 50, y: 30, w: 160, h: 36, text: 'w x=1 y=1' }],
    },
    {
      caption: 'T2 starts after T1 committed, and still reads the old x and y.',
      add: [label('l2', 22, 113, 'T2'), { t: 'box', id: 't2', x: 270, y: 90, w: 160, h: 36, text: 'r x=0 y=0' }],
    },
    {
      caption: 'Serializable only needs some serial order. T2 then T1 explains everything, with no torn reads. Legal.',
      add: [
        label('lo', 30, 183, 'order'),
        { t: 'box', id: 's1', x: 80, y: 160, w: 100, h: 36, text: 'T2', tone: 'soft', dashed: true },
        { t: 'box', id: 's2', x: 220, y: 160, w: 100, h: 36, text: 'T1', tone: 'soft', dashed: true },
        { t: 'line', id: 'so', x1: 180, y1: 178, x2: 220, y2: 178, arrow: true, tone: 'grey' },
      ],
    },
    {
      caption: 'Strict serializable adds real time: T2 began after T1 committed, so it must see T1. This history is banned. etcd’s KV operations promise this.',
      set: { t2: { tone: 'red' }, s1: { tone: 'red' }, s2: { tone: 'red' } },
      add: [{ t: 'line', id: 'rt', x1: 210, y1: 48, x2: 270, y2: 108, arrow: true, tone: 'red' }, label('t1f', 345, 80, 'T1 came first', 'red'), label('nos', 450, 183, 'not strict', 'red')],
      stop: {
        title: 'Two words, two axes',
        edge: true,
        body: 'Serializable: many objects, no real time. Linearizable: one object, real time. Both together is strict serializable. Jepsen calls the replica side “consistency” and the transaction side “isolation”; Postgres READ COMMITTED or SERIALIZABLE are isolation levels.',
      },
    },
  ],
}

/* ---------- 02 · replica lag ---------- */
const L4 = (len: number): El[] => [lane('cl', 70, 'Client', len), lane('pr', 210, 'Primary', len, 'x=1'), lane('r1', 350, 'R1', len, 'x=1'), lane('r2', 490, 'R2', len, 'x=1')]

export const replicaLag: FlowDef = {
  h: 345,
  steps: [
    {
      caption: 'Client writes x=2 to the primary. Replicas copy it asynchronously: R1 is nearly current, R2 lags (say two seconds).',
      add: [...L4(330), { t: 'msg', id: 'w', from: 'cl', to: 'pr', y: 80, text: 'write x=2' }],
      set: {},
    },
    {
      caption: 'R1 applies x=2 quickly. The copy headed for R2 is still in flight (dashed), so R2 still holds x=1.',
      set: { pr: { sub: 'x=2' }, r1: { sub: 'x=2' } },
      add: [
        { t: 'msg', id: 'c1', from: 'pr', to: 'r1', y: 100, y2: 118, text: 'x=2' },
        { t: 'msg', id: 'c2', from: 'pr', to: 'r2', y: 100, y2: 300, dashed: true },
      ],
    },
    {
      caption: 'The client reads through R1 and gets x=2. So far so good.',
      drop: ['c1'],
      add: [
        { t: 'msg', id: 'q1', from: 'cl', to: 'r1', y: 150, text: 'read x' },
        { t: 'msg', id: 'a1', from: 'r1', to: 'cl', y: 172, text: 'x=2' },
      ],
    },
    {
      caption: 'The load balancer sends the next read to R2, which answers x=1. The client saw x=2, then x=1: time went backwards.',
      add: [
        { t: 'msg', id: 'q2', from: 'cl', to: 'r2', y: 215, text: 'read x' },
        { t: 'msg', id: 'a2', from: 'r2', to: 'cl', y: 240, text: 'x=1', tone: 'red' },
      ],
      stop: {
        title: 'Two guarantees broke',
        edge: true,
        body: 'Read-your-writes (its own write is missing) and monotonic reads (older than what it already saw). Each replica is eventually consistent; the pair, behind a load balancer, is not enough.',
      },
    },
    {
      caption: 'Fix 1: sticky sessions. Pin a client to one replica so its reads never go back. Pinned to lagging R2, it could still miss its own write.',
      drop: ['w', 'c2', 'q1', 'a1', 'q2', 'a2'],
      add: [
        { t: 'msg', id: 's1', from: 'cl', to: 'r1', y: 100, text: 'read x' },
        { t: 'msg', id: 's2', from: 'r1', to: 'cl', y: 125, text: 'x=2' },
        { t: 'msg', id: 's3', from: 'cl', to: 'r1', y: 175, text: 'read x' },
        { t: 'msg', id: 's4', from: 'r1', to: 'cl', y: 200, text: 'x=2' },
      ],
    },
    {
      caption: 'Fix 2: version token. The write returns a log position (LSN); the replica waits until it has replayed that far, then answers.',
      drop: ['s1', 's2', 's3', 's4'],
      set: { r2: { sub: 'x=2' } },
      add: [
        { t: 'msg', id: 'k1', from: 'cl', to: 'r2', y: 100, text: 'read, lsn≥7' },
        { t: 'msg', id: 'k2', from: 'pr', to: 'r2', y: 125, y2: 155, text: 'x=2' },
        { t: 'msg', id: 'k3', from: 'r2', to: 'cl', y: 190, text: 'x=2', tone: 'red' },
      ],
      stop: {
        title: 'Tokens, by system',
        edge: true,
        body: (
          <>
            <p>Postgres: carry the WAL position. MongoDB causal sessions carry a cluster time, and give all four session guarantees only with majority reads and writes. Or read the primary right after writing.</p>
            <Code>{`-- primary, after commit
SELECT pg_current_wal_lsn();
-- standby: replay must reach it
SELECT pg_last_wal_replay_lsn();`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 02 · Postgres commit modes ---------- */
export const commitModes: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Client commits on the primary. The write-ahead log (WAL), Postgres’s change record, streams to the synchronous standby.',
      add: [lane('cl', 70, 'Client', 315), lane('pr', 280, 'Primary', 315), lane('st', 490, 'Standby', 315), { t: 'msg', id: 'cm', from: 'cl', to: 'pr', y: 75, text: 'COMMIT' }, { t: 'msg', id: 'wal', from: 'pr', to: 'st', y: 95, y2: 135, text: 'WAL' }],
    },
    {
      caption: '`synchronous_commit=on` with a sync standby: OK returns once the standby has flushed the WAL to disk, not yet replayed it.',
      add: [
        { t: 'msg', id: 'fl', from: 'st', to: 'pr', y: 145, y2: 170, text: 'flushed' },
        { t: 'msg', id: 'ok1', from: 'pr', to: 'cl', y: 172, y2: 195, text: 'ok', tone: 'red' },
      ],
    },
    {
      caption: 'The client reads the standby right after OK. The row has not been replayed yet, so it is missing.',
      add: [
        { t: 'msg', id: 'rd', from: 'cl', to: 'st', y: 225, text: 'read row' },
        { t: 'msg', id: 'rr', from: 'st', to: 'cl', y: 250, text: 'no row', tone: 'red' },
      ],
      stop: {
        title: 'Acked is not visible',
        edge: true,
        body: 'Flushed is durable, not applied. A standby read after OK can miss the row. Async standbys, and different standbys, can also disagree with each other.',
      },
    },
    {
      caption: '`remote_apply` waits for the standby to replay the change. A standby read now sees the row: causal reads in simple cases, at higher commit latency.',
      drop: ['fl', 'ok1', 'rd', 'rr'],
      add: [
        label('rp', 490, 152, 'replayed'),
        { t: 'msg', id: 'ap', from: 'st', to: 'pr', y: 178, y2: 203, text: 'applied' },
        { t: 'msg', id: 'ok2', from: 'pr', to: 'cl', y: 205, y2: 228, text: 'ok', tone: 'red' },
        { t: 'msg', id: 'rd2', from: 'cl', to: 'st', y: 255, text: 'read row' },
        { t: 'msg', id: 'rr2', from: 'st', to: 'cl', y: 280, text: 'row ✓' },
      ],
    },
  ],
}

/* ---------- 02 · causal ---------- */
export const causal: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Ann posts a question. It reaches Bob fast and Cy slowly (dashed = still in flight).',
      add: [
        lane('an', 70, 'Ann', 315),
        lane('bo', 280, 'Bob', 315),
        lane('cy', 490, 'Cy', 315),
        { t: 'msg', id: 'p1', from: 'an', to: 'bo', y: 80, y2: 100, text: 'post Q' },
        { t: 'msg', id: 'p2', from: 'an', to: 'cy', y: 80, y2: 285, dashed: true },
      ],
    },
    {
      caption: 'Bob reads the question, then replies. The reply happened after the post, so the post is its cause. It reaches Cy first.',
      add: [{ t: 'msg', id: 'rp', from: 'bo', to: 'cy', y: 135, y2: 165, text: 'reply', tone: 'red' }],
    },
    {
      caption: 'Cy sees an answer to a question that has not arrived: effect before cause. Causal consistency forbids this.',
      add: [label('sc', 490, 215, 'reply, but\nno question', 'red')],
    },
    {
      caption: 'Causal delivery: hold the reply until its cause arrives, then show both in order.',
      drop: ['sc'],
      add: [label('hd', 490, 215, 'hold reply,\ndeliver Q first')],
      stop: {
        title: 'Only causal links order',
        edge: true,
        body: 'Two independent writes have no causal link. Different replicas may show them in different orders, and that is allowed.',
      },
    },
  ],
}

/* ---------- 03 · CAP ---------- */
const cut = 'M280,58 L272,110 L288,160 L272,210 L288,260 L280,322'

export const capScene: FlowDef = {
  h: 345,
  steps: [
    {
      caption: 'Two replicas hold v0. Client 1 talks to G1, client 2 to G2. CAP’s C means one linearizable register, not ACID’s consistency.',
      add: [lane('c1', 60, 'C1', 325), lane('g1', 200, 'G1', 325, 'v0'), lane('g2', 360, 'G2', 325, 'v0'), lane('c2', 500, 'C2', 325)],
    },
    {
      caption: 'Healthy: G1 copies v1 to G2, waits for the ack, then says OK. Both hold v1.',
      set: { g1: { sub: 'v1' }, g2: { sub: 'v1' } },
      add: [
        { t: 'msg', id: 'w1', from: 'c1', to: 'g1', y: 85, text: 'write v1' },
        { t: 'msg', id: 'rp', from: 'g1', to: 'g2', y: 105, y2: 125, text: 'copy v1' },
        { t: 'msg', id: 'ak', from: 'g2', to: 'g1', y: 135, y2: 155, text: 'ack' },
        { t: 'msg', id: 'ok', from: 'g1', to: 'c1', y: 165, y2: 185, text: 'ok' },
      ],
    },
    {
      caption: 'The link between G1 and G2 is cut. Both nodes stay up and both still get client requests. That is P, the partition.',
      drop: ['w1', 'rp', 'ak', 'ok'],
      add: [{ t: 'path', id: 'cut', d: cut, tone: 'red', dashed: true }, label('cuttx', 280, 338, 'partition', 'red')],
    },
    {
      caption: 'Client 1 writes v2 to G1. The copy to G2 is lost (✕). G1 has v2; G2 still has v1.',
      set: { g1: { sub: 'v2' } },
      add: [
        { t: 'msg', id: 'w2', from: 'c1', to: 'g1', y: 90, text: 'write v2' },
        { t: 'msg', id: 'rp2', from: 'g1', to: 'g2', y: 112, y2: 132, text: 'copy v2', lost: true },
      ],
    },
    {
      caption: 'Client 2 reads G2, which cannot know about v2. Answer v1: stale, so not consistent. Refuse or wait: not available. It cannot do both.',
      add: [
        { t: 'msg', id: 'rd', from: 'c2', to: 'g2', y: 190, text: 'read' },
        { t: 'msg', id: 'ra', from: 'g2', to: 'c2', y: 218, text: 'v1 stale', tone: 'red' },
        { t: 'msg', id: 'rb', from: 'g2', to: 'c2', y: 270, text: 'error', tone: 'grey', dashed: true },
      ],
    },
    {
      caption: 'Pick per request. AP answers stale; CP refuses. “CA” is not on the menu, because partitions happen.',
      set: { ra: { text: 'AP: v1 stale' }, rb: { text: 'CP: error' } },
      stop: {
        title: 'What A and C mean',
        edge: true,
        body: 'A: every non-failing node must eventually answer, even on the small side. C: linearizability of one register. Real systems mix guarantees per operation, so “CP” or “AP” labels are coarse.',
      },
    },
  ],
}

/* ---------- 03 · Raft split ---------- */
const node = (id: string, x: number, text: string, sub?: string): El => ({ t: 'node', id, x, y: 90, text, sub })
const part = 'M335,44 L327,90 L343,140 L327,190 L343,240 L335,292'

export const raftSplit: FlowDef = {
  h: 322,
  steps: [
    {
      caption: 'Five Raft nodes, leader n4 (L). A write commits once a majority, 3 of 5, has it.',
      add: [node('n1', 60, 'n1'), node('n2', 170, 'n2'), node('n3', 280, 'n3'), node('n4', 390, 'n4', 'L'), node('n5', 500, 'n5')],
    },
    {
      caption: 'The network splits 3 | 2. n4, the old leader, is on the small side and has not noticed yet.',
      add: [{ t: 'path', id: 'sp', d: part, tone: 'red', dashed: true }, label('pt', 335, 25, 'partition', 'red'), label('mj', 170, 42, 'majority 3'), label('mn', 445, 42, 'minority 2')],
    },
    {
      caption: 'The majority elects a new leader, n2, and keeps serving. The minority cannot reach a majority, so it cannot commit.',
      set: { n2: { sub: 'L', tone: 'red' } },
      add: [label('sv', 170, 190, 'serves'), label('stk', 445, 190, 'cannot commit', 'red')],
      stop: {
        title: 'Up, yet not CAP-available',
        edge: true,
        body: 'Minority-side nodes refuse, so by CAP’s strict definition the system is unavailable. Most clients still get answers from the majority side.',
      },
    },
    {
      caption: 'n4 may answer from local state and miss writes n2 committed. A safe read confirms leadership with a quorum, or holds a lease.',
      drop: ['stk'],
      add: [
        { t: 'box', id: 'cli', x: 400, y: 240, w: 90, h: 36, text: 'client' },
        { t: 'line', id: 'rq', x1: 430, y1: 240, x2: 396, y2: 117, arrow: true, tone: 'red', text: 'read x' },
        label('old', 445, 300, 'old leader answers v1', 'red'),
      ],
      stop: {
        title: 'The stale leader',
        edge: true,
        body: (
          <>
            <p>etcd’s default Get goes through Raft (ReadIndex), so it is linearizable. The serializable option skips that and may be stale.</p>
            <Code>{`cli.Get(ctx, "k")
cli.Get(ctx, "k",
  clientv3.WithSerializable())`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 03 · PACELC ---------- */
export const pacelc: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'No partition at all. The client writes to A; B is a second replica far away. Even now, replication forces a choice.',
      add: [lane('cl', 70, 'Client', 315), lane('a', 280, 'A', 315, 'near'), lane('b', 490, 'B', 315, 'far'), { t: 'msg', id: 'w', from: 'cl', to: 'a', y: 80, text: 'write' }],
    },
    {
      caption: 'Choice 1: wait for B’s ack before replying. The copies agree, but every write pays the long round trip.',
      add: [
        { t: 'msg', id: 'rp', from: 'a', to: 'b', y: 100, y2: 170, text: 'replicate' },
        { t: 'msg', id: 'ak', from: 'b', to: 'a', y: 175, y2: 245, text: 'ack' },
        { t: 'msg', id: 'ok', from: 'a', to: 'cl', y: 250, y2: 270, text: 'ok', tone: 'red' },
      ],
    },
    {
      caption: 'Choice 2: reply at once, copy later; B may serve the old value. Cassandra always sends writes to all replicas; the level only sets acks awaited.',
      drop: ['rp', 'ak', 'ok'],
      add: [
        { t: 'msg', id: 'ok2', from: 'a', to: 'cl', y: 100, y2: 118, text: 'ok', tone: 'red' },
        { t: 'msg', id: 'rp2', from: 'a', to: 'b', y: 125, y2: 245, dashed: true, text: 'replicate' },
        { t: 'msg', id: 'rd', from: 'cl', to: 'b', y: 205, text: 'read' },
        { t: 'msg', id: 'ra', from: 'b', to: 'cl', y: 230, text: 'old', tone: 'red' },
      ],
    },
    {
      caption: 'Abadi’s PACELC: if Partition, choose A or C; Else, choose Latency or C. CAP says nothing about the else. Real systems tune it per request.',
      drop: ['cl', 'a', 'b', 'w', 'ok2', 'rp2', 'rd', 'ra'],
      add: [
        { t: 'box', id: 'pp', x: 20, y: 20, w: 250, h: 60, label: 'IF PARTITION', text: 'A or C' },
        { t: 'box', id: 'ee', x: 290, y: 20, w: 250, h: 60, label: 'ELSE', text: 'Latency or C' },
        { t: 'box', id: 'x1', x: 20, y: 110, w: 520, h: 52, text: 'PA/EL', sub: 'Dynamo · Cassandra · SimpleDB' },
        { t: 'box', id: 'x2', x: 20, y: 176, w: 520, h: 52, text: 'PC/EL', sub: 'PNUTS' },
        { t: 'box', id: 'x3', x: 20, y: 242, w: 520, h: 56, text: 'per request', sub: 'DynamoDB ConsistentRead · Cassandra level', tone: 'red' },
      ],
    },
  ],
}

/* ---------- 04 · quorums ---------- */
const QL = (): El[] => [lane('wr', 60, 'Writer', 205), lane('q1', 200, 'R1', 205, 'v1'), lane('q2', 340, 'R2', 205, 'v1'), lane('q3', 480, 'R3', 205, 'v1')]

export const quorum: FlowDef = {
  h: 342,
  steps: [
    {
      caption: 'Three replicas, all v1. Write to 2 (W=2), read from 2 (R=2). W + R > N, so any read set overlaps any finished write set.',
      add: [...QL(), label('nwr', 280, 226, 'N=3 · W=2 · R=2')],
    },
    {
      caption: 'A write of v2 is in progress. Only R1 has it so far: one of the two acks the writer needs. The write has not finished.',
      set: { q1: { sub: 'v2' } },
      add: [
        { t: 'msg', id: 'v1', from: 'wr', to: 'q1', y: 75, y2: 95, text: 'v2' },
        { t: 'msg', id: 'v2', from: 'wr', to: 'q2', y: 80, y2: 200, dashed: true },
        { t: 'msg', id: 'v3', from: 'wr', to: 'q3', y: 80, y2: 200, dashed: true },
      ],
    },
    {
      caption: 'Reader X asks R1 and R3, sees v2 and v1, and returns the newer one: v2.',
      add: [{ t: 'box', id: 'bx', x: 10, y: 246, w: 540, h: 36, text: 'X reads R1,R3: v2,v1 → v2' }],
    },
    {
      caption: 'Later, Y asks R2 and R3 and gets v1. After a read already returned v2, time went backwards: not linearizable.',
      add: [{ t: 'box', id: 'by', x: 10, y: 292, w: 540, h: 36, text: 'Y reads R2,R3: v1,v1 → v1', tone: 'red' }],
      stop: {
        title: 'Overlap is not enough',
        edge: true,
        body: 'Sloppy quorums, last-write-wins with clock skew and concurrent writes break it too. Cassandra QUORUM writes plus QUORUM reads are still not linearizable.',
      },
    },
    {
      caption: 'Only consensus fixes it. Cassandra LWT runs Paxos. MongoDB `majority` reads can still lag; `linearizable` confirms with a majority.',
      drop: ['bx', 'by'],
      add: [
        { t: 'box', id: 'f1', x: 10, y: 244, w: 540, h: 42, text: 'Cassandra LWT (SERIAL)', sub: 'Paxos, ~4 round trips: linearizable CAS' },
        { t: 'box', id: 'f2', x: 10, y: 294, w: 540, h: 42, text: 'Mongo linearizable read', sub: 'one document, primary only, set maxTimeMS' },
      ],
    },
  ],
}

/* ---------- 04 · testing ---------- */
export const nemesis: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Concurrent clients run reads and writes against a real cluster. Every operation is recorded.',
      add: [
        lane('cl', 70, 'Clients', 185),
        lane('cu', 240, 'Cluster', 185),
        { t: 'msg', id: 'm1', from: 'cl', to: 'cu', y: 80, text: 'write 7' },
        { t: 'msg', id: 'm2', from: 'cu', to: 'cl', y: 102, text: 'ok' },
        { t: 'msg', id: 'm3', from: 'cl', to: 'cu', y: 132, text: 'read' },
        { t: 'msg', id: 'm4', from: 'cu', to: 'cl', y: 154, text: '7' },
      ],
    },
    {
      caption: 'Each op is logged as invoke, then ok, fail or info. `info` means the outcome is unknown, usually a timeout.',
      add: [{ t: 'box', id: 'hs', x: 10, y: 205, w: 310, h: 92, label: 'HISTORY', text: 'w7 invoke · ok\nr invoke · ok → 7' }],
    },
    {
      caption: 'A nemesis injects faults: partitions, kills, clock skew. A write times out. Did it happen? The log can only say `info`.',
      drop: ['m1', 'm2', 'm3', 'm4'],
      set: { hs: { text: 'w7 invoke · ok\nr invoke · ok → 7\nw8 invoke · info' } },
      add: [
        lane('ne', 400, 'Nemesis', 185),
        { t: 'msg', id: 'n1', from: 'ne', to: 'cu', y: 80, text: 'cut link', tone: 'red' },
        { t: 'msg', id: 'n2', from: 'cl', to: 'cu', y: 132, text: 'write 8', lost: true },
      ],
      stop: {
        title: 'Timed out is not failed',
        edge: true,
        body: 'A write that timed out may have taken effect, so the checker must allow both outcomes. Real code needs idempotency keys or fencing tokens.',
      },
    },
    {
      caption: 'The checker searches for one legal order, consistent with real time, that explains every result. That is NP-complete in general, so histories stay short.',
      drop: ['n1', 'n2'],
      add: [
        lane('ck', 510, 'Checker', 320),
        { t: 'msg', id: 'hk', x1: 320, x2: 510, y: 250, text: 'history' },
        { t: 'box', id: 'vd', x: 340, y: 282, w: 200, h: 50, text: 'legal order?', sub: 'no → minimal witness' },
      ],
    },
  ],
}
