import { describe, expect, it } from 'vitest'
import { buildHeap, runToEnd, reachableFrom } from './greentea'
import { simulate, defaults, goalFor } from './pacer'

describe('green tea vs classic', () => {
  for (const [fanout, locality] of [[1, 0], [2, 0.5], [3, 0.8], [4, 0.2]])
    it(`both mark exactly the reachable set (fanout ${fanout}, locality ${locality})`, () => {
      const h = buildHeap({ fanout, locality, seed: 11 })
      const want = reachableFrom(h)
      for (const mode of ['classic', 'green'] as const) {
        const s = runToEnd(h, mode, 4)
        expect(s.marked).toEqual(want)
        expect(s.scanned).toEqual(want)
      }
    })

  it('green tea takes fewer cache misses on a dense, local heap', () => {
    const h = buildHeap({ fanout: 3, locality: 0.7, seed: 3 })
    const c = runToEnd(h, 'classic', 4)
    const g = runToEnd(h, 'green', 4)
    expect(g.misses).toBeLessThan(c.misses)
    const avg = g.batches.reduce((a, b) => a + b, 0) / g.batches.length
    expect(avg).toBeGreaterThan(1.5)
  })
})

describe('pacer', () => {
  it('goal formula: live + (live+roots)*GOGC/100', () => {
    expect(goalFor({ ...defaults, gogc: 100, roots: 8 }, 100)).toBe(208)
    expect(goalFor({ ...defaults, gogc: 50, roots: 0 }, 100)).toBe(150)
    expect(goalFor({ ...defaults, gogc: 100, roots: 0 }, 1)).toBe(4) // 4 MiB floor
  })

  it('GOMEMLIMIT caps the goal; GOGC=off means only the limit triggers', () => {
    expect(goalFor({ ...defaults, gogc: null, limit: 500 }, 100)).toBeCloseTo(500 - 12 - 15)
    expect(goalFor({ ...defaults, gogc: null, limit: null }, 100)).toBe(Infinity)
  })

  it('higher GOGC → fewer cycles and less GC CPU, more memory', () => {
    const a = simulate({ ...defaults, gogc: 50 })
    const b = simulate({ ...defaults, gogc: 200 })
    expect(b.cycles.length).toBeLessThan(a.cycles.length)
    expect(b.gcCpu).toBeLessThan(a.gcCpu)
    expect(b.peak).toBeGreaterThan(a.peak)
  })

  it('limit near live heap → the CPU limiter kicks in and memory overshoots instead of a death spiral', () => {
    const r = simulate({ ...defaults, gogc: null, limit: 130, allocRate: 800 })
    expect(r.cycles.some((c) => c.limited)).toBe(true)
    const late = r.samples.filter((x) => x.t > 2)
    const lateGc = late.reduce((a, x) => a + x.gcFrac, 0) / late.length
    expect(lateGc).toBeLessThan(0.56)
    expect(lateGc).toBeGreaterThan(0.4)
    expect(r.overLimitMs).toBeGreaterThan(0)
  })
})
