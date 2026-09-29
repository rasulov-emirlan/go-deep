import { describe, expect, it } from 'vitest'
import { append, canAppend, growCap, initial, view, type LabState } from './slicelab'

const times = (n: number, st: LabState = initial()) => Array.from({ length: n }).reduce<LabState>((s) => append(s).state, st)

describe('growCap (verified on go1.26.4, heap path, 8-byte elems)', () => {
  it('doubles small slices, rounded to size classes', () => {
    expect([0, 1, 2, 4, 8].map((c) => growCap(c, c + 1))).toEqual([1, 2, 4, 8, 16])
    expect(growCap(5, 6)).toBe(10)
    expect(growCap(3, 4)).toBe(6)
  })
  it('jumps straight to newLen when more than double is needed', () => {
    expect(growCap(0, 5)).toBe(6) // append(nil, 1,2,3,4,5): 40 B -> 48 B class
    expect(growCap(5, 11)).toBe(12) // 88 B -> 96 B
  })
})

describe('append lab', () => {
  it('starts with a = [1 2 3 4], b = a[:2]', () => {
    const st = initial()
    expect(st.a).toEqual([1, 2, 3, 4])
    expect(view(st)).toEqual([1, 2])
  })

  it('appends within cap overwrite a', () => {
    const r = append(initial())
    expect(r.event).toBe('overwrote')
    expect(r.state.a).toEqual([1, 2, 7, 4])
    expect(append(r.state).state.a).toEqual([1, 2, 7, 8])
  })

  it('a full b moves to a new array and a stops changing', () => {
    const st = times(2)
    const r = append(st)
    expect(r.event).toBe('moved')
    expect(r.state.b.cells).toHaveLength(8)
    expect(view(r.state)).toEqual([1, 2, 7, 8, 9])
    const after = append(r.state)
    expect(after.event).toBe('inplace')
    expect(after.state.a).toEqual([1, 2, 7, 8])
  })

  it('stops before a second move', () => {
    expect(canAppend(times(5))).toBe(true)
    expect(canAppend(times(6))).toBe(false)
  })
})
