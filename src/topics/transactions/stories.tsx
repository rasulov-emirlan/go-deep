import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * One bank, one stage. Accounts are boxes at the top, transactions are two
 * gophers on the floor (T1 left, T2 right), rows being fought over sit in the
 * middle. Red = the thing this step is about.
 */
const FLOOR = 340
const T1S = 'misc-standing-v2'
const T2S = 'dandy-standing'
const WAIT = 'convict-chained'
const ERR = 'fairy-tale-messenger-red-letter'

const t1 = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 't1', sprite: T1S, x: 110, y: FLOOR, h: 130, tag: 'T1', bubble, ...extra })
const t2 = (bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 't2', sprite: T2S, x: 690, y: FLOOR, h: 130, tag: 'T2', bubble, ...extra })

const big = (s: string, hot = false) => <span className={'tx-big' + (hot ? ' tx-hot' : '')}>{s}</span>
const mono = (s: string) => <span className="tx-mono">{s}</span>

/* ───────────────────────── ACID · a money transfer ───────────────────────── */

const acct = (who: 'Alice' | 'Bob', v: string, tone: Prop['tone'] = 'line'): Prop => ({
  id: who,
  x: who === 'Alice' ? 40 : 560,
  y: 70,
  w: 200,
  h: 90,
  label: who,
  text: big(v, tone === 'red'),
  tone,
})
const cart = (x: number, bubble?: string, extra: Partial<Actor> = {}): Actor => ({ id: 'cart', sprite: 'adventure-pushing-cart', x, y: FLOOR, h: 120, tag: 'transfer', bubble, ...extra })
const sum = (v: string, hot = false): Prop => ({ id: 'sum', x: 330, y: 85, w: 140, h: 60, tone: hot ? 'red' : 'soft', label: 'total', text: big(v, hot) })

