import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { setups, trips, ttfb, type Setup } from './roundtrips'

const RTT = 100

export function RttLab() {
  const [setup, setSetup] = useState<Setup>('tls12')
  const ts = trips(setup)

  return (
    <Lab title="Count the round trips" controls={<Seg value={setup} onChange={setSetup} options={setups.map((s) => ({ v: s.id, label: s.label }))} />}>
      <p className="ht-try">Each round trip takes 100 ms. Pick a connection type and watch the wait shrink.</p>
      <div className="ht-total" aria-live="polite">
        <b>{ttfb(setup, RTT)} ms</b> before the first byte
      </div>
      <div className="ht-trips">
        {ts.map((t, i) => (
          <span key={i} className={'k-' + t.kind}>
            {t.label}
          </span>
        ))}
      </div>
    </Lab>
  )
}
