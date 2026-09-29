import { describe, expect, it } from 'vitest'
import { newOldMap, oldPut, has } from './oldmap'
import { newMap, put } from './swiss'

describe('classic map model', () => {
  it('keeps every key findable through incremental growth', () => {
    const m = newOldMap()
    for (let i = 0; i < 2000; i++) {
      oldPut(m, 'k' + i)
      if (i % 97 === 0) for (let j = 0; j <= i; j += 13) expect(has(m, 'k' + j)).toBe(true)
    }
    expect(m.count).toBe(2000)
    expect(m.count / 2 ** m.B).toBeLessThanOrEqual(6.5)
  })

  it('moves at most 2 buckets of entries per write while growing', () => {
    const m = newOldMap()
    let maxMoved = 0
    for (let i = 0; i < 5000; i++) maxMoved = Math.max(maxMoved, oldPut(m, 'k' + i))
    expect(maxMoved).toBeLessThanOrEqual(2 * 8 * 3) // 2 buckets, even with short overflow chains
  })

  it('swiss worst-case single insert is bounded by one table', () => {
    const m = newMap(1024)
    let worst = 0
    for (let i = 0; i < 20000; i++) worst = Math.max(worst, put(m, 'k' + i, i).reduce((n, s) => n + (s.t === 'grow' ? s.moved : 0), 0))
    expect(worst).toBeLessThanOrEqual(896)
    expect(worst).toBeGreaterThan(400)
  })
})
