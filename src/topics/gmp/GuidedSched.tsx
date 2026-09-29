import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, type Actor, type Prop } from '../../components/Story'
import { clone, create, done, step, type Config, type EventKind, type Op, type Sim, type SimEvent } from '../../sim/sched'
import { why } from './explain'

type Tour = { id: string; label: string; blurb: string; cfg: Config; stops: EventKind[]; asyncToggle?: boolean }

const cpu = (n: number) => [{ k: 'cpu' as const, n }]
// one `go` per tick, so every spawn gets its own step and caption
const spawns = (n: number, script: Op[], label: string): Op[] => Array.from({ length: n }, (_, i) => ({ k: 'spawn' as const, count: 1, script, label: n > 1 ? label + i : label }))

export const tours: Tour[] = [
  {
    id: 'runnext',
    label: '1 · go f() & runnext',
    blurb: 'GOMAXPROCS=1. main starts three goroutines, then waits for them.',
    cfg: { gomaxprocs: 1, main: [...spawns(3, cpu(2), 'g'), { k: 'wait' }] },
    stops: ['spawn', 'kick', 'wait-park', 'run-runnext', 'run-local', 'goexit', 'wg-wake'],
  },
  {
    id: 'global',
    label: '2 · the global queue',
    blurb: 'A tiny local queue (4 seats here, 256 for real) overflows, and one goroutine calls runtime.Gosched().',
    cfg: {
      gomaxprocs: 1,
      runqCap: 4,
      main: [...spawns(6, cpu(1), 'g'), ...spawns(1, [{ k: 'cpu', n: 1 }, { k: 'yield' }, { k: 'cpu', n: 1 }], 'polite'), { k: 'wait' }],
    },
    stops: ['overflow', 'gosched', 'run-global', 'run-local'],
  },
  {
    id: 'steal',
    label: '3 · work stealing',
    blurb: 'GOMAXPROCS=2. All work lands on P0; P1 has to go and find it.',
    cfg: { gomaxprocs: 2, main: [...spawns(5, cpu(3), 'g'), { k: 'wait' }] },
    stops: ['wakep', 'new-thread', 'steal-runnext', 'steal', 'park-m', 'run-global'],
  },
  {
    id: 'io',
    label: '4 · file vs network I/O',
    blurb: 'One goroutine reads a file (blocking syscall), one reads a socket (netpoller), two just compute.',
    cfg: {
      gomaxprocs: 1,
      main: [
        { k: 'spawn', count: 1, script: [{ k: 'syscall', n: 6 }, { k: 'cpu', n: 1 }], label: 'file' },
        { k: 'spawn', count: 1, script: [{ k: 'net', n: 4 }, { k: 'cpu', n: 1 }], label: 'conn' },
        ...spawns(2, cpu(3), 'w'),
        { k: 'wait' },
      ],
    },
    stops: ['syscall-enter', 'handoff', 'new-thread', 'net-park', 'run-netpoll', 'exitsyscall-global'],
  },
  {
    id: 'sys2',
    label: '5 · syscall edge cases',
    blurb: 'GOMAXPROCS=2 and nothing else to run: one very short syscall, one slow one.',
    cfg: { gomaxprocs: 2, main: [{ k: 'spawn', count: 1, script: [{ k: 'syscall', n: 1 }, { k: 'cpu', n: 1 }], label: 'quick' }, { k: 'spawn', count: 1, script: [{ k: 'syscall', n: 6 }, { k: 'cpu', n: 1 }], label: 'slow' }, { k: 'wait' }] },
    stops: ['syscall-enter', 'exitsyscall-fast', 'retake-idle', 'exitsyscall-idlep', 'steal-runnext', 'park-m'],
  },
  {
    id: 'hog',
    label: '6 · preemption',
    blurb: 'GOMAXPROCS=1. go func(){ for {} }() — then main sleeps 4 ms and wants to print. Flip the Go version.',
    cfg: { gomaxprocs: 1, main: [{ k: 'spawn', count: 1, script: [{ k: 'loop' }], label: 'hog' }, { k: 'sleep', n: 2 }, { k: 'cpu', n: 1 }] },
    stops: ['sleep-park', 'timer-ready', 'preempt', 'preempt-ignored', 'run-global'],
    asyncToggle: true,
  },
]

type Layout = {
  W: number
  laneTop: (i: number) => number
  laneH: number
  global: { x: number; w: number; h: number; step: number; max: number; gh: number }
  q: { x: number; w: number; head: number; step: number; max: number; gh: number }
  rn: { x: number; w: number; gh: number }
  p: { x: number; w: number; gh: number }
  m: { x: number; h: number }
  sysmon: { x: number; h: number }
  bottomH: number
  parkW: number
  park: { step: number; gh: number }
  sys: { step: number; mh: number; gh: number }
}

