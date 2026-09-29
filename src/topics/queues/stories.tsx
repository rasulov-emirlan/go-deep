import type { ReactNode } from 'react'
import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * Messaging scenes. A message is a box with its name; a broker is a dashed
 * frame around its messages; readers and workers are gophers under it.
 * Red is the one thing each step is about.
 */

const t = (s: string): ReactNode => <span className="queues-cell">{s}</span>
const msg = (id: string, x: number, y: number, tone: Prop['tone'] = 'line', text = id, w = 110): Prop => ({ id, x, y, w, h: 64, tone, text: t(text) })

/* ───────────────────────── 1 · log vs queue ───────────────────────── */

const MX = [210, 345, 480]
const box = (label: string): Prop => ({ id: 'box', x: 180, y: 34, w: 440, h: 124, tone: 'dashed', label })
const cells = (tones: Prop['tone'][] = ['line', 'line', 'line']) => ['m1', 'm2', 'm3'].map((m, i) => msg(m, MX[i], 70, tones[i]))
const rdA = (tag: string, extra: Partial<Actor> = {}): Actor => ({ id: 'A', sprite: 'fairy-tale-messenger-reading', x: 250, y: 330, h: 120, tag, ...extra })
const rdB = (tag: string, extra: Partial<Actor> = {}): Actor => ({ id: 'B', sprite: 'fairy-tale-messenger-reading', x: 560, y: 330, h: 120, tag, flip: true, ...extra })

export const logStory: Frame[] = [
  {
    caption: 'Kafka stores messages in a log: a list that only grows at the end.',
    actors: [rdA('A · at 0')],
    props: [box('kafka log'), ...cells()],
  },
  {
    caption: 'A reads all three. It keeps a bookmark, the offset: where it stopped.',
    actors: [rdA('A · at 3', { bubble: 'read 3' })],
    props: [box('kafka log'), ...cells(['soft', 'soft', 'soft'])],
  },
  {
    caption: 'Reading deletes nothing, so reader B starts at 0 and still gets m1.',
    actors: [rdA('A · at 3'), rdB('B · at 0', { bubble: 'm1 too!' })],
    props: [box('kafka log'), ...cells(['red', 'soft', 'soft'])],
  },
  {
    caption: 'Old messages leave by age or size, never because someone read them.',
    actors: [rdA('A · at 0', { bubble: 'again!', hot: true }), rdB('B · at 1')],
    props: [box('kafka log'), ...cells()],
    stop: {
      title: 'Replay = move the offset',
      body: <p>Set a reader’s offset back and it rereads everything still kept. By default Kafka keeps messages 7 days.</p>,
    },
  },
  {
    caption: 'A queue is different: each message goes to just one worker.',
    actors: [rdA('A', { bubble: 'got m1' }), rdB('B', { dim: true })],
    props: [box('queue'), msg('m1', 40, 250, 'red'), ...cells().slice(1)],
  },
  {
    caption: 'A acks, meaning “done”, and the queue deletes m1. B never sees it.',
    actors: [rdA('A', { bubble: 'ack!' }), rdB('B', { bubble: 'no m1', hot: true })],
    props: [box('queue'), { ...msg('m1', 40, 250), hidden: true }, ...cells().slice(1)],
  },
]

/* ───────────────────────── 2 · SQS ───────────────────────── */

const queue: Prop = { id: 'q', x: 40, y: 34, w: 300, h: 124, tone: 'dashed', label: 'sqs queue' }
const dlq: Prop = { id: 'dlq', x: 40, y: 196, w: 300, h: 120, tone: 'dashed', label: 'dead-letter queue' }
const inQ = (id: string, i: number, tone: Prop['tone'] = 'line') => msg(id, 65 + i * 140, 70, tone)
const held = (id: string, x: number, text = id) => msg(id, x - 75, 60, 'dashed', text, 150)
const wA = (extra: Partial<Actor> = {}): Actor => ({ id: 'A', sprite: 'convict-working-hard', x: 480, y: 330, h: 120, tag: 'worker A', ...extra })
const wB = (extra: Partial<Actor> = {}): Actor => ({ id: 'B', sprite: 'fairy-tale-messenger-reading', x: 680, y: 330, h: 120, tag: 'worker B', flip: true, ...extra })
const crashed = (extra: Partial<Actor> = {}): Actor => wA({ sprite: 'science-experiment-mishap', tag: 'A ✗', hot: true, ...extra })

