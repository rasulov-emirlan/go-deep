import { Code } from '../../components/Code'
import type { BoxEl, El, FlowDef, LaneEl, MsgEl, TextEl } from '../../components/flow'

/* helpers: ids of lanes double as message endpoints */
const lane = (id: string, x: number, text: string, len: number, o: Partial<LaneEl> = {}): El => ({ t: 'lane', id, x, y: 8, len, text, ...o })
const msg = (id: string, from: string, to: string, y: number, text: string, o: Partial<MsgEl> = {}): El => ({ t: 'msg', id, from, to, y, y2: y + 14, text, ...o })
const box = (id: string, x: number, y: number, w: number, h: number, o: Partial<BoxEl> = {}): El => ({ t: 'box', id, x, y, w, h, ...o })
const text = (id: string, x: number, y: number, s: string, o: Partial<TextEl> = {}): El => ({ t: 'text', id, x, y, text: s, ...o })

/* ---------- 01 · two-phase commit ---------- */
// lanes: Shard A 90 · Coordinator 280 · Shard B 470
export const twoPC: FlowDef = {
  h: 440,
  steps: [
    {
      caption: 'Move $10 from shard A to shard B: both or neither. Phase 1, prepare: the coordinator asks each shard to do the work but not commit yet.',
      add: [lane('a', 90, 'Shard A', 430), lane('c', 280, 'Coordinator', 430), lane('b', 470, 'Shard B', 430), box('ask', 150, 52, 260, 28, { text: 'client: move $10 A → B', tone: 'soft' }), msg('p1', 'c', 'a', 104, 'PREPARE'), msg('p2', 'c', 'b', 104, 'PREPARE')],
    },
    {
      caption: 'Each shard force-writes a prepare record to its log, keeps its row locks, and votes YES. A YES is a promise not to abort on its own.',
      add: [
        box('pa', 44, 130, 92, 46, { text: 'prepared', sub: 'locks held' }),
        box('pb', 424, 130, 92, 46, { text: 'prepared', sub: 'locks held' }),
        msg('y1', 'a', 'c', 190, 'YES'),
        msg('y2', 'b', 'c', 190, 'YES'),
      ],
    },
    {
      caption: 'All votes are YES, so the coordinator force-writes COMMIT to its own log. That write is the commit point: the decision now exists.',
      add: [box('cc', 226, 214, 108, 44, { text: 'COMMIT', sub: 'commit point', tone: 'red' })],
    },
    {
      caption: 'Phase 2: COMMIT goes out. Each shard applies the change, releases its locks and acknowledges.',
      add: [msg('k1', 'c', 'a', 272, 'COMMIT'), msg('k2', 'c', 'b', 272, 'COMMIT')],
      set: {
        cc: { tone: 'ink' },
        pa: { text: 'committed', sub: 'locks freed', tone: 'grey' },
        pb: { text: 'committed', sub: 'locks freed', tone: 'grey' },
      },
    },
    {
      caption: 'Replay: the coordinator dies after collecting the YES votes, before writing COMMIT. Both shards are in doubt, still holding their locks.',
      drop: ['cc', 'k1', 'k2', 'ask'],
      set: {
        c: { dead: true },
        pa: { text: 'in doubt', sub: 'locks held', tone: 'red' },
        pb: { text: 'in doubt', sub: 'locks held', tone: 'red' },
      },
      stop: {
        title: 'Coordinator dies after prepare',
        edge: true,
        body: (
          <>
            A shard that voted YES can neither commit nor abort alone, so it waits with its locks, possibly for hours. If the crash came after COMMIT was logged, recovery re-sends COMMIT, so a repeat must be a no-op.
          </>
        ),
      },
    },
    {
      caption: 'Why they cannot decide: committing is wrong if the outcome was ABORT, aborting is wrong if it was COMMIT. Asking a peer helps only if it already heard.',
      drop: ['p1', 'p2', 'y1', 'y2'],
      add: [
        text('t1', 90, 204, "can't commit,\ncan't abort", { tone: 'red' }),
        text('t2', 470, 204, "can't commit,\ncan't abort", { tone: 'red' }),
        msg('q', 'a', 'b', 290, 'you know?', { dashed: true, y2: 290 }),
      ],
    },
    {
      caption: 'The fix: keep the coordinator log on a consensus group (Paxos). If the leader dies, a new leader reads the log and finishes COMMIT.',
      drop: ['t1', 't2', 'q'],
      add: [box('px', 190, 372, 180, 52, { text: 'log on 3 replicas', sub: 'Paxos', tone: 'red' }), msg('k3', 'c', 'a', 316, 'COMMIT', { tone: 'red' }), msg('k4', 'c', 'b', 316, 'COMMIT', { tone: 'red' })],
      set: {
        c: { dead: false, text: 'New leader' },
        pa: { text: 'committed', sub: 'locks freed', tone: 'grey' },
        pb: { text: 'committed', sub: 'locks freed', tone: 'grey' },
      },
      stop: {
        title: 'How does Spanner avoid it?',
        body: <>Spanner runs 2PC over Paxos groups: prepare records and the decision are replicated, so a crashed coordinator means a re-election, not stuck locks. The price is extra latency.</>,
      },
    },
  ],
}

