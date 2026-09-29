import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { canSend, initial, lastReaders, send, type LabState, type Mode } from './queuelab'

function Row({ name, got, last }: { name: string; got: number[]; last: number }) {
  return (
    <div className="queues-row">
      <span className="queues-name">{name}</span>
      <div className="queues-msgs">
        {got.length === 0 && <span className="queues-none">nothing</span>}
        {got.map((n) => (
          <span key={n} className={'queues-msg' + (n === last ? ' hot' : '')}>
            m{n}
          </span>
        ))}
      </div>
    </div>
  )
}

export function QueueLab() {
  const [st, setSt] = useState<LabState>(() => initial('log'))
  const who = lastReaders(st)
  const n = st.sent
  const result = n === 0 ? 'Send a message.' : who.length === 2 ? `A and B both got m${n}.` : `Only ${who[0]} got m${n}.`
  const note = n === 0 ? '' : st.mode === 'log' ? 'The log still keeps it.' : 'It was deleted after the ack.'

  return (
    <Lab
      title="Log or queue"
      className="queues-lab"
      controls={
        <Seg
          value={st.mode}
          onChange={(m: Mode) => setSt(initial(m))}
          options={[
            { v: 'log', label: 'Log' },
            { v: 'queue', label: 'Queue' },
          ]}
        />
      }
    >
      <p className="queues-try">Send a few messages, then switch to Queue and compare.</p>
      <div className="queues-grid">
        <div>
          <Row name="A" got={st.a} last={n} />
          <Row name="B" got={st.b} last={n} />
          <Row name="Kept" got={st.stored} last={-1} />
        </div>
        <div>
          <p className={'queues-result' + (who.length === 1 ? ' hot' : '')} aria-live="polite">
            {result} <span>{note}</span>
          </p>
          <button className="btn" onClick={() => setSt(canSend(st) ? send(st) : initial(st.mode))}>
            {canSend(st) ? `Send m${n + 1}` : 'Start over'}
          </button>
        </div>
      </div>
    </Lab>
  )
}