export const sqsStory: Frame[] = [
  {
    caption: 'A receives m1. SQS hides it from others: the visibility timeout, 30s default.',
    actors: [wA({ bubble: 'mine' }), wB()],
    props: [queue, held('m1', 480, 'm1 hidden'), inQ('m2', 1)],
  },
  {
    caption: 'A finishes and deletes m1. In SQS, deleting is the ack.',
    actors: [wA({ bubble: 'delete' }), wB()],
    props: [queue, { ...held('m1', 480), hidden: true }, inQ('m2', 1)],
  },
  {
    caption: 'A takes m2, then crashes before deleting it.',
    actors: [crashed({ bubble: 'crash!' }), wB()],
    props: [queue, held('m2', 480, 'm2 hidden')],
  },
  {
    caption: 'The timeout ends, m2 becomes visible again, and B gets it.',
    actors: [crashed({ dim: true }), wB({ bubble: 'm2 again' })],
    props: [queue, { ...held('m2', 680, 'm2'), tone: 'red' }],
    stop: {
      title: 'Twice is normal',
      body: (
        <p>
          Standard queues deliver at least once, in best-effort order. Make handlers idempotent, and set the timeout above your slowest job.
        </p>
      ),
    },
  },
  {
    caption: 'After too many failed tries, a redrive policy parks m2 in a dead-letter queue.',
    actors: [wA(), wB({ bubble: 'fails again' })],
    props: [queue, dlq, msg('m2', 135, 230, 'red')],
  },
  {
    caption: 'FIFO queues keep order per message group. u7’s second message waits.',
    actors: [wA({ bubble: 'u7 #1' }), wB({ bubble: 'u9 #1' })],
    props: [{ ...queue, label: 'fifo queue' }, msg('u7b', 65, 70, 'red', 'u7 #2', 120)],
    stop: {
      title: 'FIFO has limits',
      body: (
        <p>
          It drops a repeat send with the same dedup ID for 5 minutes. Without high-throughput mode: 300 calls/s per action, or 3,000 messages/s in batches of 10.
        </p>
      ),
    },
  },
]

/* ───────────────────────── 3 · Pub/Sub ───────────────────────── */

const topic = (text?: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'topic', x: 150, y: 110, w: 170, h: 100, label: 'topic', tone, text: text && t(text) })
const sub = (id: string, y: number, label: string, text?: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x: 400, y, w: 190, h: 100, label, tone, text: text && t(text) })
const email = (text?: string, tone?: Prop['tone']) => sub('s1', 20, 'sub: email', text, tone)
const stats = (text?: string, tone?: Prop['tone']) => sub('s2', 200, 'sub: stats', text, tone)
const pub = (extra: Partial<Actor> = {}): Actor => ({ id: 'pub', sprite: 'fairy-tale-messenger-red-letter', x: 70, y: 330, h: 120, tag: 'publisher', ...extra })
const eW = (extra: Partial<Actor> = {}): Actor => ({ id: 'e', sprite: 'fairy-tale-messenger-reading', x: 700, y: 140, h: 110, tag: 'email', flip: true, ...extra })
const sW = (extra: Partial<Actor> = {}): Actor => ({ id: 'st', sprite: 'superhero-standing', x: 700, y: 330, h: 110, tag: 'stats', flip: true, ...extra })

