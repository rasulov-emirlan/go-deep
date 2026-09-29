// A deterministic, teaching-scale model of the Go scheduler (runtime/proc.go).
// It keeps the real decision order (runnext → local → global → netpoll → steal),
// the real queue semantics (runnext kick-out, runqputslow, globrunqget batching,
// steal-half), P handoff on syscalls and sysmon preemption — but in ticks, not ns.

export type Op =
  | { k: 'cpu'; n: number }
  | { k: 'loop' } // tight loop with no function calls: no cooperative safe points
  | { k: 'syscall'; n: number }
  | { k: 'net'; n: number }
  | { k: 'sleep'; n: number }
  | { k: 'yield' }
  | { k: 'spawn'; count: number; script: Op[]; label?: string }
  | { k: 'wait' } // park forever (e.g. wg.Wait / select{}) until all others exit

export type GState = 'runnable' | 'running' | 'syscall' | 'waiting' | 'dead'
export type G = {
  id: number
  label: string
  state: GState
  ops: Op[]
  pc: number
  left: number
  slice: number
  ranOn: number[] // P ids it ran on, in order (for the UI)
  wait?: 'net' | 'sleep' | 'wait'
}
export type P = {
  id: number
  status: 'idle' | 'running' | 'syscall'
  m: number | null
  cur: number | null
  runnext: number | null
  runq: number[]
  schedtick: number
}
export type M = { id: number; p: number | null; g: number | null; state: 'running' | 'spinning' | 'idle' | 'syscall' }
export type Parked = { g: number; readyAt: number; kind: 'net' | 'sleep' }
export type Sys = { g: number; m: number; p: number; since: number; doneAt: number }

export type EventKind =
  | 'info'
  | 'spawn'
  | 'kick'
  | 'overflow'
  | 'new-thread'
  | 'wakep'
  | 'park-m'
  | 'run-runnext'
  | 'run-local'
  | 'run-global'
  | 'fairness'
  | 'run-netpoll'
  | 'steal'
  | 'steal-runnext'
  | 'goexit'
  | 'gosched'
  | 'net-park'
  | 'sleep-park'
  | 'wait-park'
  | 'syscall-enter'
  | 'exitsyscall-fast'
  | 'exitsyscall-idlep'
  | 'exitsyscall-global'
  | 'handoff'
  | 'retake-idle'
  | 'preempt'
  | 'preempt-ignored'
  | 'netpoll-sysmon'
  | 'timer-ready'
  | 'run-timer'
  | 'wg-wake'
export type SimEvent = { tick: number; kind: EventKind; g?: number; p?: number; text: string }

export type Sim = {
  events: SimEvent[]
  tick: number
  gomaxprocs: number
  asyncPreempt: boolean
  runqCap: number
  timeslice: number
  sysmonEvery: number
  ps: P[]
  ms: M[]
  gs: G[]
  global: number[]
  parked: Parked[]
  sys: Sys[]
  lastPoll: number
  seed: number
  log: string[] // newest first
  order: number[] // G ids in the order they first started running
  history: (number | null)[][] // per tick: G id running on each P (-1 = P held by a syscall)
  stats: { steals: number; handoffs: number; preemptions: number; threads: number; switches: number; ignoredPreempts: number }
}

export type Config = { gomaxprocs: number; asyncPreempt?: boolean; runqCap?: number; main: Op[]; mainLabel?: string }

export function create(cfg: Config): Sim {
  const s: Sim = {
    tick: 0,
    gomaxprocs: cfg.gomaxprocs,
    asyncPreempt: cfg.asyncPreempt ?? true,
    runqCap: cfg.runqCap ?? 8,
    timeslice: 5,
    sysmonEvery: 2,
    ps: [],
    ms: [],
    gs: [],
    global: [],
    parked: [],
    sys: [],
    lastPoll: 0,
    seed: 0x2545f491,
    log: [],
    order: [],
    history: [],
    events: [],
    stats: { steals: 0, handoffs: 0, preemptions: 0, threads: 1, switches: 0, ignoredPreempts: 0 },
  }
  for (let i = 0; i < cfg.gomaxprocs; i++) s.ps.push({ id: i, status: 'idle', m: null, cur: null, runnext: null, runq: [], schedtick: 0 })
  // m0 runs main on P0
  s.ms.push({ id: 0, p: 0, g: null, state: 'running' })
  const main = newG(s, cfg.main, cfg.mainLabel ?? 'main')
  s.ps[0].m = 0
  s.ps[0].status = 'running'
  // runtime.main already scheduled one runtime helper G on P0 before user main
  // (calibrated against the go1.26 300-goroutine puzzle)
  s.ps[0].schedtick = 1
  run(s, s.ps[0], main)
  s.log.unshift('m0 starts main goroutine on P0')
  return s
}

