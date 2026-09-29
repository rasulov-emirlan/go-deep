import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

type Tone = Prop['tone']

/* ── 01 · How an index finds a row ───────────────────────────────────── */

const table = (tone: Tone = 'line'): Prop => ({ id: 'tbl', x: 460, y: 190, w: 330, h: 140, tone, label: 'table', text: '9,346 pages' })
const node = (id: string, y: number, text: string, tone: Tone): Prop => ({ id, x: 230, y, w: 190, h: 52, tone, text: <span className="ix-leaf">{text}</span> })
const tree = (hot = false): Prop[] => [node('root', 20, 'root', hot ? 'red' : 'line'), node('mid', 96, 'branch', hot ? 'red' : 'line'), node('leaf', 172, 'leaf: u777', hot ? 'red' : 'line')]
const q = (bubble?: string, tag = 'query', hot = false): Actor => ({ id: 'q', sprite: 'adventure-pushing-cart', x: 110, y: 330, h: 100, tag, bubble, hot })

export const findRow: Frame[] = [
  {
    caption: 'A table is 8 KB pages in no order: 1M users fill 9,346.',
    actors: [q('email = u777?')],
    props: [table()],
  },
  {
    caption: 'No index: a Seq Scan reads every page and checks every row.',
    actors: [q('read all', '9,346 reads', true)],
    props: [table('ink')],
  },
  {
    caption: 'A B-tree index keeps the emails sorted in a small tree of pages.',
    actors: [q('email = u777?')],
    props: [...tree(), table()],
  },
  {
    caption: 'The search walks root → branch → leaf: 3 page reads.',
    actors: [q('3 hops')],
    props: [...tree(true), table()],
  },
  {
    caption: 'The leaf points at the row’s page in the table: 4 reads, not 9,346.',
    actors: [q('found', '4 reads', true)],
    props: [...tree(true), table(), { id: 'hit', x: 676, y: 198, w: 106, h: 44, tone: 'red', text: <span className="ix-leaf">u777</span> }],
    stop: {
      title: 'Why so few reads?',
      body: <p>One index page holds hundreds of keys, so each level multiplies the reach. 3 levels cover 1M rows, about 4 cover a billion.</p>,
    },
  },
]

/* ── 02 · Column order matters ───────────────────────────────────────── */

const CC = ['kg', 'kz', 'ru', 'us']
const leaves = (tone: (i: number) => Tone): Prop[] =>
  CC.map((c, i): Prop => ({
    id: `c${i}`,
    x: 20 + i * 195,
    y: 40,
    w: 180,
    h: 70,
    tone: tone(i),
    text: (
      <span className="ix-cl">
        {c}
        <b>age 18→77</b>
      </span>
    ),
  }))
const sql = (s: string): Prop => ({ id: 'sql', x: 150, y: 150, w: 630, h: 56, tone: 'soft', text: <code className="ix-sql">{s}</code> })
const reader = (bubble?: string, hot = false): Actor => ({ id: 'g', sprite: 'fairy-tale-messenger-reading', x: 80, y: 330, h: 105, bubble, hot })

export const composite: Frame[] = [
  {
    caption: 'An index on (country, age) is sorted like a phone book: country, then age.',
    actors: [reader()],
    props: [...leaves(() => 'line'), sql('INDEX ON users (country, age)')],
  },
  {
    caption: 'Filter on both columns: jump straight to kg, then to age 30.',
    actors: [reader('1 jump')],
    props: [...leaves((i) => (i === 0 ? 'red' : 'line')), sql("WHERE country = 'kg' AND age = 30")],
  },
  {
    caption: 'Filter on age alone: the matches sit inside every country, not in one place.',
    actors: [reader('scattered')],
    props: [...leaves(() => 'red'), sql('WHERE age = 30')],
  },
  {
    caption: 'Before PostgreSQL 18, it can’t jump there, so it reads everything.',
    actors: [reader('read it all', true)],
    props: [...leaves(() => 'ink'), sql('WHERE age = 30   -- PG 17')],
    stop: {
      title: 'The leftmost prefix rule',
      body: <p>(country, age) can jump on country, or on country + age. age alone isn’t a prefix, so older versions scan.</p>,
    },
  },
  {
    caption: 'PostgreSQL 18 skip scan jumps into each country, then seeks age = 30.',
    actors: [reader('4 jumps')],
    props: [...leaves(() => 'red'), sql('WHERE age = 30   -- PG 18')],
    stop: {
      title: 'When skip scan helps',
      body: <p>Only when the skipped column has few distinct values: 4 countries, yes; 1M emails, no.</p>,
    },
  },
]

/* ── 03 · Why the index is ignored ───────────────────────────────────── */