export const pubsubStory: Frame[] = [
  {
    caption: 'In Pub/Sub you publish to a topic. Readers attach through subscriptions.',
    actors: [pub({ bubble: 'order #42' }), eW(), sW()],
    props: [topic('m1', 'red'), email(), stats()],
  },
  {
    caption: 'Each subscription gets its own copy of m1: that is fan-out.',
    actors: [pub(), eW(), sW()],
    props: [topic('m1'), email('m1', 'red'), stats('m1', 'red')],
  },
  {
    caption: 'Pull: the worker asks for messages. Push: Pub/Sub POSTs them to your URL.',
    actors: [pub({ dim: true }), eW({ bubble: 'any new?' }), sW({ bubble: 'POST /push' })],
    props: [topic('m1'), email('m1'), stats('m1')],
  },
  {
    caption: 'No ack before the ack deadline, 10s by default? Pub/Sub sends it again.',
    actors: [pub({ dim: true }), eW({ bubble: 'too slow', hot: true }), sW()],
    props: [topic('m1'), email('m1 again', 'red'), stats()],
    stop: {
      title: 'Exactly-once, with limits',
      body: <p>Only pull subscriptions, for subscribers in the same region. Publish retries can still duplicate, so dedupe anyway.</p>,
    },
  },
  {
    caption: 'Still failing after 5 tries, the default? A dead-letter topic takes it.',
    actors: [pub({ dim: true }), eW({ dim: true }), sW()],
    props: [topic('m1'), { ...email('m1 → DLT', 'red'), label: 'sub: email' }, stats()],
  },
  {
    caption: 'An ordering key keeps one customer’s messages in order, if the subscription enables it.',
    actors: [pub({ bubble: 'key u7' }), eW({ bubble: 'u7 in order' }), sW()],
    props: [topic('u7: 1, 2'), email('u7: 1, 2', 'red'), stats()],
    stop: {
      title: 'Ordering has a cost',
      body: <p>Publish each key from one region, at up to 1 MB/s per key. One redelivery resends every later message for that key.</p>,
    },
  },
]

/* ───────────────────────── 4 · how to choose ───────────────────────── */

const pick = (hot?: 'k' | 's' | 'p' | 'f'): Prop[] => [
  { id: 'k', x: 360, y: 30, w: 190, h: 70, tone: hot === 'k' ? 'red' : 'line', text: t('Kafka') },
  { id: 's', x: 360, y: 125, w: 190, h: 70, tone: hot === 's' ? 'red' : 'line', text: t('SQS') },
  { id: 'p', x: 360, y: 220, w: 190, h: 70, tone: hot === 'p' ? 'red' : 'line', text: t('Pub/Sub') },
  { id: 'f', x: 590, y: 125, w: 180, h: 70, tone: 'red', text: t('link to S3'), hidden: hot !== 'f' },
]
const thinker = (bubble: string): Actor => ({ id: 'me', sprite: 'science-lightbulb', x: 170, y: 330, h: 140, tag: 'you', bubble })

export const chooseStory: Frame[] = [
  {
    caption: 'Need to reread old events, or add a reader later? Use a log: Kafka.',
    actors: [thinker('replay?')],
    props: pick('k'),
  },
  {
    caption: 'Just jobs for a pool of workers? A managed queue like SQS is enough.',
    actors: [thinker('just jobs?')],
    props: pick('s'),
  },
  {
    caption: 'Several services each need every event? Pub/Sub subscriptions, or one Kafka group each.',
    actors: [thinker('everyone?')],
    props: pick('p'),
  },
  {
    caption: 'Big files? Store them in S3 or Cloud Storage and send a link.',
    actors: [thinker('big file?')],
    props: pick('f'),
    stop: {
      title: 'Size limits',
      body: (
        <>
          <p>SQS takes up to 1 MiB (it was 256 KiB until 2025). Pub/Sub takes 10 MB.</p>
          <Code>{`{"order": 42,
 "pdf": "s3://bills/42.pdf"}`}</Code>
        </>
      ),
    },
  },
]
