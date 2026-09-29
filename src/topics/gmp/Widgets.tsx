import { useMemo, useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { create, runUntil } from '../../sim/sched'

/** Gantt of P0 over time for the tight-loop program, with/without async preemption. */
export function PreemptTimeline() {
  const [async, setAsync] = useState(true)
  const sim = useMemo(
    () => runUntil(create({ gomaxprocs: 1, asyncPreempt: async, main: [{ k: 'spawn', count: 1, script: [{ k: 'loop' }], label: 'hog' }, { k: 'sleep', n: 2 }, { k: 'cpu', n: 1 }] }), 40),
    [async],
  )
  const ticks = sim.history.slice(0, 40)
  const w = 18
  return (
    <Lab
      title="Preemption timeline — GOMAXPROCS=1"
      controls={<Seg value={async ? 1 : 0} onChange={(v) => setAsync(v === 1)} options={[{ v: 0, label: 'Go ≤1.13' }, { v: 1, label: 'Go 1.14+' }]} />}
      foot={
        async ? (
          <span>
            sysmon notices <code>hog</code> has held P0 for 10ms (same <code>schedtick</code>), sends <b>SIGURG</b>; the handler injects a call to <code>asyncPreempt</code>, hog goes to the global queue and main gets P0 back.
          </span>
        ) : (
          <span>
            sysmon still sets the preempt flag, but a loop with no function calls never runs a prologue check. main’s timer fires, main is runnable — and starves forever. The same bug froze GC’s stop-the-world on multi-P programs.
          </span>
        )
      }
    >
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${ticks.length * w + 60} 90`} style={{ width: '100%', minWidth: 560, display: 'block' }}>
          <text x={0} y={34} fontSize={11} fontWeight={700}>
            P0
          </text>
          {ticks.map((row, t) => {
            const g = row[0]
            const label = g === null || g === -1 ? '' : sim.gs[g].label
            const isMain = label === 'main'
            return (
              <g key={t}>
                <rect x={40 + t * w} y={18} width={w - 1} height={26} fill={g === null ? '#f5f5f5' : isMain ? '#e63946' : '#0a0a0a'} />
                {t % 5 === 0 && (
                  <text x={40 + t * w} y={60} fontSize={8} fill="#737373">
                    {t * 2}ms
                  </text>
                )}
              </g>
            )
          })}
          <text x={40} y={80} fontSize={9} fill="#737373">
            ■ hog (for {'{}'}) <tspan fill="#e63946">■ main</tspan> · 1 tick ≈ 2ms, sysmon preempts after 10ms
          </text>
        </svg>
      </div>
      <div className="stats" style={{ marginTop: '.7rem', marginBottom: 0 }}>
        <Stat label="main finished?" value={sim.gs[0].state === 'dead' ? 'yes' : 'never'} hot={sim.gs[0].state !== 'dead'} />
        <Stat label="preemptions" value={sim.stats.preemptions} />
        <Stat label="ignored preempt requests" value={sim.stats.ignoredPreempts} />
      </div>
    </Lab>
  )
}

/** Go 1.25 container-aware GOMAXPROCS. */
export function GomaxprocsCalc() {
  const [cores, setCores] = useState(64)
  const [limit, setLimit] = useState<number | null>(2)
  const [env, setEnv] = useState<number | null>(null)
  const [modern, setModern] = useState(true)
  let result: number
  const trace: string[] = []
  if (env !== null) {
    result = env
    trace.push(`GOMAXPROCS=${env} set explicitly → used as-is; automatic updates disabled`)
  } else if (!modern) {
    result = cores
    trace.push(`go.mod go line < 1.25 (or Go ≤1.24) → runtime.NumCPU() = ${cores}`)
    if (limit !== null) trace.push(`cgroup limit ${limit} CPU ignored → CFS throttling likely at tail latency`)
  } else if (limit === null) {
    result = cores
    trace.push(`no cgroup CPU limit → min(affinity CPUs) = ${cores}`)
  } else {
    const lim = Math.max(2, Math.ceil(limit))
    result = Math.min(cores, lim)
    trace.push(`ceil(quota/period) = ceil(${limit}) = ${Math.ceil(limit)}`)
    if (Math.ceil(limit) < 2) trace.push(`floored at 2 → ${lim}`)
    trace.push(`min(${cores} CPUs, ${lim}) = ${result}`)
    trace.push('re-checked by sysmon about once per second')
  }
  const cpuOpts: { v: number | null; label: string }[] = [
    { v: null, label: 'none' },
    { v: 0.5, label: '500m' },
    { v: 1.5, label: '1.5' },
    { v: 2, label: '2' },
    { v: 7.2, label: '7.2' },
  ]
  return (
    <Lab title="GOMAXPROCS in a container">
      <div className="controls" style={{ marginBottom: '.6rem' }}>
        <span className="field">node CPUs</span>
        <Seg value={cores} onChange={setCores} options={[4, 16, 64].map((v) => ({ v, label: String(v) }))} />
        <span className="field">limits.cpu</span>
        <Seg value={limit} onChange={setLimit} options={cpuOpts} />
      </div>
      <div className="controls" style={{ marginBottom: '1rem' }}>
        <span className="field">env GOMAXPROCS</span>
        <Seg<number | null> value={env} onChange={setEnv} options={[{ v: null, label: 'unset' }, { v: 8, label: '8' }]} />
        <span className="field">go.mod</span>
        <Seg value={modern ? 1 : 0} onChange={(v) => setModern(v === 1)} options={[{ v: 0, label: 'go 1.24' }, { v: 1, label: 'go 1.25+' }]} />
      </div>
      <div className="stats">
        <Stat label="GOMAXPROCS" value={result} hot />
        <Stat label="requests.cpu counted?" value="never" />
      </div>
      <ol style={{ margin: 0, paddingLeft: '1.2rem', fontFamily: 'var(--mono)', fontSize: 13 }}>
        {trace.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </Lab>
  )
}

/** Goroutine stack growth: 2 KiB start, double-and-copy. */
export function StackGrowth() {
  const [depth, setDepth] = useState(40)
  const [frame, setFrame] = useState(96)
  const need = depth * frame
  const sizes = [2048]
  while (sizes[sizes.length - 1] < need) sizes.push(sizes[sizes.length - 1] * 2)
  const final = sizes[sizes.length - 1]
  const copied = sizes.slice(0, -1).reduce((a, b) => a + b, 0)
  const max = 1 << 20
  return (
    <Lab title="Stack growth — morestack → copystack">
      <div className="controls" style={{ marginBottom: '1rem' }}>
        <label className="field">
          recursion depth <input type="range" min={1} max={4000} value={depth} onChange={(e) => setDepth(+e.target.value)} />
          <output>{depth}</output>
        </label>
        <label className="field">
          frame bytes <input type="range" min={16} max={512} step={16} value={frame} onChange={(e) => setFrame(+e.target.value)} />
          <output>{frame}</output>
        </label>
      </div>
      <div className="stats">
        <Stat label="stack used" value={fmt(need)} />
        <Stat label="stack size" value={fmt(final)} hot />
        <Stat label="grow+copy events" value={sizes.length - 1} />
        <Stat label="bytes copied" value={fmt(copied)} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {sizes.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ width: 60, color: '#737373' }}>{fmt(s)}</span>
            <div style={{ height: 14, width: `${Math.max(1, (Math.log2(s) - 10) / (Math.log2(max) - 10)) * 100}%`, background: i === sizes.length - 1 ? '#0a0a0a' : '#d4d4d4', position: 'relative' }}>
              {i === sizes.length - 1 && <div style={{ position: 'absolute', inset: 0, width: `${(need / s) * 100}%`, background: '#e63946' }} />}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: '#737373', margin: '.8rem 0 0' }}>
        Bars on a log scale. Each step allocates a 2× contiguous stack, copies the frames and fixes every pointer into the stack. The GC halves it again when less than ¼ is used. Hard ceiling: 1 GB on 64-bit → <code>fatal error: stack overflow</code>.
      </p>
    </Lab>
  )
}

function fmt(b: number) {
  return b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(b % 1024 ? 1 : 0)} KiB` : `${b} B`
}
