import { describe, expect, it } from 'vitest'
import { DEFAULTS, histogram, peak, retryTimes } from './jitter'

const H = (p: Parameters<typeof retryTimes>[0]) => histogram(retryTimes(p), 40, 3200)

describe('jitter toy model', () => {
  it('every client makes every retry', () => {
    expect(retryTimes('full')).toHaveLength(DEFAULTS.clients * DEFAULTS.retries)
  })
  it('fixed sleep and plain exponential stay perfectly synchronized', () => {
    expect(peak(H('fixed'))).toBe(100)
    expect(peak(H('expo'))).toBe(100)
  })
  it('exponential arrives at 100, 300, 700, 1500, 3100 ms', () => {
    const t = [...new Set(retryTimes('expo'))]
    expect(t).toEqual([100, 300, 700, 1500, 3100])
  })
  it('jitter breaks up the herd', () => {
    for (const p of ['full', 'equal', 'decorrelated'] as const) expect(peak(H(p))).toBeLessThan(60)
  })
  it('is deterministic', () => {
    expect(retryTimes('decorrelated')).toEqual(retryTimes('decorrelated'))
  })
  it('decorrelated waits stay within [base, cap]', () => {
    const t = retryTimes('decorrelated', { ...DEFAULTS, clients: 1, retries: 1 })
    expect(t[0]).toBeGreaterThanOrEqual(100)
    expect(t[0]).toBeLessThanOrEqual(300)
  })
})
