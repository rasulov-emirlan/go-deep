import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { levels, run, scenarios, type Level, type Row, type ScenarioId } from './isolation'

const verdictLabel = { anomaly: 'Anomaly', safe: 'Safe', retry: 'Error → retry' }

/** Two scripted transactions stepping side by side; pick the race and the isolation level. */
export function IsoLab() {
  const [s, setS] = useState<ScenarioId>('lost')
  const [l, setL] = useState<Level>('rc')
  const [k, setK] = useState(0)
  const res = run(s, l)
  const n = res.rows.length
  const done = k >= n
  const lv = levels.find((x) => x.v === l)!
  return (
    <Lab
      title="Isolation lab"
      foot={<>Every result was recorded on a real PostgreSQL 18 server. Switch the level mid-run to compare the same step.</>}
    >
      <div className="tx-ctl">
        <Seg
          value={s}
          options={scenarios.map((x) => ({ v: x.v, label: x.label }))}
          onChange={(v) => {
            setS(v)
            setK(0)
          }}
        />
        <Seg value={l} options={levels.map((x) => ({ v: x.v, label: x.label }))} onChange={setL} />
      </div>
      <p className="tx-setup">{scenarios.find((x) => x.v === s)!.setup}</p>
      <div className="tx-grid" role="table" aria-label="T1 and T2 statements in time order">
        <div className="tx-h">#</div>
        <div className="tx-h">T1</div>
        <div className="tx-h">T2</div>
        <div className="tx-n">0</div>
        <div className="tx-cell tx-both">
          <code>BEGIN ISOLATION LEVEL {lv.sql}</code>
        </div>
        {res.rows.slice(0, k).map((r, i) => (
          <Step key={i} i={i} r={r} />
        ))}
        {k === 0 && <div className="tx-hint">Press Step: T1 and T2 take turns.</div>}
      </div>
      {done && (
        <div className={'tx-out tx-' + res.verdict}>
          <span className="kicker">{verdictLabel[res.verdict]}</span>
          <p>{res.outcome}</p>
        </div>
      )}
      <div className="tx-nav">
        <button className="btn ghost" onClick={() => setK(0)} disabled={k === 0}>
          ↺ Reset
        </button>
        <button className="btn ghost" onClick={() => setK(n)} disabled={done}>
          Run all
        </button>
        <button className="btn" onClick={() => setK(k + 1)} disabled={done}>
          Step {Math.min(k + 1, n)}/{n} →
        </button>
      </div>
    </Lab>
  )
}

function Step({ i, r }: { i: number; r: Row }) {
  const cell = (
    <div className="tx-cell">
      <code>{r.sql}</code>
      <span className={'tx-res tx-' + r.tone}>→ {r.out}</span>
    </div>
  )
  const empty = <div className="tx-cell tx-empty" />
  return (
    <>
      <div className="tx-n">{i + 1}</div>
      {r.t === 1 ? cell : empty}
      {r.t === 2 ? cell : empty}
    </>
  )
}
