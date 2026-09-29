import { useState } from 'react'
import { share, type Outcome } from '../lib/playground'

export function ShareButton({ code }: { code: () => string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'err'>('idle')
  return (
    <button
      className="btn ghost"
      disabled={state === 'busy'}
      onClick={async () => {
        // open the tab now so pop-up blockers allow it, then point it at the share link
        const tab = window.open('', '_blank')
        setState('busy')
        try {
          const url = await share(code())
          if (tab) tab.location.href = url
          else window.location.href = url
          setState('idle')
        } catch {
          tab?.close()
          setState('err')
        }
      }}
    >
      {state === 'busy' ? 'Opening…' : state === 'err' ? 'Couldn’t share, retry' : 'Open in Go Playground ↗'}
    </button>
  )
}

export function Result({ out, err, busy }: { out: Outcome | null; err: string; busy: boolean }) {
  if (busy) return <div className="run-out">Running in the Go Playground…</div>
  if (err)
    return (
      <div className="run-out bad" role="alert">
        {err}
      </div>
    )
  if (!out) return null
  if (out.kind === 'compile')
    return (
      <div className="run-out bad" role="status">
        <b className="run-verdict">Doesn’t compile</b>
        <pre>{out.errors}</pre>
      </div>
    )
  if (out.kind === 'output')
    return (
      <div className="run-out" role="status">
        <pre>{out.output || '(no output)'}</pre>
      </div>
    )
  const passed = out.cases.filter((c) => c.ok).length
  return (
    <div className={'run-out ' + (out.kind === 'pass' ? 'good' : 'bad')} role="status">
      <b className="run-verdict">{out.kind === 'pass' ? `✓ All ${out.cases.length} checks pass` : out.kind === 'crash' ? '✗ It crashed' : `✗ ${passed} of ${out.cases.length} checks pass`}</b>
      <ul className="run-cases">
        {out.cases.map((c, i) => (
          <li key={i} className={c.ok ? 'ok' : 'no'}>
            <span>{c.ok ? '✓' : '✗'}</span> {c.name}
            {c.detail && <code>{c.detail}</code>}
          </li>
        ))}
      </ul>
      {out.kind === 'crash' && <pre>{out.output.split('\n').filter((l) => !/^[✓✗] /.test(l)).join('\n').trim()}</pre>}
    </div>
  )
}
