import { describe, expect, it } from 'vitest'
import { opLabel, plan, simulate } from './crash'

const base = { n: 6, batch: 1, idempotent: false }

describe('plan', () => {
  it('commit-before puts the commit ahead of the work', () => {
    expect(plan('before', 1, 3).map(opLabel)).toEqual(['commit 1', 'm0', 'commit 2', 'm1', 'commit 3', 'm2'])
  })
  it('commit-after puts it behind, batching as asked', () => {
    expect(plan('after', 3, 5).map(opLabel)).toEqual(['m0', 'm1', 'm2', 'commit 3', 'm3', 'm4', 'commit 5'])
  })
  it('resumes from an offset', () => {
    expect(plan('after', 1, 4, 2).map(opLabel)).toEqual(['m2', 'commit 3', 'm3', 'commit 4'])
  })
})

describe('simulate', () => {
  it('no crash is exactly once in both modes', () => {
    for (const mode of ['before', 'after'] as const) {
      const r = simulate({ ...base, mode, crashAfter: 99 })
      expect(r.crashed).toBe(false)
      expect(r.applied).toEqual([1, 1, 1, 1, 1, 1])
      expect(r.verdict).toBe('exactly')
    }
  })
  it('commit-before, crash between commit and work: message lost', () => {
    // commit 1, m0, commit 2, m1, commit 3 | crash | m2 never runs
    const r = simulate({ ...base, mode: 'before', crashAfter: 5 })
    expect(r.resumeAt).toBe(3)
    expect(r.applied).toEqual([1, 1, 0, 1, 1, 1])
    expect(r.verdict).toBe('lost')
  })
  it('commit-after, crash between work and commit: message duplicated', () => {
    // m0, commit 1, m1, commit 2, m2 | crash | resume at 2
    const r = simulate({ ...base, mode: 'after', crashAfter: 5 })
    expect(r.resumeAt).toBe(2)
    expect(r.applied).toEqual([1, 1, 2, 1, 1, 1])
    expect(r.verdict).toBe('dup')
  })
  it('idempotent consumer turns the duplicate into a skip', () => {
    const r = simulate({ ...base, mode: 'after', crashAfter: 5, idempotent: true })
    expect(r.applied).toEqual([1, 1, 1, 1, 1, 1])
    expect(r.skipped).toEqual([0, 0, 1, 0, 0, 0])
    expect(r.verdict).toBe('effectively')
  })
  it('idempotency cannot bring back a lost message', () => {
    const r = simulate({ ...base, mode: 'before', crashAfter: 5, idempotent: true })
    expect(r.verdict).toBe('lost')
  })
  it('bigger batches lose or duplicate more', () => {
    // after, batch 3: m0 m1 m2 commit3 m3 m4 | crash → m3 m4 replayed
    const dup = simulate({ ...base, batch: 3, mode: 'after', crashAfter: 6 })
    expect(dup.applied).toEqual([1, 1, 1, 2, 2, 1])
    // before, batch 3: commit3 m0 | crash → m1 m2 lost
    const lost = simulate({ ...base, batch: 3, mode: 'before', crashAfter: 2 })
    expect(lost.applied).toEqual([1, 0, 0, 1, 1, 1])
  })
  it('a crash right at the start just restarts cleanly', () => {
    const r = simulate({ ...base, mode: 'after', crashAfter: 0 })
    expect(r.crashed).toBe(true)
    expect(r.verdict).toBe('exactly')
  })
})
