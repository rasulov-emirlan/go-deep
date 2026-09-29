// Teaching model of Go 1.24+ Swiss-table maps (internal/runtime/maps).
// Real layout rules: 8-slot groups + control word, H1/H2 split, triangular
// probing over groups, 7/8 load, tombstones, small-map mode (≤8, no table),
// table doubling up to maxTableCapacity, then extendible-hashing splits.
// Only maxTableCapacity is shrunk (real: 1024) so splits happen on screen.

export const SLOTS = 8
export const EMPTY = 0x80
export const DELETED = 0xfe
const M64 = (1n << 64n) - 1n

/** 64-bit hash of a string key: FNV-1a then a splitmix64 finalizer, seeded. */
export function hash64(key: string, seed: bigint): bigint {
  let h = 0xcbf29ce484222325n ^ seed
  for (let i = 0; i < key.length; i++) {
    h ^= BigInt(key.charCodeAt(i))
    h = (h * 0x100000001b3n) & M64
  }
  h ^= h >> 30n
  h = (h * 0xbf58476d1ce4e5b9n) & M64
  h ^= h >> 27n
  h = (h * 0x94d049bb133111ebn) & M64
  h ^= h >> 31n
  return h
}

export const h1 = (h: bigint) => h >> 7n
export const h2 = (h: bigint) => Number(h & 0x7fn)

export type Group = { ctrl: number[]; keys: (string | null)[]; vals: (number | null)[] }
export type Table = { id: number; capacity: number; used: number; growthLeft: number; localDepth: number; index: number; groups: Group[] }
export type SwissMap = {
  seed: bigint
  used: number
  small: Group | null // small-map mode: one group, no table/directory
  dir: Table[] // directory entries (tables repeat when localDepth < globalDepth)
  globalDepth: number
  maxCap: number
  nextTable: number
  tombstonePossible: boolean
}

export type Step =
  | { t: 'hash'; key: string; hash: bigint; h1: bigint; h2: number; dirIdx: number | null }
  | { t: 'probe'; table: number; group: number; i: number; match: number[]; empty: number[] }
  | { t: 'cmp'; table: number; group: number; slot: number; eq: boolean }
  | { t: 'place'; table: number; group: number; slot: number; reuse: 'empty' | 'tombstone' | 'update' }
  | { t: 'delete'; table: number; group: number; slot: number; to: 'empty' | 'tombstone' }
  | { t: 'miss'; table: number; group: number }
  | { t: 'grow'; from: number; to: number; kind: 'small→table' | 'double' | 'split'; note: string; moved: number }
  | { t: 'dirDouble'; depth: number }
  | { t: 'prune'; table: number; tombstones: number; freed: number }

/** Called after the map's shape changed mid-insert (grow, split, prune), before the insert is retried. */
export type OnMutate = (m: SwissMap) => void

const newGroup = (): Group => ({ ctrl: Array(SLOTS).fill(EMPTY), keys: Array(SLOTS).fill(null), vals: Array(SLOTS).fill(null) })

export function maxGrowthLeft(capacity: number) {
  // a single-group table must keep one slot empty to terminate probes
  return capacity === SLOTS ? SLOTS - 1 : (capacity * 7) / 8
}

export function newMap(maxCap = 32, seed = 0x5eedn): SwissMap {
  return { seed, used: 0, small: null, dir: [], globalDepth: 0, maxCap, nextTable: 0, tombstonePossible: false }
}

function newTable(m: SwissMap, capacity: number, localDepth: number): Table {
  return {
    id: m.nextTable++,
    capacity,
    used: 0,
    growthLeft: maxGrowthLeft(capacity),
    localDepth,
    index: -1,
    groups: Array.from({ length: capacity / SLOTS }, newGroup),
  }
}

export function dirIndex(m: SwissMap, hash: bigint) {
  return m.globalDepth === 0 ? 0 : Number(hash >> BigInt(64 - m.globalDepth))
}

/** Triangular probe sequence over groups: p(i) = h1 + i(i+1)/2 mod n. */
export function probeSeq(hash: bigint, nGroups: number): number[] {
  const mask = BigInt(nGroups - 1)
  const out: number[] = []
  let off = h1(hash) & mask
  for (let i = 0; i < nGroups; i++) {
    out.push(Number(off))
    off = (off + BigInt(i + 1)) & mask
  }
  return out
}

