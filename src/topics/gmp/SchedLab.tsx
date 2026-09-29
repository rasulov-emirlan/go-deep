import { useEffect, useMemo, useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { clone, create, done, spawnOn, step, type Config, type G, type Op, type Sim } from '../../sim/sched'

type Preset = { id: string; label: string; cfg: Config; note: string }

const cpu = (n: number): Op[] => [{ k: 'cpu', n }]

const presets: Preset[] = [
  {
    id: 'fanout',
    label: 'Fan-out',
    cfg: {
      gomaxprocs: 4,
      main: [{ k: 'spawn', count: 4, script: cpu(6), label: 'a' }, { k: 'spawn', count: 4, script: cpu(3), label: 'b' }, { k: 'spawn', count: 3, script: cpu(8), label: 'c' }, { k: 'wait' }],
    },
    note: 'main spawns 11 goroutines onto P0. Watch runnext kick-outs, wakep starting one spinning M at a time, and idle Ps stealing half of P0’s queue.',
  },
  {
    id: 'runnext',
    label: 'runnext puzzle',
    cfg: { gomaxprocs: 1, main: [{ k: 'spawn', count: 5, script: cpu(1), label: 'g' }, { k: 'wait' }] },
    note: 'GOMAXPROCS=1, spawn g0…g4, then wg.Wait(). Which goroutine runs first? (The last one — it sits in runnext.)',
  },
  {
    id: 'overflow',
    label: 'Queue overflow',
    cfg: { gomaxprocs: 1, runqCap: 8, main: [{ k: 'spawn', count: 11, script: cpu(1), label: 'g' }, { k: 'wait' }] },
    note: 'The local queue here holds 8 (real: 256). The 10th spawn overflows: runqputslow moves half the queue + the kicked G to the global queue in one batch.',
  },
  {
    id: 'syscall',
    label: 'Blocking syscall',
    cfg: {
      gomaxprocs: 2,
      main: [
        { k: 'spawn', count: 2, script: [{ k: 'syscall', n: 7 }, { k: 'cpu', n: 1 }], label: 'read' },
        { k: 'spawn', count: 4, script: cpu(4), label: 'w' },
        { k: 'wait' },
      ],
    },
    note: 'Two goroutines do a blocking file read. Their Ms block in the kernel; sysmon retakes the Ps and hands them to new Ms — watch the thread count rise above GOMAXPROCS.',
  },
  {
    id: 'net',
    label: 'Network I/O',
    cfg: { gomaxprocs: 2, main: [{ k: 'spawn', count: 6, script: [{ k: 'cpu', n: 1 }, { k: 'net', n: 5 }, { k: 'cpu', n: 2 }], label: 'conn' }, { k: 'wait' }] },
    note: 'Six connections each hit EAGAIN and gopark on the netpoller. No threads block: the M keeps its P and runs something else. Ready Gs come back via findRunnable or sysmon.',
  },
  {
    id: 'hog',
    label: 'CPU hog',
    cfg: { gomaxprocs: 1, main: [{ k: 'spawn', count: 1, script: [{ k: 'loop' }], label: 'hog' }, { k: 'sleep', n: 2 }, { k: 'cpu', n: 1 }] },
    note: 'go func(){ for {} }() then time.Sleep. Toggle async preemption off (≈ Go ≤1.13) and main never runs again.',
  },
]

const W = 920
const GW = 34
const GH = 24

function Token({ g, x, y, fresh }: { g: G; x: number; y: number; fresh: boolean }) {
  const st = g.state
  const fill = st === 'running' ? '#0a0a0a' : st === 'syscall' ? '#737373' : '#fff'
  const text = st === 'running' || st === 'syscall' ? '#fafafa' : '#0a0a0a'
  const op = g.ops[g.pc]
  const total = op && 'n' in op ? op.n : 0
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform .35s ease' }}>
      <rect width={GW} height={GH} fill={fill} stroke={fresh ? '#e63946' : '#0a0a0a'} strokeWidth={fresh ? 2.5 : 1.2} strokeDasharray={st === 'waiting' ? '3 2' : undefined} />
      <text x={GW / 2} y={15} textAnchor="middle" fontSize={g.label.length > 4 ? 8.5 : 10} fontWeight={700} fill={text}>
        {g.label}
      </text>
      {op?.k === 'cpu' && total > 0 && <rect x={2} y={GH - 4} width={((GW - 4) * g.left) / total} height={2} fill="#e63946" />}
      {op?.k === 'loop' && <text x={GW - 4} y={9} fontSize={8} textAnchor="end" fill="#e63946">∞</text>}
    </g>
  )
}

