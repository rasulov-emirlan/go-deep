import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * Kafka scenes. A partition is a row of numbered cells (offsets); a consumer
 * is a reading gopher; red is the one thing each step is about.
 */

/* ───────────────────────── 1 · partitions & keys ───────────────────────── */

const ROW_Y = [96, 162, 228, 294]
const cellX = (o: number) => 290 + o * 80
const cell = (p: number, o: number, tone: Prop['tone'] = 'line'): Prop => ({
  id: `p${p}c${o}`,
  x: cellX(o),
  y: ROW_Y[p],
  w: 70,
  h: 56,
  tone,
  text: <span className="kafka-cell">{o}</span>,
})
const rowName = (p: number): Prop => ({ id: `p${p}`, x: 200, y: ROW_Y[p], w: 70, h: 56, tone: 'ink', text: <span className="kafka-cell">P{p}</span> })
const rows = (lens: number[], hot: string[] = []): Prop[] =>
  lens.flatMap((n, p) => [rowName(p), ...Array.from({ length: n }, (_, o) => cell(p, o, hot.includes(`${p}.${o}`) ? 'red' : 'line'))])
const hash = (text: string): Prop => ({ id: 'hash', x: 560, y: 24, w: 220, h: 56, tone: 'red', text: <span className="kafka-mono">{text}</span> })
const producer = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'prod', sprite: 'fairy-tale-messenger-red-letter', x: 75, y: 325, h: 115, tag: 'producer', bubble, ...extra })

export const partitionsStory: Frame[] = [
  {
    caption: 'A topic is split into partitions: logs that only grow at the end.',
    actors: [producer()],
    props: rows([4, 2, 3]),
  },
  {
    caption: 'The producer hashes the message key to pick a partition.',
    actors: [producer('key user-7')],
    props: [...rows([4, 2, 3]), hash('user-7 → P1')],
  },
  {
    caption: 'It lands at the end of P1. Its offset, the position number, is 2.',
    actors: [producer('appended!')],
    props: [...rows([4, 3, 3], ['1.2']), hash('user-7 → P1')],
  },
  {
    caption: 'Same key, same partition, so user-7’s events stay in order.',
    actors: [producer('user-7 again')],
    props: [...rows([4, 4, 3], ['1.2', '1.3']), hash('user-7 → P1')],
    stop: {
      title: 'Order is per partition',
      body: <p>Messages in different partitions have no order between them. Need one global order? Use one partition, and accept one reader.</p>,
    },
  },
  {
    caption: 'Adding a partition moves keys, so user-7’s new events can overtake old ones.',
    actors: [producer('now P3?!', { hot: true })],
    props: [...rows([4, 4, 3, 1], ['1.2', '1.3', '3.0']), hash('user-7 → P3')],
  },
]

/* ───────────────────────── 2 · consumer groups ───────────────────────── */

const PX = [120, 450]
const part = (p: number, extra: Partial<Prop> = {}): Prop => ({ id: `gp${p}`, x: PX[p], y: 90, w: 230, h: 60, label: `P${p}`, ...extra })
const parts = (hot: Record<number, Partial<Prop>> = {}): Prop[] => [0, 1].map((p) => part(p, hot[p]))
const group: Prop = { id: 'grp', x: 20, y: 185, w: 760, h: 170, tone: 'dashed', label: 'group' }
const under = (p: number) => PX[p] + 115
const reader = (id: string, x: number, tag: string, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'fairy-tale-messenger-reading', x, y: 330, h: 100, tag, ...extra })
const idle: Actor = { id: 'C3', sprite: 'dandy-umbrella', x: 710, y: 330, h: 90, tag: 'C3 idle', hot: true, bubble: 'nothing?' }

