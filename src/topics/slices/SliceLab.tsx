import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { apply, can, initCode, initial, view, type LabState, type Name, type Op } from './slicelab'

const OPS: { op: Op; label: (n: Name) => string }[] = [
  { op: 'append', label: (n) => `append(${n}, v)` },
  { op: 'write', label: (n) => `${n}[0] = v` },
  { op: 'drop1', label: (n) => `${n}[1:]` },
  { op: 'extend', label: (n) => `${n}[:cap]` },
  { op: 'clip', label: (n) => `${n}[:len:len]` },
  { op: 'copy', label: (n) => `${n === 'a' ? 'b' : 'a'} = ${n}` },
]

type Log = { line: string; note: string; grew: boolean }

export function SliceLab() {
  const [st, setSt] = useState<LabState>(initial)
  const [who, setWho] = useState<Name>('b')
  const [log, setLog] = useState<Log[]>(initCode.map((line) => ({ line, note: '', grew: false })))
  const [fresh, setFresh] = useState<number | null>(null)

  const run = (op: Op) => {
    const r = apply(st, who, op)
    setSt(r.state)
    setFresh(r.grew ? r.state.s[who].arr : null)
    setLog((l) => [...l, { line: r.line, note: r.note, grew: r.grew }].slice(-5))
  }
  const reset = () => {
    setSt(initial())
    setFresh(null)
    setLog(initCode.map((line) => ({ line, note: '', grew: false })))
  }

  return (
    <Lab
      title="Slice playground"
      controls={
        <button className="btn ghost sm" onClick={reset}>
          Reset
        </button>
      }
      foot={
        <div className="sl-print">
          {(['a', 'b'] as Name[]).map((n) => (
            <code key={n}>
              {n} = [{view(st, n).join(' ')}]
            </code>
          ))}
        </div>
      }
    >
      <div className="sl-arrays">
        {st.arrays.map((arr) => {
          const on = (['a', 'b'] as Name[]).filter((n) => st.s[n].arr === arr.id)
          const seen = (i: number) => on.some((n) => i >= st.s[n].off && i < st.s[n].off + st.s[n].len)
          return (
            <div key={arr.id} className={'sl-arr' + (arr.id === fresh ? ' fresh' : '')} style={{ gridTemplateColumns: `2.2rem repeat(${arr.cells.length}, var(--sl-cw))` }}>
              <span className="sl-name">#{arr.id}</span>
              {arr.cells.map((v, i) => (
                <span key={i} className={'sl-cell' + (seen(i) ? '' : ' spare')}>
                  {v}
                </span>
              ))}
              {on.map((n) => {
                const h = st.s[n]
                return [
                  <span key={n + 'l'} className={'sl-name' + (n === who ? ' on' : '')}>
                    {n}
                  </span>,
                  h.len > 0 && (
                    <span key={n + 'n'} className={'sl-len' + (n === who ? ' on' : '')} style={{ gridColumn: `${h.off + 2} / span ${h.len}` }}>
                      {h.len}
                    </span>
                  ),
                  h.cap > h.len && (
                    <span key={n + 'c'} className="sl-cap" style={{ gridColumn: `${h.off + h.len + 2} / span ${h.cap - h.len}` }}>
                      {h.cap}
                    </span>
                  ),
                ]
              })}
            </div>
          )
        })}
      </div>
      <div className="sl-legend">
        <span>
          <i className="sl-k-len" /> len
        </span>
        <span>
          <i className="sl-k-cap" /> cap
        </span>
        <span>#n = backing array</span>
      </div>
      <div className="sl-controls">
        <Seg
          value={who}
          onChange={setWho}
          options={[
            { v: 'a' as Name, label: 'on a' },
            { v: 'b' as Name, label: 'on b' },
          ]}
        />
        <div className="sl-ops">
          {OPS.map(({ op, label }) => (
            <button key={op} className="btn ghost sm" disabled={!can(st, who, op)} onClick={() => run(op)}>
              {label(who)}
            </button>
          ))}
        </div>
      </div>
      <ol className="sl-log">
        {log.map((l, i) => (
          <li key={i} className={l.grew ? 'grew' : ''}>
            <code>{l.line}</code>
            {l.note && <span>{l.note}</span>}
          </li>
        ))}
      </ol>
    </Lab>
  )
}
