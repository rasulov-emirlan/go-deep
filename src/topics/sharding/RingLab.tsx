import { useMemo, useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { compare, type Action } from './ring'

const pct = (n: number) => (n < 10 ? n.toFixed(1) : n.toFixed(0)) + '%'

/** 10 nodes, 20 000 keys. Change the number of points per node, then add or remove one node. */
export function RingLab() {
  const [v, setV] = useState(100)
  const [action, setAction] = useState<Action>('add')
  const r = useMemo(() => compare({ vnodes: v, action }), [v, action])
  const mean = r.keys / r.after
  const top = Math.max(2, Math.ceil(r.maxOverMean * 2) / 2)

  return (
    <Lab
      title="Add or remove a node"
      controls={
        <>
          <Seg
            value={v}
            onChange={setV}
            options={[
              { v: 1, label: '1 pt' },
              { v: 10, label: '10' },
              { v: 100, label: '100' },
              { v: 1000, label: '1000' },
            ]}
          />
          <Seg
            value={action}
            onChange={setAction}
            options={[
              { v: 'add' as Action, label: '10 → 11' },
              { v: 'remove' as Action, label: '10 → 9' },
            ]}
          />
        </>
      }
      foot="Points per node, then the change. Bars are keys per node after the change; the dashed line is a fair share."
    >
      <div className="sharding-lab">
        <div className="sharding-stats">
          <Stat label="Ring moved" value={pct(r.movedPct)} />
          <Stat label="hash mod N would move" value={pct(r.modPct)} hot />
          <Stat label="Busiest node" value={`${r.maxOverMean.toFixed(2)}× fair`} hot={r.maxOverMean > 1.3} />
        </div>
        <div className="sharding-bars" role="img" aria-label="keys per node after the change">
          <span className="sharding-fair" style={{ bottom: `${(1 / top) * 100}%` }} />
          {r.load.map((c, i) => (
            <div key={r.ids[i]} className="sharding-col">
              <span className={'sharding-bar' + ((action === 'add' && r.ids[i] === r.changed) ? ' new' : '')} style={{ height: `${(c / mean / top) * 100}%` }} />
              <em>{r.ids[i]}</em>
            </div>
          ))}
        </div>
      </div>
    </Lab>
  )
}