/* ---------- 02 · saga, orchestrated ---------- */
// lanes: Orch 70 · Stock 200 · Pay 340 · Ship 480
export const sagaOrch: FlowDef = {
  h: 430,
  steps: [
    {
      caption: 'A saga splits one business action into local transactions, each with an undo. An orchestrator, a state machine saved in a DB, gives the orders.',
      add: [
        lane('o', 70, 'Orch', 400, { sub: 'PENDING', w: 110 }),
        lane('s', 200, 'Stock', 400, { sub: 'has undo' }),
        lane('p', 340, 'Pay', 400, { sub: 'has undo' }),
        lane('sh', 480, 'Ship', 400, { sub: 'pivot' }),
      ],
    },
    {
      caption: 'T1: reserve stock. It commits at once, for real. Its undo, C1, is release.',
      add: [msg('m1', 'o', 's', 84, 'reserve'), msg('r1', 's', 'o', 112, 'ok')],
      set: { o: { sub: 'RESERVED' } },
    },
    {
      caption: 'T2: charge the card. Also committed for real; its undo, C2, is refund.',
      add: [msg('m2', 'o', 'p', 150, 'charge'), msg('r2', 'p', 'o', 178, 'ok')],
      set: { o: { sub: 'PAID' } },
    },
    {
      caption: 'T3: ship fails. There is no rollback across services: T1 and T2 stay committed, so the orchestrator must undo them itself.',
      add: [msg('m3', 'o', 'sh', 216, 'ship'), msg('r3', 'sh', 'o', 244, 'FAILED', { tone: 'red' })],
      set: { o: { sub: 'FAILED' } },
    },
    {
      caption: 'Undo in reverse order, latest first: refund the card.',
      add: [msg('m4', 'o', 'p', 282, 'refund', { tone: 'red' }), msg('r4', 'p', 'o', 310, 'ok')],
      set: { r3: { tone: 'ink' }, o: { sub: 'UNDO' } },
      stop: {
        title: 'Compensation is not rollback',
        edge: true,
        body: (
          <>
            A refund is a new forward transaction: the charge, its fee and the receipt already happened. Undos must be idempotent and retried until they succeed; a saga stuck undoing needs an alert.
          </>
        ),
      },
    },
    {
      caption: 'Release the stock, mark the order CANCELLED. Ship was the pivot, the go/no-go step: steps after a pivot have no undo, so they are retried.',
      add: [msg('m5', 'o', 's', 342, 'release', { tone: 'red' }), msg('r5', 's', 'o', 370, 'ok'), text('pv', 280, 412, 'after the pivot: retry, never undo', { tone: 'red' })],
      set: { m4: { tone: 'ink' }, o: { sub: 'CANCELLED' }, sh: { tone: 'red' } },
    },
  ],
}