const WIDE: Layout = {
  W: 800,
  laneTop: (i) => 108 + i * 122,
  laneH: 112,
  global: { x: 16, w: 600, h: 92, step: 56, max: 10, gh: 62 },
  q: { x: 16, w: 440, head: 420, step: 52, max: 8, gh: 64 },
  rn: { x: 466, w: 84, gh: 70 },
  p: { x: 560, w: 130, gh: 86 },
  m: { x: 745, h: 100 },
  sysmon: { x: 760, h: 86 },
  bottomH: 112,
  parkW: 370,
  park: { step: 72, gh: 72 },
  sys: { step: 150, mh: 84, gh: 62 },
}

// phones: same map, fewer seats, everything bigger relative to the stage
const NARROW: Layout = {
  W: 420,
  laneTop: (i) => 96 + i * 112,
  laneH: 104,
  global: { x: 6, w: 318, h: 84, step: 50, max: 5, gh: 58 },
  q: { x: 6, w: 176, head: 150, step: 44, max: 3, gh: 58 },
  rn: { x: 186, w: 62, gh: 60 },
  p: { x: 252, w: 90, gh: 72 },
  m: { x: 385, h: 84 },
  sysmon: { x: 376, h: 76 },
  bottomH: 104,
  parkW: 200,
  park: { step: 50, gh: 60 },
  sys: { step: 100, mh: 70, gh: 52 },
}

const stageH = (L: Layout, nP: number) => L.laneTop(nP) + L.bottomH + 6
const WAITERS = ['misc-standing-left', 'misc-standing-v2', 'dandy-standing', 'superhero-standing', 'misc-with-candy']
const bubbleFor: Partial<Record<EventKind, string>> = {
  kick: 'pushed back!',
  overflow: 'to global!',
  gosched: 'after you…',
  preempt: 'preempted!',
  'preempt-ignored': 'can’t stop me',
  steal: 'stolen!',
  'steal-runnext': 'stolen!',
  'net-park': 'waiting for data',
  'sleep-park': 'zzz',
  'wait-park': 'wg.Wait()',
  'syscall-enter': 'stuck in read()',
  'exitsyscall-global': 'no P for me',
  'run-netpoll': 'data’s here!',
  'run-runnext': 'my turn!',
  'wg-wake': 'all done?',
  'timer-ready': 'let me in!',
  'exitsyscall-fast': 'back already',
}