/** SWAR matchH2 on a packed 64-bit control word (can yield false positives). */
export function packCtrl(ctrl: number[]): bigint {
  return ctrl.reduce((acc, b, i) => acc | (BigInt(b) << BigInt(8 * i)), 0n)
}
export function swarMatchH2(ctrl: bigint, h: number): number[] {
  const lsb = 0x0101010101010101n
  const msb = 0x8080808080808080n
  const v = ctrl ^ (lsb * BigInt(h))
  const r = ((v - lsb) & ~v & msb) & M64
  return bitsToSlots(r)
}
export function swarMatchEmpty(ctrl: bigint): number[] {
  const msb = 0x8080808080808080n
  return bitsToSlots((ctrl & ~(ctrl << 6n)) & msb & M64)
}
function bitsToSlots(b: bigint) {
  const out: number[] = []
  for (let i = 0; i < SLOTS; i++) if ((b >> BigInt(8 * i + 7)) & 1n) out.push(i)
  return out
}

const matchH2 = (g: Group, h: number) => g.ctrl.flatMap((c, i) => (c === h ? [i] : []))
const matchEmpty = (g: Group) => g.ctrl.flatMap((c, i) => (c === EMPTY ? [i] : []))

export function tables(m: SwissMap): Table[] {
  const seen = new Set<number>()
  return m.dir.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}

export function get(m: SwissMap, key: string): { found: boolean; val?: number; steps: Step[] } {
  const hash = hash64(key, m.seed)
  const steps: Step[] = [{ t: 'hash', key, hash, h1: h1(hash), h2: h2(hash), dirIdx: m.small ? null : m.dir.length ? dirIndex(m, hash) : null }]
  if (m.small || !m.dir.length) {
    const g = m.small
    if (!g) return { found: false, steps }
    const match = matchH2(g, h2(hash))
    steps.push({ t: 'probe', table: -1, group: 0, i: 0, match, empty: matchEmpty(g) })
    for (const s of match) {
      const eq = g.keys[s] === key
      steps.push({ t: 'cmp', table: -1, group: 0, slot: s, eq })
      if (eq) return { found: true, val: g.vals[s]!, steps }
    }
    steps.push({ t: 'miss', table: -1, group: 0 })
    return { found: false, steps }
  }
  const t = m.dir[dirIndex(m, hash)]
  for (const [i, gi] of probeSeq(hash, t.groups.length).entries()) {
    const g = t.groups[gi]
    const match = matchH2(g, h2(hash))
    const empty = matchEmpty(g)
    steps.push({ t: 'probe', table: t.id, group: gi, i, match, empty })
    for (const s of match) {
      const eq = g.keys[s] === key
      steps.push({ t: 'cmp', table: t.id, group: gi, slot: s, eq })
      if (eq) return { found: true, val: g.vals[s]!, steps }
    }
    if (empty.length) {
      steps.push({ t: 'miss', table: t.id, group: gi })
      return { found: false, steps }
    }
  }
  return { found: false, steps }
}

