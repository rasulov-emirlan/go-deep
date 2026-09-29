import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * Split stage: Postgres on the left half, MongoDB on the right half,
 * the Go app standing between them. Red = the thing this step is about.
 */
const FLOOR = 340
const APP = 'misc-standing-v2'

const app = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'app', sprite: APP, x: 400, y: FLOOR, h: 125, tag: 'Go app', bubble, ...extra })

const big = (s: string, hot = false) => <span className={'mg-big' + (hot ? ' mg-hot' : '')}>{s}</span>
const mono = (s: string) => <span className="mg-mono">{s}</span>

const pg: Prop = { id: 'pg', x: 40, y: 0, w: 330, h: 36, tone: 'ink', text: mono('PostgreSQL') }
const mg: Prop = { id: 'mg', x: 430, y: 0, w: 330, h: 36, tone: 'ink', text: mono('MongoDB') }

/** a box in one of four slots: 0,1 = Postgres half, 2,3 = Mongo half; wide spans two slots */
const XS = [40, 220, 430, 610]
const box = (id: string, slot: number, label: string, v: string, tone: Prop['tone'] = 'line', wide = false): Prop => ({
  id,
  x: XS[slot],
  y: 60,
  w: wide ? 330 : 150,
  h: 95,
  label,
  text: big(v, tone === 'red'),
  tone,
})

/* ───────────────────────── Data model · rows vs documents ───────────────────────── */

export const model: Frame[] = [
  {
    caption: 'Postgres keeps data in tables of rows. An order and its items are separate tables.',
    actors: [app()],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7'), box('items', 1, 'items', '3 rows')],
  },
  {
    caption: 'A JOIN matches rows by id to rebuild the order in one query.',
    actors: [app('JOIN')],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7', 'red'), box('items', 1, 'items', '3 rows', 'red')],
  },
  {
    caption: 'MongoDB stores documents, JSON-like records. The items sit inside the order itself.',
    actors: [app()],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7'), box('items', 1, 'items', '3 rows'), box('doc', 2, 'orders', 'items inside', 'line', true)],
  },
  {
    caption: 'Embedding: data you read together lives together. One read, no join.',
    actors: [app('one read')],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7'), box('items', 1, 'items', '3 rows'), box('doc', 2, 'orders', 'items inside', 'red', true)],
  },
  {
    caption: 'Referencing: store another document’s id, like a foreign key, and fetch it separately.',
    actors: [app('two reads')],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7'), box('items', 1, 'items', '3 rows'), box('doc', 2, 'orders', 'user: 42'), box('user', 3, 'users', 'Ana', 'red')],
    stop: {
      title: 'Don’t embed everything',
      body: <p>Embed what you read and change together. Reference data that is shared or grows without limit: a document caps at 16 MB.</p>,
    },
  },
  {
    caption: 'Mongo can join with $lookup, but many-to-many joins are Postgres’s home turf.',
    actors: [app('$lookup')],
    props: [pg, mg, box('orders', 0, 'orders', 'order 7'), box('items', 1, 'items', '3 rows'), box('doc', 2, 'orders', 'user: 42'), box('user', 3, 'users', 'Ana')],
  },
]

/* ───────────────────────── Schema · strict vs flexible ───────────────────────── */

export const schema: Frame[] = [
  {
    caption: 'Postgres checks every row against the table’s columns. Wrong type? The insert fails.',
    actors: [app('age = "ten"')],
    props: [pg, mg, box('users', 0, 'users', 'age int'), box('res', 1, 'result', 'rejected', 'red')],
  },
  {
    caption: 'Changing the shape is a migration: an ALTER TABLE run before new code ships.',
    actors: [app('add email')],
    props: [pg, mg, box('users', 0, 'users', '+ email', 'red'), box('res', 1, 'migration', 'ALTER', 'line')],
  },
  {
    caption: 'MongoDB accepts any shape by default. Two documents may disagree.',
    actors: [app()],
    props: [pg, mg, box('users', 0, 'users', '+ email'), box('res', 1, 'migration', 'ALTER'), box('d1', 2, 'doc 1', 'age: 30'), box('d2', 3, 'doc 2', 'age: "ten"', 'red')],
    stop: {
      title: 'Schemaless still has a schema',
      body: <p>The shape just moves into your code. Old documents keep their old shape until you rewrite them.</p>,
    },
  },
  {
    caption: 'Schema validation, a $jsonSchema rule on a collection, rejects bad documents too.',
    actors: [app('$jsonSchema')],
    props: [pg, mg, box('users', 0, 'users', '+ email'), box('res', 1, 'migration', 'ALTER'), box('d1', 2, 'doc 1', 'age: 30'), box('d2', 3, 'doc 2', 'rejected', 'red')],
  },
  {
    caption: 'Middle ground: a Postgres JSONB column, binary JSON, keeps flexible fields in a table.',
    actors: [app()],
    props: [pg, mg, box('users', 0, 'products', 'price'), box('res', 1, 'jsonb', 'attrs', 'red'), box('d1', 2, 'doc 1', 'age: 30'), box('d2', 3, 'doc 2', 'rejected')],
    stop: {
      title: 'Index JSONB with GIN',
      body: (
        <>
          <p>A GIN index, one entry per key and value, makes “contains” queries fast.</p>
          <Code>{`CREATE INDEX ON products
  USING gin (attrs);
SELECT * FROM products
WHERE attrs @> '{"color":"red"}';`}</Code>
        </>
      ),
    },
  },
]