function scene(s: Sim, fresh: SimEvent[], L: Layout): { actors: Actor[]; props: Prop[] } {
  const SH = stageH(L, s.ps.length)
  const props: Prop[] = [{ id: 'global', x: L.global.x, y: 8, w: L.global.w, h: L.global.h, tone: 'dashed', label: `global queue (${s.global.length})` }]
  const actors: Actor[] = []
  const hot = new Map<number, string>()
  for (const e of fresh) if (e.g !== undefined && bubbleFor[e.kind]) hot.set(e.g, bubbleFor[e.kind]!)
  const sysmonActs = fresh.some((e) => ['handoff', 'retake-idle', 'preempt', 'preempt-ignored', 'netpoll-sysmon', 'timer-ready'].includes(e.kind))
  // only the newest bubble per area would be readable; keep at most 2 bubbles on stage
  let bubbles = 0
  const g = (id: number, x: number, y: number, h: number, sprite?: string): Actor => {
    let bubble = hot.get(id)
    if (bubble && bubbles++ >= 2) bubble = undefined
    return { id: 'g' + id, sprite: sprite ?? WAITERS[id % WAITERS.length], x, y, h, tag: s.gs[id].label, hot: hot.has(id), bubble, z: 3 }
  }
  const more = (id: string, x: number, y: number, n: number) => n > 0 && props.push({ id, x, y, w: 40, h: 24, tone: 'none', text: `+${n}` })

  s.global.slice(0, L.global.max).forEach((id, i) => actors.push(g(id, L.global.x + 40 + i * L.global.step, 4 + L.global.h, L.global.gh)))
  more('gmore', L.global.x + L.global.w - 44, 30, s.global.length - L.global.max)

  s.ps.forEach((p, i) => {
    const ty = L.laneTop(i)
    const H = L.laneH
    props.push({ id: 'q' + i, x: L.q.x, y: ty, w: L.q.w, h: H, tone: 'dashed', label: `P${i} queue ${p.runq.length}/${s.runqCap}` })
    props.push({ id: 'rn' + i, x: L.rn.x, y: ty, w: L.rn.w, h: H, tone: 'red', label: 'next' })
    props.push({
      id: 'p' + i,
      x: L.p.x,
      y: ty + H * 0.36,
      w: L.p.w,
      h: H * 0.64,
      tone: p.status === 'idle' ? 'dashed' : p.status === 'syscall' ? 'red' : 'soft',
      label: `P${i}${p.status === 'idle' ? ' · idle' : ''}`,
      text: p.status === 'syscall' ? `held by M${p.m}` : undefined,
    })
    p.runq.slice(0, L.q.max).forEach((id, j) => actors.push(g(id, L.q.head - j * L.q.step, ty + H - 2, L.q.gh)))
    more('qmore' + i, L.q.x + 4, ty + H / 2 - 12, p.runq.length - L.q.max)
    if (p.runnext !== null) actors.push(g(p.runnext, L.rn.x + L.rn.w / 2, ty + H - 2, L.rn.gh))
    if (p.cur !== null && p.status !== 'syscall') {
      const G = s.gs[p.cur]
      const loop = G.ops[G.pc]?.k === 'loop'
      actors.push(g(p.cur, L.p.x + L.p.w / 2, ty + H - 4, L.p.gh, loop ? 'superhero-lifting-1TB' : 'convict-working-hard'))
    }
  })

  const idleMs: number[] = []
  s.ms.forEach((m) => {
    if (m.state === 'syscall') return
    if (m.p !== null) {
      const ty = L.laneTop(m.p)
      actors.push({
        id: 'm' + m.id,
        sprite: 'fairy-tale-armored-knight',
        x: L.m.x,
        y: ty + L.laneH,
        h: L.m.h,
        tag: 'M' + m.id,
        bubble: m.state === 'spinning' ? 'looking…' : undefined,
        hot: m.state === 'spinning',
      })
    } else idleMs.push(m.id)
  })
  idleMs.forEach((id, i) => actors.push({ id: 'm' + id, sprite: 'fairy-tale-armored-knight', x: L.global.x + L.global.w - 30 - i * 26, y: 4 + L.global.h, h: 50, tag: 'M' + id + ' idle', dim: true }))

  const bottom = L.laneTop(s.ps.length) + 4
  props.push({ id: 'parked', x: L.global.x, y: bottom, w: L.parkW, h: SH - bottom - 6, tone: 'soft', label: 'parked · no thread' })
  props.push({ id: 'kernel', x: L.global.x + L.parkW + 10, y: bottom, w: L.W - L.parkW - 2 * L.global.x - 10, h: SH - bottom - 6, tone: 'ink', label: 'kernel · holds a thread' })
  const parked = [...s.parked.map((x) => x.g), ...s.gs.filter((x) => x.wait === 'wait' && x.state === 'waiting').map((x) => x.id)]
  parked.forEach((id, i) => {
    const G = s.gs[id]
    const sprite = G.wait === 'net' ? 'dandy-umbrella' : G.wait === 'sleep' ? 'dandy-raining' : 'misc-cool-one'
    actors.push(g(id, L.global.x + 36 + i * L.park.step, SH - 12, L.park.gh, sprite))
  })
  const k0 = L.global.x + L.parkW + 10
  s.sys.forEach((sc, i) => {
    actors.push({ id: 'm' + sc.m, sprite: 'fairy-tale-armored-knight', x: k0 + 40 + i * L.sys.step, y: SH - 10, h: L.sys.mh, tag: 'M' + sc.m })
    actors.push(g(sc.g, k0 + 90 + i * L.sys.step, SH - 10, L.sys.gh, 'convict-chained'))
  })

  actors.push({ id: 'sysmon', sprite: 'fairy-tale-king', x: L.sysmon.x, y: 4 + L.global.h, h: L.sysmon.h, tag: 'sysmon', bubble: sysmonActs ? 'I see you!' : undefined, hot: sysmonActs })
  return { actors, props }
}

