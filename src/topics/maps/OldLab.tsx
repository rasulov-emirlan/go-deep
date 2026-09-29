import { useMemo, useState } from 'react'
import { Lab, Stat } from '../../components/Lab'
import { newOldMap, oldPut, type Bucket, type OldMap } from '../../sim/oldmap'
import { newMap, put } from '../../sim/swiss'

function chain(b: Bucket) {
  const out: Bucket[] = []
  for (let x: Bucket | null = b; x; x = x.overflow) out.push(x)
  return out
}

function BucketView({ b, idx, dim, cursor }: { b: Bucket; idx: number; dim?: boolean; cursor?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: dim ? 0.35 : 1, marginBottom: 3 }}>
      <span style={{ width: 30, fontFamily: 'var(--mono)', fontSize: 10, color: cursor ? '#e63946' : '#737373', fontWeight: cursor ? 700 : 400 }}>
        {cursor ? '▶' : ''}
        {idx}
      </span>
      {chain(b).map((x, ci) => (
        <div key={ci} style={{ display: 'flex', alignItems: 'center' }}>
          {ci > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#e63946', margin: '0 3px' }}>→</span>}
          <div style={{ display: 'flex', border: `1px solid ${ci > 0 ? '#e63946' : '#0a0a0a'}` }}>
            {x.keys.map((k, i) => (
              <div
                key={i}
                title={k ?? 'empty'}
                style={{ width: 16, height: 18, borderLeft: i ? '1px solid #ebebeb' : undefined, background: k ? '#0a0a0a' : '#fff', fontSize: 7, color: '#fafafa', fontFamily: 'var(--mono)', textAlign: 'center', lineHeight: '18px' }}
              >
                {k ? x.top[i].toString(16) : ''}
              </div>
            ))}
          </div>
        </div>
      ))}
      {b.evacuated && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#737373' }}>evacuated</span>}
    </div>
  )
}

/** Go ≤1.23: buckets, overflow chains, incremental evacuation. */
export function OldMapLab() {
  const [m, setM] = useState<OldMap>(() => newOldMap())
  const [n, setN] = useState(0)
  const [lastMoved, setLastMoved] = useState(0)
  const add = (count: number) => {
    const next = structuredClone(m)
    let moved = 0
    for (let i = 0; i < count; i++) moved += oldPut(next, 'k' + (n + i))
    setN(n + count)
    setM(next)
    setLastMoved(moved)
  }
  const growing = !!m.old
  return (
    <Lab
      title="Classic map (Go ≤1.23) — incremental evacuation"
      controls={
        <>
          <button className="btn" onClick={() => add(1)}>
            +1 insert
          </button>
          <button className="btn ghost" onClick={() => add(10)}>
            +10
          </button>
          <button className="btn ghost" onClick={() => (setM(newOldMap()), setN(0), setLastMoved(0))}>
            Reset
          </button>
        </>
      }
      foot={
        <span>
          Bucket = low B bits of the hash; each cell shows the tophash byte (top 8 bits). When count &gt; 6.5·2^B, <code>hashGrow</code> only <em>allocates</em> the new array; each later write evacuates
          the bucket it touches plus one more (<code>growWork</code>), splitting old bucket i into i and i+2^oldB.
        </span>
      }
    >
      <div className="stats">
        <Stat label="count" value={m.count} />
        <Stat label="B / buckets" value={`${m.B} / ${m.buckets.length}`} />
        <Stat label="load" value={(m.count / m.buckets.length).toFixed(2)} hot={m.count / m.buckets.length > 6} />
        <Stat label="growing" value={growing ? `yes · ${m.nevacuate}/${m.old!.length}` : 'no'} hot={growing} />
        <Stat label="moved by last op" value={lastMoved} />
      </div>
      <div className="two">
        <div>
          <span className="kicker">buckets (2^{m.B})</span>
          {m.buckets.map((b, i) => (
            <BucketView key={i} b={b} idx={i} />
          ))}
        </div>
        <div>
          <span className="kicker">oldbuckets {growing ? `(${m.old!.length}) — nevacuate ▶` : '— nil'}</span>
          {growing ? m.old!.map((b, i) => <BucketView key={i} b={b} idx={i} dim={b.evacuated} cursor={i === m.nevacuate} />) : <p style={{ fontSize: 13, color: '#737373' }}>Insert until load exceeds 6.5 per bucket.</p>}
        </div>
      </div>
    </Lab>
  )
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

function Chart({ vals, label, max }: { vals: number[]; label: string; max: number }) {
  const W = 900
  const H = 110
  const bw = W / vals.length
  const peak = Math.max(...vals)
  return (
    <div style={{ marginBottom: '1rem' }}>
      <span className="kicker" style={{ color: '#0a0a0a' }}>
        {label} · worst single insert <span className="r">{peak}</span> entries moved · total {sum(vals).toLocaleString()}
      </span>
      <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', display: 'block', background: '#fafafa' }}>
        <line x1={0} x2={W} y1={H} y2={H} stroke="#d4d4d4" />
        {vals.map((v, i) =>
          v > 0 ? <rect key={i} x={i * bw} y={H - (v / max) * H} width={Math.max(bw, 1.2)} height={(v / max) * H} fill={v === peak ? '#e63946' : '#0a0a0a'} /> : null,
        )}
        <text x={0} y={H + 13} fontSize={10} fill="#737373">
          insert #0
        </text>
        <text x={W} y={H + 13} fontSize={10} fill="#737373" textAnchor="end">
          #{vals.length}
        </text>
      </svg>
    </div>
  )
}

/** Per-insert rehash work: amortized evacuation vs bounded per-table rehash. */
export function GrowthRace() {
  const [N, setN] = useState(6000)
  const data = useMemo(() => {
    const om = newOldMap()
    const sm = newMap(1024)
    const old: number[] = []
    const sw: number[] = []
    for (let i = 0; i < N; i++) {
      old.push(oldPut(om, 'key' + i))
      sw.push(put(sm, 'key' + i, i).reduce((a, s) => a + (s.t === 'grow' ? s.moved : 0), 0))
    }
    return { old, sw }
  }, [N])
  const max = Math.max(...data.sw, ...data.old, 1)
  return (
    <Lab
      title="Growth cost per insert — same keys, same scale"
      controls={
        <label className="field">
          inserts <input type="range" min={1000} max={20000} step={1000} value={N} onChange={(e) => setN(+e.target.value)} />
          <output>{N}</output>
        </label>
      }
      foot={
        <span>
          Old map: a doubling moves every entry, but spread over later writes (≤2 buckets each) — lots of small bars, lookups meanwhile check <code>oldbuckets</code>. Swiss map: one table rehashes all at
          once, but a table never exceeds 1024 slots, so the worst insert moves ≤ 896 entries no matter how big the map gets.
        </span>
      }
    >
      <Chart max={max} vals={data.old} label="Go ≤1.23 incremental evacuation" />
      <Chart max={max} vals={data.sw} label="Go 1.24+ Swiss (maxTableCapacity 1024)" />
    </Lab>
  )
}
