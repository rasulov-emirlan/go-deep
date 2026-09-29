import { describe, expect, it } from 'vitest'
import { newMap, put, get, del, len, tables, tombstones, swarMatchH2, swarMatchEmpty, probeSeq, h1, h2, dirIndex, DELETED, EMPTY } from './swiss'

describe('swiss map model', () => {
  it('SWAR matches the worked example from the Go source', () => {
    const ctrl = 0x8080801580802a80n
    expect(swarMatchH2(ctrl, 0x15)).toEqual([4])
    expect(swarMatchEmpty(ctrl)).toEqual([0, 2, 3, 5, 6, 7])
  })

  it('SWAR H2 match can yield false positives (0x0302, h=2)', () => {
    expect(swarMatchH2(0x8080808080800302n, 2)).toEqual([0, 1])
  })

  it('worked example hash: h1/h2 split and probe sequence', () => {
    const h = 0x9e3779b97f4a7c15n
    expect(h2(h)).toBe(0x15)
    expect(h1(h)).toBe(0x13c6ef372fe94f8n)
    expect(probeSeq(h, 16).slice(0, 6)).toEqual([8, 9, 11, 14, 2, 7])
    expect(probeSeq(h, 4)).toEqual([0, 1, 3, 2])
  })

  it('probe sequence visits every group exactly once', () => {
    for (const n of [1, 2, 4, 8, 16, 128]) expect(new Set(probeSeq(0xdeadbeefcafen, n)).size).toBe(n)
  })

  it('small map up to 8, 9th key grows to a 16-slot table', () => {
    const m = newMap()
    for (let i = 0; i < 8; i++) put(m, 'k' + i, i)
    expect(m.small).not.toBeNull()
    expect(m.dir.length).toBe(0)
    const steps = put(m, 'k8', 8)
    expect(steps.some((s) => s.t === 'grow' && s.kind === 'small→table')).toBe(true)
    expect(m.small).toBeNull()
    expect(tables(m)[0].capacity).toBe(16)
  })

  it('stores and finds many keys through doubling, splits and directory doublings', () => {
    const m = newMap(32)
    const N = 400
    for (let i = 0; i < N; i++) put(m, 'key-' + i, i)
    expect(len(m)).toBe(N)
    for (let i = 0; i < N; i++) expect(get(m, 'key-' + i)).toMatchObject({ found: true, val: i })
    expect(get(m, 'nope').found).toBe(false)
    expect(m.globalDepth).toBeGreaterThan(1)
    for (const t of tables(m)) {
      expect(t.capacity).toBeLessThanOrEqual(32)
      expect(t.used).toBeLessThanOrEqual((t.capacity * 7) / 8)
      // a table spans 2^(global-local) consecutive directory entries
      const span = 1 << (m.globalDepth - t.localDepth)
      expect(m.dir.slice(t.index, t.index + span).every((x) => x === t)).toBe(true)
    }
    // every key routes through the directory by its top bits
    for (const t of tables(m)) for (const g of t.groups) for (const k of g.keys) if (k) expect(m.dir[dirIndex(m, hashOf(m, k))]).toBe(t)
  })

  it('updates in place without growing len', () => {
    const m = newMap()
    put(m, 'a', 1)
    put(m, 'a', 2)
    expect(len(m)).toBe(1)
    expect(get(m, 'a').val).toBe(2)
  })

  it('delete: empty if the group has an empty slot, tombstone if the group is full', () => {
    const m = newMap(1024)
    for (let i = 0; i < 14; i++) put(m, 'x' + i, i) // 16-slot table, 2 groups
    const t = tables(m)[0]
    const full = t.groups.find((g) => g.ctrl.every((c) => c !== EMPTY))
    const partial = t.groups.find((g) => g.ctrl.some((c) => c === EMPTY))
    if (full) {
      const k = full.keys.find((x) => x)!
      const s = del(m, k)
      expect(s.at(-1)).toMatchObject({ t: 'delete', to: 'tombstone' })
      expect(full.ctrl.includes(DELETED)).toBe(true)
      expect(tombstones(m)).toBe(1)
    }
    if (partial) {
      const k = partial.keys.find((x) => x)!
      expect(del(m, k).at(-1)).toMatchObject({ t: 'delete', to: 'empty' })
    }
    for (let i = 0; i < 14; i++) {
      const r = get(m, 'x' + i)
      if (r.found) expect(r.val).toBe(i)
    }
  })

  it('small maps never create tombstones', () => {
    const m = newMap()
    for (let i = 0; i < 8; i++) put(m, 's' + i, i)
    del(m, 's3')
    expect(m.small!.ctrl.includes(DELETED)).toBe(false)
  })

  it('delete then reinsert across growth keeps every surviving key findable', () => {
    const m = newMap(16)
    for (let i = 0; i < 200; i++) put(m, 'k' + i, i)
    for (let i = 0; i < 200; i += 3) del(m, 'k' + i)
    for (let i = 200; i < 300; i++) put(m, 'k' + i, i)
    for (let i = 0; i < 300; i++) expect(get(m, 'k' + i).found).toBe(!(i < 200 && i % 3 === 0))
  })
})

import { hash64 } from './swiss'
import type { SwissMap } from './swiss'
function hashOf(m: SwissMap, k: string) {
  return hash64(k, m.seed)
}
