import { useMemo, useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { simulate, type Mode, type Outcome } from './stampede'

const DOTS = 200
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const note: Record<Mode, string> = {
  none: 'Every request that arrives before the first query returns goes to Postgres, and they queue for its 20 connections.',
  singleflight: 'One query per pod; the rest wait for their pod’s leader. Try 64 pods: it is per process, and leaders queue too.',
  swr: 'Nobody waits: callers get the old value instantly, and each pod refreshes once in the background.',
}

const rank: Record<Outcome, number> = { db: 3, wait: 2, stale: 1, hit: 0 }
/** One dot per `per` requests, showing the worst outcome in the group. */
const bucket = (o: Outcome[], per: number) =>
  Array.from({ length: Math.ceil(o.length / per) }, (_, k) => o.slice(k * per, (k + 1) * per).reduce((a, b) => (rank[b] > rank[a] ? b : a)))

export function StampedeLab() {
  const [mode, setMode] = useState<Mode>('none')
  const [n, setN] = useState(1000)
  const [pods, setPods] = useState(4)
  const r = useMemo(() => simulate({ n, pods, mode }), [n, pods, mode])
  const per = Math.max(1, Math.round(n / DOTS))
  const dots = bucket(r.outcomes, per)
  return (
    <div className="sc-lab">
    <Lab
      title="Stampede simulator"
      foot="Model: the key expires at t = 0, requests arrive evenly over 100 ms, Postgres has 20 connections and each query takes 50 ms."
    >
      <div className="sc-controls">
        <div className="sc-ctl">
          <span className="kicker">guard</span>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { v: 'none', label: 'none' },
              { v: 'singleflight', label: 'singleflight' },
              { v: 'swr', label: 'stale-while-revalidate' },
            ]}
          />
        </div>
        <div className="sc-ctl">
          <span className="kicker">requests</span>
          <Seg value={n} onChange={setN} options={[100, 1000, 10000].map((v) => ({ v, label: v.toLocaleString('en') }))} />
        </div>
        <div className="sc-ctl">
          <span className="kicker">pods</span>
          <Seg value={pods} onChange={setPods} options={[1, 4, 64].map((v) => ({ v, label: String(v) }))} />
        </div>
      </div>
      <div className="stats">
        <Stat label="DB queries" value={r.dbQueries.toLocaleString('en')} hot={r.dbQueries > 20} />
        <Stat label="peak DB queue" value={r.peakQueue.toLocaleString('en')} hot={r.peakQueue > 0} />
        <Stat label="p50" value={ms(r.p50)} />
        <Stat label="p99" value={ms(r.p99)} hot={r.p99 > 200} />
      </div>
      <div className="sc-dots" aria-label="each dot is a request">
        {dots.map((o, k) => (
          <i key={k} className={'sc-' + o} />
        ))}
      </div>
      <div className="sc-legend">
        <span><i className="sc-db" /> queried DB</span>
        <span><i className="sc-wait" /> waited for leader</span>
        <span><i className="sc-stale" /> got stale value</span>
        <span><i className="sc-hit" /> cache hit</span>
        <span>1 dot = {per === 1 ? '1 request' : `${per} requests (worst shown)`}</span>
      </div>
      <p className="sc-note">{note[mode]}</p>
    </Lab>
    </div>
  )
}