export const groupStory: Frame[] = [
  {
    caption: 'A consumer group is a team of readers. Alone, C1 reads both partitions.',
    actors: [reader('C1', 400, 'C1', { bubble: 'all mine' })],
    props: [...parts(), group],
  },
  {
    caption: 'C2 joins. The group rebalances: it splits the partitions between them.',
    actors: [reader('C1', under(0), 'C1 · P0'), reader('C2', under(1), 'C2 · P1', { bubble: 'hi!' })],
    props: [...parts(), group],
  },
  {
    caption: 'A third reader gets no partition and sits idle.',
    actors: [reader('C1', under(0), 'C1 · P0'), reader('C2', under(1), 'C2 · P1'), idle],
    props: [...parts(), group],
    stop: {
      title: 'Partitions cap parallelism',
      body: <p>In a group, each partition has one reader, which keeps per-key order. To scale past that, add partitions, which moves keys.</p>,
    },
  },
  {
    caption: 'Lag: messages written but not yet processed. Slow C2 is 500 behind.',
    actors: [
      reader('C1', under(0), 'C1 · P0'),
      { id: 'C2', sprite: 'convict-working-hard', x: under(1), y: 330, h: 100, tag: 'C2 · P1', hot: true, bubble: 'slow DB…' },
      { ...idle, hot: false, bubble: undefined, dim: true },
    ],
    props: [...parts({ 1: { tone: 'red', text: <span className="kafka-mono">lag 500</span> } }), group],
    stop: {
      title: 'Fixing lag',
      body: <p>Find the slow call first; it is usually one. Then batch the work, or add partitions and readers.</p>,
    },
  },
]

/* ───────────────────────── 3 · commit timing ───────────────────────── */

const logX = (o: number) => 30 + o * 84
const logCell = (o: number, tone: Prop['tone'] = 'line', text = `m${o}`): Prop => ({ id: `l${o}`, x: logX(o), y: 100, w: 76, h: 56, tone, text: <span className="kafka-cell">{text}</span> })
const log = (hot: Record<number, [Prop['tone'], string?]> = {}): Prop[] =>
  [0, 1, 2, 3, 4].map((o) => (hot[o] ? logCell(o, hot[o][0], hot[o][1]) : logCell(o, o < 2 ? 'soft' : 'line')))
const mark = (at: number): Prop => ({ id: 'mark', x: logX(at) - 32, y: 50, w: 140, h: 40, tone: 'ink', text: <span className="kafka-mono">bookmark {at}</span> })
const db: Prop = { id: 'db', x: 470, y: 100, w: 310, h: 250, label: 'charges' }
const row = (id: string, y: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x: 490, y, w: 270, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const worker = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'fairy-tale-messenger-reading', x: 210, y: 325, h: 115, tag: 'consumer', bubble, ...extra })
const boom = (bubble = 'crash!'): Actor => ({ id: 'w', sprite: 'science-experiment-mishap', x: 210, y: 325, h: 100, tag: 'consumer ✗', hot: true, bubble })
const done = [row('r0', 140, 'm0 ✓'), row('r1', 190, 'm1 ✓')]

