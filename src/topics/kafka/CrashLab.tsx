import { Fragment, useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { opLabel, plan, simulate, type Mode } from './crash'

const N = 6

const verdicts = {
  exactly: ['Exactly once', 'No crash, nothing to recover.'],
  effectively: ['Effectively once', 'The replay happened, but the dedup check skipped it.'],
  lost: ['At-most-once', 'The bookmark ran ahead of the work. Idempotency can’t fix a message that never runs.'],
  dup: ['At-least-once', 'The work ran ahead of the bookmark, so the replacement redid it.'],
  'lost+dup': ['Lost and duplicated', 'Both at once.'],
} as const

export function CrashLab() {
  const [mode, setMode] = useState<Mode>('after')
  const [batch, setBatch] = useState(1)
  const [idem, setIdem] = useState(false)
  const [crash, setCrash] = useState(5)
  const len = plan(mode, batch, N).length
  const r = simulate({ mode, batch, n: N, crashAfter: Math.min(crash, len), idempotent: idem })
  const [title, why] = verdicts[r.verdict]

  return (
    <Lab
      title="Crash the consumer"
      controls={
        <>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { v: 'before', label: 'Commit before' },
              { v: 'after', label: 'Commit after' },
            ]}
          />
          <Seg
            value={batch}
            onChange={setBatch}
            options={[
              { v: 1, label: 'Every msg' },
              { v: 3, label: 'Every 3' },
            ]}
          />
          <button className={'btn sm ' + (idem ? 'on' : 'ghost')} onClick={() => setIdem(!idem)} aria-pressed={idem}>
            Dedup {idem ? 'on' : 'off'}
          </button>
        </>
      }
    >
      <div className="kafka-lab">
        <div className="kafka-run">
          <span className="kicker">Run 1 · tap a step to crash after it</span>
          <div className="kafka-tape">
            {r.run1.map((op, k) => (
              <Fragment key={k}>
                <button className={'kafka-op ' + op.kind + (k < r.done ? ' done' : ' never')} onClick={() => setCrash(k + 1)}>
                  {opLabel(op)}
                </button>
                {r.crashed && k + 1 === r.done && <span className="kafka-boom">✗ crash</span>}
              </Fragment>
            ))}
            {r.crashed && r.done === 0 && <span className="kafka-boom">✗ crash</span>}
            <button className="btn ghost sm" onClick={() => setCrash(len)} disabled={!r.crashed}>
              No crash
            </button>
          </div>
        </div>
        {r.crashed && (
          <div className="kafka-run">
            <span className="kicker">Run 2 · replacement resumes at committed = {r.resumeAt}</span>
            <div className="kafka-tape">
              {r.run2.map((op, k) => (
                <span key={k} className={'kafka-op done ' + op.kind + (op.kind === 'process' && r.applied[op.msg] + r.skipped[op.msg] > 1 ? ' again' : '')}>
                  {opLabel(op)}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="kafka-run">
          <span className="kicker">Charges in the database</span>
          <div className="kafka-res">
            {r.applied.map((c, m) => (
              <div key={m} className={'kafka-msg' + (c !== 1 ? ' bad' : '')}>
                <b>m{m}</b>
                <span>{c === 0 ? 'lost' : `×${c}`}</span>
                {r.skipped[m] > 0 && <small>skip ×{r.skipped[m]}</small>}
              </div>
            ))}
          </div>
        </div>
        <p className="kafka-verdict">
          <b className={r.verdict === 'exactly' || r.verdict === 'effectively' ? '' : 'r'}>{title}.</b> {why}
        </p>
      </div>
    </Lab>
  )
}
