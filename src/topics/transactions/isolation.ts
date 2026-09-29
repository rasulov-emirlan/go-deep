/**
 * Scripted two-transaction races and what PostgreSQL 18 actually does at each
 * isolation level. Every output here was recorded from a real postgres:18.4
 * server (two pgx connections stepping in this exact order).
 */
export type Level = 'rc' | 'rr' | 'ser'
export type ScenarioId = 'lost' | 'skew' | 'nonrepeat' | 'phantom'
export type Tone = 'ok' | 'wait' | 'err' | 'hot'
export type Row = { t: 1 | 2; sql: string; out: string; tone: Tone }
export type Verdict = 'anomaly' | 'safe' | 'retry'
export type Run = { rows: Row[]; verdict: Verdict; outcome: string }

export const levels: { v: Level; label: string; sql: string }[] = [
  { v: 'rc', label: 'Read Committed', sql: 'READ COMMITTED' },
  { v: 'rr', label: 'Repeatable Read', sql: 'REPEATABLE READ' },
  { v: 'ser', label: 'Serializable', sql: 'SERIALIZABLE' },
]

export const scenarios: { v: ScenarioId; label: string; setup: string }[] = [
  { v: 'lost', label: 'Lost update', setup: 'acct 1 has balance 100. T1 withdraws 30, T2 withdraws 20, both computing in Go.' },
  { v: 'skew', label: 'Write skew', setup: 'alice and bob are on call. Rule: at least one stays on call.' },
  { v: 'nonrepeat', label: 'Non-repeatable read', setup: 'acct 1 has balance 100. T1 reads it twice.' },
  { v: 'phantom', label: 'Phantom', setup: 'acct has 2 rows with balance > 0. T1 counts them twice.' },
]

const SER_UPDATE = 'ERROR 40001: could not serialize access due to concurrent update'
const SER_RW = 'ERROR 40001: could not serialize access due to read/write dependencies among transactions'

const r = (t: 1 | 2, sql: string, out: string, tone: Tone = 'ok'): Row => ({ t, sql, out, tone })

export function run(s: ScenarioId, l: Level): Run {
  const snap = l !== 'rc' // one snapshot per transaction
  switch (s) {
    case 'lost':
      return {
        rows: [
          r(1, 'SELECT balance FROM acct WHERE id = 1', '100'),
          r(2, 'SELECT balance FROM acct WHERE id = 1', '100'),
          r(1, 'UPDATE acct SET balance = 70 WHERE id = 1', 'UPDATE 1'),
          r(2, 'UPDATE acct SET balance = 80 WHERE id = 1', 'waits for T1’s row lock…', 'wait'),
          r(1, 'COMMIT', 'COMMIT'),
          snap ? r(2, '(lock released)', SER_UPDATE, 'err') : r(2, '(lock released)', 'UPDATE 1', 'hot'),
          snap ? r(2, 'COMMIT', 'ROLLBACK') : r(2, 'COMMIT', 'COMMIT'),
        ],
        verdict: snap ? 'retry' : 'anomaly',
        outcome: snap ? 'balance = 70. T2 must retry: it will read 70 and write 50.' : 'balance = 80. T1’s −30 vanished: a lost update.',
      }
    case 'skew':
      return {
        rows: [
          r(1, 'SELECT count(*) FROM docs WHERE on_call', '2'),
          r(2, 'SELECT count(*) FROM docs WHERE on_call', '2'),
          r(1, "UPDATE docs SET on_call = false WHERE name = 'alice'", 'UPDATE 1'),
          r(2, "UPDATE docs SET on_call = false WHERE name = 'bob'", 'UPDATE 1'),
          r(1, 'COMMIT', 'COMMIT'),
          l === 'ser' ? r(2, 'COMMIT', SER_RW, 'err') : r(2, 'COMMIT', 'COMMIT', 'hot'),
        ],
        verdict: l === 'ser' ? 'retry' : 'anomaly',
        outcome:
          l === 'ser'
            ? '1 doctor on call. Bob’s retry will count 1 and stay on call.'
            : '0 doctors on call: write skew. Each changed a different row, so nothing conflicted.',
      }
    case 'nonrepeat':
      return {
        rows: [
          r(1, 'SELECT balance FROM acct WHERE id = 1', '100'),
          r(2, 'UPDATE acct SET balance = 50 WHERE id = 1', 'UPDATE 1'),
          r(2, 'COMMIT', 'COMMIT'),
          snap ? r(1, 'SELECT balance FROM acct WHERE id = 1', '100') : r(1, 'SELECT balance FROM acct WHERE id = 1', '50', 'hot'),
          r(1, 'COMMIT', 'COMMIT'),
        ],
        verdict: snap ? 'safe' : 'anomaly',
        outcome: snap ? 'T1 saw 100 twice: one snapshot for the whole transaction.' : 'Same query, two answers: each statement took a fresh snapshot.',
      }
    case 'phantom':
      return {
        rows: [
          r(1, 'SELECT count(*) FROM acct WHERE balance > 0', '2'),
          r(2, 'INSERT INTO acct VALUES (3, 10)', 'INSERT 0 1'),
          r(2, 'COMMIT', 'COMMIT'),
          snap ? r(1, 'SELECT count(*) FROM acct WHERE balance > 0', '2') : r(1, 'SELECT count(*) FROM acct WHERE balance > 0', '3', 'hot'),
          r(1, 'COMMIT', 'COMMIT'),
        ],
        verdict: snap ? 'safe' : 'anomaly',
        outcome: !snap
          ? 'A phantom row appeared: 2, then 3.'
          : l === 'rr'
            ? 'Still 2. PostgreSQL’s Repeatable Read has no phantoms, stricter than the SQL standard.'
            : 'Still 2: the whole transaction reads one snapshot.',
      }
  }
}
