import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * One bank, one stage. Accounts are boxes at the top, transactions are two
 * gophers on the floor (T1 left, T2 right). Red = the thing this step is about.
 */
const FLOOR = 340
const T1S = 'misc-standing-v2'
const T2S = 'dandy-standing'
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
const sum = (v: string): Prop => ({ id: 'sum', x: 330, y: 85, w: 140, h: 60, tone: 'soft', label: 'total', text: big(v) })

export const acid: Frame[] = [
  {
    caption: 'Move 30 from Alice to Bob: two updates that must both happen, or neither.',
    actors: [cart(170, 'move 30')],
    props: [acct('Alice', '100'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'Isolation: Alice is 70 inside the transaction, but others still see 100.',
    actors: [cart(400, '−30 done'), { id: 'aud', sprite: 'fairy-tale-messenger-reading', x: 690, y: FLOOR, h: 125, tag: 'reader', bubble: 'Alice: 100' }],
    props: [acct('Alice', '70?', 'red'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'The server crashes before the second update runs.',
    actors: [cart(400, undefined, { hidden: true }), { id: 'boom', sprite: 'science-experiment-mishap', x: 400, y: FLOOR, h: 125, bubble: 'crash!' }],
    props: [acct('Alice', '70?', 'red'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'Atomicity: after restart Alice is 100 again. Half a transaction never survives.',
    actors: [cart(170, 'retry')],
    props: [acct('Alice', '100'), acct('Bob', '50'), sum('150')],
  },
  {
    caption: 'Durability: COMMIT returns only once the change is safely on disk.',
    actors: [cart(630, 'COMMIT'), { id: 'wal', sprite: 'fairy-tale-witch-learning', x: 400, y: FLOOR, h: 125, tag: 'WAL', bubble: 'on disk' }],
    props: [acct('Alice', '70'), acct('Bob', '80'), sum('150')],
    stop: {
      title: 'Consistency is partly yours',
      body: <p>The database enforces CHECK, UNIQUE and foreign keys. A rule like “the total stays 150” is your code’s job.</p>,
    },
  },
]

/* ───────────────────────── MVCC · versions, not overwrites ───────────────────────── */

const ver = (id: string, x: number, label: string, v: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y: 50, w: 180, h: 100, tone, label, text: big(v, tone === 'red') })

export const mvcc: Frame[] = [
  {
    caption: 'MVCC: an UPDATE writes a new row version and keeps the old one.',
    actors: [t1('set 70'), t2()],
    props: [ver('v1', 180, 'old', '100'), ver('v2', 440, 'new', '70', 'red')],
  },
  {
    caption: 'T2 reads without waiting. T1 hasn’t committed, so T2 sees the old 100.',
    actors: [t1(), t2('I see 100')],
    props: [ver('v1', 180, 'old', '100', 'red'), ver('v2', 440, 'new', '70')],
  },
  {
    caption: 'T1 commits. New reads see 70, and the old version is now dead.',
    actors: [t1('COMMIT'), t2('now 70')],
    props: [ver('v1', 180, 'dead', '100', 'dashed'), ver('v2', 440, 'live', '70')],
  },
  {
    caption: 'Autovacuum, a background cleaner, frees dead versions. The file doesn’t shrink.',
    actors: [{ id: 'broom', sprite: 'fairy-tale-witch-broom', x: 400, y: FLOOR, h: 125, tag: 'autovacuum', bubble: 'sweep!' }, t1(), t2()],
    props: [ver('v1', 180, 'free', '—', 'soft'), ver('v2', 440, 'live', '70')],
    stop: {
      edge: true,
      title: 'Long transactions block cleanup',
      body: <p>Vacuum can’t remove versions an open transaction might still read. One session idle in a transaction for hours lets dead rows pile up.</p>,
    },
  },
]

/* ───────────────────────── Read anomalies ───────────────────────── */

const row = (v: string, tone: Prop['tone'] = 'line', label = 'balance'): Prop => ({ id: 'row', x: 300, y: 90, w: 200, h: 90, tone, label, text: big(v, tone === 'red') })
const lvl = (s: string): Prop => ({ id: 'lvl', x: 250, y: 30, w: 300, h: 40, tone: 'ink', text: mono(s) })

export const reads: Frame[] = [
  {
    caption: 'Read Committed is the default level. T1 reads the balance: 100.',
    actors: [t1('100'), t2()],
    props: [lvl('READ COMMITTED'), row('100')],
  },
  {
    caption: 'T2 sets 50 but hasn’t committed. T1 still reads 100: no dirty reads.',
    actors: [t1('still 100'), t2('set 50…')],
    props: [lvl('READ COMMITTED'), row('100')],
  },
  {
    caption: 'T2 commits. Now 50 is visible to everyone.',
    actors: [t1(), t2('COMMIT')],
    props: [lvl('READ COMMITTED'), row('50', 'red')],
  },
  {
    caption: 'T1 reads again and gets 50. Same query, different answer.',
    actors: [t1('now 50?!', { hot: true }), t2()],
    props: [lvl('READ COMMITTED'), row('50', 'red')],
  },
  {
    caption: 'Repeatable Read: T1 keeps one snapshot, a frozen view, and still sees 100.',
    actors: [t1('still 100'), t2()],
    props: [lvl('REPEATABLE READ'), row('100')],
    stop: {
      title: 'Stricter than the standard',
      body: <p>The SQL standard lets Repeatable Read see rows others insert meanwhile, called a phantom row. PostgreSQL never shows them: one snapshot covers every query.</p>,
    },
  },
]

/* ───────────────────────── Write anomalies ───────────────────────── */

const oncall = (n: string, hot = false): Prop => ({ id: 'row', x: 300, y: 90, w: 200, h: 90, tone: hot ? 'red' : 'line', label: 'on call', text: big(n, hot) })
const doc = (id: 't1' | 't2', name: string, bubble?: string, extra: Partial<Actor> = {}) => (id === 't1' ? t1 : t2)(bubble, { tag: name, ...extra })

export const writes: Frame[] = [
  {
    caption: 'Both read 100 and subtract in Go: T1 saves 70, T2 saves 80.',
    actors: [t1('save 70'), t2('save 80')],
    props: [lvl('READ COMMITTED'), row('100')],
  },
  {
    caption: 'The last write wins: 80. T1’s −30 is gone, a lost update.',
    actors: [t1('COMMIT'), t2('COMMIT')],
    props: [lvl('READ COMMITTED'), row('80', 'red')],
  },
  {
    caption: 'In Repeatable Read, T2 fails with error 40001 because the row changed.',
    actors: [t1('COMMIT'), t2('40001', { sprite: ERR, hot: true })],
    props: [lvl('REPEATABLE READ'), row('70')],
    stop: {
      title: 'Retry on 40001',
      body: (
        <>
          <p>Retry the whole transaction, not just the statement.</p>
          <Code>{`var pe *pgconn.PgError
if errors.As(err, &pe) &&
    pe.Code == "40001" {
    // retry the whole tx
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'In Read Committed, one atomic UPDATE fixes it: SET balance = balance − 30.',
    actors: [t1('−30'), t2('−20')],
    props: [lvl('READ COMMITTED'), row('50')],
    stop: {
      title: 'Or lock the row',
      body: <p>SELECT … FOR UPDATE locks the row you read. T2 waits, then reads 70, not 100.</p>,
    },
  },
  {
    caption: 'Write skew: one doctor must stay on call. Alice and Bob both count 2.',
    actors: [doc('t1', 'Alice', 'count = 2'), doc('t2', 'Bob', 'count = 2')],
    props: [lvl('REPEATABLE READ'), oncall('2')],
  },
  {
    caption: 'Each goes off call. They changed different rows, so both commit: 0 left.',
    actors: [doc('t1', 'Alice', 'off, COMMIT'), doc('t2', 'Bob', 'off, COMMIT')],
    props: [lvl('REPEATABLE READ'), oncall('0', true)],
  },
  {
    caption: 'Serializable spots the pattern and fails Bob’s COMMIT with 40001.',
    actors: [doc('t1', 'Alice', 'COMMIT'), doc('t2', 'Bob', '40001', { sprite: ERR, hot: true })],
    props: [lvl('SERIALIZABLE'), oncall('1')],
  },
]