function positions(s: Sim) {
  const pos = new Map<number, { x: number; y: number }>()
  const n = s.ps.length
  const colW = Math.min(228, (W - 10) / n)
  s.global.forEach((g, i) => i < 22 && pos.set(g, { x: 120 + i * (GW + 4), y: 18 }))
  s.ps.forEach((p, i) => {
    const x0 = 10 + i * colW
    if (p.cur !== null) pos.set(p.cur, { x: x0 + 14, y: 178 })
    if (p.runnext !== null) pos.set(p.runnext, { x: x0 + 120, y: 178 })
    p.runq.forEach((g, j) => {
      const perRow = Math.max(2, Math.floor((colW - 24) / (GW + 5)))
      pos.set(g, { x: x0 + 12 + (j % perRow) * (GW + 5), y: 240 + Math.floor(j / perRow) * (GH + 6) })
    })
  })
  const parked = [...s.parked.map((pk) => pk.g), ...s.gs.filter((g) => g.wait === 'wait' && g.state === 'waiting').map((g) => g.id)]
  parked.forEach((g, i) => pos.set(g, { x: 14 + (i % 11) * (GW + 5), y: 388 + Math.floor(i / 11) * (GH + 6) }))
  s.sys.forEach((sc, i) => pos.set(sc.g, { x: 480 + i * 84 + 44, y: 388 }))
  return { pos, colW }
}