function rand(s: Sim) {
  // xorshift32, deterministic
  let x = s.seed
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  s.seed = x >>> 0
  return s.seed
}

function newG(s: Sim, ops: Op[], label?: string): G {
  const g: G = { id: s.gs.length, label: label ?? 'g' + s.gs.length, state: 'runnable', ops, pc: 0, left: 0, slice: 0, ranOn: [] }
  loadOp(g)
  s.gs.push(g)
  return g
}

function loadOp(g: G) {
  const op = g.ops[g.pc]
  g.left = op && 'n' in op ? op.n : 0
}

function say(s: Sim, msg: string, kind: EventKind = 'info', g?: number, p?: number) {
  s.events.push({ tick: s.tick, kind, g, p, text: msg })
  s.log.unshift(`t${s.tick} · ${msg}`)
  if (s.log.length > 200) s.log.length = 200
}

const gname = (s: Sim, id: number) => s.gs[id].label

function run(s: Sim, p: P, g: G, inheritTime = false) {
  p.cur = g.id
  if (!inheritTime) p.schedtick++
  g.state = 'running'
  g.slice = 0
  if (!s.order.includes(g.id)) s.order.push(g.id)
  if (g.ranOn[g.ranOn.length - 1] !== p.id) g.ranOn.push(p.id)
  const m = s.ms[p.m!]
  m.g = g.id
  m.state = 'running'
  s.stats.switches++
}

// runqput with next=true is what newproc does: the new G goes to runnext and
// the previous runnext is kicked to the tail of the local queue.
export function runqput(s: Sim, p: P, gid: number, next: boolean) {
  if (next) {
    const old = p.runnext
    p.runnext = gid
    if (old === null) return
    say(s, `P${p.id}: ${gname(s, old)} kicked out of runnext → local queue tail`, 'kick', old, p.id)
    gid = old
  }
  if (p.runq.length < s.runqCap) {
    p.runq.push(gid)
    return
  }
  // runqputslow: move half the local queue + this G to the global queue
  const half = p.runq.splice(0, s.runqCap / 2)
  s.global.push(...half, gid)
  say(s, `P${p.id}: local queue full → runqputslow moves ${half.length + 1} Gs to the global queue`, 'overflow', gid, p.id)
}

function idleP(s: Sim) {
  return s.ps.find((p) => p.status === 'idle' && p.m === null)
}

function getM(s: Sim): M {
  const idle = s.ms.find((m) => m.state === 'idle')
  if (idle) return idle
  const m: M = { id: s.ms.length, p: null, g: null, state: 'idle' }
  s.ms.push(m)
  s.stats.threads++
  say(s, `no idle M → runtime creates OS thread m${m.id}`, 'new-thread')
  return m
}

function acquire(p: P, m: M, state: M['state']) {
  p.m = m.id
  p.status = 'running'
  m.p = p.id
  m.state = state
}

function releaseP(s: Sim, p: P) {
  if (p.m !== null) {
    const m = s.ms[p.m]
    m.p = null
    m.g = null
    m.state = 'idle'
  }
  p.m = null
  p.cur = null
  p.status = 'idle'
}

function hasWork(s: Sim) {
  return s.global.length > 0 || s.ps.some((p) => p.runq.length > 0 || p.runnext !== null) || s.parked.some((x) => x.readyAt <= s.tick)
}

