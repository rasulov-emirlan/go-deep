import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ---------- 1. cache-aside ---------- */

const RUN = 'fairy-tale-messenger-running'
const cache = (text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'cache', x: 250, y: 200, w: 200, h: 140, tone, label: 'cache · Redis', text })
const pg = (tone: Prop['tone'] = 'ink', text = 'Postgres'): Prop => ({ id: 'pg', x: 600, y: 200, w: 180, h: 140, tone, label: 'db', text })
const dbGopher = (bubble?: string, hot?: boolean): Actor => ({ id: 'db', sprite: hot ? 'convict-hard-times' : 'superhero-lifting-1TB', x: 690, y: 190, h: 90, bubble, hot })

export const cacheAside: Frame[] = [
  {
    caption: 'A read asks the cache first. The key isn’t there: a miss.',
    actors: [{ id: 'r', sprite: RUN, x: 170, y: 332, h: 110, tag: 'GET user:42', bubble: 'user:42?' }],
    props: [cache('—', 'dashed'), pg()],
  },
  {
    caption: 'On a miss the app reads Postgres, then stores the row in the cache with a TTL.',
    actors: [{ id: 'r', sprite: RUN, x: 525, y: 332, h: 110, tag: 'GET user:42', bubble: 'SELECT …' }, dbGopher()],
    props: [cache('user:42 · TTL 5m'), pg()],
  },
  {
    caption: 'Every read until the TTL runs out is a hit and never touches Postgres.',
    actors: [
      { id: 'r', sprite: RUN, x: 170, y: 332, h: 110, tag: 'hit', bubble: 'got it' },
      { id: 'r2', sprite: 'misc-standing-v2', x: 70, y: 332, h: 90, tag: 'hit' },
      dbGopher('idle'),
    ],
    props: [cache('user:42 · TTL 4m'), pg()],
  },
  {
    caption: 'A write updates Postgres first, then deletes the cache key instead of overwriting it.',
    actors: [{ id: 'w', sprite: 'convict-working-hard', x: 525, y: 332, h: 110, tag: 'UPDATE user:42', hot: true, bubble: 'DEL user:42' }, dbGopher()],
    props: [cache('deleted', 'red'), pg()],
    stop: {
      title: 'why delete, not set?',
      body: (
        <p>
          Two writers can SET the cache in the opposite order from their commits, leaving the old value until TTL. Deleting makes the next reader load the committed row. A tiny race remains (a slow
          reader re-fills an old row), so the TTL is your safety net.
        </p>
      ),
    },
  },
  {
    caption: 'Write-through: every write updates cache and DB together, so reads stay warm but writes pay twice.',
    actors: [{ id: 'w', sprite: 'convict-working-hard', x: 525, y: 332, h: 110, tag: 'write-through', bubble: 'both, now' }, dbGopher()],
    props: [cache('user:42 · new'), pg()],
  },
  {
    caption: 'Write-back: writes land in the cache and flush to the DB later. Fast, but a crash loses them.',
    actors: [{ id: 'w', sprite: 'convict-working-hard', x: 170, y: 332, h: 110, tag: 'write-back', hot: true, bubble: 'flush later' }, dbGopher('behind')],
    props: [cache('dirty: 3 rows', 'red'), pg('soft', 'Postgres')],
    stop: {
      title: 'which one when?',
      edge: true,
      body: (
        <p>
          Cache-aside is the default for business data. Write-back only fits data you can afford to lose or rebuild: view counters, rate-limit buckets, metrics.
        </p>
      ),
    },
  },
  {
    caption: 'Rows that don’t exist get cached too, briefly, or bots probing random ids go straight to Postgres.',
    actors: [{ id: 'r', sprite: 'fairy-tale-robin-hood', x: 150, y: 332, h: 110, tag: 'GET user:999999', bubble: 'user:999999?' }, dbGopher('idle')],
    props: [cache('user:999999 · none · 30s'), pg()],
  },
]

/* ---------- 2. stampede ---------- */

const crowd = (bubble?: string, hot?: boolean, x0 = 50): Actor[] =>
  ['a', 'b', 'c', 'd'].map((id, i) => ({ id, sprite: i % 2 ? 'misc-standing-left' : RUN, x: x0 + i * 55, y: 332, h: 88, hot, bubble: i === 3 ? bubble : undefined, tag: i === 0 ? '×10k/s' : undefined }))

