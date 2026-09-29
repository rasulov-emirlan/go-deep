import { useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { attemptsFromRetries, bottomLoad, budgetCap } from './amplify'

/** Log-scaled bar so 1× and 625× both fit. */
const pct = (n: number) => Math.max(2, (Math.log(n) / Math.log(625)) * 100)

export function AmplifyLab() {
  const [layers, setLayers] = useState(3)
  const [attempts, setAttempts] = useState(3)
  const load = bottomLoad(layers, attempts)
  const ifRetries = bottomLoad(layers, attemptsFromRetries(attempts))
  return (
    <Lab
      title="Retry amplification"
      controls={
        <>
          <Seg value={layers} onChange={setLayers} options={[1, 2, 3, 4].map((v) => ({ v, label: `${v} layer${v > 1 ? 's' : ''}` }))} />
          <Seg value={attempts} onChange={setAttempts} options={[1, 2, 3, 4, 5].map((v) => ({ v, label: `${v} att.` }))} />
        </>
      }
    >
      <div className="res-lab">
        <p className="res-try">
          Every layer makes <b>{attempts}</b> attempt{attempts > 1 ? 's' : ''} ({attempts === 1 ? 'no retries' : `1 try + ${attempts - 1} retr${attempts === 2 ? 'y' : 'ies'}`}) when the layer below fails.
        </p>
        <div className="res-bar" role="img" aria-label={`bottom layer sees ${load} times the load`}>
          <span className={load > 1 ? 'hot' : ''} style={{ width: pct(load) + '%' }} />
        </div>
        <div className="res-stats">
          <Stat label="DB sees" value={`${load}×`} hot={load >= 9} />
          <Stat label="If “retry N times” (N+1 attempts)" value={`${ifRetries}×`} hot={ifRetries >= 9} />
          <Stat label="With a 10% retry budget" value={`≤${budgetCap(0.1).toFixed(1)}×`} />
        </div>
        <p className="res-note">Bar is log scale. Attempts multiply per layer: attempts^layers.</p>
      </div>
    </Lab>
  )
}
