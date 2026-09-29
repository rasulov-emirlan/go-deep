import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

type Tone = Prop['tone']

/* ── 01 · Seq Scan vs B-tree ─────────────────────────────────────────── */

const heapRow = (tone: (i: number) => Tone = () => 'line'): Prop[] => [
  ...Array.from({ length: 6 }, (_, i): Prop => ({ id: `h${i}`, x: 150 + i * 88, y: 262, w: 76, h: 70, tone: tone(i), text: '8 KiB' })),
  { id: 'hmore', x: 680, y: 262, w: 110, h: 70, tone: 'none', text: '… 9,346' },
]
const tree = (st: 'none' | 'on' | 'hot'): Prop[] => {
  const t = (on: boolean): Tone => (st === 'none' ? 'dashed' : st === 'hot' && on ? 'red' : 'line')
  return [
    { id: 'root', x: 400, y: 20, w: 130, h: 40, tone: t(true), text: st === 'none' ? 'no index' : 'root' },
    ...[0, 1, 2].map((i): Prop => ({ id: `in${i}`, x: 250 + i * 150, y: 92, w: 110, h: 40, tone: t(i === 1) })),
    ...[0, 1, 2, 3, 4, 5].map((i): Prop => ({ id: `lf${i}`, x: 170 + i * 95, y: 164, w: 80, h: 40, tone: t(i === 3), text: st === 'hot' && i === 3 ? <span className="ix-leaf">u777</span> : undefined })),
  ]
}
const q = (x: number, bubble?: string, tag = 'query', hot = false): Actor => ({ id: 'q', sprite: 'adventure-pushing-cart', x, y: 332, h: 88, tag, bubble, hot })

export const seqVsBtree: Frame[] = [
  {
    caption: 'A table is a heap of 8 KiB pages in no useful order: 1M users fill 9,346.',
    actors: [q(70, 'email = u777?')],
    props: [...tree('none'), ...heapRow()],
  },
  {
    caption: 'No index: a Seq Scan reads every page and checks every row.',
    actors: [q(735, 'read all', '9,346 pages', true)],
    props: [...tree('none'), ...heapRow(() => 'ink').filter((p) => p.id !== 'hmore')],
    stop: {
      title: 'why not stop at the match?',
      body: <p>Nothing says email is unique, so another u777 could sit on the last page. Only a LIMIT 1 lets a Seq Scan stop at the first hit.</p>,
    },
  },
  {
    caption: 'A B-tree index keeps the emails sorted in pages of its own: root, internal, leaves.',
    actors: [q(70, 'email = u777?')],
    props: [...tree('on'), ...heapRow()],
  },
  {
    caption: 'The lookup goes root → internal → leaf, binary-searching inside each page: 3 page reads.',
    actors: [q(70, '3 hops')],
    props: [...tree('hot'), ...heapRow()],
  },
  {
    caption: 'The leaf entry’s ctid points at the row’s heap page, so the total is 4 reads, not 9,346.',
    actors: [q(70, 'done', '4 pages', true)],
    props: [...tree('hot'), ...heapRow((i) => (i === 4 ? 'red' : 'line'))],
    stop: {
      title: 'why logarithmic?',
      body: (
        <p>
          A page holds hundreds of keys, so each level multiplies the reach by hundreds: 1M rows fit in 3 levels, a billion in about 4. Measured on PG18: <code>Buffers: shared hit=1 read=3</code> vs
          9,346 for the Seq Scan.
        </p>
      ),
    },
  },
]

/* ── 02 · Inside the B+tree ──────────────────────────────────────────── */