/* ---------- 02 · saga, choreographed ---------- */
export const sagaChoreo: FlowDef = {
  h: 360,
  steps: [
    {
      caption: 'Choreography has no boss: a service commits its local step, publishes an event, and whoever listens reacts.',
      add: [lane('o', 90, 'Order', 340, { sub: 'PENDING', w: 100 }), lane('s', 280, 'Stock', 340), lane('p', 470, 'Pay', 340), msg('e1', 'o', 's', 84, 'OrderPlaced', { y2: 98 })],
    },
    {
      caption: 'Stock reserves and publishes StockReserved, which Pay listens for.',
      add: [msg('e2', 's', 'p', 140, 'StockReserved')],
    },
    {
      caption: 'The card is declined. Pay publishes PayFailed; Stock listens for it and releases its reservation.',
      add: [msg('e3', 'p', 's', 196, 'PayFailed', { tone: 'red' })],
      set: { p: { tone: 'red' }, e2: { tone: 'ink' } },
    },
    {
      caption: 'Stock announces the release and Order cancels itself. No boss, but the flow lives only in who listens to whom: hard to follow past three or four steps.',
      add: [msg('e4', 's', 'o', 252, 'StockReleased', { tone: 'red' })],
      set: { e3: { tone: 'ink' }, o: { sub: 'CANCELLED' } },
    },
  ],
}

/* ---------- 03 · cancel overtakes create ---------- */
// lanes: Orch 90 · Stock 470
export const cancelFirst: FlowDef = {
  h: 400,
  steps: [
    {
      caption: 'The orchestrator sends reserve #42. The network is slow and it is still in flight when the orchestrator’s timeout fires.',
      add: [lane('o', 90, 'Orch', 370), lane('s', 470, 'Stock', 370), { t: 'msg', id: 'rv', x1: 90, y: 90, x2: 470, y2: 230, dashed: true }, text('rvt', 178, 100, 'reserve #42')],
    },
    {
      caption: 'A timeout means unknown outcome, so it sends the undo: cancel #42. That one takes a faster path and overtakes the reserve.',
      add: [{ t: 'msg', id: 'cx', x1: 90, y: 140, x2: 470, y2: 190, tone: 'red' }, text('cxt', 400, 156, 'cancel #42', { tone: 'red' })],
    },
    {
      caption: 'Stock has no reservation #42 to cancel. A naive handler ignores the cancel.',
      add: [box('bx', 400, 250, 150, 46, { text: 'no #42: ignore', tone: 'grey' })],
    },
    {
      caption: 'Then the late reserve lands and succeeds. Stock is now held for an order that is already cancelled, and nothing will release it.',
      set: { rv: { dashed: false }, bx: { text: 'reserved #42', sub: 'never released', tone: 'red' }, cx: { tone: 'ink' }, cxt: { tone: 'grey' } },
    },
    {
      caption: 'The fix: a cancel for an unknown id records a tombstone. The late reserve finds it and is refused.',
      add: [msg('rf', 's', 'o', 330, 'refused', { tone: 'red', y2: 344 })],
      set: { bx: { text: 'tombstone #42', sub: 'reserve refused', tone: 'ink' } },
      stop: {
        title: 'Cancel arrives before create',
        edge: true,
        body: <>Undos must tolerate arriving before the action they undo. The same race exists when parallel branches finish in any order.</>,
      },
    },
  ],
}

/* ---------- 03 · saga has no isolation ---------- */
// lanes: Saga 90 · Stock DB 280 · Other req 470
export const sagaIsolation: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'A saga keeps atomicity through undos but has no isolation. T1 commits at once, so everyone can see qty 4 while the order is still pending.',
      add: [
        lane('s', 90, 'Saga', 320),
        lane('d', 280, 'Stock DB', 320),
        lane('u', 470, 'Other req', 320),
        box('row', 226, 52, 108, 46, { text: 'qty 4', sub: 'stock row', tone: 'red' }),
        msg('t1', 's', 'd', 130, 'T1 qty-1'),
      ],
    },
    {
      caption: 'Another request reads 4 and acts on it.',
      add: [msg('rd', 'u', 'd', 176, 'read qty'), msg('rr', 'd', 'u', 204, '4', { tone: 'red' })],
      set: { t1: { tone: 'grey' } },
    },
    {
      caption: 'Then the saga fails and undoes T1. That read was dirty: 4 never really existed.',
      add: [msg('c1', 's', 'd', 254, 'C1 qty=5', { tone: 'red' })],
      set: { row: { text: 'qty 5', tone: 'ink' }, rr: { tone: 'ink' } },
      stop: {
        title: 'Undo can clobber updates',
        edge: true,
        body: <>If C1 sets qty to 5 after another order changed it, that change is lost. Prefer commutative updates: +1 and −1, not set.</>,
      },
    },
    {
      caption: 'Replay with a semantic lock: T1 also flags the row PENDING. Other requests see the flag and wait, fail or skip instead of trusting the number.',
      drop: ['t1', 'rd', 'rr', 'c1'],
      add: [msg('rd2', 'u', 'd', 150, 'read qty'), msg('rr2', 'd', 'u', 178, 'PENDING', { tone: 'red' })],
      set: { row: { text: 'qty 4', sub: 'PENDING', tone: 'red' } },
    },
  ],
}