export function SchedLab({ initial = 'fanout', only }: { initial?: string; only?: string[] }) {
  const list = only ? presets.filter((p) => only.includes(p.id)) : presets
  const [pid, setPid] = useState(initial)
  const preset = presets.find((p) => p.id === pid)!
  const [procs, setProcs] = useState(preset.cfg.gomaxprocs)
  const [async, setAsync] = useState(true)
  const [{ sim, prev }, setState] = useState<{ sim: Sim; prev: Sim | null }>(() => ({ sim: create(preset.cfg), prev: null }))
  const setSim = (f: Sim | ((s: Sim) => Sim)) => setState((st) => ({ prev: st.sim, sim: typeof f === 'function' ? f(st.sim) : f }))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(600)
  const [target, setTarget] = useState(0)

  const reset = (id = pid, n = procs, a = async) => {
    const pr = presets.find((p) => p.id === id)!
    setState({ sim: create({ ...pr.cfg, gomaxprocs: n, asyncPreempt: a }), prev: null })
    setPlaying(false)
    setTarget(0)
  }

  const finished = done(sim)
  useEffect(() => {
    if (!playing || finished) return
    const t = setTimeout(() => setSim((s) => (step((s = clone(s))), s)), speed)
    return () => clearTimeout(t)
  }, [playing, sim, speed, finished])

  const doStep = () => setSim((s) => (step((s = clone(s))), s))
  const spawn = (ops: Op[], label: string) =>
    setSim((s) => {
      s = clone(s)
      spawnOn(s, Math.min(target, s.ps.length - 1), ops, label + s.gs.length)
      return s
    })

  const { pos, colW } = useMemo(() => positions(sim), [sim])
  // tokens that changed place since the previous state get a red outline
  const fresh = useMemo(() => {
    const out = new Set<number>()
    if (!prev) return out
    const before = positions(prev).pos
    pos.forEach((p, g) => {
      const b = before.get(g)
      if (!b || b.x !== p.x || b.y !== p.y) out.add(g)
    })
    return out
  }, [pos, prev])

  const spinning = sim.ms.filter((m) => m.state === 'spinning').length
  const idleMs = sim.ms.filter((m) => m.state === 'idle')
  const H = 470

  return (
    <Lab
      title="Scheduler lab"
      controls={
        <>
          <button className="btn" onClick={doStep} disabled={finished}>
            Step
          </button>
          <button className={'btn ' + (playing ? 'on' : 'ghost')} onClick={() => setPlaying((p) => !p)} disabled={finished}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn ghost" onClick={() => reset()}>
            Reset
          </button>
          <Seg value={speed} onChange={setSpeed} options={[{ v: 900, label: '½×' }, { v: 600, label: '1×' }, { v: 250, label: '3×' }]} />
        </>
      }
      foot={<span>{preset.note}</span>}
    >
      <div className="controls" style={{ marginBottom: '.7rem' }}>
        <Seg
          value={pid}
          onChange={(v) => {
            const pr = presets.find((p) => p.id === v)!
            setPid(v)
            setProcs(pr.cfg.gomaxprocs)
            reset(v, pr.cfg.gomaxprocs)
          }}
          options={list.map((p) => ({ v: p.id, label: p.label }))}
        />
      </div>
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <span className="field">GOMAXPROCS</span>
        <Seg
          value={procs}
          onChange={(n) => {
            setProcs(n)
            reset(pid, n)
          }}
          options={[1, 2, 3, 4].map((n) => ({ v: n, label: String(n) }))}
        />
        <button
          className={'btn sm ' + (async ? 'on' : 'ghost')}
          onClick={() => {
            setAsync(!async)
            reset(pid, procs, !async)
          }}
          title="Go 1.14+ preempts tight loops with SIGURG"
        >
          Async preempt {async ? 'on' : 'off'}
        </button>
        <span className="field" style={{ marginLeft: '.5rem' }}>
          go on
        </span>
        <Seg value={Math.min(target, sim.ps.length - 1)} onChange={setTarget} options={sim.ps.map((p) => ({ v: p.id, label: 'P' + p.id }))} />
        <button className="btn sm ghost" onClick={() => spawn(cpu(4), 'w')}>
          + go work()
        </button>
        <button className="btn sm ghost" onClick={() => spawn([{ k: 'syscall', n: 6 }, { k: 'cpu', n: 1 }], 'sys')}>
          + go read(file)
        </button>
        <button className="btn sm ghost" onClick={() => spawn([{ k: 'net', n: 5 }, { k: 'cpu', n: 1 }], 'net')}>
          + go conn.Read()
        </button>
      </div>
      <div className="stats">
        <Stat label="tick" value={sim.tick} />
        <Stat label="threads" value={sim.ms.length + 1} hot={sim.ms.length > sim.gomaxprocs} />
        <Stat label="spinning" value={spinning} />
        <Stat label="steals" value={sim.stats.steals} />
        <Stat label="handoffs" value={sim.stats.handoffs} />
        <Stat label="preemptions" value={sim.stats.preemptions} />
        <Stat label="live Gs" value={sim.gs.filter((g) => g.state !== 'dead').length} />
      </div>
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 680, display: 'block' }} role="img" aria-label="Go scheduler state">
          {/* global queue */}
          <text x={0} y={26} fontSize={10} fontWeight={700}>
            GLOBAL
          </text>
          <text x={0} y={38} fontSize={10} fill="#737373">
            RUNQ ({sim.global.length})
          </text>
          <rect x={112} y={12} width={W - 200} height={GH + 12} fill="#f5f5f5" stroke="#d4d4d4" />
          {sim.global.length > 22 && (
            <text x={W - 94} y={34} fontSize={10} fill="#e63946">
              +{sim.global.length - 22}
            </text>
          )}
          {/* sysmon */}
          <rect x={W - 78} y={12} width={76} height={GH + 12} fill={sim.tick % sim.sysmonEvery === 0 && sim.tick > 0 ? '#0a0a0a' : '#fff'} stroke="#0a0a0a" />
          <text x={W - 40} y={28} fontSize={9} textAnchor="middle" fontWeight={700} fill={sim.tick % sim.sysmonEvery === 0 && sim.tick > 0 ? '#fafafa' : '#0a0a0a'}>
            sysmon
          </text>
          <text x={W - 40} y={41} fontSize={8} textAnchor="middle" fill="#737373">
            M, no P
          </text>

          {/* Ps */}
          {sim.ps.map((p, i) => {
            const x0 = 10 + i * colW
            const m = p.m !== null ? sim.ms[p.m] : null
            const sys = p.status === 'syscall'
            return (
              <g key={p.id}>
                {/* M */}
                <rect x={x0 + 4} y={70} width={colW - 16} height={30} fill={m ? (m.state === 'spinning' ? '#fbe3e5' : '#fff') : 'transparent'} stroke={m ? '#0a0a0a' : '#d4d4d4'} strokeDasharray={m ? undefined : '4 3'} />
                <text x={x0 + 12} y={89} fontSize={10} fontWeight={700} fill={m ? '#0a0a0a' : '#a3a3a3'}>
                  {m ? `m${m.id}` : 'no M'}
                </text>
                <text x={x0 + colW - 18} y={89} fontSize={9} textAnchor="end" fill={m?.state === 'spinning' ? '#e63946' : '#737373'}>
                  {m ? (sys ? 'in syscall' : m.state) : ''}
                </text>
                <line x1={x0 + colW / 2 - 6} x2={x0 + colW / 2 - 6} y1={100} y2={118} stroke={m ? '#0a0a0a' : '#d4d4d4'} strokeWidth={m ? 2 : 1} />
                {/* P */}
                <rect x={x0 + 4} y={118} width={colW - 16} height={228} fill={p.status === 'idle' ? '#f5f5f5' : '#fff'} stroke="#0a0a0a" strokeWidth={2} />
                <text x={x0 + 12} y={138} fontSize={12} fontWeight={700}>
                  P{p.id}
                </text>
                <text x={x0 + colW - 18} y={138} fontSize={9} textAnchor="end" fill={sys ? '#e63946' : '#737373'}>
                  {p.status === 'idle' ? 'idle' : sys ? 'held by syscall' : `schedtick ${p.schedtick}`}
                </text>
                <text x={x0 + 14} y={170} fontSize={8} fill="#737373">
                  RUNNING
                </text>
                <rect x={x0 + 12} y={176} width={GW + 4} height={GH + 4} fill="none" stroke="#d4d4d4" />
                <text x={x0 + 120} y={170} fontSize={8} fill="#e63946">
                  RUNNEXT
                </text>
                <rect x={x0 + 118} y={176} width={GW + 4} height={GH + 4} fill="none" stroke="#e63946" strokeDasharray="3 2" />
                <text x={x0 + 14} y={232} fontSize={8} fill="#737373">
                  LOCAL RUNQ {p.runq.length}/{sim.runqCap}
                  {sim.runqCap === 8 ? ' (real: 256)' : ''}
                </text>
              </g>
            )
          })}

          {/* waiting room + syscalls */}
          <rect x={4} y={362} width={462} height={H - 366} fill="#fafafa" stroke="#d4d4d4" />
          <text x={12} y={378} fontSize={9} fontWeight={700}>
            PARKED — netpoller, timers, sync (no thread)
          </text>
          <rect x={474} y={362} width={W - 478} height={H - 366} fill="#fafafa" stroke="#d4d4d4" />
          <text x={482} y={378} fontSize={9} fontWeight={700}>
            BLOCKED IN SYSCALL — M + G, no P
          </text>
          {sim.sys.map((sc, i) => (
            <g key={sc.g}>
              <rect x={480 + i * 84} y={386} width={40} height={GH + 4} fill="#737373" />
              <text x={500 + i * 84} y={404} fontSize={10} textAnchor="middle" fill="#fafafa" fontWeight={700}>
                m{sc.m}
              </text>
              <text x={480 + i * 84} y={428} fontSize={8} fill="#737373">
                {sc.doneAt - sim.tick}t left
              </text>
            </g>
          ))}
          {idleMs.length > 0 && (
            <text x={W - 10} y={H - 10} fontSize={9} textAnchor="end" fill="#737373">
              idle Ms: {idleMs.map((m) => 'm' + m.id).join(' ')}
            </text>
          )}
          {finished && (
            <g>
              <rect x={W / 2 - 150} y={200} width={300} height={40} fill="#0a0a0a" />
              <text x={W / 2} y={225} textAnchor="middle" fontSize={12} fill="#fafafa" fontWeight={700}>
                main returned → program exits
              </text>
            </g>
          )}

          {sim.gs.map((g) => {
            const p = pos.get(g.id)
            if (!p || g.state === 'dead') return null
            return <Token key={g.id} g={g} x={p.x} y={p.y} fresh={fresh.has(g.id) && sim.tick > 0} />
          })}
        </svg>
      </div>
      <div className="legend" style={{ marginTop: '.6rem' }}>
        <span>
          <i style={{ background: '#0a0a0a' }} />
          running
        </span>
        <span>
          <i style={{ background: '#fff' }} />
          runnable
        </span>
        <span>
          <i style={{ background: '#fff', borderStyle: 'dashed' }} />
          waiting (parked)
        </span>
        <span>
          <i style={{ background: '#737373' }} />
          in syscall
        </span>
        <span>
          <i style={{ background: '#fff', borderColor: '#e63946', borderWidth: 2 }} />
          just moved
        </span>
        <span>
          <i style={{ background: '#e63946', height: 3, border: 0 }} />
          CPU work left
        </span>
      </div>
      <div className="log" aria-live="polite" style={{ margin: '0 -1rem -1rem' }}>
        {sim.log.slice(0, 40).map((l, i) => (
          <div key={sim.log.length - i}>{l}</div>
        ))}
      </div>
    </Lab>
  )
}