const LEAF = ['2 4 6', '8 10 12', '14 16 18', '20 22 24']
const HEAP = ['10 22 4', '18 2 14', '6 24 12', '20 8 16']
const bt = (o: { path?: boolean; leaves?: number[]; links?: boolean; heap?: number[] | 'dim'; l1?: string; i0?: string } = {}): Prop[] => [
  { id: 'root', x: 280, y: 10, w: 90, h: 40, tone: o.path ? 'red' : 'line', text: <span className="ix-leaf">14</span> },
  { id: 'lbl-l', x: 20, y: 128, w: 100, h: 20, tone: 'none', label: 'leaves' },
  { id: 'lbl-h', x: 20, y: 228, w: 160, h: 20, tone: 'none', label: 'heap · 3 rows/page' },
  { id: 'i0', x: 110, y: 80, w: 100, h: 40, tone: o.path ? 'red' : 'line', text: <span className="ix-leaf">{o.i0 ?? '8'}</span> },
  { id: 'i1', x: 440, y: 80, w: 100, h: 40, tone: 'line', text: <span className="ix-leaf">20</span> },
  ...LEAF.map((t, i): Prop => ({ id: `l${i}`, x: 20 + i * 160, y: 150, w: 130, h: 44, tone: o.leaves?.includes(i) ? 'red' : 'line', text: <span className="ix-leaf">{i === 1 && o.l1 ? o.l1 : t}</span> })),
  ...[0, 1, 2].map((i): Prop => ({ id: `k${i}`, x: 150 + i * 160, y: 150, w: 30, h: 44, tone: 'none', text: <span className={o.links ? 'ix-hot' : undefined}>⇄</span> })),
  ...HEAP.map(
    (t, i): Prop => ({
      id: `p${i}`,
      x: 20 + i * 160,
      y: 250,
      w: 130,
      h: 44,
      tone: o.heap === 'dim' ? 'dashed' : o.heap?.includes(i) ? 'red' : 'soft',
      text: <span className="ix-leaf">{t}</span>,
    }),
  ),
]
const owl = (bubble?: string, tag?: string, hot = false): Actor => ({ id: 'w', sprite: 'fairy-tale-witch-learning', x: 730, y: 325, h: 115, bubble, tag, hot })

export const anatomy: Frame[] = [
  {
    caption: 'Root and internal pages hold only separator keys; the leaves hold every key, sorted.',
    actors: [owl()],
    props: bt(),
  },
  {
    caption: 'For BETWEEN 10 AND 18, one descent (10 < 14 left, 10 ≥ 8 right) lands on 10’s leaf.',
    actors: [owl('find 10')],
    props: bt({ path: true, leaves: [1] }),
  },
  {
    caption: 'Then it walks right along the leaf links until a key passes 18, with no second descent.',
    actors: [owl('walk right')],
    props: bt({ leaves: [1, 2], links: true }),
    stop: {
      title: 'ranges and ORDER BY',
      body: <p>Sorted, linked leaves are why a B-tree serves ranges, ORDER BY, MIN/MAX and prefix LIKE. Leaves link both ways, so ORDER BY … DESC walks left. A hash index has no order, so it can do none of this.</p>,
    },
  },
  {
    caption: 'Each leaf entry is (key, ctid), and SELECT * follows every ctid into the heap, often to a new page.',
    actors: [owl('4 pages', 'SELECT *', true)],
    props: bt({ leaves: [1, 2], heap: [0, 1, 2, 3] }),
    stop: {
      title: 'Bitmap Heap Scan',
      body: <p>With many matches, random heap jumps get expensive. Postgres then collects all the ctids first, sorts them by page, and reads each heap page once: Bitmap Index Scan → Bitmap Heap Scan.</p>,
    },
  },
  {
    caption: 'SELECT id needs only the key, already in the leaf, so an Index-Only Scan skips the heap.',
    actors: [owl('no heap', 'SELECT id', true)],
    props: bt({ leaves: [1, 2], heap: 'dim' }),
    stop: {
      edge: true,
      title: 'the visibility map',
      body: (
        <p>
          The leaf has no MVCC info. Postgres skips a heap page only if the visibility map marks it all-visible, and VACUUM sets that. Check <code>Heap Fetches:</code> in EXPLAIN ANALYZE. Use{' '}
          <code>INCLUDE (col)</code> to carry extra columns.
        </p>
      ),
    },
  },
  {
    caption: 'Insert 11: its leaf is full, so it splits in two, and the separator 11 moves up into the parent.',
    actors: [owl('split!', 'INSERT 11', true)],
    props: bt({ leaves: [1], l1: '8 10 | 11 12', i0: '8 · 11' }),
    stop: {
      edge: true,
      title: 'UUIDv4 keys',
      body: <p>Random keys land on random leaves, so splits happen all over the tree and leave pages half-empty and cold in cache. Sequential keys (bigserial, UUIDv7) always append to the rightmost leaf.</p>,
    },
  },
]

/* ── 03 · Composite index ────────────────────────────────────────────── */

