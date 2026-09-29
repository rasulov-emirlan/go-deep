import { describe, expect, it } from 'vitest'
import { attemptsFromRetries, bottomLoad, budgetCap } from './amplify'

describe('retry amplification', () => {
  it('3 layers × 3 attempts = 27', () => expect(bottomLoad(3, 3)).toBe(27))
  it('"retry 3 times" is 4 attempts: 4^3 = 64', () => expect(bottomLoad(3, attemptsFromRetries(3))).toBe(64))
  it('one layer only multiplies once', () => expect(bottomLoad(1, 3)).toBe(3))
  it('4 layers of 3 attempts = 81; 5 layers = 243', () => {
    expect(bottomLoad(4, 3)).toBe(81)
    expect(bottomLoad(5, 3)).toBe(243)
  })
  it('a 10% budget caps the multiplier at 1.1×', () => expect(budgetCap(0.1)).toBeCloseTo(1.1))
})
