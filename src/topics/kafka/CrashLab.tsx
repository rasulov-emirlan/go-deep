import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { simulate, type Mode } from './crash'

const verdicts = {
  exactly: ['Exactly once', ''],
  effectively: ['Charged once', 'The replay came, but dedup skipped it.'],
  lost: ['m2 lost', 'The bookmark moved before the work. Dedup can’t fix that.'],
  dup: ['m2 charged twice', 'The work ran before the bookmark moved.'],
  'lost+dup': ['Lost and duplicated', ''],
} as const

/** Same crash every time: in the middle of m2. Only the commit order and dedup change. */
export function CrashLab() {
  const [mode, setMode] = useState<Mode>('after')
  const [idem, setIdem] = useState(false)
  const r = simulate({ mode, batch: 1, n: 4, crashAfter: 5, idempotent: idem })
  const [title, why] = verdicts[r.verdict]
  const ok = r.verdict === 'exactly' || r.verdict === 'effectively'

  return (
    <Lab
      title="Crash the consumer"
      controls={
        <>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { v: 'before', label: 'Commit first' },
              { v: 'after', label: 'Commit after' },
            ]}
          />
          <Seg
            value={idem}
            onChange={setIdem}
            options={[
              { v: false, label: 'No dedup' },
              { v: true, label: 'Dedup' },
            ]}
          />
        </>
      }
    >
      <div className="kafka-lab">
        <p className="kafka-try">The consumer crashes while handling m2. Try all four combinations.</p>
        <div className="kafka-res">
          {r.applied.map((c, m) => (
            <div key={m} className={'kafka-msg' + (c !== 1 ? ' bad' : '')}>
              <b>m{m}</b>
              <span>{c === 0 ? 'lost' : `×${c}`}</span>
            </div>
          ))}
        </div>
        <p className="kafka-verdict">
          <b className={ok ? '' : 'r'}>{title}.</b> {why}
        </p>
      </div>
    </Lab>
  )
}