const CC = ['kg', 'kz', 'ru', 'us']
const cleaves = (tone: (i: number) => Tone): Prop[] =>
  Array.from({ length: 8 }, (_, i): Prop => ({
    id: `c${i}`,
    x: 10 + i * 98,
    y: 120,
    w: 90,
    h: 50,
    tone: tone(i),
    text: (
      <span className="ix-cl">
        {CC[i >> 1]}
        <b>{i % 2 ? '48–77' : '18–47'}</b>
      </span>
    ),
  }))
const croot = (hot = false): Prop => ({ id: 'croot', x: 330, y: 40, w: 140, h: 40, tone: hot ? 'red' : 'line', text: <span className="ix-leaf">root</span> })
const clbl: Prop = { id: 'clbl', x: 10, y: 98, w: 200, h: 20, tone: 'none', label: 'leaves of (country, age)' }
const sql = (s: string): Prop => ({ id: 'sql', x: 150, y: 240, w: 640, h: 60, tone: 'soft', text: <code className="ix-sql">{s}</code> })
const planner = (bubble?: string, hot = false): Actor => ({ id: 'g', sprite: 'fairy-tale-messenger-reading', x: 70, y: 330, h: 105, bubble, hot })

export const composite: Frame[] = [
  {
    caption: 'An index on (country, age) is sorted like a phone book: by country, then by age within each country.',
    actors: [planner()],
    props: [clbl, croot(), ...cleaves(() => 'line'), sql('CREATE INDEX ON users (country, age)')],
  },
  {
    caption: 'country = kg AND age 30–31: one descent, then one short contiguous slice.',
    actors: [planner('1 seek')],
    props: [clbl, croot(true), ...cleaves((i) => (i === 0 ? 'red' : 'line')), sql("WHERE country = 'kg' AND age BETWEEN 30 AND 31")],
    stop: {
      title: 'equality first, range last',
      body: <p>With (age, country), the range comes first: it scans every country’s ages 30–31 and only filters on country along the way. Equality columns first keeps the matches in one slice.</p>,
    },
  },
  {
    caption: 'age = 30 alone: the matches sit inside every country block, not in one slice.',
    actors: [planner('scattered')],
    props: [clbl, croot(), ...cleaves((i) => (i % 2 ? 'line' : 'red')), sql('WHERE age = 30')],
  },
  {
    caption: 'Before PG18 nothing can seek on age alone, so it reads the whole index or the table.',
    actors: [planner('read it all', true)],
    props: [clbl, croot(), ...cleaves(() => 'ink'), sql('WHERE age = 30   -- PG ≤ 17')],
    stop: {
      title: 'the leftmost prefix',
      body: <p>(country, age) can seek on country, or on country + age. age alone isn’t a prefix. After a range on one column, the next column is only a filter.</p>,
    },
  },
  {
    caption: 'PostgreSQL 18 skip scan jumps to each distinct country, then seeks age = 30 inside it.',
    actors: [planner('4 seeks')],
    props: [clbl, croot(true), ...cleaves((i) => (i % 2 ? 'line' : 'red')), sql('WHERE age = 30   -- PG 18 skip scan')],
    stop: {
      edge: true,
      title: 'when skip scan helps',
      body: (
        <p>
          Only when the skipped column has few distinct values: 4 countries, yes; 1M emails, no. EXPLAIN ANALYZE in PG18 prints the number of seeks as <code>Index Searches: N</code>.
        </p>
      ),
    },
  },
  {
    caption: 'Within kg the ages come out sorted, so ORDER BY age LIMIT 10 needs no Sort and stops early.',
    actors: [planner('no Sort')],
    props: [clbl, croot(true), ...cleaves((i) => (i === 0 ? 'red' : 'line')), sql("WHERE country = 'kg' ORDER BY age LIMIT 10")],
  },
]

/* ── 04 · Why the index is ignored ───────────────────────────────────── */

const paths = (win: 'idx' | 'seq', idx = 'Index Scan', seq = 'Seq Scan'): Prop[] => [
  { id: 'pidx', x: 30, y: 150, w: 240, h: 80, tone: win === 'idx' ? 'red' : 'dashed', label: 'plan A', text: idx },
  { id: 'pseq', x: 530, y: 150, w: 240, h: 80, tone: win === 'seq' ? 'red' : 'dashed', label: 'plan B', text: seq },
]
const query = (s: string): Prop => ({ id: 'qq', x: 20, y: 30, w: 760, h: 56, tone: 'soft', text: <code className="ix-sql">{s}</code> })
const king = (bubble: string, hot = false): Actor => ({ id: 'k', sprite: 'fairy-tale-king', x: 400, y: 330, h: 140, bubble, hot, tag: 'planner' })