/* ---------- 04 · outbox ---------- */
// lanes: App+DB 90 · Relay 280 · Kafka 470
export const outbox: FlowDef = {
  h: 440,
  steps: [
    {
      caption: 'Naive dual write: commit the order to the DB, then publish an event to Kafka. Two writes to two systems; nothing makes them atomic.',
      add: [lane('a', 90, 'App+DB', 430, { w: 100 }), lane('r', 280, 'Relay', 430), lane('k', 470, 'Kafka', 430), box('ord', 26, 72, 128, 44, { text: 'order 42', sub: 'committed' })],
    },
    {
      caption: 'A crash between them loses the event: the order exists, nobody hears. Publish first instead and you can announce an order that never committed.',
      add: [msg('lost', 'a', 'k', 200, 'publish', { lost: true, tone: 'red', y2: 200 })],
    },
    {
      caption: 'The fix: write the event as a row in an outbox table, in the same local transaction as the order. One commit: both rows exist or neither.',
      drop: ['lost'],
      add: [box('txn', 16, 52, 148, 130, { label: 'one local txn', tone: 'red', z: -1 }), box('ob', 26, 124, 128, 44, { text: 'outbox', sub: 'row #10 unsent' })],
    },
    {
      caption: 'A relay process reads unsent rows and publishes them to Kafka, by polling or by tailing the DB log (CDC).',
      add: [msg('rd', 'r', 'a', 206, 'read #10'), msg('pub', 'r', 'k', 250, 'publish #10')],
    },
    {
      caption: 'The relay crashes after publishing but before marking the row sent. The row still looks unsent.',
      add: [msg('mk', 'r', 'a', 296, 'mark sent', { lost: true, tone: 'red', y2: 296 })],
      set: { r: { dead: true }, ob: { sub: 'still unsent', tone: 'red' } },
    },
    {
      caption: 'After restart the relay publishes #10 again. Kafka now holds the event twice.',
      add: [msg('pub2', 'r', 'k', 340, 'publish #10', { tone: 'red' }), box('tp', 400, 384, 140, 44, { text: 'topic', sub: '#10  #10', tone: 'red' })],
      set: { r: { dead: false }, mk: { tone: 'ink' } },
      stop: {
        title: 'Outbox is exactly-once, right?',
        edge: true,
        body: <>No. The relay can publish and crash before marking, so the event may arrive twice. Outbox gives at-least-once; consumers must dedupe.</>,
      },
    },
  ],
}

