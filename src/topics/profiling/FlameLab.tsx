import { useState } from 'react'
import { Lab } from '../../components/Lab'
import { build, index, layout, ms, PROFILE, verdict } from './flame'

const root = build(PROFILE)
const idx = index(root)
const rects = layout(root)
const depth = Math.max(...rects.map((r) => r.depth)) + 1
const short = (name: string) => name.replace(/^.*\//, '')

export function FlameLab() {
  const [sel, setSel] = useState<string | undefined>()
  const n = sel ? idx.get(sel) : undefined
  const v = sel ? verdict(root, sel) : undefined

  return (
    <Lab title="Find what to fix" foot="10 s of CPU from a Go web service. Width = share of CPU.">
      <p className="profiling-ask">
        Tap the bar you would fix <b>first</b>.
      </p>
      <div className="profiling-flame" style={{ height: depth * 26 }} role="group" aria-label="flame graph">
        {rects.map((r) => (
          <button
            key={r.id}
            className={'profiling-fr' + (r.id === sel ? ' on' : '') + (r.id === 'root' ? ' root' : '')}
            style={{ left: `${r.x * 100}%`, width: `${r.w * 100}%`, top: r.depth * 26 }}
            onClick={() => setSel(r.id)}
            aria-label={short(r.name)}
          >
            {r.w > 0.07 ? (r.id === 'root' ? 'all' : short(r.name)) : ''}
          </button>
        ))}
      </div>
      <div className={'profiling-info' + (v ? ' ' + v.kind : '')} aria-live="polite">
        {n && v ? (
          <>
            <b className="profiling-verdict">{v.kind === 'yes' ? '✓ Yes' : v.kind === 'close' ? '~ Close' : '✗ Not that'}</b>
            <code>{n.name === 'root' ? 'all samples' : short(n.name)}</code>
            <span className="profiling-nums">
              flat {ms(n.flat)} · cum {ms(n.cum)}
            </span>
            <p>{v.text}</p>
          </>
        ) : (
          <p>Hint: look for a wide bar that does work nobody needs.</p>
        )}
      </div>
    </Lab>
  )
}
