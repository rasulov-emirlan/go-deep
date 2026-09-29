// Scripted guided tours over the real Swiss-map model (src/sim/swiss.ts).
// Each tour runs real operations on a real map and records one frame per sim
// Step, with the map state the reader should see at that moment. Keys are
// searched for (not hard-coded) so each tour reliably hits its edge cases.
import { DELETED, EMPTY, cloneMap, del, dirIndex, get, h1, h2, hash64, newMap, put, tables, type Step, type SwissMap } from '../../sim/swiss'

export type Kind =
  | 'small-alloc'
  | 'small-hash'
  | 'small-insert'
  | 'hit'
  | 'false-pos'
  | 'small-miss'
  | 'update'
  | 'small-delete'
  | 'to-table'
  | 'hash'
  | 'place-empty'
  | 'probe-next'
  | 'miss'
  | 'delete-empty'
  | 'delete-tomb'
  | 'past-tomb'
  | 'reuse-tomb'
  | 'prune'
  | 'prune-fail'
  | 'double'
  | 'split'
  | 'dir-double'
  | 'split-no-dir'

export type Op = { k: 'put' | 'get' | 'del'; key: string; val?: number } | { k: 'fill'; keys: string[] }

export type TourFrame = {
  state: SwissMap
  step: Step | null
  op: Op | null
  kinds: Kind[]
  /** result of the whole op, shown on its last frame */
  result?: string
}

export type Tour = { id: string; label: string; blurb: string; maxCap: number; stops: Kind[]; frames: TourFrame[] }

/** Readable 2-letter keys: consonant+vowel first ("ba", "ko"…), then every other pair. */
const CANDIDATES = (() => {
  const c = 'bdfghjklmnprstvwyz'
  const v = 'aeiou'
  const out: string[] = []
  for (const a of c) for (const b of v) out.push(a + b)
  const abc = 'abcdefghijklmnopqrstuvwxyz'
  for (const a of abc) for (const b of abc) if (!out.includes(a + b)) out.push(a + b)
  return out
})()

export function classify(step: Step, steps: Step[], i: number, state: SwissMap): Kind[] {
  switch (step.t) {
    case 'hash':
      return step.dirIdx === null ? ['small-hash'] : ['hash']
    case 'probe': {
      if (step.table === -1) return []
      const k: Kind[] = []
      if (step.i > 0) k.push('probe-next')
      const g = state.dir.find((t) => t.id === step.table)?.groups[step.group]
      if (g && g.ctrl.includes(DELETED) && steps.slice(i + 1).some((x) => x.t === 'probe')) k.push('past-tomb')
      return k
    }
    case 'cmp':
      return [step.eq ? 'hit' : 'false-pos']
    case 'place':
      if (step.reuse === 'update') return ['update']
      if (step.table === -1) return ['small-insert']
      return [step.reuse === 'tombstone' ? 'reuse-tomb' : 'place-empty']
    case 'delete':
      if (step.table === -1) return ['small-delete']
      return [step.to === 'tombstone' ? 'delete-tomb' : 'delete-empty']
    case 'miss':
      return [step.table === -1 ? 'small-miss' : 'miss']
    case 'grow':
      if (step.kind === 'small→table') return ['to-table']
      if (step.kind === 'double') return ['double']
      return steps[i + 1]?.t === 'dirDouble' ? ['split'] : ['split', 'split-no-dir']
    case 'dirDouble':
      return ['dir-double']
    case 'prune':
      return [step.freed ? 'prune' : 'prune-fail']
  }
}

/** Records frames while running ops on a live map; helpers find keys with the properties a scene needs. */
export class Script {
  m: SwissMap
  frames: TourFrame[] = []
  private used = new Set<string>()
  private val = 0

  constructor(maxCap: number, seed = 0x5eedn) {
    this.m = newMap(maxCap, seed)
  }

