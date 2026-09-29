import { useEffect, useState, type ReactNode } from 'react'

/**
 * A step-by-step illustrated scene. Everything lives in a W×H virtual stage
 * and is positioned in percentages, so it scales to any width. Actors and
 * props keep their `id` across frames, so CSS transitions animate the moves.
 */
export type Actor = {
  id: string
  sprite: string // file in /public/gophers without extension
  x: number // center x
  y: number // feet (bottom) y
  h?: number // height in stage units
  tag?: string // badge under the sprite, e.g. "G1"
  bubble?: string // speech bubble
  flip?: boolean
  dim?: boolean
  hot?: boolean // red tag
  hidden?: boolean
  z?: number
}

export type Prop = {
  id: string
  x: number
  y: number
  w: number
  h: number
  label?: ReactNode // mono kicker at the top-left
  text?: ReactNode // centered text
  tone?: 'line' | 'ink' | 'red' | 'soft' | 'dashed' | 'none'
  hidden?: boolean
  z?: number
}

/** A frame with `stop` halts autoplay and shows a "why" card until the reader presses OK. */
export type Stop = { title: string; body: ReactNode; edge?: boolean }
export type Frame = { caption: ReactNode; actors: Actor[]; props?: Prop[]; stop?: Stop }

/** `code` spans in plain-string captions */
function inlineCode(c: ReactNode): ReactNode {
  if (typeof c !== 'string' || !c.includes('`')) return c
  return c.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') && part.endsWith('`') && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : part))
}

const W = 800
const H = 360

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** A scaled W×H stage of props and gopher actors. */
export function Stage({ actors, props, w = W, h = H }: { actors: Actor[]; props: Prop[]; w?: number; h?: number }) {
  return (
    <div className="stage" style={{ aspectRatio: `${w} / ${h}` }}>
      {props.map((p) => (
        <PropBox key={p.id} p={p} w={w} h={h} />
      ))}
      {actors.map((a) => (
        <ActorView key={a.id} a={a} w={w} h={h} />
      ))}
    </div>
  )
}

function PropBox({ p, w: SW = W, h: SH = H }: { p: Prop; w?: number; h?: number }) {
  const tone = p.tone ?? 'line'
  return (
    <div
      className={`st-prop st-${tone}`}
      style={{ left: pct(p.x, SW), top: pct(p.y, SH), width: pct(p.w, SW), height: pct(p.h, SH), opacity: p.hidden ? 0 : 1, zIndex: p.z }}
    >
      {p.label && <span className="st-plabel">{p.label}</span>}
      {p.text && <span className="st-ptext">{p.text}</span>}
    </div>
  )
}

function ActorView({ a, w: SW = W, h: SH = H }: { a: Actor; w?: number; h?: number }) {
  const h = a.h ?? 90
  return (
    <div
      className="st-actor"
      style={{
        left: pct(a.x, SW),
        top: pct(a.y - h, SH),
        height: pct(h, SH),
        opacity: a.hidden ? 0 : a.dim ? 0.35 : 1,
        zIndex: a.z ?? 2,
      }}
    >
      <img src={`/gophers/${a.sprite}.webp`} alt="" draggable={false} style={{ transform: `translateX(-50%) ${a.flip ? 'scaleX(-1)' : ''}` }} />
      {a.bubble && <span className={'st-bubble' + (a.x < SW * 0.14 ? ' l' : a.x > SW * 0.86 ? ' r' : '')}>{a.bubble}</span>}
      {a.tag && <span className={'st-tag' + (a.hot ? ' hot' : '')}>{a.tag}</span>}
    </div>
  )
}

export function Story({ title, frames, id }: { title: string; frames: Frame[]; id?: string }) {
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(false)
  const f = frames[i]
  const last = i === frames.length - 1
  const waiting = auto && !!f.stop
  useEffect(() => {
    if (!auto || f.stop) return
    if (last) {
      setAuto(false)
      return
    }
    const t = setTimeout(() => setI((n) => n + 1), 1500)
    return () => clearTimeout(t)
  }, [auto, i, last, f.stop])
  const next = () => (last ? (setI(0), setAuto(false)) : setI(i + 1))

  // every actor/prop that appears in any frame stays mounted so it can animate in/out
  const actorIds = [...new Set(frames.flatMap((fr) => fr.actors.map((a) => a.id)))]
  const propIds = [...new Set(frames.flatMap((fr) => (fr.props ?? []).map((p) => p.id)))]
  const findActor = (aid: string): Actor => {
    const here = f.actors.find((a) => a.id === aid)
    if (here) return here
    for (let k = i; k >= 0; k--) {
      const a = frames[k].actors.find((x) => x.id === aid)
      if (a) return { ...a, hidden: true, bubble: undefined }
    }
    const first = frames.flatMap((fr) => fr.actors).find((a) => a.id === aid)!
    return { ...first, hidden: true, bubble: undefined }
  }
  const findProp = (pid: string): Prop => f.props?.find((p) => p.id === pid) ?? { ...frames.flatMap((fr) => fr.props ?? []).find((p) => p.id === pid)!, hidden: true }
  const stops = frames.filter((fr) => fr.stop).length
  // crop empty sky: the stage starts just above the highest thing any frame draws (+ room for bubbles)
  const top = Math.max(
    0,
    Math.min(...frames.flatMap((fr) => [...fr.actors.map((a) => a.y - (a.h ?? 90) - 44), ...(fr.props ?? []).map((p) => p.y - 8)])),
  )
  const up = <T extends { y: number }>(o: T): T => ({ ...o, y: o.y - top })
  // …and keep room under the lowest feet for their tags
  const bottom = Math.max(H, ...frames.flatMap((fr) => fr.actors.filter((a) => a.tag).map((a) => a.y + 24)))

  return (
    <figure className="story" id={id} tabIndex={0} onKeyDown={(e) => (e.key === 'ArrowRight' ? next() : e.key === 'ArrowLeft' ? setI(Math.max(i - 1, 0)) : null)}>
      <div className="story-head">
        <span className="kicker">{title}</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (auto ? setAuto(false) : (last && setI(0), setAuto(true)))}>
          {auto ? '❚❚ Pause' : `▶ Autoplay${stops ? ` · ${stops} stop${stops > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
      <Stage props={propIds.map(findProp).map(up)} actors={actorIds.map(findActor).map(up)} h={bottom - top} />
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">
          {i + 1}/{frames.length}
        </span>
        {inlineCode(f.caption)}
      </figcaption>
      {f.stop && (
        <div className={'story-stop' + (f.stop.edge ? ' edge' : '')}>
          <span className="kicker red">{f.stop.edge ? 'Edge case · ' : 'Why? · '}{f.stop.title}</span>
          <div className="story-stop-body">{f.stop.body}</div>
          {waiting && (
            <button className="btn" onClick={next}>
              OK, next →
            </button>
          )}
        </div>
      )}
      <div className="story-nav">
        <button className="btn ghost" onClick={() => setI(Math.max(i - 1, 0))} disabled={i === 0} aria-label="Previous step">
          ← Back
        </button>
        <div className="story-dots">
          {frames.map((fr, k) => (
            <button key={k} className={(k === i ? 'on' : k < i ? 'seen' : '') + (fr.stop ? ' stop' : '')} onClick={() => setI(k)} aria-label={`Step ${k + 1}`} />
          ))}
        </div>
        <button className="btn" onClick={next}>
          {last ? '↺ Again' : 'Next →'}
        </button>
      </div>
    </figure>
  )
}
