import { useMemo, useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { runAll, scenarios, start, stepScript, type Barrier, type State } from '../../sim/tricolor'

const barriers: { v: Barrier; label: string }[] = [
  { v: 'none', label: 'No barrier' },
  { v: 'dijkstra', label: 'Dijkstra (insert)' },
  { v: 'yuasa', label: 'Yuasa (delete)' },
  { v: 'hybrid', label: 'Hybrid (Go 1.8+)' },
]

const NX = (x: number) => 190 + x * 150
const NY = (y: number) => 40 + y * 78
const R = 22

export function TriColorLab() {
  const [si, setSi] = useState(0)
  const [barrier, setBarrier] = useState<Barrier>('none')
  const sc = scenarios[si]
  const [st, setSt] = useState<State>(() => start(sc, 'none'))
  const reset = (i = si, b = barrier) => setSt(start(scenarios[i], b))
  const next = () => setSt((s) => stepScript(sc, structuredClone(s)))
  const all = () => setSt(runAll(sc, barrier))
  const nextAction = sc.script[st.pc]
  const matrix = useMemo(() => scenarios.map((s) => barriers.map((b) => runAll(s, b.v).dangling.length === 0)), [])

  const rootY = (i: number) => 30 + i * 90
  const H = Math.max(260, NY(Math.max(...st.objs.map((o) => o.y))) + 60)
  const pos = (id: string) => {
    const o = st.objs.find((x) => x.id === id)!
    return { x: NX(o.x), y: NY(o.y) }
  }
  const dangling = new Set(st.dangling)

  const edge = (x1: number, y1: number, id: string, key: string) => {
    const p = pos(id)
    const dx = p.x - x1
    const dy = p.y - y1
    const d = Math.hypot(dx, dy) || 1
    const x2 = p.x - (dx / d) * (R + 4)
    const y2 = p.y - (dy / d) * (R + 4)
    const bad = dangling.has(id)
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bad ? '#e63946' : '#0a0a0a'} strokeWidth={bad ? 2.5 : 1.5} markerEnd={bad ? 'url(#arrR)' : 'url(#arr)'} />
  }

  return (
    <Lab
      title="Tri-color marking vs a sneaky mutator"
      controls={
        <>
          <button className="btn" onClick={next} disabled={st.done}>
            Next
          </button>
          <button className="btn ghost" onClick={all} disabled={st.done}>
            Run all
          </button>
          <button className="btn ghost" onClick={() => reset()}>
            Reset
          </button>
        </>
      }
      foot={<span>{sc.blurb}</span>}
    >
      <div className="controls" style={{ marginBottom: '.6rem' }}>
        <Seg
          value={si}
          onChange={(i) => {
            setSi(i)
            reset(i)
          }}
          options={scenarios.map((s, i) => ({ v: i, label: `${i + 1}. ${s.title}` }))}
        />
      </div>
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <span className="field">write barrier</span>
        <Seg
          value={barrier}
          onChange={(b) => {
            setBarrier(b)
            reset(si, b)
          }}
          options={barriers}
        />
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, marginBottom: '.5rem', minHeight: '1.3rem' }}>
        {st.done ? (
          <b style={{ color: st.dangling.length ? '#e63946' : '#0a0a0a' }}>{st.dangling.length ? `✗ use-after-free: ${st.dangling.join(', ')} was swept while reachable` : '✓ every reachable object survived'}</b>
        ) : (
          <>
            next: <b>{nextAction.k === 'write' || nextAction.k === 'stackWrite' ? nextAction.say : nextAction.k === 'scanRoot' ? `GC scans root ${nextAction.root}` : nextAction.k === 'mark' ? 'GC scans one grey object' : nextAction.k === 'drain' ? 'GC drains all grey objects' : 'sweep: free every white object'}</b>
          </>
        )}
      </div>
      <div className="viz-scroll">
        <svg viewBox={`0 0 720 ${H}`} style={{ width: '100%', minWidth: 520, display: 'block', background: '#fafafa' }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#0a0a0a" />
            </marker>
            <marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#e63946" />
            </marker>
          </defs>
          {st.roots.map((r, i) => (
            <g key={r.id}>
              <rect x={10} y={rootY(i)} width={96} height={24 + r.slots.length * 26} fill={r.scanned ? '#0a0a0a' : '#fff'} stroke="#0a0a0a" strokeWidth={1.5} />
              <text x={18} y={rootY(i) + 16} fontSize={10} fontWeight={700} fill={r.scanned ? '#fafafa' : '#0a0a0a'}>
                {r.label}
              </text>
              <text x={100} y={rootY(i) + 16} fontSize={8} textAnchor="end" fill={r.scanned ? '#a3a3a3' : '#737373'}>
                {r.scanned ? 'scanned' : r.id === 'globals' ? '' : 'not scanned'}
              </text>
              {r.slots.map((t, j) => (
                <g key={j}>
                  <rect x={18} y={rootY(i) + 24 + j * 26} width={80} height={20} fill="#fff" stroke="#737373" />
                  <text x={24} y={rootY(i) + 38 + j * 26} fontSize={10} fill="#0a0a0a">
                    {t ? `→ ${t}` : 'nil'}
                  </text>
                  {t && edge(98, rootY(i) + 34 + j * 26, t, `${r.id}${j}`)}
                </g>
              ))}
            </g>
          ))}
          {st.objs.map((o) => o.fields.map((f, j) => f && edge(NX(o.x) + R, NY(o.y), f, `${o.id}${j}`)))}
          {st.objs.map((o) => {
            const fill = o.freed ? '#fff' : o.color === 'black' ? '#0a0a0a' : o.color === 'grey' ? '#a3a3a3' : '#fff'
            const shaded = st.shaded.includes(o.id)
            return (
              <g key={o.id}>
                <circle cx={NX(o.x)} cy={NY(o.y)} r={R} fill={fill} stroke={o.freed ? '#e63946' : shaded ? '#e63946' : '#0a0a0a'} strokeWidth={shaded || o.freed ? 3 : 1.5} strokeDasharray={o.freed ? '4 3' : undefined} />
                <text x={NX(o.x)} y={NY(o.y) + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={o.color === 'black' && !o.freed ? '#fafafa' : o.freed ? '#e63946' : '#0a0a0a'}>
                  {o.id}
                </text>
                {o.freed && (
                  <text x={NX(o.x)} y={NY(o.y) + R + 14} textAnchor="middle" fontSize={9} fill="#e63946">
                    freed
                  </text>
                )}
                {o.fields.length > 0 && !o.freed && (
                  <text x={NX(o.x)} y={NY(o.y) - R - 6} textAnchor="middle" fontSize={9} fill="#737373">
                    ptr → {o.fields[0] ?? 'nil'}
                  </text>
                )}
              </g>
            )
          })}
          <text x={710} y={H - 10} textAnchor="end" fontSize={9} fill="#737373">
            grey queue: [{st.grey.join(', ')}]
          </text>
        </svg>
      </div>
      <div className="legend" style={{ marginTop: '.6rem' }}>
        <span>
          <i style={{ background: '#fff', borderRadius: '50%' }} />
          white — not reached
        </span>
        <span>
          <i style={{ background: '#a3a3a3', borderRadius: '50%' }} />
          grey — queued
        </span>
        <span>
          <i style={{ background: '#0a0a0a', borderRadius: '50%' }} />
          black — scanned
        </span>
        <span>
          <i style={{ background: '#fff', borderColor: '#e63946', borderWidth: 2, borderRadius: '50%' }} />
          shaded by barrier
        </span>
      </div>
      <div className="log" style={{ margin: '0 -1rem 1rem' }}>
        {st.log.map((l, i) => (
          <div key={st.log.length - i}>{l}</div>
        ))}
        {!st.log.length && <div>Press Next.</div>}
      </div>
      <span className="kicker" style={{ color: '#0a0a0a' }}>
        Which barrier survives which scenario
      </span>
      <div className="viz-scroll">
        <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12, width: '100%', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 6, borderBottom: '2px solid #0a0a0a' }}>scenario</th>
              {barriers.map((b) => (
                <th key={b.v} style={{ padding: 6, borderBottom: '2px solid #0a0a0a', textAlign: 'center' }}>
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={s.id} style={{ background: i === si ? '#f5f5f5' : undefined }}>
                <td style={{ padding: 6, borderBottom: '1px solid #d4d4d4' }}>
                  {i + 1}. {s.title}
                </td>
                {matrix[i].map((ok, j) => (
                  <td key={j} style={{ padding: 6, borderBottom: '1px solid #d4d4d4', textAlign: 'center', color: ok ? '#0a0a0a' : '#e63946', fontWeight: 700 }}>
                    {ok ? 'safe' : 'loses object'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Lab>
  )
}