  hash(k: string) {
    return hash64(k, this.m.seed)
  }
  h2(k: string) {
    return h2(this.hash(k))
  }
  /** Group a key's probe starts at, in a table of nGroups groups. */
  start(k: string, nGroups: number) {
    return Number(h1(this.hash(k)) & BigInt(nGroups - 1))
  }
  /** Table a key routes to right now. */
  table(k: string) {
    return this.m.dir[dirIndex(this.m, this.hash(k))]
  }
  where(k: string) {
    for (const t of tables(this.m)) for (const [gi, g] of t.groups.entries()) for (const [s, x] of g.keys.entries()) if (x === k) return { table: t, group: gi, slot: s }
    return null
  }
  /** Keys that are live in the map, in table/group/slot order. */
  keys(filter: (w: NonNullable<ReturnType<Script['where']>>) => boolean = () => true) {
    const out: string[] = []
    for (const t of tables(this.m)) for (const [gi, g] of t.groups.entries()) for (const [s, x] of g.keys.entries()) if (x && filter({ table: t, group: gi, slot: s })) out.push(x)
    return out
  }
  find(pred: (k: string) => boolean): string {
    const k = CANDIDATES.find((x) => !this.used.has(x) && pred(x))
    if (!k) throw new Error('no key satisfies the predicate')
    this.used.add(k)
    return k
  }
  findN(n: number, pred: (k: string) => boolean) {
    return Array.from({ length: n }, () => this.find(pred))
  }

  /** Apply ops without recording (the tour's starting state). */
  setup(keys: string[]) {
    for (const k of keys) {
      this.used.add(k)
      put(this.m, k, this.val++)
    }
  }
  begin() {
    this.frames.push({ state: cloneMap(this.m), step: null, op: null, kinds: this.m.small || this.m.dir.length ? [] : ['small-alloc'] })
  }

  put(key: string, val = this.val++) {
    this.used.add(key)
    this.record({ k: 'put', key, val }, () => {
      const mids: SwissMap[] = []
      const steps = put(this.m, key, val, (mm) => mids.push(cloneMap(mm)))
      return { steps, mids, result: `m["${key}"] = ${val}` }
    })
  }
  get(key: string) {
    this.used.add(key)
    this.record({ k: 'get', key }, () => {
      const r = get(this.m, key)
      return { steps: r.steps, mids: [], result: r.found ? `m["${key}"] → ${r.val}, true` : `m["${key}"] → 0, false (not found)` }
    })
  }
  del(key: string) {
    this.record({ k: 'del', key }, () => ({ steps: del(this.m, key), mids: [], result: `delete(m, "${key}") done` }))
  }
  fill(keys: string[]) {
    for (const k of keys) {
      this.used.add(k)
      const steps = put(this.m, k, this.val++)
      if (steps.some((s) => s.t === 'grow' || s.t === 'prune')) throw new Error(`fill key ${k} changed the table shape`)
    }
    this.frames.push({ state: cloneMap(this.m), step: null, op: { k: 'fill', keys }, kinds: [] })
  }

  private record(op: Op, run: () => { steps: Step[]; mids: SwissMap[]; result: string }) {
    const before = cloneMap(this.m)
    const { steps, mids, result } = run()
    const after = cloneMap(this.m)
    let state = before
    steps.forEach((s, i) => {
      if (s.t === 'grow' || s.t === 'prune') state = mids.shift() ?? state
      if (s.t === 'place' || s.t === 'delete') state = after
      this.frames.push({ state, step: s, op, kinds: classify(s, steps, i, state), result: i === steps.length - 1 ? result : undefined })
    })
  }
}

const SMALL = 'small'

function smallTour(): Tour {
  const s = new Script(32)
  s.begin()
  const [a, b, c] = s.findN(3, () => true)
  s.put(a)
  s.put(b)
  s.put(c)
  s.get(b)
  // a missing key that shares its 7-bit fingerprint with a key already in the group
  const twin = s.find((k) => [a, b, c].some((x) => s.h2(x) === s.h2(k)))
  s.get(twin)
  s.put(b)
  s.del(c)
  s.fill(s.findN(6, () => true))
  s.put(s.find(() => true))
  return {
    id: SMALL,
    label: '1 · small map (≤ 8)',
    blurb: 'A fresh map[string]int. Insert, look up, overwrite, delete — then the 9th key.',
    maxCap: 32,
    stops: ['small-alloc', 'small-hash', 'small-insert', 'hit', 'false-pos', 'small-miss', 'update', 'small-delete', 'to-table'],
    frames: s.frames,
  }
}