export const stampede: Frame[] = [
  {
    caption: 'A hot key serves 10 000 reads a second straight from the cache.',
    actors: [...crowd('hit'), dbGopher('idle')],
    props: [cache('feed:home'), pg()],
  },
  {
    caption: 'Its TTL expires. Every request in the next 50 ms misses at the same moment.',
    actors: [...crowd('miss!', true), dbGopher('idle')],
    props: [cache('expired', 'red'), pg()],
  },
  {
    caption: 'Hundreds of identical queries hit Postgres at once. It saturates and starts timing out.',
    actors: [...crowd('SELECT …', true), dbGopher('help!', true)],
    props: [cache('expired', 'red'), pg('red', 'overloaded')],
    stop: {
      title: 'the thundering herd',
      body: (
        <p>
          The query is cheap; five hundred copies of it are not. They queue for connections, time out, and retry, so the cache that was shielding the DB becomes an amplifier.
        </p>
      ),
    },
  },
  {
    caption: 'singleflight: one leader runs the query; every other caller for that key waits for its result.',
    actors: [
      { id: 'lead', sprite: 'fairy-tale-messenger-red-letter', x: 525, y: 332, h: 110, tag: 'leader', hot: true, bubble: 'one query' },
      ...['a', 'b', 'c', 'd'].map((id, i): Actor => ({ id, sprite: 'dandy-umbrella', x: 50 + i * 55, y: 332, h: 88, bubble: i === 3 ? 'waiting' : undefined })),
      dbGopher(),
    ],
    props: [cache('filling…', 'dashed'), pg()],
    stop: {
      title: 'per process, and shared fate',
      edge: true,
      body: (
        <>
          <Code>{`v, err, _ := g.Do(key, func() (any, error) {
    return load(ctx) // once per key
})`}</Code>
          <p>
            It dedupes inside one process only: 20 pods still send 20 queries (add a Redis <code>SET NX</code> lock for fleet-wide). Waiters share the leader’s error too, including its cancelled{' '}
            <code>ctx</code>.
          </p>
        </>
      ),
    },
  },
  {
    caption: 'Stale-while-revalidate: keep serving the old value and refresh it once, in the background.',
    actors: [...crowd('stale, fast'), { id: 'lead', sprite: 'fairy-tale-messenger-red-letter', x: 525, y: 332, h: 110, tag: 'refresh', bubble: 'in background' }, dbGopher()],
    props: [cache('feed:home · stale'), pg()],
  },
  {
    caption: 'Early refresh: each hit may recompute a little before expiry, more likely as the TTL nears zero.',
    actors: [...crowd('hit'), { id: 'lead', sprite: 'fairy-tale-messenger-red-letter', x: 525, y: 332, h: 110, tag: '1 early refresh' }, dbGopher()],
    props: [cache('feed:home · TTL 2s'), pg()],
    stop: {
      title: 'XFetch and TTL jitter',
      body: (
        <p>
          Probabilistic early expiration refreshes when <code>now − β·Δ·ln(rand) ≥ expiry</code> (Δ = recompute time), so one caller renews before the herd arrives. Also add random jitter to
          TTLs, so keys written together don’t all expire in the same second.
        </p>
      ),
    },
  },
]

/* ---------- 3. retries + circuit breaker ---------- */

const svc = (tone: Prop['tone'] = 'ink', text = 'service B'): Prop => ({ id: 'svc', x: 580, y: 200, w: 200, h: 140, tone, label: 'dependency', text })
const bGopher = (bubble?: string, hot?: boolean): Actor => ({ id: 'b', sprite: hot ? 'convict-hard-times' : 'superhero-lifting-1TB', x: 680, y: 190, h: 90, bubble, hot })
const callers = (bubble?: string, hot?: boolean, n = 3): Actor[] =>
  Array.from({ length: n }, (_, i): Actor => ({ id: 'c' + i, sprite: 'convict-working-hard', x: 110 + i * 80, y: 332, h: 92, hot, bubble: i === n - 1 ? bubble : undefined }))
const breaker = (state: string, tone: Prop['tone']): Prop => ({ id: 'brk', x: 380, y: 230, w: 150, h: 110, tone, label: 'breaker', text: state })
const knight = (bubble?: string, hot?: boolean): Actor => ({ id: 'k', sprite: 'fairy-tale-armored-knight', x: 455, y: 225, h: 90, bubble, hot })