export function put(m: SwissMap, key: string, val: number, onMutate?: OnMutate): Step[] {
  const hash = hash64(key, m.seed)
  const steps: Step[] = []
  if (!m.dir.length) {
    if (!m.small) m.small = newGroup()
    const g = m.small
    steps.push({ t: 'hash', key, hash, h1: h1(hash), h2: h2(hash), dirIdx: null })
    // like the runtime: a small map holding 8 entries converts before looking,
    // even when this write is an update of an existing key (TODO in map.go)
    if (m.used >= SLOTS) return steps.concat(growToTable(m, g, onMutate), put(m, key, val, onMutate))
    const match = matchH2(g, h2(hash))
    steps.push({ t: 'probe', table: -1, group: 0, i: 0, match, empty: matchEmpty(g) })
    for (const s of match) {
      const eq = g.keys[s] === key
      steps.push({ t: 'cmp', table: -1, group: 0, slot: s, eq })
      if (eq) {
        g.vals[s] = val
        steps.push({ t: 'place', table: -1, group: 0, slot: s, reuse: 'update' })
        return steps
      }
    }
    const e = matchEmpty(g)
    g.ctrl[e[0]] = h2(hash)
    g.keys[e[0]] = key
    g.vals[e[0]] = val
    m.used++
    steps.push({ t: 'place', table: -1, group: 0, slot: e[0], reuse: 'empty' })
    return steps
  }
  const t = m.dir[dirIndex(m, hash)]
  steps.push({ t: 'hash', key, hash, h1: h1(hash), h2: h2(hash), dirIdx: dirIndex(m, hash) })
  let firstDel: { g: number; s: number } | null = null
  for (const [i, gi] of probeSeq(hash, t.groups.length).entries()) {
    const g = t.groups[gi]
    const match = matchH2(g, h2(hash))
    const empty = matchEmpty(g)
    steps.push({ t: 'probe', table: t.id, group: gi, i, match, empty })
    for (const s of match) {
      const eq = g.keys[s] === key
      steps.push({ t: 'cmp', table: t.id, group: gi, slot: s, eq })
      if (eq) {
        g.vals[s] = val
        steps.push({ t: 'place', table: t.id, group: gi, slot: s, reuse: 'update' })
        return steps
      }
    }
    if (!firstDel) {
      const d = g.ctrl.findIndex((c) => c === DELETED)
      if (d >= 0) firstDel = { g: gi, s: d }
    }
    if (empty.length) {
      if (firstDel) {
        place(t, firstDel.g, firstDel.s, key, val, hash)
        m.used++
        steps.push({ t: 'place', table: t.id, group: firstDel.g, slot: firstDel.s, reuse: 'tombstone' })
        return steps
      }
      if (t.growthLeft === 0) {
        const p = pruneTombstones(m, t)
        if (p) {
          steps.push(p)
          onMutate?.(m)
        }
      }
      if (t.growthLeft > 0) {
        const slot = matchEmpty(g)[0]
        place(t, gi, slot, key, val, hash)
        t.growthLeft--
        m.used++
        steps.push({ t: 'place', table: t.id, group: gi, slot, reuse: 'empty' })
        return steps
      }
      steps.push(...rehash(m, t))
      onMutate?.(m)
      return steps.concat(put(m, key, val, onMutate))
    }
  }
  throw new Error('table full: invariant violated')
}

function growToTable(m: SwissMap, g: Group, onMutate?: OnMutate): Step[] {
  // small group → first real table (16 slots, 1-entry directory)
  const t = newTable(m, 2 * SLOTS, 0)
  t.index = 0
  for (let s = 0; s < SLOTS; s++) if (g.keys[s] !== null) reinsert(m, t, g.keys[s]!, g.vals[s]!)
  m.small = null
  m.dir = [t]
  m.globalDepth = 0
  onMutate?.(m)
  return [{ t: 'grow', from: SLOTS, to: t.capacity, kind: 'small→table', moved: SLOTS, note: 'the small map (one group, no table) becomes a 16-slot table behind a 1-entry directory' }]
}

/**
 * table.pruneTombstones: only when tombstones are ≥10% of capacity. Trace every
 * key's probe path; a group whose tombstones some path walks past is needed.
 * Free the rest, but only if that reclaims ≥10% of capacity (else the caller grows).
 */
function pruneTombstones(m: SwissMap, t: Table): Step | null {
  const dead = t.groups.reduce((n, g) => n + g.ctrl.filter((c) => c === DELETED).length, 0)
  if (dead * 10 < t.capacity) return null
  const needed = new Set<number>()
  t.groups.forEach((g, gi) => {
    for (const k of g.keys) {
      if (k === null) continue
      for (const pg of probeSeq(hash64(k, m.seed), t.groups.length)) {
        if (pg === gi) break
        if (t.groups[pg].ctrl.some((c) => c === DELETED || c === EMPTY)) needed.add(pg)
      }
    }
    if (g.ctrl.some((c) => c === EMPTY)) needed.add(gi)
  })
  const free = t.groups.flatMap((g, gi) => (needed.has(gi) ? [] : g.ctrl.flatMap((c, s) => (c === DELETED ? [[gi, s]] : []))))
  if (free.length * 10 < t.capacity) return { t: 'prune', table: t.id, tombstones: dead, freed: 0 }
  for (const [gi, s] of free) {
    t.groups[gi].ctrl[s] = EMPTY
    t.growthLeft++
  }
  return { t: 'prune', table: t.id, tombstones: dead, freed: free.length }
}

function place(t: Table, gi: number, s: number, key: string, val: number, hash: bigint) {
  const g = t.groups[gi]
  g.ctrl[s] = h2(hash)
  g.keys[s] = key
  g.vals[s] = val
  t.used++
}

