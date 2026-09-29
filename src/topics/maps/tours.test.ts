import { describe, expect, it } from 'vitest'
import { buildTours } from './tours'
import { get, tables } from '../../sim/swiss'

const tours = buildTours()

describe('guided map tours', () => {
  it.each(tours.map((t) => [t.id, t] as const))('%s hits every stop it promises', (_, t) => {
    const seen = new Set(t.frames.flatMap((f) => f.kinds))
    for (const k of t.stops) expect(seen, `${t.id} never reaches ${k}`).toContain(k)
  })

  it('together the tours cover every edge case', () => {
    const all = new Set(tours.flatMap((t) => t.stops))
    for (const k of ['small-insert', 'to-table', 'hit', 'false-pos', 'miss', 'probe-next', 'delete-empty', 'delete-tomb', 'reuse-tomb', 'update', 'double', 'split', 'dir-double', 'split-no-dir', 'prune'])
      expect(all).toContain(k)
  })

  it('a false positive compares the key and moves on', () => {
    for (const id of ['small', 'lookup']) {
      const t = tours.find((x) => x.id === id)!
      const i = t.frames.findIndex((f) => f.kinds.includes('false-pos'))
      expect(t.frames[i].step).toMatchObject({ t: 'cmp', eq: false })
      expect(t.frames[i].op).toMatchObject({ k: 'get' })
    }
  })

  it('the prune tour prunes instead of growing', () => {
    const t = tours.find((x) => x.id === 'tomb')!
    const last = t.frames.at(-1)!.state
    expect(tables(last)).toHaveLength(1)
    expect(tables(last)[0].capacity).toBe(16)
    expect(t.frames.some((f) => f.kinds.includes('double'))).toBe(false)
  })

  it('growth tour ends with 4 tables of 32 and a 4-entry directory', () => {
    const last = tours.find((x) => x.id === 'grow')!.frames.at(-1)!.state
    expect(last.globalDepth).toBe(2)
    expect(tables(last).map((t) => t.capacity)).toEqual([32, 32, 32, 32])
    expect(tables(last).every((t) => t.localDepth === 2)).toBe(true)
  })

  it('every key put in a tour is still findable in its final state', () => {
    for (const t of tours) {
      const last = t.frames.at(-1)!.state
      const live = new Set<string>()
      for (const f of t.frames) {
        if (f.op?.k === 'put') live.add(f.op.key)
        if (f.op?.k === 'fill') f.op.keys.forEach((k) => live.add(k))
        if (f.op?.k === 'del') live.delete(f.op.key)
      }
      for (const k of live) expect(get(last, k).found, `${t.id}: ${k}`).toBe(true)
    }
  })

  it('frames before a grow show the old shape, frames after show the new one', () => {
    const t = tours.find((x) => x.id === 'small')!
    const i = t.frames.findIndex((f) => f.kinds.includes('to-table'))
    expect(t.frames[i - 1].state.small).not.toBeNull()
    expect(t.frames[i].state.small).toBeNull()
    expect(t.frames[i].state.dir).toHaveLength(1)
  })
})
