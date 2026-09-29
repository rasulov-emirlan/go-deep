import { useState, type ReactNode } from 'react'
import { markDone, useProgress } from '../lib/progress'

export type Level = 'core' | 'senior' | 'staff'
export type InterviewQ = { id: string; q: string; level: Level; a: ReactNode }

export function Interview({ items, prefix }: { items: InterviewQ[]; prefix: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [level, setLevel] = useState<Level | 'all'>('all')
  const [hideKnown, setHideKnown] = useState(false)
  const { isDone } = useProgress()
  const key = (id: string) => `iv:${prefix}:${id}`
  const shown = items.filter((q) => (level === 'all' || q.level === level) && !(hideKnown && isDone(key(q.id))))
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const known = items.filter((q) => isDone(key(q.id))).length
  return (
    <div>
      <div className="filters">
        <div className="seg">
          {(['all', 'core', 'senior', 'staff'] as const).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        <button className={'btn sm ' + (hideKnown ? 'on' : 'ghost')} onClick={() => setHideKnown((h) => !h)}>
          Hide known
        </button>
        <button className="btn sm ghost" onClick={() => setOpen(open.size ? new Set() : new Set(shown.map((q) => q.id)))}>
          {open.size ? 'Collapse all' : 'Expand all'}
        </button>
        <span className="kicker" style={{ margin: 0 }}>
          <span className="r">{known}</span>/{items.length} known
        </span>
      </div>
      <div className="cards">
        {shown.map((q) => {
          const isOpen = open.has(q.id)
          const k = isDone(key(q.id))
          return (
            <div key={q.id} className={'card' + (isOpen ? ' open' : '') + (k ? ' known' : '')}>
              <button onClick={() => toggle(q.id)} aria-expanded={isOpen}>
                <span className="qn">{String(items.indexOf(q) + 1).padStart(2, '0')}</span>
                <span className="qt">{q.q}</span>
                <span className={'lvl' + (q.level === 'staff' ? ' hard' : '')}>{q.level}</span>
                <span className="plus">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="ans">
                  {q.a}
                  <div className="know">
                    <button className={'btn sm ' + (k ? 'on' : 'ghost')} onClick={() => markDone(key(q.id), !k)}>
                      {k ? '✓ I know this' : 'Mark as known'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

