import { useMemo, useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { simulate, type Mode } from './stampede'

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

/** Fixed scene: 1,000 requests over 100 ms across 4 pods, just after the key expired. */
export function StampedeLab() {
  const [mode, setMode] = useState<Mode>('none')
  const r = useMemo(() => simulate({ n: 1000, pods: 4, mode }), [mode])
  const bad = r.dbQueries > 20
  return (
    <Lab
      title="Expire a hot key"
      controls={
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { v: 'none', label: 'No guard' },
            { v: 'singleflight', label: 'singleflight' },
          ]}
        />
      }
    >
      <p className="sc-try">1,000 requests arrive right as the key expires, on 4 pods. Turn on singleflight.</p>
      <div className="sc-result" aria-live="polite">
        <div className={bad ? 'r' : ''}>
          <b>{r.dbQueries.toLocaleString('en')}</b> database queries
        </div>
        <div className={bad ? 'r' : ''}>
          <b>{ms(r.max)}</b> slowest wait
        </div>
      </div>
    </Lab>
  )
}
