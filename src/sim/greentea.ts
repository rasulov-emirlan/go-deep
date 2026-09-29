// Classic object-graph flood vs Green Tea span scanning, on the same heap.
// Memory model: each span is a region; the CPU cache holds the `cacheSize`
// most recently touched regions (LRU). Classic mark needs a separate mspan /
// gcmarkBits lookup per pointer (out-of-line metadata); Green Tea keeps
// mark/scan bits inline at the end of the 8 KiB span.

export type Heap = { spans: number; perSpan: number; objs: HObj[]; roots: number[] }
export type HObj = { id: number; span: number; slot: number; ptrs: number[] }

/** Typed events for guided tours. `span` is the street (span) the event is about. */
export type GEventKind =
  | 'c-root' // classic: a root pushed on the LIFO work stack
  | 'c-scan' // classic: pop one object and scan it
  | 'c-jump' // classic: the next object is on a different span than the last one
  | 'c-skip' // classic: pointee already marked, only its metadata was touched
  | 'g-enqueue' // green: first mark on an unqueued span → the span is queued
  | 'g-requeue' // green: a span that was already scanned is queued again
  | 'g-accumulate' // green: mark on an already-queued span, no new queue entry
  | 'g-dequeue-many' // green: dequeued span scans several objects in one pass
  | 'g-dequeue-one' // green: only one object was marked → single-object fast path
  | 'done'
export type GEvent = { kind: GEventKind; span: number; objs: number[]; misses: number; text: string }

export type GCState = {
  marked: Set<number> // "seen"
  scanned: Set<number> // black
  loads: number // memory-region touches
  misses: number
  cache: string[] // LRU, most recent last
  trail: number[] // spans touched, most recent last (for drawing jumps)
  steps: number
  done: boolean
  // classic
  stack: number[]
  // green tea
  queue: number[] // FIFO of span ids
  queued: Set<number>
  batch: number[] // objects scanned in the last span dequeue
  batches: number[] // sizes of every span dequeue
  events: GEvent[]
  lastSpan: number | null // span of the last scanned object/span
  everQueued: Set<number>
}

function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

/** Build a heap: `fanout` pointers per object, `locality` = P(pointee is in the same span). */
export function buildHeap(opts: { spans?: number; perSpan?: number; fill?: number; fanout: number; locality: number; seed?: number }): Heap {
  const spans = opts.spans ?? 16
  const perSpan = opts.perSpan ?? 16
  const r = rng(opts.seed ?? 7)
  const objs: HObj[] = []
  for (let s = 0; s < spans; s++)
    for (let i = 0; i < perSpan; i++) if (r() < (opts.fill ?? 0.8)) objs.push({ id: objs.length, span: s, slot: i, ptrs: [] })
  const bySpan = (s: number) => objs.filter((o) => o.span === s)
  for (const o of objs) {
    const n = Math.max(0, Math.round(opts.fanout + (r() - 0.5)))
    for (let k = 0; k < n; k++) {
      const pool = r() < opts.locality ? bySpan(o.span) : objs
      const t = pool[Math.floor(r() * pool.length)]
      if (t && t.id !== o.id) o.ptrs.push(t.id)
    }
  }
  const roots = Array.from({ length: 3 }, () => objs[Math.floor(r() * objs.length)].id)
  return { spans, perSpan, objs, roots }
}

export function initState(): GCState {
  return {
    marked: new Set(),
    scanned: new Set(),
    loads: 0,
    misses: 0,
    cache: [],
    trail: [],
    steps: 0,
    done: false,
    stack: [],
    queue: [],
    queued: new Set(),
    batch: [],
    batches: [],
    events: [],
    lastSpan: null,
    everQueued: new Set(),
  }
}

function touch(s: GCState, region: string, cacheSize: number, span?: number) {
  s.loads++
  const i = s.cache.indexOf(region)
  if (i >= 0) s.cache.splice(i, 1)
  else s.misses++
  s.cache.push(region)
  if (s.cache.length > cacheSize) s.cache.shift()
  if (span !== undefined && s.trail[s.trail.length - 1] !== span) {
    s.trail.push(span)
    if (s.trail.length > 12) s.trail.shift()
  }
}

// ---- classic: LIFO stack of objects -------------------------------------------------

export function classicStart(h: Heap, cacheSize: number): GCState {
  const s = initState()
  for (const r of h.roots) {
    classicShade(h, s, r, cacheSize)
    s.events.push({ kind: 'c-root', span: h.objs[r].span, objs: [r], misses: 0, text: `root → push #${r}` })
  }
  return s
}

function classicShade(h: Heap, s: GCState, id: number, cacheSize: number) {
  const o = h.objs[id]
  touch(s, 'meta' + o.span, cacheSize) // spanOf → mspan → gcmarkBits (out-of-line)
  if (s.marked.has(id)) {
    s.events.push({ kind: 'c-skip', span: o.span, objs: [id], misses: 0, text: `#${id} already marked (still had to look up its span)` })
    return
  }
  s.marked.add(id)
  s.stack.push(id)
}