export const ignored: Frame[] = [
  {
    caption: 'The planner prices every plan from table statistics and runs the cheapest: an index is an option, not an order.',
    actors: [king('index: 4 pages')],
    props: [query("WHERE email = 'u777@x.io'"), ...paths('idx')],
  },
  {
    caption: 'Low selectivity: status = done matches 99% of rows, so reading every page in order is cheaper.',
    actors: [king('Seq Scan', true)],
    props: [query("WHERE status = 'done'   -- 99% of rows"), ...paths('seq')],
    stop: {
      title: 'random vs sequential',
      body: <p>By default a random page costs 4 and a sequential page costs 1 (random_page_cost, seq_page_cost). On PG18, status = 'done' (99%) got a Seq Scan and status = 'pending' (1%) used the index.</p>,
    },
  },
  {
    caption: 'A function on the column: the index stores email, not lower(email), so it can’t match.',
    actors: [king('Seq Scan', true)],
    props: [query("WHERE lower(email) = 'u777@x.io'"), ...paths('seq')],
    stop: { edge: true, title: 'fix', body: <p>Index the expression itself: <code>CREATE INDEX ON users (lower(email))</code>. The same applies to <code>created_at::date</code>.</p> },
  },
  {
    caption: 'An implicit cast: 5.0 is numeric, so Postgres casts the column, (id)::numeric, and the bigint index can’t be used.',
    actors: [king('Seq Scan', true)],
    props: [query('WHERE id = 5.0   -- Filter: (id)::numeric = 5.0'), ...paths('seq')],
  },
  {
    caption: "LIKE '%@x.io' has no fixed prefix to seek to, so the B-tree can’t help.",
    actors: [king('Seq Scan', true)],
    props: [query("WHERE email LIKE '%@x.io'"), ...paths('seq', 'B-tree', 'Seq Scan')],
    stop: {
      edge: true,
      title: 'even a prefix LIKE',
      body: (
        <p>
          <code>LIKE 'u7%'</code> skips a plain B-tree unless the collation is C. Build it with <code>text_pattern_ops</code>. For <code>'%x%'</code>, use a pg_trgm GIN index.
        </p>
      ),
    },
  },
  {
    caption: 'After a bulk load without ANALYZE, the planner expected 1 row, got 500,000, and chose the index.',
    actors: [king('rows=1?', true)],
    props: [query('Index Scan (rows=1) (actual rows=500000)'), ...paths('idx', 'Index Scan ✗', 'Seq Scan ✓')],
    stop: {
      edge: true,
      title: 'spot it, fix it',
      body: <p>A 10× gap between estimated and actual rows means bad statistics. Run ANALYZE. For skewed or correlated columns, raise SET STATISTICS or add CREATE STATISTICS.</p>,
    },
  },
  {
    caption: 'EXPLAIN shows the plan and estimates; EXPLAIN ANALYZE also runs it and adds real rows and timings.',
    actors: [king('show me')],
    props: [
      query('EXPLAIN (ANALYZE, BUFFERS) SELECT …'),
      { id: 'pidx', x: 30, y: 150, w: 240, h: 80, tone: 'dashed', label: 'EXPLAIN', text: 'plan + estimates' },
      { id: 'pseq', x: 530, y: 150, w: 240, h: 80, tone: 'red', label: 'EXPLAIN ANALYZE', text: 'runs it: + actual rows, time' },
    ],
    stop: {
      title: 'it really runs',
      body: (
        <>
          <p>ANALYZE executes the statement, so wrap writes in a transaction you roll back. BUFFERS shows the number of pages touched.</p>
          <Code>{`BEGIN;
EXPLAIN ANALYZE
  DELETE FROM users WHERE id = 7;
ROLLBACK;`}</Code>
        </>
      ),
    },
  },
]

/* ── 05 · Costs, kinds, access patterns ──────────────────────────────── */