export const retryBreaker: Frame[] = [
  {
    caption: 'Service B slows down. Its callers time out and immediately retry.',
    actors: [...callers('timeout!'), bGopher('slow…', true)],
    props: [svc('soft', 'service B')],
  },
  {
    caption: 'Each failed call becomes three, so B gets triple load exactly when it is weakest.',
    actors: [...callers('retry ×3', true), bGopher('drowning', true)],
    props: [svc('red', '3× load')],
    stop: {
      title: 'retry storms multiply',
      body: (
        <p>
          Three layers that each try 3 times send up to 27 calls to the bottom one. Retry at one layer only, and only idempotent calls (or ones carrying an idempotency key).
        </p>
      ),
    },
  },
  {
    caption: 'Exponential backoff with full jitter spreads retries out instead of firing them in synchronized waves.',
    actors: [...callers('wait 0–800ms'), bGopher('breathing')],
    props: [svc('soft', 'service B')],
    stop: {
      title: 'why the jitter?',
      body: (
        <>
          <Code>{`d := min(maxBackoff, base<<attempt)
time.Sleep(rand.N(d)) // math/rand/v2: 0 ≤ sleep < d`}</Code>
          <p>Plain doubling still makes every client retry at the same instants. Randomizing the whole wait turns the spikes into a flat trickle.</p>
        </>
      ),
    },
  },
  {
    caption: 'A retry budget caps retries at ~10% of traffic, so a dead dependency sees at most 1.1× load.',
    actors: [...callers('budget spent'), bGopher()],
    props: [svc()],
  },
  {
    caption: 'Circuit breaker, closed: calls pass through while it counts the failures.',
    actors: [...callers(undefined, false, 2), knight('pass'), bGopher()],
    props: [breaker('CLOSED', 'line'), svc()],
  },
  {
    caption: 'The failure rate crosses the threshold: the breaker opens and fails calls instantly, with no network trip.',
    actors: [...callers('fallback', false, 2), knight('fail fast', true), bGopher('recovering', true)],
    props: [breaker('OPEN', 'red'), svc('soft', 'service B')],
    stop: {
      title: 'what failing fast buys',
      body: <p>Goroutines and connections aren’t stuck waiting on a dead host, B gets room to recover, and you can serve a fallback: a cached value, a default, a clear 503.</p>,
    },
  },
  {
    caption: 'After a cooldown it turns half-open and lets a few trial calls through.',
    actors: [...callers(undefined, false, 2), knight('one try'), bGopher()],
    props: [breaker('HALF-OPEN', 'dashed'), svc()],
  },
  {
    caption: 'Trials succeed: closed again. Any trial fails: open for another cooldown.',
    actors: [...callers('back to normal', false, 2), knight(), bGopher('fine')],
    props: [breaker('CLOSED', 'line'), svc()],
    stop: {
      title: 'timeouts come first',
      edge: true,
      body: (
        <p>
          A breaker only sees failures you surface: a call with no <code>context</code> deadline just hangs. Keep one breaker per dependency (or per host), never one global switch.
        </p>
      ),
    },
  },
]

/* ---------- 4. connection pool ---------- */

const slots = (tones: Prop['tone'][] = ['soft', 'soft', 'soft', 'soft'], texts: string[] = []): Prop[] =>
  tones.map((tone, i) => ({ id: 's' + i, x: 300 + i * 70, y: 250, w: 60, h: 90, tone, text: texts[i] ?? `c${i + 1}` }))
const poolBox: Prop = { id: 'pool', x: 285, y: 110, w: 290, h: 240, tone: 'dashed', label: 'sql.DB · MaxOpenConns 4' }
const pgRight = (label = 'Postgres', tone: Prop['tone'] = 'ink'): Prop => ({ id: 'pg', x: 620, y: 230, w: 160, h: 110, tone, label: 'db', text: label })
const user = (id: string, slot: number, sprite = 'convict-working-hard', bubble?: string, hot?: boolean, tag?: string): Actor => ({ id, sprite, x: 330 + slot * 70, y: 245, h: 70, bubble, hot, tag })
const waiter = (id: string, i: number, bubble?: string, hot?: boolean): Actor => ({ id, sprite: 'dandy-raining', x: 60 + i * 72, y: 332, h: 88, bubble, hot })

