// Teaching model of the classic bucket map (Go ≤1.23, runtime/map.go):
// 2^B buckets of 8 slots + tophash, overflow chains, load factor 6.5,
// incremental evacuation (growWork moves ≤2 old buckets per write).
import { hash64 } from './swiss'

export type Bucket = { top: number[]; keys: (string | null)[]; overflow: Bucket | null; evacuated?: boolean }
export type OldMap = { B: number; count: number; buckets: Bucket[]; old: Bucket[] | null; nevacuate: number; noverflow: number; seed: bigint; moved: number }

const newBucket = (): Bucket => ({ top: Array(8).fill(0), keys: Array(8).fill(null), overflow: null })

export function newOldMap(seed = 0x5eedn): OldMap {
  return { B: 0, count: 0, buckets: [newBucket()], old: null, nevacuate: 0, noverflow: 0, seed, moved: 0 }
}

export const tophash = (h: bigint) => {
  const t = Number(h >> 56n)
  return t < 5 ? t + 5 : t
}

function chain(b: Bucket) {
  const out: Bucket[] = []
  for (let x: Bucket | null = b; x; x = x.overflow) out.push(x)
  return out
}

function insertInto(m: OldMap, b: Bucket, key: string, h: bigint) {
  for (const x of chain(b)) {
    const i = x.keys.indexOf(null)
    if (i >= 0) {
      x.keys[i] = key
      x.top[i] = tophash(h)
      return
    }
  }
  const last = chain(b).at(-1)!
  last.overflow = newBucket()
  m.noverflow++
  last.overflow.keys[0] = key
  last.overflow.top[0] = tophash(h)
}

function evacuate(m: OldMap, oldIdx: number) {
  const ob = m.old![oldIdx]
  if (ob.evacuated) return
  const oldN = m.old!.length
  for (const x of chain(ob))
    for (const k of x.keys) {
      if (k === null) continue
      const h = hash64(k, m.seed)
      const dst = m.buckets.length === oldN ? oldIdx : Number(h & BigInt(oldN)) ? oldIdx + oldN : oldIdx // same-size, or X/Y half
      insertInto(m, m.buckets[dst], k, h)
      m.moved++
    }
  ob.evacuated = true
  if (oldIdx === m.nevacuate) {
    while (m.nevacuate < oldN && m.old![m.nevacuate].evacuated) m.nevacuate++
    if (m.nevacuate === oldN) m.old = null
  }
}

function growWork(m: OldMap, bucket: number) {
  if (!m.old) return
  evacuate(m, bucket & (m.old.length - 1))
  if (m.old) evacuate(m, m.nevacuate)
}

export const overLoad = (count: number, B: number) => count > 8 && count > 6.5 * 2 ** B

export function has(m: OldMap, key: string) {
  const h = hash64(key, m.seed)
  let b = m.buckets[Number(h & BigInt(m.buckets.length - 1))]
  if (m.old) {
    const ob = m.old[Number(h & BigInt(m.old.length - 1))]
    if (!ob.evacuated) b = ob
  }
  return chain(b).some((x) => x.keys.includes(key))
}

/** Insert; returns how many entries this single write had to move (growth work). */
export function oldPut(m: OldMap, key: string): number {
  const before = m.moved
  const h = hash64(key, m.seed)
  const idx = () => Number(h & BigInt(m.buckets.length - 1))
  growWork(m, idx())
  if (has(m, key)) return m.moved - before
  if (!m.old && (overLoad(m.count + 1, m.B) || m.noverflow >= 2 ** Math.min(m.B, 15))) {
    // hashGrow: allocate only, move nothing yet
    const same = !overLoad(m.count + 1, m.B)
    m.old = m.buckets
    if (!same) m.B++
    m.buckets = Array.from({ length: 2 ** m.B }, newBucket)
    m.nevacuate = 0
    m.noverflow = 0
    growWork(m, idx())
  }
  insertInto(m, m.buckets[idx()], key, h)
  m.count++
  return m.moved - before
}
