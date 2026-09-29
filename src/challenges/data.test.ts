import { describe, expect, it } from 'vitest'
import { challenges, harness } from './data'
import { allQuestions } from '../bank/data'
import { categories } from '../bank/types'

describe('challenges', () => {
  it('load with a harness', () => {
    expect(harness).toContain('func done()')
    expect(challenges.length).toBeGreaterThan(0)
  })
  it.each(challenges.map((c) => [c.id, c] as const))('%s is well-formed', (_, c) => {
    expect([1, 2, 3]).toContain(c.level)
    expect(categories.map((x) => x.slug)).toContain(c.cat)
    if (c.bank) expect(allQuestions.some((q) => q.id === c.bank)).toBe(true)
    expect(c.prompt.split(/\s+/).length).toBeLessThan(120)
    for (const src of [c.starter, c.solution, c.check]) expect(src.startsWith('package main')).toBe(true)
    expect(c.starter).not.toContain('func main(')
    expect(c.solution).not.toContain('func main(')
    expect(c.check).toContain('done()')
  })
})
