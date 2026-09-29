import { describe, expect, it } from 'vitest'
import { layout, orders, words, type Field } from './layout'

const f = (name: string, size: number, align = size): Field => ({ name, type: '', size, align })

// every number below was checked with unsafe.Sizeof/Offsetof on go1.26.4 linux/amd64
describe('layout', () => {
  it('Bad {bool; int64; bool} is 24, Good {int64; bool; bool} is 16', () => {
    const bad = layout([f('a', 1), f('b', 8), f('c', 1)])
    expect(bad.size).toBe(24)
    expect(bad.offsets).toEqual([0, 8, 16])
    expect(bad.padding).toBe(14)
    expect(layout([f('b', 8), f('a', 1), f('c', 1)]).size).toBe(16)
  })

  it('the lab struct is 32 in bad order, 24 in good order', () => {
    const bad = layout(orders.bad)
    expect(bad.size).toBe(32)
    expect(bad.offsets).toEqual([0, 8, 16, 20, 24])
    expect(bad.padding).toBe(10)
    const good = layout(orders.good)
    expect(good.size).toBe(24)
    expect(good.offsets).toEqual([0, 8, 16, 20, 21])
    expect(good.padding).toBe(2)
  })

  it('a trailing zero-size field adds padding, a leading one does not', () => {
    expect(layout([f('n', 8), f('_', 0, 1)]).size).toBe(16)
    expect(layout([f('_', 0, 1), f('n', 8)]).size).toBe(8)
    expect(layout([f('a', 4), f('_', 0, 1)]).size).toBe(8)
  })

  it('marks padding bytes and splits into 8-byte words', () => {
    const l = layout(orders.bad)
    expect(l.bytes.filter((b) => b.field === null)).toHaveLength(l.padding)
    expect(l.bytes[0]).toEqual({ field: 'paid', first: true })
    expect(l.bytes[1].field).toBeNull()
    const w = words(l.bytes)
    expect(w).toHaveLength(4)
    expect(w.every((row) => row.length === 8)).toBe(true)
  })
})