export const connPool: Frame[] = [
  {
    caption: '*sql.DB is a pool, not a connection. SetMaxOpenConns(4) allows four at once.',
    actors: [user('q1', 0, undefined, 'SELECT')],
    props: [poolBox, ...slots(['ink', 'soft', 'soft', 'soft']), pgRight()],
  },
  {
    caption: 'A query borrows a conn and gives it back when its rows are closed. Idle conns wait for reuse.',
    actors: [user('q1', 0), user('q2', 1)],
    props: [poolBox, ...slots(['ink', 'ink', 'soft', 'soft'], ['c1', 'c2', 'idle', 'idle']), pgRight()],
    stop: {
      title: 'the defaults',
      edge: true,
      body: (
        <p>
          <code>MaxOpenConns</code> defaults to 0 = unlimited, <code>MaxIdleConns</code> to 2. Unlimited lets a traffic spike open hundreds of Postgres backends (one process each). Set both, plus{' '}
          <code>SetConnMaxLifetime</code>.
        </p>
      ),
    },
  },
  {
    caption: 'All four are busy. The fifth caller doesn’t get an error; it waits in line for a free conn.',
    actors: [user('q1', 0), user('q2', 1), user('q3', 2), user('q4', 3), waiter('w1', 0, 'waiting')],
    props: [poolBox, ...slots(['ink', 'ink', 'ink', 'ink']), pgRight()],
  },
  {
    caption: 'An open transaction pins its conn until Commit or Rollback. So do a slow query and unclosed rows.',
    actors: [user('q1', 0, 'convict-chained', 'in tx…', true, 'tx'), user('q2', 1), user('q3', 2), user('q4', 3), waiter('w1', 0), waiter('w2', 1, 'waiting')],
    props: [poolBox, ...slots(['red', 'ink', 'ink', 'ink']), pgRight()],
  },
  {
    caption: 'Pin all four and every request queues. Latency climbs while Postgres itself sits idle.',
    actors: [
      ...[0, 1, 2, 3].map((i) => user('q' + (i + 1), i, 'convict-chained', i === 3 ? 'HTTP call…' : undefined, true)),
      waiter('w1', 0, undefined, true),
      waiter('w2', 1, undefined, true),
      waiter('w3', 2, 'still waiting', true),
      { id: 'pgg', sprite: 'superhero-lifting-1TB', x: 700, y: 222, h: 80, bubble: 'bored' },
    ],
    props: [poolBox, ...slots(['red', 'red', 'red', 'red']), pgRight('CPU 3%', 'soft')],
    stop: {
      title: 'pool exhaustion',
      body: (
        <p>
          Look at <code>db.Stats()</code>: <code>WaitCount</code> and <code>WaitDuration</code> climb, <code>InUse</code> = max. Usual causes: a tx that makes HTTP calls, forgotten{' '}
          <code>rows.Close()</code>, no <code>ctx</code> timeout.
        </p>
      ),
    },
  },
  {
    caption: 'Self-deadlock: inside a tx, calling db.Query instead of tx.Query asks the pool for a second conn.',
    actors: [user('q1', 0, 'convict-chained', 'need 1 more', true, 'tx')],
    props: [{ ...poolBox, label: 'MaxOpenConns 1', w: 90 }, ...slots(['red']), pgRight()],
    stop: {
      title: 'hangs forever',
      edge: true,
      body: (
        <>
          <Code>{`db.SetMaxOpenConns(1)
tx, _ := db.Begin()
db.QueryRowContext(ctx, "select 1").Scan(&x)
// context deadline exceeded (no ctx: blocks forever)`}</Code>
          <p>The tx holds the only conn and waits on itself. Same trap with any pool size once enough goroutines do it at once.</p>
        </>
      ),
    },
  },
  {
    caption: '30 pods × 20 conns = 600, past Postgres’ default max_connections of 100. PgBouncer multiplexes them onto a few.',
    actors: [{ id: 'pgb', sprite: 'adventure-pushing-cart', x: 700, y: 228, h: 80, bubble: 'PgBouncer: 600 → 40' }],
    props: [{ ...poolBox, label: '30 pods × 20 conns' }, ...slots(['ink', 'ink', 'ink', 'ink'], ['×150', '×150', '×150', '×150']), pgRight('40 conns')],
    stop: {
      title: 'transaction pooling has rules',
      body: (
        <p>
          In transaction mode a server conn is yours only for one tx. Session state (<code>SET</code>, advisory locks, <code>LISTEN</code>) leaks or breaks; prepared statements need PgBouncer ≥ 1.21
          with <code>max_prepared_statements</code>.
        </p>
      ),
    },
  },
]

