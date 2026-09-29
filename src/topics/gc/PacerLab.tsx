import { useMemo, useState } from 'react'
import { Lab, Stat } from '../../components/Lab'
import { defaults, gctrace, goalFor, simulate, type PacerParams } from '../../sim/pacer'

const GOGC_STEPS = [25, 50, 100, 200, 400, 800, -1] // -1 = off
const LIMIT_STEPS = [-1, 130, 160, 200, 300, 500, 1000]

export function PacerLab() {
  const [gi, setGi] = useState(2)
  const [li, setLi] = useState(0)
  const [live, setLive] = useState(100)
  const [alloc, setAlloc] = useState(600)
  const gogc = GOGC_STEPS[gi] === -1 ? null : GOGC_STEPS[gi]
  const limit = LIMIT_STEPS[li] === -1 ? null : LIMIT_STEPS[li]
  const p: PacerParams = { ...defaults, live, allocRate: alloc, gogc, limit }
  const r = useMemo(() => simulate(p), [gi, li, live, alloc]) // eslint-disable-line react-hooks/exhaustive-deps

  const W = 900
  const H = 240
  const pad = 36
  const finite = r.samples.map((s) => s.heap)
  const yMax = Math.max(...finite, limit ?? 0, live * 1.2) * 1.08
  const x = (t: number) => pad + (t / p.seconds) * (W - pad - 8)
  const y = (v: number) => H - 22 - (v / yMax) * (H - 40)
  const path = r.samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.heap).toFixed(1)}`).join('')
  const goal = r.samples.filter((s) => isFinite(s.goal))
  const goalPath = goal.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(Math.min(s.goal, yMax)).toFixed(1)}`).join('')
  const ticks = [0, 1, 2, 3, 4]
  const firstGoal = goalFor(p, live)

  return (
    <Lab
      title="Pacer lab — GOGC, GOMEMLIMIT and the heap sawtooth"
      foot={
        <span>
          Model, not a benchmark: 4 Ps, 25% background workers, assists when the heap outruns the trigger, CPU limiter ≈ 50%. Try GOGC=off with GOMEMLIMIT=500, then drag the limit down to 130 to meet
          the death spiral — and the limiter that stops it.
        </span>
      }
    >
      <div className="controls" style={{ marginBottom: '.5rem' }}>
        <label className="field">
          GOGC <input type="range" min={0} max={GOGC_STEPS.length - 1} value={gi} onChange={(e) => setGi(+e.target.value)} />
          <output>{gogc ?? 'off'}</output>
        </label>
        <label className="field">
          GOMEMLIMIT <input type="range" min={0} max={LIMIT_STEPS.length - 1} value={li} onChange={(e) => setLi(+e.target.value)} />
          <output>{limit ? limit + 'MiB' : 'off'}</output>
        </label>
      </div>
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <label className="field">
          live heap <input type="range" min={20} max={200} step={10} value={live} onChange={(e) => setLive(+e.target.value)} />
          <output>{live}MiB</output>
        </label>
        <label className="field">
          alloc rate <input type="range" min={100} max={1500} step={50} value={alloc} onChange={(e) => setAlloc(+e.target.value)} />
          <output>{alloc}MiB/s</output>
        </label>
      </div>
      <div className="stats">
        <Stat label="heap goal" value={isFinite(firstGoal) ? `${Math.round(firstGoal)} MiB` : '∞'} />
        <Stat label="GC cycles / 4s" value={r.cycles.length} />
        <Stat label="GC CPU" value={`${Math.round(r.gcCpu * 100)}%`} hot={r.gcCpu > 0.4} />
        <Stat label="peak heap" value={`${Math.round(r.peak)} MiB`} />
        <Stat label="over limit" value={limit ? `${Math.round(r.overLimitMs)} ms` : '—'} hot={r.overLimitMs > 0} />
      </div>
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 560, display: 'block' }}>
          {r.cycles.map((c) => (
            <rect key={c.n} x={x(c.start)} y={8} width={Math.max(1, x(c.end) - x(c.start))} height={H - 30} fill={c.limited ? '#fbe3e5' : '#ebebeb'} />
          ))}
          <line x1={pad} x2={W - 8} y1={H - 22} y2={H - 22} stroke="#0a0a0a" />
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={pad} x2={W - 8} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#ebebeb" />
              <text x={pad - 4} y={y(yMax * f) + 3} fontSize={9} textAnchor="end" fill="#737373">
                {Math.round(yMax * f)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} fontSize={9} textAnchor="middle" fill="#737373">
              {t}s
            </text>
          ))}
          <line x1={pad} x2={W - 8} y1={y(live)} y2={y(live)} stroke="#737373" strokeDasharray="2 3" />
          <text x={W - 10} y={y(live) - 4} fontSize={9} textAnchor="end" fill="#737373">
            live heap
          </text>
          {limit && (
            <>
              <line x1={pad} x2={W - 8} y1={y(limit)} y2={y(limit)} stroke="#e63946" strokeWidth={1.5} />
              <text x={W - 10} y={y(limit) - 4} fontSize={9} textAnchor="end" fill="#e63946">
                GOMEMLIMIT
              </text>
            </>
          )}
          <path d={goalPath} fill="none" stroke="#737373" strokeWidth={1} strokeDasharray="6 3" />
          <path d={path} fill="none" stroke="#0a0a0a" strokeWidth={1.8} />
        </svg>
      </div>
      <div className="legend" style={{ marginTop: '.5rem' }}>
        <span>
          <i style={{ background: '#0a0a0a', height: 3, border: 0 }} />
          heap in use
        </span>
        <span>
          <i style={{ background: 'transparent', borderStyle: 'dashed', height: 3, borderWidth: '1px 0 0 0' }} />
          heap goal
        </span>
        <span>
          <i style={{ background: '#ebebeb' }} />
          GC marking
        </span>
        <span>
          <i style={{ background: '#fbe3e5' }} />
          CPU limiter engaged
        </span>
      </div>
      <span className="kicker" style={{ color: '#0a0a0a', marginTop: '.8rem' }}>
        GODEBUG=gctrace=1 (last cycles, from the model)
      </span>
      <pre className="code" style={{ fontSize: 11 }}>
        {r.cycles.length ? r.cycles.slice(-4).map((c) => gctrace(c, p, r.gcCpu * 100)).join('\n') : '(no GC ran: GOGC=off and no memory limit — the heap just grows)'}
      </pre>
    </Lab>
  )
}