const plans = (win: 'idx' | 'seq', idx = 'Index Scan', seq = 'Seq Scan', la = 'plan A', lb = 'plan B'): Prop[] => [
  { id: 'pidx', x: 30, y: 130, w: 240, h: 80, tone: win === 'idx' ? 'red' : 'dashed', label: la, text: idx },
  { id: 'pseq', x: 530, y: 130, w: 240, h: 80, tone: win === 'seq' ? 'red' : 'dashed', label: lb, text: seq },
]
const query = (s: string): Prop => ({ id: 'qq', x: 20, y: 30, w: 760, h: 56, tone: 'soft', text: <code className="ix-sql">{s}</code> })
const king = (bubble: string, hot = false): Actor => ({ id: 'k', sprite: 'fairy-tale-king', x: 400, y: 330, h: 140, bubble, hot, tag: 'planner' })

export const ignored: Frame[] = [
  {
    caption: 'The planner estimates what each plan costs and runs the cheapest one.',
    actors: [king('index: 4 pages')],
    props: [query("WHERE email = 'u777@x.io'"), ...plans('idx')],
  },
  {
    caption: 'If 99% of rows match, reading the whole table in order is cheaper.',
    actors: [king('Seq Scan', true)],
    props: [query("WHERE status = 'done'"), ...plans('seq')],
  },
  {
    caption: 'The index stores email, not lower(email), so this query can’t use it.',
    actors: [king('Seq Scan', true)],
    props: [query("WHERE lower(email) = 'u777@x.io'"), ...plans('seq')],
    stop: {
      title: 'Index the expression',
      body: (
        <>
          <p>Index exactly what the query filters on.</p>
          <Code>{`CREATE INDEX ON users (lower(email));`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Stale statistics guessed 1 row but found 500,000. Run ANALYZE to refresh them.',
    actors: [king('rows=1?', true)],
    props: [query('estimated rows=1, actual rows=500000'), ...plans('idx', 'Index Scan ✗', 'Seq Scan ✓')],
  },
  {
    caption: 'EXPLAIN shows the plan. EXPLAIN ANALYZE runs it and shows real rows and time.',
    actors: [king('show me')],
    props: [query('EXPLAIN ANALYZE SELECT …'), ...plans('seq', 'guesses', 'real run', 'EXPLAIN', 'EXPLAIN ANALYZE')],
    stop: {
      title: 'It really runs',
      body: (
        <>
          <p>So wrap writes in a transaction you roll back.</p>
          <Code>{`BEGIN;
EXPLAIN ANALYZE
  DELETE FROM users WHERE id = 7;
ROLLBACK;`}</Code>
        </>
      ),
    },
  },
]

/* ── 04 · What an index costs ────────────────────────────────────────── */

const box = (id: string, x: number, y: number, w: number, h: number, text: string, tone: Tone = 'line', label?: string): Prop => ({ id, x, y, w, h, text, tone, label })
const worker = (bubble?: string, tag?: string, hot = false): Actor => ({ id: 'wk', sprite: 'convict-working-hard', x: 100, y: 330, h: 125, bubble, tag, hot })

export const costs: Frame[] = [
  {
    caption: 'Every INSERT writes the row plus one entry in every index.',
    actors: [worker('4 writes', 'INSERT', true)],
    props: [box('a', 220, 40, 160, 80, 'the row', 'ink'), box('b', 400, 40, 160, 80, 'index 1', 'red'), box('c', 580, 40, 160, 80, 'index 2', 'red'), box('d', 400, 140, 160, 80, 'index 3', 'red')],
  },
  {
    caption: 'B-tree is the default. Other kinds fit other data.',
    actors: [worker('pick one')],
    props: [box('a', 220, 40, 160, 80, 'jsonb, arrays', 'line', 'GIN'), box('b', 400, 40, 160, 80, 'time order', 'line', 'BRIN'), box('c', 580, 40, 160, 80, '= only', 'line', 'hash')],
  },
  {
    caption: 'OFFSET 500000 reads 500,000 rows first, then throws them away.',
    actors: [worker('skip, skip…', 'OFFSET', true)],
    props: [box('a', 220, 60, 440, 60, '500,000 wasted', 'ink'), box('b', 680, 60, 100, 60, '20 rows', 'red')],
  },
  {
    caption: 'Keyset pagination, WHERE id > last seen id, jumps straight to the next page.',
    actors: [worker('7 pages', 'keyset')],
    props: [box('a', 220, 60, 440, 60, 'skipped', 'dashed'), box('b', 680, 60, 100, 60, '20 rows', 'red')],
    stop: {
      title: 'The keyset catch',
      body: <p>Sort by a unique key, like (created_at, id). You can go next or back, but not jump to page 37.</p>,
    },
  },
]
