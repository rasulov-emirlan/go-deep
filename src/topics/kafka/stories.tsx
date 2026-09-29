import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * Kafka scenes. A partition is a row of numbered cells (offsets); a consumer
 * is a reading gopher; red is the one thing each step is about.
 */

/* ───────────────────────── 1 · partitions & keys ───────────────────────── */

const ROW_Y = [110, 170, 230, 290]
const cellX = (o: number) => 220 + o * 54
const cell = (p: number, o: number, tone: Prop['tone'] = 'line', text: string = String(o)): Prop => ({
  id: `p${p}c${o}`,
  x: cellX(o),
  y: ROW_Y[p],
  w: 48,
  h: 48,
  tone,
  text: <span className="kafka-cell">{text}</span>,
})
const rowName = (p: number): Prop => ({ id: `p${p}`, x: 150, y: ROW_Y[p], w: 56, h: 48, tone: 'ink', text: <span className="kafka-cell">P{p}</span> })
const rows = (lens: number[], hot: string[] = []): Prop[] =>
  lens.flatMap((n, p) => [rowName(p), ...Array.from({ length: n }, (_, o) => cell(p, o, hot.includes(`${p}.${o}`) ? 'red' : 'line'))])
const hash = (text: string): Prop => ({ id: 'hash', x: 440, y: 40, w: 340, h: 48, tone: 'red', text: <span className="kafka-mono">{text}</span> })
const producer = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'prod', sprite: 'fairy-tale-messenger-red-letter', x: 75, y: 325, h: 115, tag: 'producer', bubble, ...extra })

export const partitionsStory: Frame[] = [
  {
    caption: 'A topic is split into partitions; each partition is an append-only log numbered by offset.',
    actors: [producer()],
    props: rows([4, 2, 3]),
  },
  {
    caption: 'The producer hashes the message key, so the same key always picks the same partition.',
    actors: [producer('key = user-7')],
    props: [...rows([4, 2, 3]), hash('hash(user-7) % 3 = 1')],
    stop: {
      edge: true,
      title: 'Go clients hash differently',
      body: (
        <p>
          Java and franz-go use murmur2. librdkafka (confluent-kafka-go) defaults to CRC32, and kafka-go’s <code>Writer</code> ignores keys entirely (round-robin) unless you set a{' '}
          <code>Balancer</code>. Mixed clients can send one key to two partitions.
        </p>
      ),
    },
  },
  {
    caption: 'It is appended at the end of P1 and gets the next offset there: 2.',
    actors: [producer('appended!')],
    props: [...rows([4, 3, 3], ['1.2']), hash('hash(user-7) % 3 = 1')],
  },
  {
    caption: 'user-7’s next event lands right behind it, so events for one key stay in order.',
    actors: [producer('user-7 again')],
    props: [...rows([4, 4, 3], ['1.2', '1.3']), hash('hash(user-7) % 3 = 1')],
    stop: {
      title: 'order is per partition only',
      body: (
        <p>
          P0 offset 3 and P1 offset 2 have no order between them; different consumers read them in parallel. Need a total order? One partition, and the throughput of one consumer.
        </p>
      ),
    },
  },
  {
    caption: 'Add a fourth partition and % 4 sends user-7 somewhere else: new events can overtake old ones.',
    actors: [producer('now P3?!', { hot: true })],
    props: [...rows([4, 4, 3, 1], ['1.2', '1.3', '3.0']), hash('hash(user-7) % 4 = 3')],
    stop: {
      edge: true,
      title: 'partition count is forever',
      body: <p>Adding partitions remaps keys, and Kafka can’t remove partitions at all. Pick the count up front, sized for the consumer parallelism you’ll need.</p>,
    },
  },
  {
    caption: 'Reading deletes nothing: a consumer only remembers the next offset it wants.',
    actors: [producer(undefined, { dim: true }), { id: 'cons', sprite: 'fairy-tale-messenger-reading', x: 700, y: 325, h: 115, tag: 'consumer', bubble: 'P1: next is 2', flip: true }],
    props: [...rows([4, 4, 3, 1], ['1.2'])],
  },
]

/* ───────────────────────── 2 · consumer groups ───────────────────────── */

const PX = [20, 190, 360, 530]
const part = (p: number, extra: Partial<Prop> = {}): Prop => ({ id: `gp${p}`, x: PX[p], y: 90, w: 150, h: 60, label: `P${p}`, ...extra })
const parts = (hot: Record<number, Partial<Prop>> = {}): Prop[] => [0, 1, 2, 3].map((p) => part(p, hot[p]))
const group: Prop = { id: 'grp', x: 10, y: 185, w: 780, h: 170, tone: 'dashed', label: 'group “billing”' }
const under = (p: number) => PX[p] + 75
const reader = (id: string, x: number, tag: string, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'fairy-tale-messenger-reading', x, y: 330, h: 100, tag, ...extra })

