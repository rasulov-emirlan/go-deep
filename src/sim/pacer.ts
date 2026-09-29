// A simplified GC pacer (runtime/mgcpacer.go + mgclimit.go) to build intuition:
//   goal    = heapMarked + (heapMarked + roots) * GOGC/100      (floor 4 MiB * GOGC/100)
//   goal    = min(goal, GOMEMLIMIT - nonHeap - headroom), never below heapMarked
//   trigger = goal - runway, clamped to [0.7, 0.95] of the way from heapMarked to goal
//   25% background workers + mark assists; CPU limiter caps GC at ~50%.
// Units: MB and seconds.

export type PacerParams = {
  live: number // steady live heap (MB)
  roots: number // stacks + globals (MB)
  allocRate: number // MB/s at full mutator speed
  gogc: number | null // null = off
  limit: number | null // GOMEMLIMIT MB, null = off
  procs: number
  scanRate: number // MB/s per core of mark work
  nonHeap: number // runtime overhead counted against GOMEMLIMIT
  seconds: number
}

export type Cycle = { n: number; start: number; end: number; x: number; y: number; z: number; goal: number; assistMs: number; bgMs: number; limited: boolean }
export type Sample = { t: number; heap: number; goal: number; trigger: number; gc: boolean; gcFrac: number; limited: boolean }
export type PacerResult = {
  samples: Sample[]
  cycles: Cycle[]
  gcCpu: number // fraction of total CPU spent in GC
  mutator: number // fraction of CPU left for the program
  peak: number
  overLimitMs: number
}

export const defaults: PacerParams = { live: 100, roots: 8, allocRate: 600, gogc: 100, limit: null, procs: 4, scanRate: 400, nonHeap: 12, seconds: 4 }

export function goalFor(p: PacerParams, heapMarked: number) {
  const gcGoal = p.gogc === null ? Infinity : Math.max(heapMarked + ((heapMarked + p.roots) * p.gogc) / 100, (4 * p.gogc) / 100)
  const limGoal = p.limit === null ? Infinity : p.limit - p.nonHeap - Math.max(0.03 * p.limit, 1)
  return Math.max(Math.min(gcGoal, limGoal), heapMarked)
}

export function simulate(p: PacerParams): PacerResult {
  const dt = 0.002
  let t = 0
  let heap = p.live
  let heapMarked = p.live
  let marking = false
  let markLeft = 0
  let allocDuringMark = 0
  let cur: Cycle | null = null
  let bucket = 0
  const cap = p.procs * 1.0
  let limited = false
  let gcTime = 0
  let totalTime = 0
  let peak = heap
  let overLimit = 0
  const samples: Sample[] = []
  const cycles: Cycle[] = []
  let goal = goalFor(p, heapMarked)
  let trigger = triggerFor(p, heapMarked, goal)
  let nextSample = 0

  while (t < p.seconds) {
    if (!marking && heap >= trigger) {
      marking = true
      markLeft = p.live + p.roots
      allocDuringMark = 0
      cur = { n: cycles.length + 1, start: t, end: 0, x: heap, y: 0, z: 0, goal, assistMs: 0, bgMs: 0, limited: false }
    }
    let gcFrac = 0
    let assist = 0
    if (marking) {
      const span = Math.max(goal - trigger, 1e-9)
      assist = Math.min(Math.max((heap - trigger) / span, 0), 1) * 0.6
      if (heap >= goal) assist = 0.75 // mutator is out of runway: assists take over
      gcFrac = 0.25 + assist
      if (limited) {
        gcFrac = 0.25 // limiter disables assists
        assist = 0
        cur!.limited = true
      }
      gcFrac = Math.min(gcFrac, 1)
    }
    // leaky bucket: fills with GC CPU, drains with mutator CPU (≈ 50% cap)
    bucket = Math.max(0, Math.min(cap, bucket + (gcFrac - (1 - gcFrac)) * p.procs * dt))
    limited = bucket >= cap * 0.999 ? true : bucket < cap * 0.9 ? false : limited

    const mut = 1 - gcFrac
    const alloc = p.allocRate * mut * dt
    heap += alloc
    gcTime += gcFrac * dt
    totalTime += dt
    if (marking) {
      allocDuringMark += alloc
      markLeft -= p.scanRate * p.procs * gcFrac * dt
      cur!.assistMs += assist * p.procs * dt * 1000
      cur!.bgMs += 0.25 * p.procs * dt * 1000
      if (markLeft <= 0) {
        // objects allocated during mark are allocated black → survive this cycle (floating garbage)
        heapMarked = p.live + allocDuringMark
        cur!.end = t
        cur!.y = heap
        cur!.z = heapMarked
        cycles.push(cur!)
        heap = heapMarked // sweep frees the rest (instant here; lazy in reality)
        marking = false
        goal = goalFor(p, heapMarked)
        trigger = triggerFor(p, heapMarked, goal)
      }
    }
    peak = Math.max(peak, heap)
    if (p.limit !== null && heap + p.nonHeap > p.limit) overLimit += dt
    if (t >= nextSample) {
      samples.push({ t, heap, goal, trigger, gc: marking, gcFrac, limited })
      nextSample += 0.01
    }
    t += dt
  }
  const gcCpu = gcTime / totalTime
  return { samples, cycles, gcCpu, mutator: 1 - gcCpu, peak, overLimitMs: overLimit * 1000 }
}

function triggerFor(p: PacerParams, heapMarked: number, goal: number) {
  if (!isFinite(goal)) return Infinity
  const markTime = (p.live + p.roots) / (p.scanRate * p.procs * 0.25)
  const runway = p.allocRate * 0.75 * markTime
  const lo = heapMarked + 0.7 * (goal - heapMarked)
  const hi = heapMarked + 0.95 * (goal - heapMarked)
  return Math.min(Math.max(goal - runway, lo), hi)
}

/** Render a cycle as a GODEBUG=gctrace=1 line (numbers from the model). */
export function gctrace(c: Cycle, p: PacerParams, cumGcPct: number) {
  const markMs = (c.end - c.start) * 1000
  const f = (x: number) => (x < 10 ? x.toFixed(2) : x.toFixed(0))
  return (
    `gc ${c.n} @${c.start.toFixed(3)}s ${Math.round(cumGcPct)}%: 0.021+${f(markMs)}+0.034 ms clock, ` +
    `${f(0.021 * p.procs)}+${f(c.assistMs)}/${f(c.bgMs)}/0+${f(0.034 * p.procs)} ms cpu, ` +
    `${Math.round(c.x)}->${Math.round(c.y)}->${Math.round(c.z)} MB, ${Math.round(c.goal)} MB goal, ${Math.round(p.roots * 0.75)} MB stacks, ${Math.round(p.roots * 0.25)} MB globals, ${p.procs} P`
  )
}
