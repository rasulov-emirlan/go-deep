import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { canStep, done, finished, init, program, step, type Gid } from './interleave'

export function RaceLab() {
  const [s, setS] = useState(() => init(false))
  const ops = program(s.mutex)
  const over = finished(s)
  const lost = over && s.n < 2
  return (
    <Lab
      title="You are the scheduler"
      controls={<Seg value={s.mutex} options={[{ v: false, label: 'n++' }, { v: true, label: 'with Mutex' }]} onChange={(m) => setS(init(m))} />}
      foot={s.mutex ? 'The lock turns the three steps into one: every order you pick ends at 2.' : 'Tip: step G1 once, then G2 once. 18 of the 20 possible orders lose an update.'}
    >
      <div className="sy-lab">
        {([0, 1] as Gid[]).map((g) => (
          <div key={g} className={'sy-col' + (s.holder === g ? ' holds' : '')}>
            <div className="sy-colhead">
              <b>G{g + 1}</b>
              <span>r = {s.reg[g] ?? '–'}</span>
            </div>
            <ol className="sy-ops">
              {ops.map((op, k) => (
                <li key={op} className={k < s.pc[g] ? 'ran' : k === s.pc[g] ? 'next' + (canStep(s, g) ? '' : ' blocked') : ''}>
                  {op}
                </li>
              ))}
            </ol>
            <button className="btn" disabled={!canStep(s, g)} onClick={() => setS(step(s, g))}>
              {done(s, g) ? 'done' : canStep(s, g) ? `Step G${g + 1}` : 'blocked'}
            </button>
          </div>
        ))}
        <div className={'sy-n' + (lost ? ' lost' : over ? ' ok' : '')}>
          <span className="kicker">shared n</span>
          <b>{s.n}</b>
          {s.mutex && <span className="sy-lock">{s.holder === null ? 'unlocked' : `G${s.holder + 1} holds lock`}</span>}
        </div>
      </div>
      <div className="sy-verdict" aria-live="polite">
        {over ? (lost ? <b className="r">n = 1: an update was lost.</b> : <b>n = 2: correct.</b>) : <span>{s.log.at(-1) ?? 'Pick who runs next.'}</span>}
        <button className="btn ghost sm" onClick={() => setS(init(s.mutex))}>
          Reset
        </button>
      </div>
    </Lab>
  )
}