// wakep: if there is an idle P and nobody is already spinning, start one
// spinning M on it. Only one at a time — a spinning M that finds work wakes the next.
function wakep(s: Sim) {
  if (s.ms.some((m) => m.state === 'spinning')) return
  const p = idleP(s)
  if (!p || !hasWork(s)) return
  const m = getM(s)
  acquire(p, m, 'spinning')
  say(s, `wakep: m${m.id} starts spinning on idle P${p.id} to look for work`, 'wakep', undefined, p.id)
}

function netpoll(s: Sim): number[] {
  const ready = s.parked.filter((x) => x.readyAt <= s.tick)
  if (!ready.length) return []
  s.parked = s.parked.filter((x) => x.readyAt > s.tick)
  s.lastPoll = s.tick
  for (const r of ready) s.gs[r.g].state = 'runnable'
  return ready.map((r) => r.g)
}

type Found = { g: number; why: string; kind: EventKind; inherit?: boolean }

export function findRunnable(s: Sim, p: P): Found | null {
  // 1. fairness: every 61st schedule, look at the global queue first
  if (p.schedtick % 61 === 0 && p.schedtick > 0 && s.global.length) {
    return { g: s.global.shift()!, why: 'schedtick%61==0 → global queue first (fairness)', kind: 'fairness' }
  }
  // 2. runnext, then local queue
  if (p.runnext !== null) {
    const g = p.runnext
    p.runnext = null
    return { g, why: 'from runnext (inherits time slice)', kind: 'run-runnext', inherit: true }
  }
  if (p.runq.length) return { g: p.runq.shift()!, why: 'from local run queue', kind: 'run-local' }
  // 3. global queue: take a batch
  if (s.global.length) {
    const n = Math.min(s.global.length, Math.floor(s.global.length / s.gomaxprocs) + 1, s.runqCap / 2)
    const batch = s.global.splice(0, n)
    p.runq.push(...batch.slice(1))
    return { g: batch[0], why: n > 1 ? `grabbed ${n} Gs from global queue` : 'from global queue', kind: 'run-global' }
  }
  // 4. non-blocking netpoll
  const ready = netpoll(s)
  if (ready.length) {
    s.global.push(...ready.slice(1))
    const timer = s.gs[ready[0]].wait === 'sleep'
    return {
      g: ready[0],
      why: (timer ? 'its timer expired' : `netpoll: ${ready.length} G(s) ready`) + (ready.length > 1 ? ', rest → global' : ''),
      kind: timer ? 'run-timer' : 'run-netpoll',
    }
  }
  // 5. steal half of another P's local queue (random victim order)
  const victims = s.ps.filter((v) => v !== p)
  for (let i = victims.length - 1; i > 0; i--) {
    const j = rand(s) % (i + 1)
    ;[victims[i], victims[j]] = [victims[j], victims[i]]
  }
  for (const v of victims) {
    if (v.runq.length) {
      const n = Math.ceil(v.runq.length / 2)
      const stolen = v.runq.splice(0, n)
      p.runq.push(...stolen.slice(1))
      s.stats.steals++
      return { g: stolen[0], why: `stole ${n} G(s) from P${v.id}`, kind: 'steal' }
    }
  }
  // last resort: steal a busy P's runnext
  for (const v of victims) {
    if (v.runnext !== null && v.cur !== null) {
      const g = v.runnext
      v.runnext = null
      s.stats.steals++
      return { g, why: `stole runnext from P${v.id}`, kind: 'steal-runnext' }
    }
  }
  return null
}

function schedule(s: Sim, p: P): boolean {
  const f = findRunnable(s, p)
  const m = s.ms[p.m!]
  if (!f) {
    say(s, `P${p.id}: nothing to run → P idle, m${m.id} parks (stopm)`, 'park-m', undefined, p.id)
    releaseP(s, p)
    return false
  }
  const wasSpinning = m.state === 'spinning'
  run(s, p, s.gs[f.g], f.inherit)
  say(s, `P${p.id} runs ${gname(s, f.g)} — ${f.why}`, f.kind, f.g, p.id)
  if (wasSpinning) wakep(s) // resetspinning → maybe wake another
  return true
}

