import { useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { CORES, JOBS, lowerBound, simulate, type Mode } from './pool'

const SUM = JOBS.reduce((s, d) => s + d, 0)
const sec = (u: number) => +(u / 10).toFixed(3) + ' s'

/** Slide the worker count; 12 jobs (100 ms units) run through one jobs channel. */
export function PoolLab() {
  const [w, setW] = useState(3)
  const [mode, setMode] = useState<Mode>('io')
  const run = simulate(JOBS, w, mode)
  const best = lowerBound(JOBS, w, mode)
  const note =
    mode === 'io'
      ? run.total <= Math.max(...JOBS)
        ? 'The longest job (400 ms) is now the floor: more workers would just sit idle.'
        : 'I/O jobs only wait, so more workers keep helping, up to what the downstream allows.'
      : w > CORES
        ? `Only ${CORES} cores: extra workers share them, every job runs slower (red), and the total stops falling.`
        : `CPU jobs scale until workers = cores (${CORES}).`
  return (
    <Lab
      title="Worker-pool sizing"
      controls={
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { v: 'io', label: 'I/O-bound' },
            { v: 'cpu', label: `CPU-bound · ${CORES} cores` },
          ]}
        />
      }
      foot="Deterministic model: jobs are taken in order by the first free worker. CPU mode splits the cores evenly between running jobs."
    >
      <label className="pt-slider">
        <span className="kicker">workers = {w}</span>
        <input type="range" min={1} max={12} value={w} onChange={(e) => setW(+e.target.value)} aria-label="Number of workers" />
      </label>
      <div className="stats pt-stats">
        <Stat label="total" value={sec(run.total)} hot />
        <Stat label="speed-up" value={'×' + (SUM / run.total).toFixed(1)} />
        <Stat label="best possible" value={sec(best)} />
      </div>
      <div className="pt-lanes" role="img" aria-label={`Timeline: ${w} workers finish 12 jobs in ${sec(run.total)}`}>
        {Array.from({ length: w }, (_, k) => (
          <div key={k} className="pt-lane">
            <span className="pt-lname">w{k + 1}</span>
            <div className="pt-track">
              {run.segs
                .filter((s) => s.worker === k)
                .map((s) => (
                  <span
                    key={s.job}
                    className={'pt-bar' + (s.end - s.start > JOBS[s.job] + 1e-6 ? ' slow' : '')}
                    style={{ left: (s.start / SUM) * 100 + '%', width: ((s.end - s.start) / SUM) * 100 + '%' }}
                  >
                    {s.job + 1}
                  </span>
                ))}
              <i className="pt-end" style={{ left: (run.total / SUM) * 100 + '%' }} />
            </div>
          </div>
        ))}
      </div>
      <p className="pt-note">{note}</p>
    </Lab>
  )
}
