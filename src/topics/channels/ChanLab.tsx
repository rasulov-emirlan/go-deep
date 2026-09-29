import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { close, make, recv, send, type Cap, type Parked } from './chanSim'

const caps: { v: Cap; label: string }[] = [
  { v: 'nil', label: 'nil' },
  { v: 0, label: 'cap 0' },
  { v: 1, label: '1' },
  { v: 2, label: '2' },
  { v: 3, label: '3' },
]

function Queue({ title, items, nil }: { title: string; items: Parked[]; nil: boolean }) {
  const shown = items.slice(0, 4)
  return (
    <div className="ch-q">
      <span className="kicker">{title}</span>
      <div className="ch-qbody">
        {shown.map((p) => (
          <div key={p.g} className="ch-g">
            <img src={`/gophers/${nil ? 'dandy-raining' : 'dandy-umbrella'}.webp`} alt="" />
            <span>
              G{p.g}
              {p.v !== undefined && <b>·{p.v}</b>}
            </span>
          </div>
        ))}
        {items.length > shown.length && <span className="ch-more">+{items.length - shown.length}</span>}
        {!items.length && <span className="ch-empty">empty</span>}
      </div>
    </div>
  )
}

export function ChanLab() {
  const [s, setS] = useState(() => make(2))
  const nil = s.cap === 'nil'
  const n = s.cap === 'nil' ? 0 : s.cap
  return (
    <Lab
      title="Channel simulator"
      controls={<Seg value={s.cap} options={caps} onChange={(c) => setS(make(c))} />}
      foot="Each button is a new goroutine doing one operation. Try: nil, then close. Or cap 0: recv, send."
    >
      <div className={'ch-board' + (s.closed ? ' closed' : '')}>
        <Queue title="sendq" items={s.sendq} nil={nil} />
        <div className="ch-buf">
          <span className="kicker">{nil ? 'no hchan' : s.closed ? 'buf · closed' : 'buf'}</span>
          <div className="ch-slots">
            {nil && <div className="ch-slot none">nil</div>}
            {!nil && n === 0 && <div className="ch-slot none">no buffer</div>}
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className={'ch-slot' + (s.buf[i] !== undefined ? ' full' : '')}>
                {s.buf[i] ?? ''}
              </div>
            ))}
          </div>
        </div>
        <Queue title="recvq" items={s.recvq} nil={nil} />
      </div>
      <div className="ch-btns">
        <button className="btn" onClick={() => setS(send(s))}>
          ch &lt;- {s.next}
        </button>
        <button className="btn" onClick={() => setS(recv(s))}>
          v, ok := &lt;-ch
        </button>
        <button className="btn ghost" onClick={() => setS(close(s))}>
          close(ch)
        </button>
      </div>
      <p className={'ch-msg ' + s.kind} aria-live="polite">
        {s.msg}
      </p>
      {s.got.length > 0 && (
        <div className="ch-got">
          <span className="kicker">received</span>
          {s.got.slice(-6).map((g, i) => (
            <span key={i} className={g.ok ? '' : 'zero'}>
              G{g.g}: {g.v}, {String(g.ok)}
            </span>
          ))}
        </div>
      )}
    </Lab>
  )
}