function exec(s: Sim, p: P) {
  const g = s.gs[p.cur!]
  const op = g.ops[g.pc]
  const m = s.ms[p.m!]
  if (!op) {
    g.state = 'dead'
    p.cur = null
    m.g = null
    say(s, `${g.label} returns → goexit, P${p.id} calls schedule()`, 'goexit', g.id, p.id)
    return
  }
  switch (op.k) {
    case 'cpu':
      g.left--
      g.slice++
      if (g.left <= 0) {
        g.pc++
        loadOp(g)
        if (g.pc >= g.ops.length) exec(s, p)
      }
      return
    case 'loop':
      g.slice++
      return
    case 'spawn': {
      for (let i = 0; i < op.count; i++) {
        const c = newG(s, op.script, op.label ? `${op.label}${op.count > 1 ? i : ''}` : undefined)
        runqput(s, p, c.id, true)
      }
      say(s, op.count === 1 ? `${g.label}: go ${s.gs[s.gs.length - 1].label}() → newproc puts it in P${p.id}.runnext` : `${g.label}: go ×${op.count} → newproc puts each new G in P${p.id}.runnext`, 'spawn', s.gs[s.gs.length - 1].id, p.id)
      g.pc++
      loadOp(g)
      g.slice++
      wakep(s)
      return
    }
    case 'yield':
      g.pc++
      loadOp(g)
      g.state = 'runnable'
      s.global.push(g.id)
      p.cur = null
      say(s, `${g.label}: runtime.Gosched() → goes to the GLOBAL queue`, 'gosched', g.id, p.id)
      return
    case 'net':
    case 'sleep':
      g.pc++
      loadOp(g)
      g.state = 'waiting'
      g.wait = op.k
      s.parked.push({ g: g.id, readyAt: s.tick + op.n, kind: op.k })
      p.cur = null
      m.g = null
      say(s, `${g.label}: ${op.k === 'net' ? 'conn.Read would block → gopark on netpoller' : 'time.Sleep → gopark on timer'}; M keeps P and schedules`, op.k === 'net' ? 'net-park' : 'sleep-park', g.id, p.id)
      return
    case 'wait':
      g.state = 'waiting'
      g.wait = 'wait'
      p.cur = null
      m.g = null
      say(s, `${g.label}: blocks (wg.Wait) → gopark`, 'wait-park', g.id, p.id)
      return
    case 'syscall':
      g.state = 'syscall'
      m.state = 'syscall'
      p.status = 'syscall'
      s.sys.push({ g: g.id, m: m.id, p: p.id, since: s.tick, doneAt: s.tick + op.n })
      g.pc++
      loadOp(g)
      say(s, `${g.label}: entersyscall (read file) — m${m.id} blocks in the kernel, P${p.id} stays attached for now`, 'syscall-enter', g.id, p.id)
      return
  }
}

function exitSyscalls(s: Sim) {
  for (const sc of s.sys.filter((x) => x.doneAt <= s.tick)) {
    s.sys = s.sys.filter((x) => x !== sc)
    const g = s.gs[sc.g]
    const m = s.ms[sc.m]
    const old = s.ps[sc.p]
    if (old.status === 'syscall' && old.m === m.id) {
      old.status = 'running'
      m.state = 'running'
      g.state = 'running'
      g.slice = 0
      say(s, `${g.label}: exitsyscall fast path — P${old.id} still ours`, 'exitsyscall-fast', g.id, old.id)
      continue
    }
    const p = idleP(s)
    if (p) {
      acquire(p, m, 'running')
      run(s, p, g)
      say(s, `${g.label}: exitsyscall — P${sc.p} was handed off, grabbed idle P${p.id}`, 'exitsyscall-idlep', g.id, p.id)
      continue
    }
    g.state = 'runnable'
    s.global.push(g.id)
    m.g = null
    m.p = null
    m.state = 'idle'
    say(s, `${g.label}: exitsyscall — no P free → G to global queue, m${m.id} parks`, 'exitsyscall-global', g.id)
  }
}