export const groupStory: Frame[] = [
  {
    caption: 'Consumers pull: C1 is alone in group “billing”, so it polls all four partitions.',
    actors: [reader('C1', 350, 'C1 · P0–P3', { bubble: 'all mine' })],
    props: [...parts(), group],
  },
  {
    caption: 'C2 joins. The group rebalances and splits the partitions between them.',
    actors: [reader('C1', 180, 'C1 · P0 P1'), reader('C2', 520, 'C2 · P2 P3', { bubble: 'hi!' })],
    props: [...parts(), group],
  },
  {
    caption: 'Four consumers, four partitions: each partition has exactly one owner in the group.',
    actors: [reader('C1', under(0), 'C1 · P0'), reader('C2', under(1), 'C2 · P1'), reader('C3', under(2), 'C3 · P2'), reader('C4', under(3), 'C4 · P3')],
    props: [...parts(), group],
    stop: {
      title: 'one owner per partition',
      body: (
        <p>
          A single reader per partition is what keeps per-key order. Another group reads the same logs with its own offsets, completely independently: that’s how Kafka does pub/sub.
        </p>
      ),
    },
  },
  {
    caption: 'A fifth consumer gets no partition and sits idle: parallelism caps at the partition count.',
    actors: [
      reader('C1', under(0), 'C1 · P0'),
      reader('C2', under(1), 'C2 · P1'),
      reader('C3', under(2), 'C3 · P2'),
      reader('C4', under(3), 'C4 · P3'),
      { id: 'C5', sprite: 'dandy-umbrella', x: 712, y: 330, h: 90, tag: 'C5 · idle', hot: true, bubble: 'nothing?' },
    ],
    props: [...parts(), group],
    stop: {
      edge: true,
      title: 'more consumers than partitions',
      body: <p>C5 is only a hot spare. To scale past 4 you add partitions (and remap keys). Kafka 4’s share groups (KIP-932) are the exception: queue-style, many consumers per partition, no ordering.</p>,
    },
  },
  {
    caption: 'Lag = log end offset − committed offset. C3 is slow, so P2 is 500 messages behind.',
    actors: [
      reader('C1', under(0), 'C1 · P0'),
      reader('C2', under(1), 'C2 · P1'),
      { id: 'C3', sprite: 'convict-working-hard', x: under(2), y: 330, h: 100, tag: 'C3 · P2', hot: true, bubble: 'slow DB…' },
      reader('C4', under(3), 'C4 · P3'),
      { id: 'C5', sprite: 'dandy-umbrella', x: 712, y: 330, h: 90, tag: 'C5 · idle', dim: true },
    ],
    props: [...parts({ 2: { tone: 'red', text: <span className="kafka-mono">lag 500</span> } }), group],
    stop: {
      edge: true,
      title: 'fixing lag',
      body: <p>Profile the handler first; it is usually one slow call. Then batch writes, or add partitions and consumers. Processing one partition with a worker pool is fine only if you keep per-key order yourself.</p>,
    },
  },
  {
    caption: 'C2 stops heartbeating; after the session timeout its partition moves to the spare, C5.',
    actors: [
      reader('C1', under(0), 'C1 · P0'),
      { id: 'C2', sprite: 'science-experiment-mishap', x: under(1) - 45, y: 330, h: 80, tag: 'C2 ✗', hot: true, dim: true },
      reader('C3', under(2), 'C3 · P2'),
      reader('C4', under(3), 'C4 · P3'),
      { id: 'C5', sprite: 'fairy-tale-messenger-reading', x: under(1) + 45, y: 330, h: 100, tag: 'C5 · P1', bubble: 'from committed', hot: true },
    ],
    props: [...parts({ 1: { tone: 'red' } }), group],
    stop: {
      title: 'why the next story matters',
      body: (
        <p>
          C5 resumes at P1’s last <b>committed</b> offset, not where C2 actually was. Kafka 4.0 made the new group protocol (KIP-848) GA: the broker assigns partitions incrementally, so the other consumers
          keep working during a rebalance.
        </p>
      ),
    },
  },
  {
    caption: 'Reading never deletes: messages expire after the retention time (7 days by default), read or not.',
    actors: [{ id: 'C1', sprite: 'dandy-raining', x: 350, y: 330, h: 100, tag: 'back after 8 days', hot: true, bubble: 'where’s my data?' }],
    props: [...parts({ 0: { tone: 'dashed', text: <span className="kafka-mono">expired</span> } }), group],
    stop: {
      edge: true,
      title: 'offset out of range',
      body: (
        <p>
          If the committed offset has already been deleted, <code>auto.offset.reset</code> decides where to restart. The Java client default <code>latest</code> silently skips everything in between.
        </p>
      ),
    },
  },
]

