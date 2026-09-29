import { describe, expect, it } from 'vitest'
import { simulate } from './stampede'

describe('stampede model', () => {
  it('no protection: everyone arriving before the first query returns hits the DB', () => {
    const r = simulate({ n: 1000, pods: 1, mode: 'none' })
    // arrivals every 0.1 ms; first query finishes at 50 ms
    expect(r.dbQueries).toBe(500)
    expect(r.outcomes.filter((o) => o === 'hit')).toHaveLength(500)
    // 500 queries through 20 conns of 50 ms: the last one waits 24 rounds
    expect(r.max).toBeGreaterThan(1000)
    expect(r.peakQueue).toBeGreaterThan(400)
  })
  it('singleflight: one query per pod, waiters bounded by one query time', () => {
    const r = simulate({ n: 1000, pods: 4, mode: 'singleflight' })
    expect(r.dbQueries).toBe(4)
    expect(r.max).toBeLessThanOrEqual(50)
    expect(r.peakQueue).toBe(0)
    expect(r.outcomes.filter((o) => o === 'db')).toHaveLength(4)
  })
  it('singleflight is per process: more pods than DB conns queue up', () => {
    const r = simulate({ n: 10000, pods: 64, mode: 'singleflight' })
    expect(r.dbQueries).toBe(64)
    expect(r.peakQueue).toBeGreaterThan(0)
  })
  it('stale-while-revalidate: nobody waits', () => {
    const r = simulate({ n: 1000, pods: 4, mode: 'swr' })
    expect(r.max).toBe(1)
    expect(r.dbQueries).toBe(4)
    expect(r.outcomes.filter((o) => o === 'stale')).toHaveLength(500)
  })
  it('is deterministic', () => {
    expect(simulate({ n: 777, pods: 3, mode: 'none' })).toEqual(simulate({ n: 777, pods: 3, mode: 'none' }))
  })
})
