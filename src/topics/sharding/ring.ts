/**
 * Consistent-hash ring lab model. 10 nodes, K keys, v points per node.
 * Compare "add a node" / "remove a node" on a ring against plain `hash mod N`.
 * Hash = FNV-1a (32-bit) + murmur3 finalizer: stable across runs (unlike Go's maphash) and well mixed on sequential ids.
 */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export type Ring = { pts: Uint32Array; owner: Uint16Array }

/** ring over the given node ids, `v` points each (named `node<id>#<i>`) */
export function buildRing(ids: number[], v: number): Ring {
  const all: [number, number][] = []
  for (const id of ids) for (let i = 0; i < v; i++) all.push([hash32(`node${id}#${i}`), id])
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return { pts: Uint32Array.from(all, (p) => p[0]), owner: Uint16Array.from(all, (p) => p[1]) }
}

/** first point clockwise (>=) from h, wrapping around */
export function lookup(r: Ring, h: number): number {
  let lo = 0
  let hi = r.pts.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (r.pts[mid] < h) lo = mid + 1
    else hi = mid
  }
  return r.owner[lo === r.pts.length ? 0 : lo]
}

export type Action = 'add' | 'remove'
export type Result = {
  ids: number[] // nodes after the change
  before: number
  after: number
  keys: number
  movedPct: number // ring
  modPct: number // hash mod N
  idealPct: number
  load: number[] // keys per node after, index-aligned with ids
  maxOverMean: number
  cv: number // std-dev / mean, as a percentage
  /** every moved key went to the new node (add) / came from the removed node (remove) */
  minimal: boolean
  changed: number // id of the node added or removed
}

export const START_NODES = 10
export const REMOVED = 3 // a node from the middle: jump hash could not drop this one, a ring can

export function compare(o: { vnodes: number; action: Action; keys?: number; nodes?: number }): Result {
  const n = o.nodes ?? START_NODES
  const keys = o.keys ?? 20000
  const base = Array.from({ length: n }, (_, i) => i)
  const changed = o.action === 'add' ? n : REMOVED
  const next = o.action === 'add' ? [...base, n] : base.filter((i) => i !== REMOVED)
  const r1 = buildRing(base, o.vnodes)
  const r2 = buildRing(next, o.vnodes)
  const pos = new Map(next.map((id, i) => [id, i]))
  const load = new Array<number>(next.length).fill(0)
  let moved = 0
  let mod = 0
  let minimal = true
  for (let k = 0; k < keys; k++) {
    const h = hash32('key' + k)
    const a = lookup(r1, h)
    const b = lookup(r2, h)
    load[pos.get(b)!]++
    if (a !== b) {
      moved++
      if (o.action === 'add' ? b !== changed : a !== changed) minimal = false
    }
    if (h % n !== h % next.length) mod++
  }
  const mean = keys / next.length
  const sd = Math.sqrt(load.reduce((s, c) => s + (c - mean) ** 2, 0) / next.length)
  return {
    ids: next,
    before: n,
    after: next.length,
    keys,
    movedPct: (100 * moved) / keys,
    modPct: (100 * mod) / keys,
    idealPct: 100 / Math.max(n, next.length),
    load,
    maxOverMean: Math.max(...load) / mean,
    cv: (100 * sd) / mean,
    minimal,
    changed,
  }
}