export const acid: Frame[] = [
  {
    caption: 'Move 30 from Alice to Bob: two UPDATEs that must succeed or fail together.',
    actors: [cart(170, 'move 30')],
    props: [acct('Alice', '100'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'BEGIN, first UPDATE: Alice becomes 70, but only inside this transaction.',
    actors: [cart(400, '−30 done'), { id: 'aud', sprite: 'fairy-tale-messenger-reading', x: 690, y: FLOOR, h: 125, tag: 'auditor', bubble: '100 + 50 ✓' }],
    props: [acct('Alice', '70?', 'red'), acct('Bob', '50'), sum('150')],
    stop: {
      title: 'Isolation',
      body: <p>Other sessions keep seeing Alice at 100 until COMMIT. The auditor never sees money in flight.</p>,
    },
  },
  {
    caption: 'The server crashes before the second UPDATE runs.',
    actors: [cart(400, undefined, { hidden: true }), { id: 'boom', sprite: 'science-experiment-mishap', x: 400, y: FLOOR, h: 125, bubble: 'crash!' }],
    props: [acct('Alice', '70?', 'red'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'After restart Alice is back at 100: the half-done transaction never committed.',
    actors: [cart(170, 'retry')],
    props: [acct('Alice', '100'), acct('Bob', '50'), sum('150')],
    stop: {
      title: 'Atomicity without an undo log',
      body: (
        <p>
          PostgreSQL doesn’t undo anything. The crashed transaction’s new row version just belongs to an xid that never committed, so every reader skips it and VACUUM removes it later.
        </p>
      ),
    },
  },
  {
    caption: 'Retry: both UPDATEs, then COMMIT. Alice 70, Bob 80, total still 150.',
    actors: [cart(630, 'COMMIT'), { id: 'wal', sprite: 'fairy-tale-witch-learning', x: 400, y: FLOOR, h: 125, tag: 'WAL', bubble: 'flushed' }],
    props: [acct('Alice', '70'), acct('Bob', '80'), sum('150')],
    stop: {
      title: 'Durability = the WAL',
      body: (
        <p>
          COMMIT returns only after its WAL record is flushed to disk; table pages are written later. With <code>synchronous_commit = off</code> a crash can lose the last few hundred ms of commits,
          but never corrupts data.
        </p>
      ),
    },
  },
  {
    caption: 'Alice tries to send 200. CHECK (balance >= 0) fails, and the whole transaction rolls back.',
    actors: [cart(170, 'send 200'), { id: 'wal', sprite: ERR, x: 400, y: FLOOR, h: 125, tag: 'CHECK', bubble: 'rejected' }],
    props: [acct('Alice', '70'), acct('Bob', '80'), sum('150')],
    stop: {
      edge: true,
      title: 'Consistency is partly yours',
      body: <p>The database enforces constraints you declare: CHECK, FOREIGN KEY, UNIQUE. “Total stays 150” is a business rule only your transaction logic can keep.</p>,
    },
  },
]

/* ───────────────────────── MVCC · versions, not overwrites ───────────────────────── */

const tup = (id: string, x: number, xmin: string, xmax: string, bal: string, tone: Prop['tone'] = 'line', hidden = false): Prop => ({
  id,
  x,
  y: 48,
  w: 170,
  h: 116,
  tone,
  hidden,
  text: (
    <span className="tx-tuple">
      <span>xmin {xmin}</span>
      <span>xmax {xmax}</span>
      <b>{bal}</b>
    </span>
  ),
})
const page: Prop = { id: 'page', x: 20, y: 16, w: 760, h: 156, tone: 'dashed', label: 'heap page · table acct' }

export const mvcc: Frame[] = [
  {
    caption: 'Each row version (a tuple) is stamped with xmin: the transaction that created it.',
    actors: [t1(), t2()],
    props: [page, tup('v1', 60, '923', '0', '100')],
  },
  {
    caption: 'T1 (xid 924) runs UPDATE. Nothing is overwritten: a new tuple appears, and the old one gets xmax = 924.',
    actors: [t1('UPDATE → 70'), t2()],
    props: [page, tup('v1', 60, '923', '924', '100'), tup('v2', 260, '924', '0', '70', 'red')],
  },
  {
    caption: 'T2 reads the same row without waiting. Its snapshot says 924 hasn’t committed, so it sees 100.',
    actors: [t1(), t2('I see 100')],
    props: [page, tup('v1', 60, '923', '924', '100', 'red'), tup('v2', 260, '924', '0', '70')],
    stop: {
      title: 'Readers don’t block writers',
      body: <p>A plain SELECT takes no row locks. It checks each tuple’s xmin and xmax against its snapshot: the list of transactions that were committed when the snapshot was taken.</p>,
    },
  },
  {
    caption: 'T1 commits. New snapshots see 70, and the old tuple is dead once no snapshot needs it.',
    actors: [t1('COMMIT'), t2('now 70')],
    props: [page, tup('v1', 60, '923', '924', 'dead', 'dashed'), tup('v2', 260, '924', '0', '70')],
  },
  {
    caption: 'Another UPDATE (xid 925) sets 40: one more dead tuple. Meanwhile T2 sits idle inside a transaction.',
    actors: [t1(), t2('idle for hours', { sprite: 'fairy-tale-witch-old', hot: true })],
    props: [page, tup('v1', 60, '923', '924', 'dead', 'dashed'), tup('v2', 260, '924', '925', 'dead', 'dashed'), tup('v3', 460, '925', '0', '40', 'red')],
    stop: {
      edge: true,
      title: 'Long transactions block cleanup',
      body: <p>Vacuum may only remove tuples that no open snapshot can still see. One session left idle in a transaction for hours pins every dead tuple created since it began.</p>,
    },
  },
  {
    caption: 'Once it ends, autovacuum marks the dead tuples’ space reusable. The file doesn’t shrink.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: 330, y: FLOOR, h: 125, tag: 'autovacuum', bubble: 'sweep!' }, t1(), t2()],
    props: [page, tup('v1', 60, '—', '—', 'free', 'soft'), tup('v2', 260, '—', '—', 'free', 'soft'), tup('v3', 460, '925', '0', '40')],
    stop: {
      edge: true,
      title: 'VACUUM vs VACUUM FULL',
      body: (
        <p>
          Plain VACUUM runs alongside traffic and frees space inside the file. VACUUM FULL rewrites the table under an ACCESS EXCLUSIVE lock. Vacuum also freezes old tuples so 32-bit transaction
          ids can wrap around safely.
        </p>
      ),
    },
  },
  {
    caption: 'Isolation levels differ in when the snapshot is taken: per statement, or once per transaction.',
    actors: [t1('per statement', { tag: 'READ COMMITTED' }), t2('per transaction', { tag: 'REPEATABLE READ' })],
    props: [page, tup('v3', 460, '925', '0', '40')],
  },
]

/* ───────────────────────── Read anomalies ───────────────────────── */

const row = (v: string, tone: Prop['tone'] = 'line', label = 'balance'): Prop => ({ id: 'row', x: 300, y: 90, w: 200, h: 90, tone, label, text: big(v, tone === 'red') })
const lvl = (s: string): Prop => ({ id: 'lvl', x: 250, y: 30, w: 300, h: 40, tone: 'ink', text: mono(s) })
const rows3 = (third: 'none' | 'new' | 'seen'): Prop[] => [
  { id: 'r1', x: 300, y: 90, w: 200, h: 36, text: mono('id 1 · 100') },
  { id: 'r2', x: 300, y: 132, w: 200, h: 36, text: mono('id 2 · 50') },
  { id: 'r3', x: 300, y: 174, w: 200, h: 36, tone: third === 'new' ? 'red' : 'line', hidden: third === 'none', text: mono('id 3 · 10') },
]

export const reads: Frame[] = [
  {
    caption: 'Dirty read? T1 sets the balance to 0 without committing. T2 still reads 100.',
    actors: [t1('set 0…'), t2('I see 100')],
    props: [lvl('ANY LEVEL'), row('100')],
    stop: {
      edge: true,
      title: 'Impossible in PostgreSQL',
      body: <p>A snapshot never includes uncommitted tuples. You may ask for READ UNCOMMITTED, but PostgreSQL runs it as Read Committed (checked on PostgreSQL 18).</p>,
    },
  },
  {
    caption: 'Non-repeatable read, step 1: T1 reads the balance and gets 100.',
    actors: [t1('100'), t2()],
    props: [lvl('READ COMMITTED'), row('100')],
  },
  {
    caption: 'T2 sets it to 50 and commits.',
    actors: [t1(), t2('set 50, COMMIT')],
    props: [lvl('READ COMMITTED'), row('50', 'red')],
  },
  {
    caption: 'In Read Committed, the default, T1 reads again and gets 50: each statement takes a fresh snapshot.',
    actors: [t1('now 50?!', { hot: true }), t2()],
    props: [lvl('READ COMMITTED'), row('50', 'red')],
  },
  {
    caption: 'In Repeatable Read, T1 keeps the snapshot from its first query and still sees 100.',
    actors: [t1('still 100'), t2()],
    props: [lvl('REPEATABLE READ'), row('100')],
    stop: {
      title: 'The snapshot starts at the first query',
      body: <p>Not at BEGIN. Anything committed between BEGIN and your first statement is visible to the whole transaction.</p>,
    },
  },
  {
    caption: 'Phantom: T1 counts rows with balance > 0 and gets 2. T2 inserts a third and commits.',
    actors: [t1('count = 2'), t2('INSERT, COMMIT')],
    props: [lvl('WHERE balance > 0'), ...rows3('new')],
  },
  {
    caption: 'Read Committed: the recount says 3. Repeatable Read: still 2.',
    actors: [t1('RC 3, RR 2', { hot: true }), t2()],
    props: [lvl('WHERE balance > 0'), ...rows3('seen')],
    stop: {
      title: 'Stronger than the standard',
      body: <p>The SQL standard lets Repeatable Read show phantoms. PostgreSQL’s doesn’t, because the whole transaction reads one snapshot. That is snapshot isolation.</p>,
    },
  },
]

/* ───────────────────────── Write anomalies ───────────────────────── */

const oncall = (n: string, hot = false): Prop => ({ id: 'row', x: 300, y: 90, w: 200, h: 90, tone: hot ? 'red' : 'line', label: 'on call', text: big(n, hot) })
const doc = (id: 't1' | 't2', name: string, bubble?: string, extra: Partial<Actor> = {}) => (id === 't1' ? t1 : t2)(bubble, { tag: `T${id[1]} · ${name}`, ...extra })

const cell = (id: string, x: number, y: number, w: number, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y, w, h: 40, tone, text: mono(text) })
const ROWS: [string, string, string][] = [
  ['READ COMMITTED', 'allowed', 'allowed'],
  ['REPEATABLE READ', '40001', 'allowed'],
  ['SERIALIZABLE', '40001', '40001'],
]
const matrix: Prop[] = [
  cell('lvl', 360, 30, 150, 'lost update', 'none'),
  cell('row', 520, 30, 150, 'write skew', 'none'),
  ...ROWS.flatMap(([lv, lost, skew], i) => [
    cell('m' + i, 130, 76 + i * 46, 220, lv, 'soft'),
    cell('l' + i, 360, 76 + i * 46, 150, lost, lost === 'allowed' ? 'red' : 'line'),
    cell('k' + i, 520, 76 + i * 46, 150, skew, skew === 'allowed' ? 'red' : 'line'),
  ]),
]

export const writes: Frame[] = [
  {
    caption: 'Lost update: T1 and T2 both read balance 100.',
    actors: [t1('100'), t2('100')],
    props: [lvl('READ COMMITTED'), row('100')],
  },
  {
    caption: 'T1 writes 100 − 30 = 70. T2 writes 100 − 20 = 80 and waits for T1’s row lock.',
    actors: [t1('SET 70'), t2('SET 80…', { sprite: WAIT })],
    props: [lvl('READ COMMITTED'), row('70?', 'red')],
  },
  {
    caption: 'T1 commits, T2’s write goes through: final balance 80. T1’s −30 is lost.',
    actors: [t1('COMMIT'), t2('COMMIT')],
    props: [lvl('READ COMMITTED'), row('80', 'red')],
  },
  {
    caption: 'Same race in Repeatable Read: T2 gets “could not serialize access due to concurrent update”.',
    actors: [t1('COMMIT'), t2('40001', { sprite: ERR, hot: true })],
    props: [lvl('REPEATABLE READ'), row('70')],
    stop: {
      title: 'First updater wins',
      body: (
        <>
          <p>If a row you update changed after your snapshot, you get SQLSTATE 40001, even for an atomic <code>balance = balance − 20</code>. Retry the whole transaction.</p>
          <Code>{`var pe *pgconn.PgError
if errors.As(err, &pe) && pe.Code == "40001" {
    // retry the whole tx
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Write skew: at least one doctor must stay on call. Alice and Bob each count 2.',
    actors: [doc('t1', 'Alice', 'count = 2'), doc('t2', 'Bob', 'count = 2')],
    props: [lvl('REPEATABLE READ'), oncall('2')],
  },
  {
    caption: 'Each takes themself off call. Different rows, so no conflict: both commit, nobody is on call.',
    actors: [doc('t1', 'Alice', 'off, COMMIT'), doc('t2', 'Bob', 'off, COMMIT')],
    props: [lvl('REPEATABLE READ'), oncall('0', true)],
  },
  {
    caption: 'Serializable tracks what each transaction read, and fails Bob’s COMMIT with 40001.',
    actors: [doc('t1', 'Alice', 'COMMIT'), doc('t2', 'Bob', '40001', { sprite: ERR, hot: true })],
    props: [lvl('SERIALIZABLE'), oncall('1')],
    stop: {
      title: 'SSI never blocks',
      body: (
        <p>
          Serializable adds SIRead locks that only record reads and never wait. When reads and writes form a dangerous cycle, one transaction fails, here at COMMIT. False positives happen, so
          always retry.
        </p>
      ),
    },
  },
  {
    caption: 'In PostgreSQL: Read Committed allows both, Repeatable Read stops lost updates, Serializable stops both.',
    actors: [t1(undefined, { dim: true }), t2(undefined, { dim: true })],
    props: [
      ...matrix,
    ],
  },
]

/* ───────────────────────── Locks & deadlocks ───────────────────────── */

const acc = (id: 'A' | 'B', owner?: string, hot = false): Prop => ({
  id,
  x: id === 'A' ? 180 : 440,
  y: 90,
  w: 180,
  h: 80,
  tone: hot ? 'red' : owner ? 'ink' : 'line',
  label: id === 'A' ? 'row: Alice' : 'row: Bob',
  text: mono(owner ? `locked · ${owner}` : 'free'),
})
const code = (s: string): Prop => ({ id: 'code', x: 170, y: 60, w: 460, h: 80, tone: 'soft', text: <span className="tx-mono tx-pre">{s}</span> })

export const locks: Frame[] = [
  {
    caption: 'Fix the lost update by locking what you read: SELECT … FOR UPDATE.',
    actors: [t1('locked: 100'), t2()],
    props: [acc('A', 'T1')],
  },
  {
    caption: 'T2’s FOR UPDATE waits. When T1 commits 70, T2 wakes up and reads 70, not 100.',
    actors: [t1('COMMIT'), t2('got 70', { hot: true })],
    props: [acc('A', 'T2')],
  },
  {
    caption: 'Better: one atomic UPDATE, so the check and the write can’t be split.',
    actors: [t1('UPDATE 1'), t2('UPDATE 0', { hot: true })],
    props: [code('UPDATE acct\nSET balance = balance − 80\nWHERE id = 1 AND balance >= 80')],
    stop: {
      title: 'The WHERE is re-checked',
      body: (
        <p>
          In Read Committed, a blocked UPDATE re-evaluates its WHERE on the newest row version once the lock is released. Two −80 withdrawals from 100: one gets UPDATE 1, the other UPDATE 0.
          Check <code>RowsAffected()</code>.
        </p>
      ),
    },
  },
  {
    caption: 'Deadlock: T1 moves money Alice → Bob, T2 moves Bob → Alice. Each locks its first row.',
    actors: [t1('lock Alice'), t2('lock Bob')],
    props: [acc('A', 'T1'), acc('B', 'T2')],
  },
  {
    caption: 'Now each waits for the other’s row. Neither can ever proceed.',
    actors: [t1('need Bob…', { sprite: WAIT }), t2('need Alice…', { sprite: WAIT })],
    props: [acc('A', 'T1', true), acc('B', 'T2', true)],
  },
  {
    caption: 'After deadlock_timeout (1 s) the detector aborts one: “deadlock detected”, SQLSTATE 40P01.',
    actors: [t1('40P01', { sprite: ERR, hot: true }), t2('UPDATE 1'), { id: 'king', sprite: 'fairy-tale-king', x: 400, y: FLOOR, h: 125, tag: 'detector', bubble: 'T1, abort!' }],
    props: [acc('A', 'T2'), acc('B', 'T2')],
    stop: {
      title: 'Who dies?',
      body: <p>The check runs in the session whose deadlock_timeout fires first, usually the one that waited longest, and that session aborts. On PostgreSQL 18 T1 got the error and T2 finished.</p>,
    },
  },
  {
    caption: 'Fix: lock rows in one global order, e.g. lower account id first. T2 now just waits its turn.',
    actors: [t1('Alice, then Bob'), t2('waiting', { sprite: WAIT })],
    props: [acc('A', 'T1'), acc('B', 'T1')],
  },
  {
    caption: 'Job queue: with SKIP LOCKED each worker grabs a different job instead of queueing.',
    actors: [
      { id: 't1', sprite: 'adventure-pirate-lifting-goods', x: 110, y: FLOOR, h: 125, tag: 'worker 1', bubble: 'job 1' },
      { id: 't2', sprite: 'convict-working-hard', x: 690, y: FLOOR, h: 125, tag: 'worker 2', bubble: 'job 2' },
    ],
    props: [
      { id: 'A', x: 150, y: 90, w: 150, h: 80, tone: 'ink', label: 'job 1', text: mono('locked · w1') },
      { id: 'B', x: 325, y: 90, w: 150, h: 80, tone: 'ink', label: 'job 2', text: mono('locked · w2') },
      { id: 'j3', x: 500, y: 90, w: 150, h: 80, label: 'job 3', text: mono('free') },
    ],
    stop: {
      edge: true,
      title: 'SKIP LOCKED',
      body: (
        <>
          <Code>{`SELECT id FROM jobs
WHERE NOT done
ORDER BY id LIMIT 1
FOR UPDATE SKIP LOCKED`}</Code>
          <p>The result deliberately ignores locked rows, so it’s an inconsistent view. Fine for a queue, wrong for anything else.</p>
        </>
      ),
    },
  },
]