/* ───────────────────────── Writes · atomicity + write concern ───────────────────────── */

const node = (id: string, i: number, label: string, v: string, tone: Prop['tone'] = 'line'): Prop => ({
  id,
  x: [40, 300, 560][i],
  y: 60,
  w: 200,
  h: 95,
  label,
  text: big(v, tone === 'red'),
  tone,
})
const set = (title: string): Prop => ({ id: 'set', x: 250, y: 0, w: 300, h: 36, tone: 'ink', text: mono(title) })
const copies = (p: string, s1: string, s2: string, hot: number[] = []): Prop[] => [
  node('p', 0, 'primary', p, hot.includes(0) ? 'red' : 'line'),
  node('s1', 1, 'secondary', s1, hot.includes(1) ? 'red' : 'line'),
  node('s2', 2, 'secondary', s2, hot.includes(2) ? 'red' : 'line'),
]

export const writes: Frame[] = [
  {
    caption: 'MongoDB runs as a replica set: a primary takes writes, secondaries copy it.',
    actors: [app()],
    props: [set('MongoDB replica set'), ...copies('v1', 'v1', 'v1')],
  },
  {
    caption: 'Updating one document is always atomic, embedded items included.',
    actors: [app('updateOne')],
    props: [set('MongoDB replica set'), ...copies('v2', 'v1', 'v1', [0])],
  },
  {
    caption: 'Multi-document transactions work since 4.0 (4.2 sharded), but cost more. Postgres is ACID by default.',
    actors: [app('transaction')],
    props: [set('MongoDB replica set'), ...copies('v2', 'v2', 'v2')],
    stop: {
      title: 'Model first, transact second',
      body: <p>MongoDB’s own docs say transactions don’t replace good schema design. By default they also abort after one minute.</p>,
    },
  },
  {
    caption: 'Write concern: how many copies must confirm before the app hears OK.',
    actors: [app('w:1 → OK')],
    props: [set('write concern'), ...copies('v3', 'v2', 'v2', [0])],
  },
  {
    caption: 'Since 5.0 the default is w: majority: most copies confirm first.',
    actors: [app('w: majority')],
    props: [set('write concern'), ...copies('v3', 'v3', 'v2', [0, 1])],
    stop: {
      title: 'w: 1 can lose writes',
      body: <p>If the primary crashes before copying, its write is rolled back. Majority writes survive the failover.</p>,
    },
  },
  {
    caption: 'Reads default to read concern local: you may see writes not yet on most copies.',
    actors: [app('read v4?')],
    props: [set('read concern'), ...copies('v4', 'v3', 'v3', [0])],
  },
]

/* ───────────────────────── Scaling · replicas vs shards ───────────────────────── */

export const scale: Frame[] = [
  {
    caption: 'Postgres usually scales up first: one bigger machine goes a long way.',
    actors: [app()],
    props: [pg, mg, box('prim', 0, 'primary', 'writes', 'red')],
  },
  {
    caption: 'Read replicas, read-only copies, take reads. Writes still go to one primary.',
    actors: [app()],
    props: [pg, mg, box('prim', 0, 'primary', 'writes'), box('rep', 1, 'replica', 'reads', 'red')],
  },
  {
    caption: 'MongoDB shards built in: a shard key, like user_id, splits data across servers.',
    actors: [app()],
    props: [pg, mg, box('prim', 0, 'primary', 'writes'), box('rep', 1, 'replica', 'reads'), box('sa', 2, 'shard A', 'A–M'), box('sb', 3, 'shard B', 'N–Z')],
  },
  {
    caption: 'A query with the shard key hits one shard. Without it, every shard is asked.',
    actors: [app('user Ana')],
    props: [pg, mg, box('prim', 0, 'primary', 'writes'), box('rep', 1, 'replica', 'reads'), box('sa', 2, 'shard A', 'A–M', 'red'), box('sb', 3, 'shard B', 'N–Z', 'dashed')],
    stop: {
      title: 'Pick the key carefully',
      body: <p>A key that only grows, like a timestamp, sends every insert to one shard. Hashed keys spread writes; resharding later exists since 5.0 but is costly.</p>,
    },
  },
  {
    caption: 'Postgres can shard too, with extensions like Citus. It just isn’t built in.',
    actors: [app()],
    props: [pg, mg, box('prim', 0, 'Citus', 'shard 1', 'red'), box('rep', 1, 'Citus', 'shard 2', 'red'), box('sa', 2, 'shard A', 'A–M'), box('sb', 3, 'shard B', 'N–Z')],
  },
]