/* ───────────────────────── 3 · commit timing ───────────────────────── */

const logX = (o: number) => 40 + o * 64
const logCell = (o: number, tone: Prop['tone'] = 'line', text = `m${o}`): Prop => ({ id: `l${o}`, x: logX(o), y: 100, w: 56, h: 46, tone, text: <span className="kafka-cell">{text}</span> })
const log = (hot: Record<number, [Prop['tone'], string?]> = {}): Prop[] =>
  [0, 1, 2, 3, 4].map((o) => (hot[o] ? logCell(o, hot[o][0], hot[o][1]) : logCell(o, o < 2 ? 'soft' : 'line')))
const mark = (at: number): Prop => ({ id: 'mark', x: logX(at) - 52, y: 56, w: 160, h: 34, tone: 'ink', text: <span className="kafka-mono">committed={at}</span> })
const db: Prop = { id: 'db', x: 470, y: 100, w: 310, h: 250, label: 'Postgres · charges' }
const row = (id: string, y: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x: 490, y, w: 270, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const worker = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'fairy-tale-messenger-reading', x: 210, y: 325, h: 115, tag: 'consumer', bubble, ...extra })
const boom = (bubble = 'crash!'): Actor => ({ id: 'w', sprite: 'science-experiment-mishap', x: 210, y: 325, h: 100, tag: 'consumer ✗', hot: true, bubble })

