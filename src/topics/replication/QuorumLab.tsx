import { useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { analyze } from './quorum'

const N = 3
const names = ['A', 'B', 'C']
const opts = [1, 2, 3].map((v) => ({ v, label: String(v) }))

/** N is fixed at 3 (the Dynamo default). Slide W and R and watch whether a read can miss the newest write. */
export function QuorumLab() {
  const [w, setW] = useState(2)
  const [r, setR] = useState(2)
  const q = analyze(N, w, r)
  return (
    <Lab
      title="Pick W and R (N = 3)"
      controls={
        <>
          <div className="replication-ctl">
            <span className="kicker">W</span>
            <Seg value={w} onChange={setW} options={opts} />
          </div>
          <div className="replication-ctl">
            <span className="kicker">R</span>
            <Seg value={r} onChange={setR} options={opts} />
          </div>
        </>
      }
    >
      <div className="replication-lab">
        <div className="replication-cells">
          {names.map((nm, i) => {
            const inW = q.writeSet.includes(i)
            const inR = q.readSet.includes(i)
            return (
              <div key={nm} className={'replication-cell' + (inW && inR ? ' both' : '')}>
                <b>{nm}</b>
                <span>{inW ? 'v1' : 'v0'}</span>
                <small>{inR ? 'read asks' : 'not asked'}</small>
              </div>
            )
          })}
        </div>
        <p className="replication-note">Worst case: the write reached the first {w}, the read asks the last {r}.</p>
        <div className="replication-stats">
          <Stat label="W + R" value={`${w + r} ${q.stale ? '≤' : '>'} ${N}`} hot={q.stale} />
          <Stat label="Writes survive" value={`${q.writeTolerates} down`} />
          <Stat label="Reads survive" value={`${q.readTolerates} down`} />
        </div>
        <p className="replication-verdict">
          {q.stale ? (
            <>
              <b className="r">A read can return v0.</b> The read set may miss every replica that has v1.
            </>
          ) : (
            <>
              <b>Every read touches a v1 replica.</b> Still not linearizable while a write is in flight: see the next diagram.
            </>
          )}
        </p>
      </div>
    </Lab>
  )
}
