import { describe, expect, it } from 'vitest'
import { buildRing, compare, hash32, lookup } from './ring'

describe('ring model (anchors: research note, 200k keys, 10 nodes)', () => {
  it('hash is stable and spread', () => {
    expect(hash32('key1')).toBe(hash32('key1'))
    expect(hash32('key1')).not.toBe(hash32('key2'))
  })

  it('lookup wraps past the last point to the first', () => {
    const r = buildRing([0, 1, 2], 4)
    expect(lookup(r, 0xffffffff)).toBe(r.owner[0])
  })

  it('hash mod N: adding a node moves ~91% (note: 90.9%)', () => {
    const r = compare({ vnodes: 200, action: 'add' })
    expect(r.modPct).toBeGreaterThan(88)
    expect(r.modPct).toBeLessThan(93.5)
  })

  it('ring with 200 points: adding a node moves ~1/(N+1) (note: 10.3%, ideal 9.1%), all to the new node', () => {
    const r = compare({ vnodes: 200, action: 'add' })
    expect(r.idealPct).toBeCloseTo(9.09, 1)
    expect(r.movedPct).toBeGreaterThan(7.5)
    expect(r.movedPct).toBeLessThan(12)
    expect(r.minimal).toBe(true)
  })

  it('removing a node moves exactly what it owned (note: 10.2%), only from that node', () => {
    const r = compare({ vnodes: 200, action: 'remove' })
    expect(r.movedPct).toBeGreaterThan(8)
    expect(r.movedPct).toBeLessThan(12.5)
    expect(r.minimal).toBe(true)
    expect(r.ids).not.toContain(r.changed)
  })

  it('one point per node is badly unbalanced (note: max 1.86x mean, CV 48%)', () => {
    const r = compare({ vnodes: 1, action: 'remove', nodes: 10 })
    expect(r.maxOverMean).toBeGreaterThan(1.3)
    expect(r.cv).toBeGreaterThan(25)
  })

  it('more points, flatter load (note CV: 48% -> 22% -> 6.6% -> 3.1%)', () => {
    const cv = [1, 10, 100, 1000].map((vnodes) => compare({ vnodes, action: 'add' }).cv)
    expect(cv[0]).toBeGreaterThan(cv[1])
    expect(cv[1]).toBeGreaterThan(cv[2])
    expect(cv[2]).toBeGreaterThan(cv[3])
    expect(cv[3]).toBeLessThan(6)
  })

  it('loads add up to the key count', () => {
    const r = compare({ vnodes: 10, action: 'add', keys: 5000 })
    expect(r.load.reduce((a, b) => a + b, 0)).toBe(5000)
    expect(r.load).toHaveLength(11)
  })
})