/* ---------- 5. replicas, sharding, CAP ---------- */

const primary = (bubble?: string, hot?: boolean): Actor => ({ id: 'p', sprite: 'fairy-tale-king', x: 180, y: 300, h: 120, tag: 'primary', bubble, hot })
const replica = (id: string, x: number, bubble?: string, hot?: boolean, dim?: boolean): Actor => ({ id, sprite: 'fairy-tale-messenger-reading', x, y: 300, h: 110, tag: id, bubble, hot, dim })
const wal: Prop = { id: 'wal', x: 250, y: 200, w: 220, h: 24, tone: 'soft', text: 'WAL →' }
const writer = (bubble?: string): Actor => ({ id: 'u', sprite: RUN, x: 90, y: 330, h: 80, bubble, tag: 'user' })

export const replicasShards: Frame[] = [
  {
    caption: 'Reads outgrow one server, so you add read replicas that replay the primary’s WAL.',
    actors: [primary('writes'), replica('replica 1', 540, 'reads'), replica('replica 2', 690, 'reads')],
    props: [wal],
  },
  {
    caption: 'Replication is usually async: a replica can be milliseconds, or seconds, behind.',
    actors: [primary(), replica('replica 1', 540, '2 s behind', true), replica('replica 2', 690)],
    props: [{ ...wal, tone: 'red', text: 'lag' }],
  },
  {
    caption: 'A user saves their profile, reloads from a replica, and sees the old one.',
    actors: [primary('saved v2'), replica('replica 1', 540, 'still v1', true), replica('replica 2', 690), { ...writer('where’s v2?'), x: 360 }],
    props: [{ ...wal, tone: 'red', text: 'lag' }],
    stop: {
      title: 'read-your-writes',
      body: (
        <p>
          Route that user’s reads to the primary for a few seconds after a write, or wait until the replica’s <code>pg_last_wal_replay_lsn()</code> passes the write’s LSN. Synchronous replicas with{' '}
          <code>synchronous_commit = remote_apply</code> fix it for every write, at a write-latency cost.
        </p>
      ),
    },
  },
  {
    caption: 'Replicas scale reads only. Every write still funnels into the one primary.',
    actors: [primary('all writes!', true), replica('replica 1', 540, undefined, false, true), replica('replica 2', 690, undefined, false, true)],
    props: [wal],
  },
  {
    caption: 'Sharding splits the data: each shard owns a slice of keys and takes its own writes.',
    actors: [
      { id: 'p', sprite: 'fairy-tale-king', x: 180, y: 300, h: 120, tag: 'shard A · ids 0–49%', bubble: 'my writes' },
      { id: 's2', sprite: 'adventure-pirate-lifting-goods', x: 560, y: 300, h: 120, tag: 'shard B · ids 50–99%', bubble: 'my writes' },
    ],
    stop: {
      title: 'choosing the shard key',
      body: (
        <p>
          Pick a key with high cardinality, even load, and present in every hot query (usually tenant or user id). <code>hash(id) % N</code> moves almost every key when N changes, so use many fixed
          virtual shards (Redis Cluster: 16 384 slots) or consistent hashing. Cross-shard JOINs and foreign keys are gone.
        </p>
      ),
    },
  },
  {
    caption: 'A network partition cuts replica 1 off from the primary. Both are still up.',
    actors: [primary(), replica('replica 1', 540, 'can’t sync', true), { ...writer('read me'), x: 700 }],
    props: [{ id: 'cut', x: 360, y: 150, w: 16, h: 200, tone: 'red' }],
  },
  {
    caption: 'Now pick: refuse the read (consistent, CP) or answer with maybe-stale data (available, AP).',
    actors: [primary(), replica('replica 1', 540, 'error or stale?', true), { ...writer(), x: 700 }],
    props: [{ id: 'cut', x: 360, y: 150, w: 16, h: 200, tone: 'red' }],
    stop: {
      title: 'what CAP actually says',
      body: (
        <p>
          Partitions happen, so P isn’t optional: CAP is a choice made <em>during</em> one. Without a partition the trade is latency vs consistency (PACELC). Postgres with sync replicas leans CP;
          Cassandra or DynamoDB at low quorum lean AP.
        </p>
      ),
    },
  },
]
