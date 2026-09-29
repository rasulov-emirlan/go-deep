import type { ReactNode } from 'react'

export function Lab({ title, controls, children, foot, id, className }: { title: string; controls?: ReactNode; children: ReactNode; foot?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={'lab' + (className ? ' ' + className : '')} id={id}>
      <div className="lab-head">
        <span className="kicker">▶ {title}</span>
        {controls && <div className="controls">{controls}</div>}
      </div>
      <div className="lab-body">{children}</div>
      {foot && <div className="lab-foot">{foot}</div>}
    </div>
  )
}

export function Stat({ label, value, hot }: { label: string; value: ReactNode; hot?: boolean }) {
  return (
    <div className={'stat' + (hot ? ' hot' : '')}>
      <span className="kicker">{label}</span>
      <b>{value}</b>
    </div>
  )
}

export function Callout({ label = 'Note', red, children }: { label?: string; red?: boolean; children: ReactNode }) {
  return (
    <div className={'callout' + (red ? ' red' : '')}>
      <span className={'kicker' + (red ? ' red' : '')}>{label}</span>
      {children}
    </div>
  )
}

export function Section({ id, n, kicker, title, children }: { id: string; n: string; kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="section" id={id}>
      <div className="wrap">
        <span className="kicker red">
          {n} — {kicker}
        </span>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  )
}

export function Seg<T>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.label} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} aria-pressed={o.v === value}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