export function classicStep(h: Heap, s: GCState, cacheSize: number) {
  const id = s.stack.pop()
  if (id === undefined) {
    s.done = true
    return
  }
  const o = h.objs[id]
  const m0 = s.misses
  const jump = s.lastSpan !== null && s.lastSpan !== o.span
  touch(s, 'span' + o.span, cacheSize, o.span) // read the object's pointer fields
  s.scanned.add(id)
  s.batch = [id]
  s.batches.push(1)
  const scan: GEvent = { kind: 'c-scan', span: o.span, objs: [id], misses: 0, text: `pop #${id} and scan it` }
  s.events.push(scan)
  if (jump) s.events.push({ kind: 'c-jump', span: o.span, objs: [id], misses: 0, text: `hop from span ${s.lastSpan} to span ${o.span}` })
  s.lastSpan = o.span
  for (const p of o.ptrs) classicShade(h, s, p, cacheSize)
  s.steps++
  scan.misses = s.misses - m0
  if (!s.stack.length) {
    s.done = true
    s.events.push({ kind: 'done', span: -1, objs: [], misses: 0, text: 'work stack empty — marking done' })
  }
}

// ---- green tea: FIFO queue of spans ------------------------------------------------

export function greenStart(h: Heap, cacheSize: number): GCState {
  const s = initState()
  for (const r of h.roots) greenShade(h, s, r, cacheSize)
  return s
}

function greenShade(h: Heap, s: GCState, id: number, cacheSize: number) {
  const o = h.objs[id]
  touch(s, 'span' + o.span, cacheSize) // inline mark bits live at the end of the span
  if (s.marked.has(id)) return
  s.marked.add(id)
  if (!s.queued.has(o.span)) {
    s.queued.add(o.span) // first discoverer enqueues the span; later marks just accumulate
    s.queue.push(o.span)
    const again = s.everQueued.has(o.span)
    s.everQueued.add(o.span)
    s.events.push({ kind: again ? 'g-requeue' : 'g-enqueue', span: o.span, objs: [id], misses: 0, text: `#${id} seen → span ${o.span} ${again ? 'queued again' : 'queued'}` })
  } else s.events.push({ kind: 'g-accumulate', span: o.span, objs: [id], misses: 0, text: `#${id} seen → span ${o.span} is already queued` })
}

export function greenStep(h: Heap, s: GCState, cacheSize: number) {
  const span = s.queue.shift()
  if (span === undefined) {
    s.done = true
    return
  }
  s.queued.delete(span)
  const m0 = s.misses
  touch(s, 'span' + span, cacheSize, span)
  // toGrey = marks &^ scans — every object marked since the span was queued
  const ready = h.objs.filter((o) => o.span === span && s.marked.has(o.id) && !s.scanned.has(o.id))
  for (const o of ready) s.scanned.add(o.id)
  s.batch = ready.map((o) => o.id)
  s.batches.push(ready.length)
  const deq: GEvent = {
    kind: ready.length === 1 ? 'g-dequeue-one' : 'g-dequeue-many',
    span,
    objs: s.batch,
    misses: 0,
    text: ready.length === 1 ? `dequeue span ${span}: only #${ready[0].id} is marked → scan just that one` : `dequeue span ${span}: scan ${ready.length} marked objects in one pass`,
  }
  s.events.push(deq)
  s.lastSpan = span
  for (const o of ready) for (const p of o.ptrs) greenShade(h, s, p, cacheSize)
  deq.misses = s.misses - m0
  s.steps++
  if (!s.queue.length) {
    s.done = true
    s.events.push({ kind: 'done', span: -1, objs: [], misses: 0, text: 'span queue empty — marking done' })
  }
}

/**
 * A hand-made 3-span × 4-slot heap for the guided tour. Object id = span*4 + slot.
 * Roots a0, a1 share span 0; span 2 collects four marks before it is scanned;
 * span 0 is queued a second time for a lone object (the single-object fast path).
 */
export function tourHeap(): Heap {
  const ptrs: Record<number, number[]> = {
    0: [4, 5], // a0 → b0, b1
    1: [6, 8], // a1 → b2, c0
    4: [9, 10], // b0 → c1, c2
    5: [2], // b1 → a2
    6: [11], // b2 → c3
    9: [7], // c1 → b3
  }
  const objs: HObj[] = Array.from({ length: 12 }, (_, id) => ({ id, span: Math.floor(id / 4), slot: id % 4, ptrs: ptrs[id] ?? [] }))
  return { spans: 3, perSpan: 4, objs, roots: [0, 1] }
}

export function runToEnd(h: Heap, mode: 'classic' | 'green', cacheSize: number) {
  const s = mode === 'classic' ? classicStart(h, cacheSize) : greenStart(h, cacheSize)
  while (!s.done) (mode === 'classic' ? classicStep : greenStep)(h, s, cacheSize)
  return s
}

export function reachableFrom(h: Heap) {
  const seen = new Set<number>()
  const q = [...h.roots]
  while (q.length) {
    const id = q.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    q.push(...h.objs[id].ptrs)
  }
  return seen
}