function lookupTour(): Tour {
  const s = new Script(32)
  // start state: a 16-slot table (2 groups) with group 0 one key short of full
  const g0 = s.findN(7, (k) => s.start(k, 2) === 0)
  const g1 = s.findN(2, (k) => s.start(k, 2) === 1)
  s.setup([...g0, ...g1])
  s.begin()
  const uniq = (k: string) => !s.keys().some((x) => s.h2(x) === s.h2(k))
  const p1 = s.find((k) => s.start(k, 2) === 0 && uniq(k))
  s.put(p1)
  const p2 = s.find((k) => s.start(k, 2) === 0 && uniq(k))
  s.put(p2)
  s.get(p1)
  const inG0 = s.keys((w) => w.group === 0)
  const twin = s.find((k) => s.start(k, 2) === 0 && inG0.some((x) => s.h2(x) === s.h2(k)) && !s.keys((w) => w.group === 1).some((x) => s.h2(x) === s.h2(k)))
  s.get(twin)
  s.get(s.find((k) => s.start(k, 2) === 1 && uniq(k)))
  s.put(p1)
  return {
    id: 'lookup',
    label: '2 · insert & look up',
    blurb: 'A 16-slot table: 2 groups of 8. Group 0 is nearly full. Watch H1 pick the group and H2 filter the lockers.',
    maxCap: 32,
    stops: ['hash', 'place-empty', 'probe-next', 'hit', 'false-pos', 'miss', 'update'],
    frames: s.frames,
  }
}

function tombTour(): Tour {
  const s = new Script(32)
  // 8 keys that all start in group 0 fill it; the 9th ("victim") also starts in
  // group 0, finds it full and is pushed on into group 1
  const g0 = s.findN(8, (k) => s.start(k, 2) === 0)
  const victim = s.find((k) => s.start(k, 2) === 0)
  const g1 = s.findN(2, (k) => s.start(k, 2) === 1)
  s.setup([...g0, victim, ...g1])
  s.begin()
  s.del(g1[0])
  s.del(g0[2])
  s.get(victim)
  s.put(s.find((k) => s.start(k, 2) === 0 && !s.keys().some((x) => s.h2(x) === s.h2(k))))
  s.del(victim)
  const inG0 = s.keys((w) => w.group === 0)
  s.del(inG0[0])
  s.del(inG0[5])
  // fill group 1 until the table has no growth left (tombstones still count)
  const need = s.m.dir[0].growthLeft
  s.fill(s.findN(need, (k) => s.start(k, 2) === 1))
  s.put(s.find((k) => s.start(k, 2) === 1))
  return {
    id: 'tomb',
    label: '3 · delete & tombstones',
    blurb: 'Group 0 is full, and one key was pushed past it into group 1. Now delete things.',
    maxCap: 32,
    stops: ['delete-empty', 'delete-tomb', 'past-tomb', 'reuse-tomb', 'prune'],
    frames: s.frames,
  }
}

function growTour(): Tour {
  const s = new Script(32)
  s.setup(s.findN(9, () => true))
  s.begin()
  const room = () => tables(s.m)[0].growthLeft
  s.fill(s.findN(room(), () => true))
  s.put(s.find(() => true))
  s.fill(s.findN(room(), () => true))
  s.put(s.find(() => true)) // 32-slot table is at 7/8 → split, directory 1 → 2
  // fill the bit-0 table and split it again: its depth equals the directory's → directory 2 → 4
  const fillTable = (bit: 0 | 1) => {
    const target = s.m.dir[bit ? s.m.dir.length - 1 : 0]
    s.fill(s.findN(target.growthLeft, (k) => s.table(k) === target))
    s.put(s.find((k) => s.table(k) === target))
  }
  fillTable(0)
  fillTable(1) // the bit-1 table spans 2 directory entries → splits without doubling the directory
  return {
    id: 'grow',
    label: '4 · growth & split',
    blurb: 'Tables are capped at 32 slots here so splits happen fast (the real cap is 1024).',
    maxCap: 32,
    stops: ['double', 'split', 'dir-double', 'split-no-dir'],
    frames: s.frames,
  }
}

export const buildTours = (): Tour[] => [smallTour(), lookupTour(), tombTour(), growTour()]

/** Every slot state a frame can show, for rendering. */
export const slotState = (c: number) => (c === EMPTY ? 'empty' : c === DELETED ? 'tomb' : 'full')