export const commitStory: Frame[] = [
  {
    caption: 'The committed offset is the group’s bookmark: the next message to read after a restart.',
    actors: [worker('next: m2')],
    props: [...log(), mark(2), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓')],
  },
  {
    caption: 'Commit before processing: the consumer reads m2 and moves the bookmark to 3 first.',
    actors: [worker('commit 3 first')],
    props: [...log({ 2: ['red'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓')],
    stop: {
      edge: true,
      title: 'kafka-go does this for you',
      body: (
        <p>
          With a <code>GroupID</code>, <code>Reader.ReadMessage</code> commits as it returns the message. For at-least-once use <code>FetchMessage</code>, process, then <code>CommitMessages</code>.
        </p>
      ),
    },
  },
  {
    caption: 'It crashes before charging m2 in the database.',
    actors: [boom()],
    props: [...log({ 2: ['red'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓')],
  },
  {
    caption: 'The replacement resumes at 3, so m2 is never charged: at-most-once.',
    actors: [worker('resume at 3')],
    props: [...log({ 2: ['red', 'lost'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓')],
    stop: {
      title: 'auto-commit isn’t a guarantee',
      body: (
        <p>
          <code>enable.auto.commit</code> commits what <code>poll</code> returned, on a timer. Process in the poll loop and you get at-least-once; hand messages to goroutines and it can commit before they
          finish: loss.
        </p>
      ),
    },
  },
  {
    caption: 'Commit after processing, same crash spot: charge m2 first, then move the bookmark.',
    actors: [worker('charge m2')],
    props: [...log({ 2: ['red'] }), mark(2), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓'), row('r2', 240, 'm2 ✓')],
  },
  {
    caption: 'It crashes after the database write but before committing 3.',
    actors: [boom()],
    props: [...log({ 2: ['red'] }), mark(2), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓'), row('r2', 240, 'm2 ✓')],
  },
  {
    caption: 'The replacement resumes at 2 and charges m2 again: at-least-once means duplicates.',
    actors: [worker('resume at 2')],
    props: [...log({ 2: ['red'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓'), row('r2', 240, 'm2 ✓'), row('r3', 290, 'm2 ✓ again!', 'red')],
  },
  {
    caption: 'Idempotent consumer: save the message ID in the same transaction, and skip IDs already seen.',
    actors: [worker('seen m2, skip')],
    props: [...log({ 2: ['red'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓'), row('r2', 240, 'm2 ✓'), row('r3', 290, 'processed: m0 m1 m2', 'red')],
    stop: {
      title: 'same transaction, or it’s not idempotent',
      body: (
        <>
          <p>If the ID insert and the charge commit separately, a crash between them brings the duplicate back.</p>
          <Code>{`tag, _ := tx.Exec(ctx, "INSERT INTO processed(id) VALUES($1) ON CONFLICT DO NOTHING", ev.ID)
if tag.RowsAffected() == 0 { return tx.Rollback(ctx) } // seen: skip`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Kafka’s exactly-once covers Kafka-to-Kafka only; for a DB write, use at-least-once plus idempotency.',
    actors: [worker('exactly once?')],
    props: [...log({ 2: ['red'] }), mark(3), db, row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓'), row('r2', 240, 'm2 ✓'), row('r3', 290, 'processed: m0 m1 m2')],
    stop: {
      title: 'what Kafka EOS really is',
      body: (
        <p>
          The idempotent producer (on by default since 3.0) dedups retries by producer ID + sequence. Transactions write output and consumer offsets atomically, read with <code>read_committed</code>. An
          email or a Postgres row is outside that transaction.
        </p>
      ),
    },
  },
]

/* ───────────────────────── 4 · outbox ───────────────────────── */

const pg: Prop = { id: 'pg', x: 190, y: 90, w: 290, h: 190, label: 'Postgres' }
const kafka: Prop = { id: 'kf', x: 560, y: 90, w: 220, h: 190, label: 'Kafka' }
const orderRow = (tone: Prop['tone'] = 'line', text = 'orders: #42'): Prop => ({ id: 'ord', x: 205, y: 130, w: 260, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const outRow = (text = 'outbox: OrderCreated', tone: Prop['tone'] = 'line'): Prop => ({ id: 'out', x: 205, y: 180, w: 260, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const tx: Prop = { id: 'tx', x: 198, y: 122, w: 274, h: 106, tone: 'dashed', label: '' }
const ev = (id: string, y: number, text = 'event #42', tone: Prop['tone'] = 'line'): Prop => ({ id, x: 575, y, w: 190, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const svc = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'svc', sprite: 'fairy-tale-messenger-red-letter', x: 90, y: 325, h: 115, tag: 'order svc', bubble, ...extra })
const relay = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'relay', sprite: 'adventure-pushing-cart', x: 520, y: 325, h: 60, tag: 'relay', bubble, ...extra })

export const outboxStory: Frame[] = [
  {
    caption: 'The order service must save order #42 and publish OrderCreated: two different systems.',
    actors: [svc('two writes')],
    props: [pg, kafka],
  },
  {
    caption: 'The DB commit succeeds, then the publish times out: the order exists, but nobody hears about it.',
    actors: [svc('oops')],
    props: [pg, kafka, orderRow(), ev('e1', 130, '✗ timeout', 'red')],
  },
  {
    caption: 'Publish first instead, then the DB rolls back: consumers act on an order that doesn’t exist.',
    actors: [svc('oops again', { hot: true })],
    props: [pg, kafka, orderRow('red', 'rolled back'), ev('e1', 130)],
    stop: {
      title: 'no shared transaction',
      body: <p>Postgres and Kafka can’t commit together: Kafka has no two-phase commit with outside systems. Retrying in memory dies with the process. Whichever write goes second can be lost.</p>,
    },
  },
  {
    caption: 'Outbox: write the order and the event row in one DB transaction, so both commit or neither.',
    actors: [svc('one tx')],
    props: [pg, kafka, tx, orderRow(), outRow('outbox: OrderCreated', 'red')],
  },
  {
    caption: 'A relay reads unsent outbox rows (polling, or CDC tailing the WAL), publishes, then marks them sent.',
    actors: [svc(undefined, { dim: true }), relay('publish')],
    props: [pg, kafka, tx, orderRow(), outRow('outbox: sent ✓'), ev('e1', 130)],
  },
  {
    caption: 'If the relay dies after publishing but before marking the row, it publishes the row again.',
    actors: [svc(undefined, { dim: true }), relay('again?', { hot: true })],
    props: [pg, kafka, tx, orderRow(), outRow('outbox: unsent', 'red'), ev('e1', 130), ev('e2', 180, 'event #42', 'red')],
    stop: {
      title: 'outbox = at-least-once',
      body: (
        <>
          <p>Consumers still dedup by event ID. With several relay workers, lock rows so two don’t send the same one:</p>
          <Code>{`SELECT id, payload FROM outbox WHERE sent_at IS NULL
ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`}</Code>
        </>
      ),
    },
  },
]

/* ───────────────────────── 5 · durability ───────────────────────── */

const BX = [230, 450, 670]
const replica = (b: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: `rep${b}`, x: BX[b] - 80, y: 100, w: 160, h: 46, tone, text: <span className="kafka-mono">{text}</span> })
const isr = (text: string, tone: Prop['tone'] = 'none'): Prop => ({ id: 'isr', x: 250, y: 46, w: 400, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const broker = (b: number, extra: Partial<Actor> = {}): Actor => ({ id: `B${b + 1}`, sprite: 'fairy-tale-armored-knight', x: BX[b], y: 330, h: 108, tag: b === 0 ? 'B1 · leader' : `B${b + 1}`, ...extra })
const dead = (b: number): Actor => broker(b, { sprite: 'convict-hard-times', tag: `B${b + 1} ✗`, dim: true, h: 110 })
const prod = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'prod', sprite: 'fairy-tale-messenger-running', x: 75, y: 330, h: 100, tag: 'producer', bubble, ...extra })

export const durabilityStory: Frame[] = [
  {
    caption: 'Replication factor 3: the partition lives on three brokers; the leader takes writes, the followers copy it.',
    actors: [prod(), broker(0), broker(1), broker(2)],
    props: [replica(0, '40 41'), replica(1, '40 41'), replica(2, '40 41'), isr('ISR = {B1, B2, B3}')],
  },
  {
    caption: 'With acks=1 the leader acknowledges as soon as offset 42 is in its own log.',
    actors: [prod('acks=1'), broker(0, { bubble: 'ack!', hot: true }), broker(1), broker(2)],
    props: [replica(0, '40 41 42', 'red'), replica(1, '40 41'), replica(2, '40 41'), isr('ISR = {B1, B2, B3}')],
  },
  {
    caption: 'The leader dies before anyone copies 42; B2 takes over without it: an acknowledged write is gone.',
    actors: [prod('where’s 42?', { hot: true }), dead(0), broker(1, { tag: 'B2 · leader', hot: true }), broker(2)],
    props: [replica(0, '40 41 42', 'dashed'), replica(1, '40 41'), replica(2, '40 41'), isr('ISR = {B2, B3}')],
    stop: {
      title: 'durability = copies, not fsync',
      body: <p>Kafka acks from the page cache; it does not fsync each write. Messages survive a crash because other brokers hold copies, so the ack has to wait for them.</p>,
    },
  },
  {
    caption: 'acks=all: the leader acknowledges only once every in-sync replica has offset 42.',
    actors: [prod('acks=all'), broker(0, { bubble: 'all have it' }), broker(1), broker(2)],
    props: [replica(0, '40 41 42', 'red'), replica(1, '40 41 42', 'red'), replica(2, '40 41 42', 'red'), isr('ISR = {B1, B2, B3}')],
  },
  {
    caption: 'A follower that falls 30 s behind (replica.lag.time.max.ms) drops out of the ISR; acks=all waits for 2.',
    actors: [prod(), broker(0), broker(1), broker(2, { bubble: 'lagging…', dim: true })],
    props: [replica(0, '40 41 42 43'), replica(1, '40 41 42 43'), replica(2, '40', 'dashed'), isr('ISR = {B1, B2}', 'red')],
  },
  {
    caption: 'With min.insync.replicas=2 and only the leader left, acks=all writes fail with NotEnoughReplicas instead of risking loss.',
    actors: [prod('rejected!', { hot: true }), broker(0, { bubble: 'can’t ack' }), dead(1), broker(2, { dim: true })],
    props: [replica(0, '40 41 42 43'), replica(1, '40 41 42 43', 'dashed'), replica(2, '40', 'dashed'), isr('ISR = {B1}', 'red')],
    stop: {
      edge: true,
      title: 'min.insync.replicas defaults to 1',
      body: <p>With the default, acks=all can still be satisfied by the leader alone. The usual recipe: RF=3, min.insync.replicas=2, acks=all. It survives one broker loss without losing acknowledged writes and keeps accepting writes.</p>,
    },
  },
  {
    caption: 'When a leader dies, the KRaft controller quorum elects a new one from the ISR; Kafka 4 has no ZooKeeper.',
    actors: [{ id: 'ctl', sprite: 'fairy-tale-king', x: 75, y: 330, h: 110, tag: 'controller', bubble: 'B2, lead!' }, dead(0), broker(1, { tag: 'B2 · leader', hot: true }), broker(2)],
    props: [replica(0, '40 41 42', 'dashed'), replica(1, '40 41 42'), replica(2, '40 41 42'), isr('ISR = {B2, B3}')],
    stop: {
      title: 'why only from the ISR',
      body: (
        <p>
          Only an in-sync replica is guaranteed to hold every acknowledged message. With <code>unclean.leader.election.enable=false</code> (the default), Kafka stays unavailable rather than elect a stale
          replica.
        </p>
      ),
    },
  },
]