const box = (id: string, x: number, y: number, w: number, h: number, text: string, tone: Tone = 'line', label?: string): Prop => ({ id, x, y, w, h, text, tone, label })
const worker = (bubble?: string, tag?: string, hot = false, x = 100): Actor => ({ id: 'wk', sprite: 'convict-working-hard', x, y: 330, h: 125, bubble, tag, hot })

export const costs: Frame[] = [
  {
    caption: 'Every INSERT writes the heap row plus an entry in every index: 5 indexes means 6 writes.',
    actors: [worker('6 writes', 'INSERT', true)],
    props: [box('heap', 200, 60, 150, 90, 'heap row', 'ink'), ...[0, 1, 2, 3, 4].map((i) => box(`ix${i}`, 400 + (i % 3) * 130, i < 3 ? 40 : 150, 110, 70, `index ${i + 1}`, 'red'))],
    stop: {
      title: 'HOT updates',
      body: <p>An UPDATE that changes no indexed column, and fits on the same page, is HOT: a new row version with no index writes. Indexing that column loses HOT. Hunt unused indexes with pg_stat_user_indexes.idx_scan = 0.</p>,
    },
  },
  {
    caption: "A partial index keeps only the rows you query: 240 kB with WHERE status = 'pending', versus 21 MB.",
    actors: [worker('tiny', 'partial')],
    props: [box('full', 200, 40, 360, 180, '(created_at) · 21 MB', 'line'), box('part', 600, 170, 60, 50, '240 kB', 'red')],
  },
  {
    caption: 'Other kinds: GIN maps values to rows, hash does equality only, BRIN stores min/max per block range.',
    actors: [worker('pick one')],
    props: [
      box('gin', 190, 30, 190, 110, 'GIN · jsonb @>, arrays, full text, trgm', 'line'),
      box('hash', 400, 30, 180, 110, 'hash · = only, no ranges, no sort', 'line'),
      box('brin', 600, 30, 180, 110, 'BRIN · 24 kB for 1M timestamps', 'red'),
    ],
    stop: {
      edge: true,
      title: 'BRIN’s catch',
      body: <p>BRIN only works when values follow disk order, as in an append-only created_at. On a column with shuffled values, every block range covers everything, and the index can skip nothing.</p>,
    },
  },
  {
    caption: 'N+1: one query loads 100 orders, then the loop queries each order’s user, making 101 round trips.',
    actors: [worker('again…', '×101', true, 420)],
    props: [box('app', 190, 50, 150, 90, 'Go app'), box('db', 560, 50, 150, 90, 'Postgres', 'ink'), box('trip', 350, 80, 200, 30, '⇄ ⇄ ⇄ ⇄ ⇄', 'none')],
  },
  {
    caption: 'Fix it with a JOIN or one batched WHERE id = ANY($1) query: 2 round trips instead of 101.',
    actors: [worker('2 trips', 'batched', false, 420)],
    props: [box('app', 190, 50, 150, 90, 'Go app'), box('db', 560, 50, 150, 90, 'Postgres', 'ink'), box('trip', 350, 80, 200, 30, '⇄', 'none')],
    stop: {
      title: 'in Go (pgx)',
      body: (
        <Code>{`// ids is a []int64
rows, err := pool.Query(ctx,
    \`SELECT id, name FROM users
     WHERE id = ANY($1)\`, ids)`}</Code>
      ),
    },
  },
  {
    caption: 'OFFSET 500000 walks and discards 500,000 rows first: on PG18 that read 6,042 pages for 20 rows.',
    actors: [worker('skip, skip…', 'OFFSET', true, 420)],
    props: [box('rowsA', 190, 60, 520, 60, '500,000 read and discarded', 'ink'), box('pageA', 720, 60, 70, 60, '20', 'red')],
  },
  {
    caption: 'Keyset pagination (WHERE id > $last ORDER BY id LIMIT 20) seeks straight there: 7 pages at any depth.',
    actors: [worker('7 pages', 'keyset', false, 420)],
    props: [box('rowsA', 190, 60, 520, 60, 'skipped by the seek', 'dashed'), box('pageA', 720, 60, 70, 60, '20', 'red')],
    stop: {
      edge: true,
      title: 'ties and page numbers',
      body: <p>Sort on a unique key: use (created_at, id) with WHERE (created_at, id) &lt; ($1, $2). The catch is that you can’t jump to page 37, only to next or previous.</p>,
    },
  },
]