/* ---------- 04 · inbox / idempotent consumer ---------- */
// lanes: Kafka 280 · Consumer 470
export const inbox: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Kafka delivery is at-least-once, so the consumer may see event #10 twice. The first copy arrives.',
      add: [lane('k', 280, 'Kafka', 320), lane('c', 470, 'Consumer', 320), msg('e1', 'k', 'c', 84, 'evt #10')],
    },
    {
      caption: 'In one DB transaction the consumer inserts the event id into an inbox table and applies the effect. A new id means both commit.',
      add: [box('in', 400, 130, 150, 50, { text: 'inbox #10', sub: 'effect applied' })],
    },
    {
      caption: 'The duplicate hits the unique id. The insert changes 0 rows, so the consumer skips the effect and commits.',
      add: [msg('e2', 'k', 'c', 210, 'evt #10', { tone: 'red' })],
      set: { in: { text: 'seen #10', sub: 'skip, no effect' } },
      stop: {
        title: 'Same transaction, stable id',
        body: (
          <>
            Key on the producer’s event id, not a broker offset that can change after a republish.
            <Code>{`BEGIN;
INSERT INTO inbox(msg_id) VALUES ($1)
  ON CONFLICT DO NOTHING;
-- 0 rows: COMMIT, skip the effect
-- 1 row: apply the effect, COMMIT`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Do not apply the effect and record the id in separate transactions: a crash between them loses the effect or doubles it.',
      drop: ['e2', 'in'],
      add: [box('ef', 380, 130, 130, 44, { text: 'effect', sub: 'txn 1' }), box('ib', 380, 210, 130, 44, { text: 'inbox row', sub: 'txn 2' }), text('cr', 350, 196, 'crash ✕', { tone: 'red', anchor: 'end' })],
    },
  ],
}

/* ---------- 04 · polling relay can skip a row ---------- */
// lanes: Txn A 70 · Txn B 200 · Outbox 340 · Relay 480
export const pollSkip: FlowDef = {
  h: 380,
  steps: [
    {
      caption: 'A polling relay reads `WHERE id > last`. Two open transactions each insert an outbox row: A gets id 10, B gets id 11.',
      add: [
        lane('a', 70, 'Txn A', 370),
        lane('b', 200, 'Txn B', 370),
        lane('o', 340, 'Outbox', 370),
        lane('r', 480, 'Relay', 370),
        box('ba', 22, 56, 96, 44, { text: 'id 10', sub: 'open', dashed: true }),
        box('bb', 152, 56, 96, 44, { text: 'id 11', sub: 'open', dashed: true }),
      ],
    },
    {
      caption: 'B commits first. Ids are handed out at insert time, not commit time, so row 11 is visible while row 10 is not.',
      add: [msg('cb', 'b', 'o', 120, 'commit 11')],
      set: { bb: { dashed: false, sub: 'committed' } },
    },
    {
      caption: 'The relay polls, sees only row 11, publishes it, and remembers last = 11.',
      add: [msg('q1', 'r', 'o', 170, 'id > 9'), msg('q1r', 'o', 'r', 198, 'row 11'), box('lst', 432, 226, 96, 40, { text: 'last = 11', tone: 'red' })],
    },
    {
      caption: 'A commits row 10 late. The next poll asks for id > 11, so row 10 is skipped for good.',
      add: [msg('ca', 'a', 'o', 288, 'commit 10'), msg('q2', 'r', 'o', 330, 'id > 11', { tone: 'red' })],
      set: { ba: { dashed: false, sub: 'skipped', tone: 'red' }, q1r: { tone: 'grey' } },
      stop: {
        title: 'Polling by id can skip rows',
        edge: true,
        body: <>Caveat, our own reasoning rather than a vendor doc: read only ids below the oldest open transaction, or tail the DB log (CDC), which keeps commit order.</>,
      },
    },
  ],
}

/* ---------- 05 · idempotency key ---------- */
// lanes: Client 70 · API 200 · DB 340 · PSP 480
export const idempotency: FlowDef = {
  h: 430,
  steps: [
    {
      caption: 'The client sends the same key K1 on every retry of one action. The API claims it with a unique row: key, request hash, in_progress.',
      add: [
        lane('cl', 70, 'Client', 420),
        lane('ap', 200, 'API', 420),
        lane('db', 340, 'DB', 420),
        lane('ps', 480, 'PSP', 420),
        msg('m1', 'cl', 'ap', 70, 'POST key K1'),
        msg('m2', 'ap', 'db', 100, 'claim K1'),
        box('kr', 292, 130, 96, 44, { text: 'K1', sub: 'in_progress' }),
      ],
    },
    {
      caption: 'It charges the PSP with a key derived from K1, because a PSP cannot join our DB transaction. The PSP replies ok.',
      add: [msg('m3', 'ap', 'ps', 196, 'charge K1'), msg('m4', 'ps', 'ap', 224, 'ok')],
    },
    {
      caption: 'The result is saved in the same DB transaction as the business write, and K1 becomes done. Then the response to the client is lost.',
      add: [msg('m5', 'ap', 'db', 262, 'save+done'), msg('m6', 'ap', 'cl', 318, 'ok 200', { lost: true, tone: 'red', y2: 318 })],
      set: { kr: { sub: 'done: 200', tone: 'red' } },
    },
    {
      caption: 'The client retries K1. The API finds it done and returns the stored response. No second charge.',
      drop: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
      add: [msg('n1', 'cl', 'ap', 70, 'POST key K1'), msg('n2', 'ap', 'db', 100, 'lookup K1'), msg('n3', 'ap', 'cl', 190, 'stored 200', { tone: 'red' }), text('nc', 480, 214, 'no 2nd charge', { tone: 'red' })],
      set: { kr: { tone: 'ink' } },
      stop: {
        title: 'Result and effect, one txn',
        edge: true,
        body: <>If the key row is saved in a different transaction from the effect, a crash between them repeats the charge or leaves K1 stuck in progress.</>,
      },
    },
    {
      caption: 'Variant: the client retries while the first request still runs. The row says in_progress, so the API answers 409 instead of running twice.',
      drop: ['n1', 'n2', 'n3', 'nc'],
      add: [msg('v1', 'cl', 'ap', 70, 'POST key K1'), msg('v2', 'ap', 'cl', 116, '409 busy', { tone: 'red' })],
      set: { kr: { sub: 'in_progress', tone: 'red' } },
      stop: {
        title: 'Worker crashed in progress',
        edge: true,
        body: <>A crashed worker leaves in_progress forever. Store a lease time on the row so an expired key can be resumed from its last recorded step.</>,
      },
    },
    {
      caption: 'Variant: same key K1 but a different request hash. Reject with 422; never return the old result for a different request.',
      drop: ['v1', 'v2'],
      add: [msg('w1', 'cl', 'ap', 70, 'POST K1 (new)'), msg('w2', 'ap', 'cl', 116, '422 mismatch', { tone: 'red' })],
      set: { kr: { sub: 'done: 200', tone: 'ink' } },
      stop: {
        title: 'Same key, different body?',
        edge: true,
        body: <>Compare the stored hash and reject. Keep keys longer than any client retry or queue redelivery, or an old retry repeats the effect.</>,
      },
    },
  ],
}

/* ---------- 05 · what Kafka exactly-once covers ---------- */
export const kafkaEos: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Idempotent producer: the broker tracks a producer id and per-partition sequence numbers and drops a resend it already has. One producer session, one partition.',
      add: [
        box('in', 10, 110, 110, 50, { text: 'input', sub: 'topic' }),
        box('ap', 225, 110, 110, 50, { text: 'your app' }),
        box('out', 440, 110, 110, 50, { text: 'output', sub: 'topic' }),
        { t: 'line', id: 'l1', x1: 120, y1: 135, x2: 225, y2: 135, arrow: true },
        { t: 'line', id: 'l2', x1: 335, y1: 135, x2: 440, y2: 135, arrow: true },
      ],
    },
    {
      caption: 'A Kafka transaction writes the output and the consumer offset atomically. A transactional id and epoch fence out a zombie, an old instance still running.',
      add: [
        box('tx', 430, 92, 128, 172, { label: 'one Kafka txn', tone: 'red', z: -1 }),
        box('off', 440, 200, 110, 50, { text: 'offsets' }),
        { t: 'line', id: 'l3', x1: 320, y1: 160, x2: 445, y2: 205, arrow: true },
      ],
    },
    {
      caption: 'Anything outside the box is not covered: a DB write, an HTTP call, an email. Consumers also see aborted records unless they use `read_committed`.',
      add: [
        box('db', 10, 250, 110, 50, { text: 'your DB', tone: 'red' }),
        box('ps', 225, 250, 110, 50, { text: 'PSP / email', tone: 'red' }),
        { t: 'line', id: 'l4', x1: 250, y1: 160, x2: 90, y2: 250, arrow: true, tone: 'red', dashed: true },
        { t: 'line', id: 'l5', x1: 280, y1: 160, x2: 280, y2: 250, arrow: true, tone: 'red', dashed: true },
      ],
      stop: {
        title: 'Does Kafka EOS cover my DB?',
        edge: true,
        body: <>No. Kafka’s exactly-once is about state and output inside one Kafka cluster. Outside effects need at-least-once delivery plus dedupe.</>,
      },
    },
    {
      caption: 'For outside effects, pair retries with an inbox, an idempotency key, and the outbox for events you emit.',
      set: { l4: { tone: 'ink', dashed: false }, l5: { tone: 'ink', dashed: false }, db: { tone: 'ink' }, ps: { tone: 'ink' } },
      add: [text('n1', 65, 322, 'inbox + outbox', { size: 14 }), text('n2', 280, 322, 'idempotency key', { size: 14 })],
    },
  ],
}