function sysmon(s: Sim) {
  // retake Ps stuck in syscalls (real: after 20µs–10ms) → handoffp
  for (const sc of s.sys) {
    const p = s.ps[sc.p]
    if (p.status !== 'syscall' || p.m !== sc.m || s.tick - sc.since < s.sysmonEvery) continue
    s.stats.handoffs++
    p.m = null
    p.cur = null
    s.ms[sc.m].p = null
    p.status = 'idle'
    if (p.runnext !== null || p.runq.length || s.global.length) {
      const m = getM(s)
      acquire(p, m, 'running')
      say(s, `sysmon retakes P${p.id} from syscalling m${sc.m} → handoffp to m${m.id}`, 'handoff', sc.g, p.id)
    } else {
      say(s, `sysmon retakes P${p.id} from syscalling m${sc.m} → no work, P idles`, 'retake-idle', sc.g, p.id)
    }
  }
  // preempt long-running Gs (real: forcePreemptNS = 10ms)
  for (const p of s.ps) {
    if (p.cur === null || p.status !== 'running') continue
    const g = s.gs[p.cur]
    if (g.slice < s.timeslice) continue
    const op = g.ops[g.pc]
    const tight = op?.k === 'loop'
    if (tight && !s.asyncPreempt) {
      s.stats.ignoredPreempts++
      say(s, `sysmon: ${g.label} ran >10ms, sets preempt flag — but a tight loop has no safe point (Go ≤1.13): ignored`, 'preempt-ignored', g.id, p.id)
      g.slice = 0
      continue
    }
    s.stats.preemptions++
    g.state = 'runnable'
    s.global.push(g.id)
    p.cur = null
    s.ms[p.m!].g = null
    say(s, `sysmon: ${g.label} ran >10ms → ${tight ? 'SIGURG async preemption' : 'preempt at next function prologue'} → G to global queue`, 'preempt', g.id, p.id)
  }
  // netpoll if nobody polled for a while (real: 10ms)
  if (s.tick - s.lastPoll >= 5) {
    const ready = netpoll(s)
    if (ready.length) {
      s.global.push(...ready)
      for (const id of ready)
        if (s.gs[id].wait === 'sleep') say(s, `${s.gs[id].label}'s timer expired → runnable, global queue (still needs a free P)`, 'timer-ready', id)
        else say(s, `sysmon: netpoll found ${s.gs[id].label} ready → global queue`, 'netpoll-sysmon', id)
    }
    s.lastPoll = s.tick
  }
}

export function step(s: Sim) {
  s.tick++
  exitSyscalls(s)
  for (const p of s.ps) {
    if (p.m === null || p.status === 'syscall') continue
    if (p.cur === null && !schedule(s, p)) continue
    exec(s, p)
  }
  if (s.tick % s.sysmonEvery === 0) sysmon(s)
  // wg.Wait-style parkers wake once every other G is dead
  const waiter = s.gs.find((g) => g.wait === 'wait' && g.state === 'waiting')
  if (waiter && s.gs.every((g) => g === waiter || g.state === 'dead')) {
    waiter.state = 'runnable'
    waiter.wait = undefined
    waiter.pc++
    loadOp(waiter)
    s.global.push(waiter.id)
    say(s, `${waiter.label}: wg.Wait returns → runnable`, 'wg-wake', waiter.id)
  }
  wakep(s)
  s.history.push(s.ps.map((p) => (p.status === 'syscall' ? -1 : p.m !== null ? p.cur : null)))
}

/** Inject a goroutine as if `go f()` ran on P `pid` (newproc → runnext). */
export function spawnOn(s: Sim, pid: number, ops: Op[], label?: string) {
  const g = newG(s, ops, label)
  const p = s.ps[pid]
  runqput(s, p, g.id, true)
  say(s, `go ${g.label}() on P${pid} → runnext`, 'spawn', g.id, pid)
  wakep(s)
  return g
}

export function done(s: Sim) {
  return s.gs.every((g) => g.state === 'dead') || (s.gs[0].state === 'dead' && s.gs[0].label === 'main')
}

export function runUntil(s: Sim, maxTicks = 500) {
  while (!done(s) && s.tick < maxTicks) step(s)
  return s
}

export const clone = (s: Sim): Sim => structuredClone(s)