export const commitStory: Frame[] = [
  {
    caption: 'The committed offset is a bookmark: where a restarted consumer starts reading.',
    actors: [worker('next: m2')],
    props: [...log(), mark(2), db, ...done],
  },
  {
    caption: 'Commit first: the consumer moves the bookmark to 3, then starts m2.',
    actors: [worker('commit 3')],
    props: [...log({ 2: ['red'] }), mark(3), db, ...done],
  },
  {
    caption: 'It crashes mid-m2 and restarts at 3, so m2 is lost: at-most-once.',
    actors: [boom()],
    props: [...log({ 2: ['red', 'lost'] }), mark(3), db, ...done],
  },
  {
    caption: 'Commit after: save m2 first, then move the bookmark.',
    actors: [worker('charge m2')],
    props: [...log({ 2: ['red'] }), mark(2), db, ...done, row('r2', 240, 'm2 ✓')],
  },
  {
    caption: 'It crashes before committing and restarts at 2, so m2 runs twice: at-least-once.',
    actors: [boom('crash!')],
    props: [...log({ 2: ['red'] }), mark(2), db, ...done, row('r2', 240, 'm2 ✓'), row('r3', 290, 'm2 again!', 'red')],
  },
  {
    caption: 'The fix is an idempotent consumer: handling a message twice changes nothing.',
    actors: [worker('seen m2')],
    props: [...log({ 2: ['red'] }), mark(3), db, ...done, row('r2', 240, 'm2 ✓'), row('r3', 290, 'm2 skipped', 'red')],
    stop: {
      title: 'Same transaction, always',
      body: (
        <>
          <p>Save the message ID in the same transaction as the charge, and skip IDs already saved.</p>
          <Code>{`// same tx as the charge
res, _ := tx.Exec(insertSeen, ev.ID)
n, _ := res.RowsAffected()
if n == 0 {
    return tx.Rollback() // seen: skip
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Kafka’s exactly-once covers Kafka-to-Kafka only. For a database, add dedup.',
    actors: [worker('exactly once?')],
    props: [...log({ 2: ['red'] }), mark(3), db, ...done, row('r2', 240, 'm2 ✓'), row('r3', 290, 'm2 skipped')],
    stop: {
      title: 'Exactly-once has limits',
      body: <p>Kafka transactions commit topic writes and offsets together. A Postgres row or an email is outside that transaction.</p>,
    },
  },
]

/* ───────────────────────── 4 · outbox ───────────────────────── */

const pg: Prop = { id: 'pg', x: 190, y: 90, w: 290, h: 150, label: 'Postgres' }
const kafka: Prop = { id: 'kf', x: 560, y: 90, w: 220, h: 150, label: 'Kafka' }
const orderRow = (tone: Prop['tone'] = 'line', text = 'order #42'): Prop => ({ id: 'ord', x: 205, y: 130, w: 260, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const outRow = (text = 'outbox row', tone: Prop['tone'] = 'line'): Prop => ({ id: 'out', x: 205, y: 180, w: 260, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const ev = (id: string, y: number, text = 'event #42', tone: Prop['tone'] = 'line'): Prop => ({ id, x: 575, y, w: 190, h: 40, tone, text: <span className="kafka-mono">{text}</span> })
const svc = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'svc', sprite: 'fairy-tale-messenger-red-letter', x: 90, y: 325, h: 115, tag: 'order svc', bubble, ...extra })
const relay = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'relay', sprite: 'adventure-pushing-cart', x: 520, y: 345, h: 75, tag: 'relay', bubble, ...extra })

export const outboxStory: Frame[] = [
  {
    caption: 'The order service must save order #42 and publish an event: two systems.',
    actors: [svc('two writes')],
    props: [pg, kafka],
  },
  {
    caption: 'The database save works, then the publish fails. Nobody hears about the order.',
    actors: [svc('oops')],
    props: [pg, kafka, orderRow(), ev('e1', 130, '✗ timeout', 'red')],
  },
  {
    caption: 'Publish first, and the save may roll back: consumers see a fake order.',
    actors: [svc('oops again', { hot: true })],
    props: [pg, kafka, orderRow('red', 'rolled back'), ev('e1', 130)],
  },
  {
    caption: 'Outbox: save the order and an event row in one database transaction.',
    actors: [svc('one tx')],
    props: [pg, kafka, orderRow(), outRow('outbox row', 'red')],
  },
  {
    caption: 'A relay reads unsent rows, publishes them, then marks them sent.',
    actors: [relay('publish')],
    props: [pg, kafka, outRow('sent ✓'), ev('e1', 130)],
  },
  {
    caption: 'If the relay dies before marking a row, it sends that row again.',
    actors: [relay('again?', { hot: true })],
    props: [pg, kafka, outRow('not sent', 'red'), ev('e1', 130), ev('e2', 180, 'event #42', 'red')],
    stop: {
      title: 'Outbox is at-least-once',
      body: (
        <>
          <p>Consumers still dedup by event ID; several relays lock rows like this:</p>
          <Code>{`SELECT id, payload FROM outbox
WHERE sent_at IS NULL
ORDER BY id LIMIT 100
FOR UPDATE SKIP LOCKED`}</Code>
        </>
      ),
    },
  },
]
