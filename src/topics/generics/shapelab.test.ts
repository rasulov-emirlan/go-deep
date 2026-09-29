import { describe, expect, it } from 'vitest'
import { sameCopy, shapeOf, TYPES, verdict } from './shapelab'

describe('GC shapes (go tool nm, go1.26.4)', () => {
  it('named types share their underlying type’s shape', () => {
    expect(sameCopy('int', 'Celsius')).toBe(true)
    expect(shapeOf('Celsius')).toBe('go.shape.int')
  })
  it('all pointers share one shape', () => {
    expect(sameCopy('*User', '*Order')).toBe(true)
    expect(shapeOf('*User')).toBe('go.shape.*uint8')
  })
  it('different sizes and each interface type get their own copy', () => {
    expect(sameCopy('int', 'int64')).toBe(false)
    expect(sameCopy('any', 'error')).toBe(false)
    expect(sameCopy('*User', 'any')).toBe(false)
  })
  it('has a verdict for every pair', () => {
    for (const a of TYPES) for (const b of TYPES) expect(verdict(a, b)).toBeTruthy()
  })
})