export function GuidedSched() {
  const [tid, setTid] = useState('runnext')
  const tour = tours.find((t) => t.id === tid)!
  const [async, setAsync] = useState(false)
  const [sim, setSim] = useState<Sim>(() => create(tour.cfg))
  const [seen, setSeen] = useState(0) // events already consumed
  const [fresh, setFresh] = useState<SimEvent[]>([])
  const [stops, setStops] = useState<SimEvent[]>([])
  const stop = stops[0] ?? null
  const [explained, setExplained] = useState<Set<EventKind>>(new Set())
  const [auto, setAuto] = useState(false)
  const [lastAll, setLastAll] = useState<(Actor & { gone?: boolean })[]>([])

  const reset = (id = tid, a = async) => {
    const t = tours.find((x) => x.id === id)!
    const s = create({ ...t.cfg, asyncPreempt: t.asyncToggle ? a : true })
    setSim(s)
    setSeen(s.events.length)
    setFresh([])
    setStops([])
    setExplained(new Set())
    setAuto(false)
    setLastAll([])
  }

  const finished = done(sim) || sim.tick > 60
  const advance = () => {
    if (finished) return
    const s = clone(sim)
    step(s)
    const evs = s.events.slice(seen)
    const ex = new Set(explained)
    const hits: SimEvent[] = []
    // explain the cause before the effect: 'spawn' is logged after the kicks it causes
    const ordered = [...evs.filter((e) => e.kind === 'spawn'), ...evs.filter((e) => e.kind !== 'spawn')]
    for (const e of ordered)
      if (tour.stops.includes(e.kind) && !ex.has(e.kind) && why[e.kind]) {
        ex.add(e.kind)
        hits.push(e)
      }
    setSim(s)
    setSeen(s.events.length)
    setFresh(evs)
    setStops(hits)
    setExplained(ex)
  }

  useEffect(() => {
    if (!auto || stop || finished) {
      if (finished) setAuto(false)
      return
    }
    const t = setTimeout(advance, 1100)
    return () => clearTimeout(t)
  })

  const [narrow, setNarrow] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 620))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const L = narrow ? NARROW : WIDE
  const { actors, props } = useMemo(() => scene(sim, fresh, L), [sim, fresh, L])
  // goroutines that vanish (finished) fade out in place instead of popping
  const all = useMemo(() => {
    const ids = new Set(actors.map((a) => a.id))
    const gone = lastAll.filter((a) => !ids.has(a.id)).map((a) => ({ ...a, hidden: true, bubble: undefined, gone: true }))
    return [...actors, ...gone]
  }, [actors]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setLastAll(all), [all])

  const card = stop ? why[stop.kind] : null
  // chips: only the cases this run can actually reach
  const covered = useMemo(() => {
    const t = create({ ...tour.cfg, asyncPreempt: tour.asyncToggle ? async : true })
    while (!done(t) && t.tick <= 60) step(t)
    const reached = new Set(t.events.map((e) => e.kind))
    return tour.stops.filter((k) => why[k] && reached.has(k))
  }, [tour, async])

  return (
    <figure className="story" ref={ref}>
      <div className="story-head">
        <span className="kicker">Guided tour · real scheduler model</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (finished ? (reset(), setAuto(true)) : setAuto(!auto))}>
          {auto ? '❚❚ Pause' : '▶ Autoplay'}
        </button>
      </div>
      <div className="story-tabs">
        {tours.map((t) => (
          <button
            key={t.id}
            className={t.id === tid ? 'on' : ''}
            onClick={() => {
              setTid(t.id)
              reset(t.id)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="story-blurb">
        {tour.blurb}
        {tour.asyncToggle && (
          <span className="seg" style={{ marginLeft: '.6rem', verticalAlign: 'middle' }}>
            {[false, true].map((v) => (
              <button
                key={String(v)}
                className={async === v ? 'on' : ''}
                onClick={() => {
                  setAsync(v)
                  reset(tid, v)
                }}
              >
                {v ? 'Go 1.14+' : 'Go ≤ 1.13'}
              </button>
            ))}
          </span>
        )}
      </p>
      <Stage actors={all} props={props} w={L.W} h={stageH(L, sim.ps.length)} />
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">t{sim.tick}</span>
        {fresh.length ? fresh.map((e) => e.text).join(' · ') : finished ? 'Done.' : 'Press Autoplay or Step.'}
        {finished && <b> {sim.gs[0].state === 'dead' ? 'main returned → the program exits.' : 'main never got its P back — this program hangs forever.'}</b>}
      </figcaption>
      {card && stop && (
        <div className={'story-stop' + (card.edge ? ' edge' : '')}>
          <span className="kicker red">
            {card.edge ? 'Edge case · ' : 'Why? · '}
            {card.title}
          </span>
          <div className="story-stop-body">{card.body}</div>
          <button className="btn" onClick={() => setStops(stops.slice(1))}>
            {stops.length > 1 ? `OK (${stops.length - 1} more) →` : 'OK, next →'}
          </button>
        </div>
      )}
      <div className="story-nav">
        <button className="btn ghost" onClick={() => reset()}>
          ↺ Restart
        </button>
        <div className="story-chips" title="stops explained in this tour">
          {covered.map((k) => (
            <span key={k} className={explained.has(k) ? 'on' : ''}>
              {why[k]!.title.split(/[→:]/)[0].trim()}
            </span>
          ))}
        </div>
        <button className="btn" onClick={advance} disabled={finished || !!stop}>
          Step →
        </button>
      </div>
    </figure>
  )
}
