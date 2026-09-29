import { useState } from 'react'
import { Lab } from '../../components/Lab'
import { replayable, setups, trips, ttfb, type Setup } from './roundtrips'

const MAX = 5 // TLS 1.2 + uncached DNS

export function RttLab() {
  const [setup, setSetup] = useState<Setup>('tls12')
  const [rtt, setRtt] = useState(100)
  const [dnsCached, setDnsCached] = useState(true)
  const ts = trips(setup, dnsCached)
  const s = setups.find((x) => x.id === setup)!

  return (
    <Lab
      title="Round-trip counter"
      controls={
        <label className="ht-check">
          <input type="checkbox" checked={!dnsCached} onChange={(e) => setDnsCached(!e.target.checked)} /> cold DNS
        </label>
      }
      foot="Ignores server think time, bandwidth and TCP slow start. Real first visits are slower still."
    >
      <label className="ht-rtt">
        <span className="kicker">RTT {rtt} ms</span>
        <input type="range" min={10} max={300} step={10} value={rtt} onChange={(e) => setRtt(+e.target.value)} aria-label="Network round-trip time" />
      </label>

      <div className="ht-pick" role="radiogroup" aria-label="Connection setup">
        {setups.map((x) => {
          const n = trips(x.id, dnsCached).length
          return (
            <button key={x.id} role="radio" aria-checked={x.id === setup} className={x.id === setup ? 'on' : ''} onClick={() => setSetup(x.id)}>
              <span className="ht-name">{x.label}</span>
              <span className="ht-bar">
                <i style={{ width: `${(n / MAX) * 100}%` }} />
              </span>
              <span className="ht-ms">{n * rtt} ms</span>
            </button>
          )
        })}
      </div>

      <div className="ht-timeline" aria-live="polite">
        <div className="ht-total">
          <b>{ttfb(setup, rtt, dnsCached)} ms</b> to first byte · {ts.length} round trip{ts.length > 1 ? 's' : ''}
        </div>
        {ts.map((t, i) => (
          <div key={i} className="ht-row">
            <span className="ht-rt">RT{i + 1}</span>
            <span className="ht-track">
              <i className={'k-' + t.kind} style={{ left: `${(i / MAX) * 100}%`, width: `${100 / MAX}%` }} />
            </span>
            <span className="ht-lbl">{t.label}</span>
          </div>
        ))}
        <p className={'ht-note' + (replayable(setup) ? ' warn' : '')}>{s.note}</p>
      </div>
    </Lab>
  )
}