function reinsert(m: SwissMap, t: Table, key: string, val: number) {
  const hash = hash64(key, m.seed)
  for (const gi of probeSeq(hash, t.groups.length)) {
    const e = matchEmpty(t.groups[gi])
    if (e.length) {
      place(t, gi, e[0], key, val, hash)
      t.growthLeft--
      return
    }
  }
  throw new Error('reinsert: no room')
}

function entries(t: Table): [string, number][] {
  return t.groups.flatMap((g) => g.keys.flatMap((k, s) => (k !== null ? [[k, g.vals[s]!] as [string, number]] : [])))
}

function rehash(m: SwissMap, t: Table): Step[] {
  const newCap = t.capacity * 2
  if (newCap <= m.maxCap) {
    const n = newTable(m, newCap, t.localDepth)
    for (const [k, v] of entries(t)) reinsert(m, n, k, v)
    n.index = t.index
    for (let i = 0; i < m.dir.length; i++) if (m.dir[i] === t) m.dir[i] = n
    return [{ t: 'grow', from: t.capacity, to: newCap, kind: 'double', moved: t.used, note: `table ${t.id} full (7/8) → rehash all ${t.used} entries into a new ${newCap}-slot table ${n.id} (tombstones dropped)` }]
  }
  // split: extendible hashing
  const ld = t.localDepth + 1
  const left = newTable(m, m.maxCap, ld)
  const right = newTable(m, m.maxCap, ld)
  const bit = 1n << BigInt(64 - ld)
  for (const [k, v] of entries(t)) reinsert(m, hash64(k, m.seed) & bit ? right : left, k, v)
  const steps: Step[] = []
  if (t.localDepth === m.globalDepth) {
    m.dir = m.dir.flatMap((x) => [x, x])
    m.globalDepth++
    steps.push({ t: 'dirDouble', depth: m.globalDepth })
  }
  const span = 1 << (m.globalDepth - t.localDepth)
  const start = m.dir.indexOf(t)
  for (let i = 0; i < span; i++) m.dir[start + i] = i < span / 2 ? left : right
  for (let i = m.dir.length - 1; i >= 0; i--) m.dir[i].index = i
  steps.unshift({
    t: 'grow',
    from: t.capacity,
    to: m.maxCap,
    kind: 'split',
    moved: t.used,
    note: `table ${t.id} is at max capacity (${m.maxCap}) → split by hash bit ${ld} into tables ${left.id} (bit=0) and ${right.id} (bit=1)`,
  })
  return steps
}

export function del(m: SwissMap, key: string): Step[] {
  const r = get(m, key)
  const steps = r.steps
  if (!r.found) return steps
  const c = steps[steps.length - 1] as Extract<Step, { t: 'cmp' }>
  const g = c.table === -1 ? m.small! : m.dir.find((t) => t.id === c.table)!.groups[c.group]
  g.keys[c.slot] = null
  g.vals[c.slot] = null
  m.used--
  // small maps never need tombstones: there is no probe sequence to preserve
  const hasEmpty = g.ctrl.some((x) => x === EMPTY)
  if (c.table === -1 || hasEmpty) {
    g.ctrl[c.slot] = EMPTY
    if (c.table !== -1) {
      const t = m.dir.find((x) => x.id === c.table)!
      t.used--
      t.growthLeft++
    }
    steps.push({ t: 'delete', table: c.table, group: c.group, slot: c.slot, to: 'empty' })
  } else {
    g.ctrl[c.slot] = DELETED
    m.tombstonePossible = true
    m.dir.find((x) => x.id === c.table)!.used--
    steps.push({ t: 'delete', table: c.table, group: c.group, slot: c.slot, to: 'tombstone' })
  }
  if (m.used === 0) m.seed = (m.seed * 6364136223846793005n + 1442695040888963407n) & M64
  return steps
}

/** Deep copy: tables stay shared between the directory entries that point at them. */
export function cloneMap(m: SwissMap): SwissMap {
  const tabs = new Map(tables(m).map((t) => [t.id, structuredClone(t)]))
  return { ...m, small: m.small ? structuredClone(m.small) : null, dir: m.dir.map((t) => tabs.get(t.id)!) }
}

export function len(m: SwissMap) {
  return m.used
}

export function tombstones(m: SwissMap) {
  if (m.small) return 0
  return tables(m).reduce((n, t) => n + t.groups.reduce((a, g) => a + g.ctrl.filter((c) => c === DELETED).length, 0), 0)
}
