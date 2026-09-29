import { useMemo, useState } from 'react'
import { Lab } from '../../components/Lab'
import { build, index, layout, ms, PROFILE, top, verdict } from './flame'

const root = build(PROFILE)
const idx = index(root)
const pct = (v: number) => `${((v / root.cum) * 100).toFixed(0)}%`
const short = (name: string) => name.replace(/^.*\//, '')

export function FlameLab() {
  const [focus, setFocus] = useState<string | undefined>()
  const [sel, setSel] = useState<string | undefined>()
  const [fn, setFn] = useState<string | undefined>()
  const rects = useMemo(() => layout(root, focus), [focus])
  const depth = Math.max(...rects.map((r) => r.depth)) + 1
  const n = sel ? idx.get(sel) : undefined
  const v = sel ? verdict(root, sel) : undefined

  return (
    <Lab
      title="Find what to optimize"
      controls={
        <>
          <button className="btn sm ghost" disabled={!sel || sel === focus} onClick={() => setFocus(sel)}>
            Zoom in
          </button>
          <button className="btn sm ghost" disabled={!focus} onClick={() => setFocus(undefined)}>
            Reset
          </button>
        </>
      }
      foot="10 s of CPU from a Go HTTP service, 1 sample = 10 ms. Width = share of samples. Left-to-right order means nothing."
    >
      <p className="profiling-ask">
        Tap the frame you would fix <b>first</b>.
      </p>
      <div className="profiling-flame" style={{ height: depth * 26 }} role="group" aria-label="flame graph">
        {rects.map((r) => {
          const name = r.id === 'root' ? `all · ${ms(root.cum)}` : short(r.name)
          const on = r.id === sel
          const mark = fn && r.name === fn
          return (
            <button
              key={r.id}
              className={'profiling-fr' + (on ? ' on' : '') + (mark ? ' mark' : '') + (r.id === 'root' ? ' root' : '')}
              style={{ left: `${r.x * 100}%`, width: `${r.w * 100}%`, top: r.depth * 26 }}
              onClick={() => setSel(r.id)}
              onDoubleClick={() => setFocus(r.id)}
              title={`${r.name} · flat ${ms(r.flat)} · cum ${ms(r.cum)}`}
            >
              {r.w > 0.07 ? name : ''}
            </button>
          )
        })}
      </div>
      <div className={'profiling-info' + (v ? ' ' + v.kind : '')} aria-live="polite">
        {n && v ? (
          <>
            <code>{n.name === 'root' ? 'all samples' : n.name}</code>
            <div className="profiling-nums">
              <span>
                flat <b>{ms(n.flat)}</b> {pct(n.flat)}
              </span>
              <span>
                cum <b>{ms(n.cum)}</b> {pct(n.cum)}
              </span>
            </div>
            <p>
              <b>{v.kind === 'yes' ? '✓ ' : v.kind === 'close' ? '~ ' : '✗ '}</b>
              {v.text}
            </p>
          </>
        ) : (
          <p>Tap a frame to see its flat and cum time. Double-click or “Zoom in” to widen it.</p>
        )}
      </div>
      <table className="profiling-top">
        <caption>
          <span className="kicker">go tool pprof -top · tap to highlight</span>
        </caption>
        <thead>
          <tr>
            <th>flat</th>
            <th>cum</th>
            <th>function</th>
          </tr>
        </thead>
        <tbody>
          {top(root, 5).map((t) => (
            <tr key={t.name} className={fn === t.name ? 'on' : ''} onClick={() => setFn(fn === t.name ? undefined : t.name)}>
              <td>{pct(t.flat)}</td>
              <td>{pct(t.cum)}</td>
              <td>{short(t.name)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Lab>
  )
}
