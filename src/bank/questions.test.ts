import { describe, expect, it } from 'vitest'
import data from './questions.json'
import { categories, kindLabel, type Question } from './types'

const qs = data as Question[]
const cats = new Set(categories.map((c) => c.slug))

describe('question bank data', () => {
  it('has questions', () => {
    expect(qs.length).toBeGreaterThan(100)
  })
  it('ids are unique', () => {
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length)
  })
  it.each(qs.map((q) => [q.id, q] as const))('%s is well-formed', (_, q) => {
    expect(cats.has(q.cat)).toBe(true)
    expect(Object.keys(kindLabel)).toContain(q.kind)
    expect(q.q.split('\n')[0].trim().length).toBeGreaterThan(5)
    expect(q.a.trim().length).toBeGreaterThan(20)
    expect([1, 2, 3]).toContain(q.level)
    expect(q.n).toBeGreaterThanOrEqual(1)
    expect((q.a.match(/```/g) ?? []).length % 2).toBe(0)
    // stray HTML entities from the notes; the XSS answer shows one on purpose
    if (q.id !== 'networking-xss-escaping') expect(q.q + q.a).not.toMatch(/&(gt|lt|amp|quot);/)
  })
})
