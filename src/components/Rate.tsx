import { useState } from 'react'
import { REASONS, rated, remember, send, type Vote } from '../lib/rate'

/** "Was this helpful?" at the end of a topic. A no asks what's wrong; answers become tickets. */
export function Rate({ topic }: { topic: string }) {
  const [done, setDone] = useState<Vote | undefined>(() => rated(topic))
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [section, setSection] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sections, setSections] = useState<string[]>([])

  const openForm = () => {
    setSections([...document.querySelectorAll('.section h2')].map((h) => h.textContent?.trim() ?? '').filter((s) => s && s !== 'Asked in real interviews' && !s.includes('→')))
    setOpen(true)
  }

  const submit = async (vote: Vote) => {
    setBusy(true)
    setErr('')
    try {
      await send({ topic, vote, reasons, section, note })
      remember(topic, vote)
      setDone(vote)
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div className="rate" aria-live="polite">
        <b className="rate-q">{done === 'up' ? 'Thanks! Glad it helped.' : 'Thanks. We’ll use this to fix the page.'}</b>
        <button className="btn ghost sm" onClick={() => (remember(topic, undefined), setDone(undefined), setReasons([]), setNote(''))}>
          Change answer
        </button>
      </div>
    )

  return (
    <div className="rate">
      <div className="rate-row">
        <b className="rate-q">Was this topic helpful?</b>
        <div className="rate-votes">
          <button className="btn ghost" disabled={busy} onClick={() => submit('up')}>
            👍 Yes
          </button>
          <button className={'btn ' + (open ? '' : 'ghost')} disabled={busy} onClick={openForm} aria-expanded={open}>
            👎 No
          </button>
        </div>
      </div>
      {open && (
        <form
          className="rate-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit('down')
          }}
        >
          <span className="kicker">What was wrong?</span>
          <div className="rate-chips" role="group" aria-label="What was wrong?">
            {REASONS.map((r) => {
              const on = reasons.includes(r.id)
              return (
                <button key={r.id} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => setReasons(on ? reasons.filter((x) => x !== r.id) : [...reasons, r.id])}>
                  {r.label}
                </button>
              )
            })}
          </div>
          {sections.length > 0 && (
            <label className="rate-field">
              <span className="kicker">Which part?</span>
              <select value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">The whole page</option>
                {sections.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <label className="rate-field">
            <span className="kicker">Tell us more (optional)</span>
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What confused you, or what should change?" />
          </label>
          <div className="rate-actions">
            <button className="btn" type="submit" disabled={busy || (!reasons.length && !note.trim())}>
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {err && (
        <p className="rate-err" role="alert">
          {err}
        </p>
      )}
    </div>
  )
}
