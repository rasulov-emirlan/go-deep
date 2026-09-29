import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ---------- 1. cache-aside + stampede ---------- */

const RUN = 'fairy-tale-messenger-running'
const cache = (text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'cache', x: 250, y: 200, w: 200, h: 140, tone, label: 'cache', text })
const pg = (tone: Prop['tone'] = 'ink', text = 'Postgres'): Prop => ({ id: 'pg', x: 600, y: 200, w: 180, h: 140, tone, label: 'db', text })
const dbGopher = (bubble?: string, hot?: boolean): Actor => ({ id: 'db', sprite: hot ? 'convict-hard-times' : 'superhero-lifting-1TB', x: 690, y: 190, h: 90, bubble, hot })
const crowd = (bubble?: string, hot?: boolean): Actor[] =>
  ['a', 'b', 'c'].map((id, i) => ({ id, sprite: i % 2 ? 'misc-standing-left' : RUN, x: 50 + i * 65, y: 332, h: 88, hot, bubble: i === 2 ? bubble : undefined, tag: i === 0 ? '×10k/s' : undefined }))

export const cacheStory: Frame[] = [
  {
    caption: 'A read asks the cache first. The key isn’t there: a miss.',
    actors: [{ id: 'r', sprite: RUN, x: 170, y: 332, h: 110, tag: 'reader', bubble: 'user:42?' }],
    props: [cache('empty', 'dashed'), pg()],
  },
  {
    caption: 'On a miss, the app reads the database and caches the row for 5 minutes.',
    actors: [{ id: 'r', sprite: RUN, x: 525, y: 332, h: 110, tag: 'reader', bubble: 'SELECT …' }, dbGopher()],
    props: [cache('user:42'), pg()],
  },
  {
    caption: 'Reads before it expires are hits and never touch the database.',
    actors: [{ id: 'r', sprite: RUN, x: 170, y: 332, h: 110, tag: 'reader', bubble: 'got it' }, dbGopher('idle')],
    props: [cache('user:42'), pg()],
  },
  {
    caption: 'A write updates the database, then deletes the cache key.',
    actors: [{ id: 'r', sprite: 'convict-working-hard', x: 525, y: 332, h: 110, tag: 'writer', hot: true, bubble: 'DEL user:42' }, dbGopher()],
    props: [cache('deleted', 'red'), pg()],
    stop: {
      title: 'Delete, don’t overwrite',
      body: <p>Two writers can overwrite the cache in the wrong order and leave an old value. Deleting makes the next read load the fresh row; the expiry cleans up rare races.</p>,
    },
  },
  {
    caption: 'A hot key expires. Thousands of requests miss at once and flood the database.',
    actors: [...crowd('miss!', true), dbGopher('help!', true)],
    props: [cache('expired', 'red'), pg('red', 'overloaded')],
  },
  {
    caption: 'The fix, singleflight: one caller runs the query, the others wait for its result.',
    actors: [
      { id: 'r', sprite: 'fairy-tale-messenger-red-letter', x: 525, y: 332, h: 110, tag: 'leader', hot: true, bubble: 'one query' },
      ...['a', 'b', 'c'].map((id, i): Actor => ({ id, sprite: 'dandy-umbrella', x: 50 + i * 65, y: 332, h: 88, bubble: i === 2 ? 'waiting' : undefined })),
      dbGopher(),
    ],
    props: [cache('filling…', 'dashed'), pg()],
    stop: {
      title: 'One query per process',
      body: (
        <>
          <p>It only dedupes inside one process: 20 pods still send 20 queries.</p>
          <Code>{`// load runs once per key;
// the others share its result
v, err, _ := g.Do(key, load)`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 2. retries + circuit breaker ---------- */

const svc = (tone: Prop['tone'] = 'ink', text = 'service B'): Prop => ({ id: 'svc', x: 580, y: 200, w: 200, h: 140, tone, label: 'dependency', text })
const bGopher = (bubble?: string, hot?: boolean): Actor => ({ id: 'b', sprite: hot ? 'convict-hard-times' : 'superhero-lifting-1TB', x: 680, y: 190, h: 90, bubble, hot })
const callers = (bubble?: string, hot?: boolean, n = 3): Actor[] =>
  Array.from({ length: n }, (_, i): Actor => ({ id: 'c' + i, sprite: 'convict-working-hard', x: 110 + i * 80, y: 332, h: 92, hot, bubble: i === n - 1 ? bubble : undefined }))
const breaker = (state: string, tone: Prop['tone']): Prop => ({ id: 'brk', x: 380, y: 230, w: 150, h: 110, tone, label: 'breaker', text: state })
const knight = (bubble?: string, hot?: boolean): Actor => ({ id: 'k', sprite: 'fairy-tale-armored-knight', x: 455, y: 225, h: 90, bubble, hot })

export const retryBreaker: Frame[] = [
  {
    caption: 'Service B slows down. Its callers time out and retry right away.',
    actors: [...callers('timeout!'), bGopher('slow…', true)],
    props: [svc('soft')],
  },
  {
    caption: 'Each failed call becomes three, so B gets triple load when it is weakest.',
    actors: [...callers('retry ×3', true), bGopher('drowning', true)],
    props: [svc('red', '3× load')],
    stop: {
      title: 'Retry storms multiply',
      body: <p>Three layers that each retry 3 times send up to 27 calls to the bottom one. Retry at one layer only, and only calls that are safe to repeat.</p>,
    },
  },
  {
    caption: 'Backoff with jitter: wait longer each time, plus a random bit, to spread retries.',
    actors: [...callers('wait 0–800ms'), bGopher('breathing')],
    props: [svc('soft')],
  },
  {
    caption: 'A circuit breaker sits in front of B and counts failures. Closed: calls pass.',
    actors: [...callers(undefined, false, 2), knight('pass'), bGopher()],
    props: [breaker('CLOSED', 'line'), svc()],
  },
  {
    caption: 'Too many failures: it opens and fails calls instantly, without calling B.',
    actors: [...callers('fallback', false, 2), knight('fail fast', true), bGopher('recovering', true)],
    props: [breaker('OPEN', 'red'), svc('soft')],
  },
  {
    caption: 'After a cooldown it goes half-open: a few trial calls pass. Success closes it.',
    actors: [...callers(undefined, false, 2), knight('one try'), bGopher('fine')],
    props: [breaker('HALF-OPEN', 'dashed'), svc()],
  },
]

/* ---------- 3. connection pool ---------- */

const slots = (tones: Prop['tone'][] = ['soft', 'soft', 'soft', 'soft'], texts: string[] = []): Prop[] =>
  tones.map((tone, i) => ({ id: 's' + i, x: 300 + i * 70, y: 250, w: 60, h: 90, tone, text: texts[i] ?? `c${i + 1}` }))
const poolBox: Prop = { id: 'pool', x: 285, y: 85, w: 290, h: 265, tone: 'dashed', label: 'sql.DB pool' }
const pgRight = (label = 'Postgres', tone: Prop['tone'] = 'ink'): Prop => ({ id: 'pg', x: 620, y: 230, w: 160, h: 110, tone, label: 'db', text: label })
const user = (id: string, slot: number, sprite = 'convict-working-hard', bubble?: string, hot?: boolean, tag?: string): Actor => ({ id, sprite, x: 330 + slot * 70, y: 245, h: 70, bubble, hot, tag })
const waiter = (id: string, i: number, bubble?: string, hot?: boolean): Actor => ({ id, sprite: 'dandy-raining', x: 60 + i * 72, y: 332, h: 88, bubble, hot })

export const connPool: Frame[] = [
  {
    caption: '*sql.DB is a pool of connections, not one. SetMaxOpenConns(4) allows four.',
    actors: [user('q1', 0)],
    props: [poolBox, ...slots(['ink', 'soft', 'soft', 'soft']), pgRight()],
  },
  {
    caption: 'All four are busy. The fifth caller doesn’t fail; it waits in line.',
    actors: [user('q1', 0), user('q2', 1), user('q3', 2), user('q4', 3), waiter('w1', 0, 'waiting')],
    props: [poolBox, ...slots(['ink', 'ink', 'ink', 'ink']), pgRight()],
  },
  {
    caption: 'An open transaction holds its connection until Commit or Rollback.',
    actors: [user('q1', 0, 'convict-chained', 'in tx…', true, 'tx'), user('q2', 1), user('q3', 2), user('q4', 3), waiter('w1', 0, 'waiting')],
    props: [poolBox, ...slots(['red', 'ink', 'ink', 'ink']), pgRight()],
  },
  {
    caption: 'Hold all four, and every request waits while Postgres sits idle.',
    actors: [
      ...[0, 1, 2, 3].map((i) => user('q' + (i + 1), i, 'convict-chained', i === 3 ? 'HTTP call…' : undefined, true)),
      waiter('w1', 0, 'still waiting', true),
    ],
    props: [poolBox, ...slots(['red', 'red', 'red', 'red']), pgRight('CPU 3%', 'soft')],
    stop: {
      title: 'Pool exhaustion',
      body: (
        <p>
          Usual causes: a transaction that makes HTTP calls, a forgotten <code>rows.Close()</code>, or no timeout. <code>db.Stats()</code> shows <code>WaitCount</code> climbing.
        </p>
      ),
    },
  },
  {
    caption: '30 pods × 20 conns = 600, over Postgres’s default limit of 100.',
    actors: [{ id: 'pgb', sprite: 'adventure-pushing-cart', x: 700, y: 228, h: 80, bubble: 'PgBouncer: 600→40' }],
    props: [{ ...poolBox, label: '30 pods' }, ...slots(['ink', 'ink', 'ink', 'ink'], ['×150', '×150', '×150', '×150']), pgRight('40 conns')],
  },
]

/* ---------- 4. replicas, sharding, CAP ---------- */

const primary = (bubble?: string, hot?: boolean): Actor => ({ id: 'p', sprite: 'fairy-tale-king', x: 180, y: 300, h: 120, tag: 'primary', bubble, hot })
const replica = (id: string, x: number, bubble?: string, hot?: boolean, dim?: boolean): Actor => ({ id, sprite: 'fairy-tale-messenger-reading', x, y: 300, h: 110, tag: id, bubble, hot, dim })
const wal: Prop = { id: 'wal', x: 250, y: 150, w: 220, h: 28, tone: 'soft', text: 'copying →' }
const writer = (bubble?: string): Actor => ({ id: 'u', sprite: RUN, x: 90, y: 330, h: 80, bubble, tag: 'user' })
const cut: Prop = { id: 'cut', x: 360, y: 150, w: 16, h: 200, tone: 'red' }

export const replicasShards: Frame[] = [
  {
    caption: 'Too many reads? Add replicas: copies of the database that follow the primary.',
    actors: [primary('writes'), replica('replica 1', 540, 'reads'), replica('replica 2', 690, 'reads')],
    props: [wal],
  },
  {
    caption: 'A user saves, reloads from a replica that lags behind, and sees old data.',
    actors: [primary('saved v2'), replica('replica 1', 540, 'still v1', true), replica('replica 2', 690), { ...writer('where’s v2?'), x: 360 }],
    props: [{ ...wal, tone: 'red', text: 'lag' }],
    stop: {
      title: 'Read your own writes',
      body: <p>Replication is usually async, so a replica can be seconds behind. After a write, read that user’s data from the primary for a moment.</p>,
    },
  },
  {
    caption: 'Replicas only help reads. Every write still goes to the one primary.',
    actors: [primary('all writes!', true), replica('replica 1', 540, undefined, false, true), replica('replica 2', 690, undefined, false, true)],
    props: [wal],
  },
  {
    caption: 'Sharding splits the data: each shard owns some keys and takes their writes.',
    actors: [
      { id: 'p', sprite: 'fairy-tale-king', x: 180, y: 300, h: 120, tag: 'shard A', bubble: 'users A–M' },
      { id: 's2', sprite: 'adventure-pirate-lifting-goods', x: 560, y: 300, h: 120, tag: 'shard B', bubble: 'users N–Z' },
    ],
  },
  {
    caption: 'A network cut splits replica from primary. Refuse the read, or serve stale data?',
    actors: [primary(), replica('replica 1', 540, 'error or stale?', true), { ...writer('read me'), x: 700 }],
    props: [cut],
    stop: {
      title: 'What CAP really says',
      body: <p>Network cuts happen, so you choose during one: refuse (consistent, CP) or answer stale (available, AP). Without a cut, the trade is speed versus freshness.</p>,
    },
  },
]
