import { describe, expect, it } from 'vitest'
import { CORES, JOBS, lowerBound, simulate } from './pool'

const sum = JOBS.reduce((s, d) => s + d, 0)

describe('worker pool sim', () => {
  it('one worker runs jobs back to back', () => {
    const r = simulate(JOBS, 1, 'io')
    expect(r.total).toBe(sum)
    expect(r.segs.map((s) => s.start)).toEqual(JOBS.map((_, i) => JOBS.slice(0, i).reduce((a, b) => a + b, 0)))
  })

  it('cpu and io agree while workers <= cores', () => {
    for (let w = 1; w <= CORES; w++) expect(simulate(JOBS, w, 'cpu')).toEqual(simulate(JOBS, w, 'io'))
  })

  it('io: enough workers means total = longest job', () => {
    expect(simulate(JOBS, JOBS.length, 'io').total).toBe(Math.max(...JOBS))
  })

  it('cpu: more workers than cores never beats the cores bound', () => {
    for (let w = 1; w <= 12; w++) {
      const r = simulate(JOBS, w, 'cpu')
      expect(r.total).toBeGreaterThanOrEqual(sum / CORES - 1e-9)
      expect(r.total).toBeGreaterThanOrEqual(lowerBound(JOBS, w, 'cpu') - 1e-9)
    }
    expect(simulate(JOBS, 12, 'cpu').total).toBeGreaterThan(simulate(JOBS, 12, 'io').total)
  })

  it('every job runs once, workers never overlap, jobs start in queue order', () => {
    for (const mode of ['io', 'cpu'] as const)
      for (let w = 1; w <= 12; w++) {
        const r = simulate(JOBS, w, mode)
        expect(r.segs.map((s) => s.job)).toEqual(JOBS.map((_, i) => i))
        for (let k = 0; k < w; k++) {
          const mine = r.segs.filter((s) => s.worker === k).sort((a, b) => a.start - b.start)
          for (let i = 1; i < mine.length; i++) expect(mine[i].start).toBeGreaterThanOrEqual(mine[i - 1].end - 1e-9)
        }
        for (let i = 1; i < r.segs.length; i++) expect(r.segs[i].start).toBeGreaterThanOrEqual(r.segs[i - 1].start)
      }
  })

  it('is deterministic', () => {
    expect(simulate(JOBS, 5, 'cpu')).toEqual(simulate(JOBS, 5, 'cpu'))
  })
})
