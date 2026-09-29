import { describe, expect, it } from 'vitest'
import { buildTree, KEYS, levels, lookup } from './btree'

const t = buildTree()

describe('toy B+tree', () => {
  it('has the documented shape', () => {
    expect(t.leaves).toHaveLength(6)
    expect(t.inner).toHaveLength(2)
    expect(t.heap).toHaveLength(12)
    expect(t.root.seps).toEqual([125])
    expect(t.inner[0].seps).toEqual([45, 85])
    expect(t.leaves.flatMap((l) => l.keys)).toEqual(KEYS)
  })

  it('stores every row on exactly one heap page, shuffled', () => {
    const all = t.heap.flat().sort((a, b) => a - b)
    expect(all).toEqual(KEYS)
    expect(t.heap[0]).not.toEqual([5, 10, 15, 20])
    for (const l of t.leaves) l.keys.forEach((k, i) => expect(t.heap[l.ctids[i]]).toContain(k))
  })

  it('point lookup: 3 index pages + 1 heap page, vs 12 for a seq scan', () => {
    const v = lookup(t, 130, 130)
    expect(v.inner).toBe(1)
    expect(v.leaves).toEqual([3])
    expect(v.hits).toEqual([130])
    expect(v.indexPages).toBe(3)
    expect(v.heapPages).toHaveLength(1)
    expect(v.seqPages).toBe(12)
  })

  it('missing key: descends, finds nothing, touches no heap', () => {
    const v = lookup(t, 42, 42)
    expect(v.hits).toEqual([])
    expect(v.indexPages).toBe(3)
    expect(v.heapPages).toEqual([])
  })

  it('range walks right along leaf links, across inner pages, without re-descending', () => {
    const v = lookup(t, 100, 170)
    expect(v.leaves).toEqual([2, 3, 4])
    expect(v.indexPages).toBe(5)
    expect(v.hits).toHaveLength(15)
    expect(v.heapFetches).toBe(15)
    expect(v.heapPages.length).toBeLessThanOrEqual(12)
  })

  it('stops at the high key: a range ending on the last key of a leaf reads one leaf', () => {
    const v = lookup(t, 5, 40)
    expect(v.leaves).toEqual([0])
  })

  it('index-only: no heap at all', () => {
    const v = lookup(t, 100, 170, true)
    expect(v.heapFetches).toBe(0)
    expect(v.heapPages).toEqual([])
    expect(v.indexPages).toBe(5)
  })

  it('swaps a reversed range and clamps past the end', () => {
    expect(lookup(t, 170, 100).hits).toEqual(lookup(t, 100, 170).hits)
    const v = lookup(t, 230, 999)
    expect(v.hits).toEqual([230, 235, 240])
    expect(v.leaves).toEqual([5])
  })

  it('whole-table range reads more pages than a seq scan', () => {
    const v = lookup(t, 0, 999)
    expect(v.hits).toHaveLength(48)
    expect(v.indexPages + v.heapFetches).toBeGreaterThan(v.seqPages)
  })
})

describe('levels', () => {
  it('matches real PostgreSQL heights (1M bigint keys → 3 pages root-to-leaf)', () => {
    expect(levels(1_000_000, 367, 286)).toBe(3)
    expect(levels(1_000_000_000, 367, 286)).toBe(4)
    expect(levels(10, 367, 286)).toBe(1)
    expect(levels(48, 8, 3)).toBe(3)
  })
})
