import { useState } from 'react'
import { Lab } from '../../components/Lab'
import { append, canAppend, initial, type Event, type LabState } from './slicelab'

const result: Record<Event, string> = {
  start: 'b := a[:2] shares a’s array.',
  overwrote: 'a changed! b wrote into a’s array.',
  moved: 'b was full, so append copied it to a new array.',
  inplace: 'a is safe now: b has its own array.',
}

function Row({ name, cells, len, hot, note }: { name: string; cells: number[]; len: number; hot: number; note?: string }) {
  return (
    <div className="sl-row">
      <span className="sl-name">{name}</span>
      <div className="sl-cells">
        {cells.map((v, i) => (
          <span key={i} className={'sl-cell' + (i >= len ? ' spare' : '') + (i === hot ? ' hot' : '')}>
            {i < len ? v : ''}
          </span>
        ))}
      </div>
      {note && <span className="sl-note">{note}</span>}
    </div>
  )
}

export function SliceLab() {
  const [st, setSt] = useState<LabState>(initial)
  const [ev, setEv] = useState<Event>('start')
  const hot = ev === 'start' ? -1 : st.b.len - 1
  const run = () => {
    const r = append(st)
    setSt(r.state)
    setEv(r.event)
  }
  return (
    <Lab
      title="Append lab"
      className="sl-lab"
      controls={
        <button
          className="btn ghost sm"
          onClick={() => {
            setSt(initial())
            setEv('start')
          }}
        >
          Reset
        </button>
      }
    >
      <p className="sl-try">Tap append a few times and watch a.</p>
      <Row name="a" cells={st.a} len={4} hot={ev === 'overwrote' ? hot : -1} />
      <Row name="b" cells={st.b.cells} len={st.b.len} hot={hot} note={st.b.shared ? 'shares a’s array' : 'own array'} />
      <p className={'sl-result' + (ev === 'overwrote' || ev === 'moved' ? ' hot' : '')} aria-live="polite">
        {result[ev]}
      </p>
      <button className="btn" onClick={run} disabled={!canAppend(st)}>
        b = append(b, {st.next})
      </button>
    </Lab>
  )
}
