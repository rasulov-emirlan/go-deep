import { describe, expect, it } from 'vitest'
import { levels, run, scenarios, type Level, type ScenarioId } from './isolation'

// Recorded on postgres:18.4 with two pgx connections stepping in this order.
const out = (s: ScenarioId, l: Level) => run(s, l).rows.map((r) => `T${r.t} ${r.out}`)

describe('isolation lab matches PostgreSQL 18', () => {
  it('lost update: RC loses T1’s write, RR/SER fail T2 when T1 commits', () => {
    expect(out('lost', 'rc').slice(-2)).toEqual(['T2 UPDATE 1', 'T2 COMMIT'])
    for (const l of ['rr', 'ser'] as const) {
      expect(out('lost', l).slice(-2)).toEqual(['T2 ERROR 40001: could not serialize access due to concurrent update', 'T2 ROLLBACK'])
      expect(run('lost', l).verdict).toBe('retry')
    }
    expect(run('lost', 'rc').outcome).toMatch('80')
  })
  it('the blocked UPDATE waits in every level', () => {
    for (const { v } of levels) expect(run('lost', v).rows[3].tone).toBe('wait')
  })
  it('write skew: only Serializable catches it, at COMMIT', () => {
    expect(run('skew', 'rc').verdict).toBe('anomaly')
    expect(run('skew', 'rr').verdict).toBe('anomaly')
    const ser = run('skew', 'ser')
    expect(ser.verdict).toBe('retry')
    expect(ser.rows.at(-1)).toMatchObject({ t: 2, sql: 'COMMIT', tone: 'err' })
    expect(ser.rows.at(-1)!.out).toMatch('read/write dependencies')
    // nothing before COMMIT fails or blocks
    expect(ser.rows.slice(0, -1).every((r) => r.tone === 'ok')).toBe(true)
  })
  it('non-repeatable read and phantom: only Read Committed shows them', () => {
    expect(out('nonrepeat', 'rc')[3]).toBe('T1 50')
    expect(out('phantom', 'rc')[3]).toBe('T1 3')
    for (const l of ['rr', 'ser'] as const) {
      expect(out('nonrepeat', l)[3]).toBe('T1 100')
      expect(out('phantom', l)[3]).toBe('T1 2')
      expect(run('nonrepeat', l).verdict).toBe('safe')
    }
  })
  it('every scenario has the same steps at every level, so levels compare row by row', () => {
    for (const { v: s } of scenarios) {
      const sqls = levels.map(({ v }) => run(s, v).rows.map((r) => `${r.t}:${r.sql}`).join('|'))
      expect(new Set(sqls).size).toBe(1)
    }
  })
  it('deterministic', () => {
    expect(run('skew', 'ser')).toEqual(run('skew', 'ser'))
  })
})
