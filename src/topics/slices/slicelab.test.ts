import { describe, expect, it } from 'vitest'
import { apply, can, growCap, initial, view, type LabState, type Name, type Op } from './slicelab'

const run = (steps: [Name, Op][], st: LabState = initial()) => steps.reduce((s, [n, op]) => apply(s, n, op).state, st)

describe('growCap (verified on go1.26.4, heap path, 8-byte elems)', () => {
  it('doubles small slices, rounded to size classes', () => {
    expect([0, 1, 2, 4, 8, 16, 32].map((c) => growCap(c, c + 1))).toEqual([1, 2, 4, 8, 16, 32, 64])
    expect(growCap(5, 6)).toBe(10)
    expect(growCap(3, 4)).toBe(6)
  })
  it('jumps straight to newLen when more than double is needed', () => {
    expect(growCap(0, 5)).toBe(6) // append(nil, 1,2,3,4,5): 40 B -> 48 B class
    expect(growCap(5, 11)).toBe(12) // 88 B -> 96 B
  })
})

describe('slice playground', () => {
  it('starts with a := make([]int,3,5), b := a[:2]', () => {
    const st = initial()
    expect(view(st, 'a')).toEqual([0, 0, 0])
    expect(view(st, 'b')).toEqual([0, 0])
  })

  it('append within cap overwrites what the other slice sees', () => {
    const r = apply(initial(), 'b', 'append')
    expect(r.grew).toBe(false)
    expect(view(r.state, 'a')).toEqual([0, 0, 1])
    expect(r.note).toMatch(/a can see/)
  })

  it('element writes are shared while both point at one array', () => {
    const st = run([['a', 'write']])
    expect(view(st, 'b')).toEqual([1, 0])
  })

  it('append beyond cap allocates, then writes no longer leak', () => {
    let st = run([['a', 'append'], ['a', 'append']]) // a is len 5 cap 5
    const r = apply(st, 'a', 'append')
    expect(r.grew).toBe(true)
    st = r.state
    expect(st.s.a.cap).toBe(10)
    expect(st.arrays).toHaveLength(2)
    st = apply(st, 'a', 'write').state
    expect(view(st, 'a')[0]).toBe(4)
    expect(view(st, 'b')[0]).toBe(0)
  })

  it('clip forces the next append to copy (full slice expression)', () => {
    let st = run([['b', 'clip']])
    expect(st.s.b.cap).toBe(2)
    st = apply(st, 'b', 'append').state
    expect(view(st, 'a')).toEqual([0, 0, 0]) // a untouched
    expect(view(st, 'b')).toEqual([0, 0, 1])
    expect(st.s.b.cap).toBe(4)
  })

  it('reslicing to cap reveals values beyond len', () => {
    let st = run([['a', 'append'], ['b', 'extend']])
    expect(view(st, 'b')).toEqual([0, 0, 0, 1, 0])
    st = apply(st, 'b', 'drop1').state
    expect(st.s.b).toMatchObject({ off: 1, len: 4, cap: 4 })
  })

  it('drops arrays no header points at', () => {
    let st = run([['a', 'clip'], ['a', 'append'], ['b', 'clip'], ['b', 'append']])
    expect(st.arrays.map((a) => a.id)).toEqual([2, 3])
    st = apply(st, 'a', 'copy').state
    expect(st.arrays).toHaveLength(1)
  })

  it('refuses to draw more than MAX_CAP cells', () => {
    let st = run([['a', 'append'], ['a', 'append'], ['a', 'append']]) // cap 10, len 6
    st = run([['a', 'extend']], st)
    expect(can(st, 'a', 'append')).toBe(false)
    expect(can(st, 'a', 'extend')).toBe(false)
  })
})
