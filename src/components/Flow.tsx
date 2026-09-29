import { useEffect, useState, type ReactNode } from 'react'
import { FLOW_W, FS, msgEnds, msgLabelY, resolve, type El, type FlowDef, type MsgEl, type Shown, type Tone } from './flow'
import './flow.css'

/**
 * A step-by-step SVG diagram for things a gopher stage can't draw: ladder (sequence) diagrams, timelines,
 * rings, state machines. Steps are diffs (see flow.ts). Elements keep their `id` between steps, so they fade,
 * slide and draw in. Same caption / stop-card / nav shell as <Story>.
 */
export function Flow({ title, def, id }: { title: string; def: FlowDef; id?: string }) {
  const frames = resolve(def)
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
    const t = setTimeout(() => setI((n) => n + 1), 2200)
    return () => clearTimeout(t)
  }, [auto, i, last, f.stop])
  const next = () => (last ? (setI(0), setAuto(false)) : setI(i + 1))

  // every element that ever appears stays mounted, so it can fade and slide
  const ever = new Map<string, Shown>()
  for (const fr of frames) for (const s of fr.els) ever.set(s.el.id, s)
  const here = new Map(f.els.map((s) => [s.el.id, s]))
  const stops = frames.filter((fr) => fr.stop).length

  return (
    <figure className="story flow" id={id} tabIndex={0} onKeyDown={(e) => (e.key === 'ArrowRight' ? next() : e.key === 'ArrowLeft' ? setI(Math.max(i - 1, 0)) : null)}>
      <div className="story-head">
        <span className="kicker">{title}</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (auto ? setAuto(false) : (last && setI(0), setAuto(true)))}>
          {auto ? '❚❚ Pause' : `▶ Autoplay${stops ? ` · ${stops} stop${stops > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
      <div className="fl-stage">
        <svg viewBox={`0 0 ${FLOW_W} ${def.h}`} role="img" aria-label={title}>
          {[...ever.values()]
            .sort((a, b) => (a.el.z ?? 0) - (b.el.z ?? 0))
            .map((s) => {
              const cur = here.get(s.el.id)
              return <Item key={s.el.id} s={cur ?? s} shown={!!cur} age={cur ? i - cur.born : 0} all={[...ever.values()]} />
            })}
        </svg>
      </div>
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">
          {i + 1}/{frames.length}
        </span>
        {inlineCode(f.caption as ReactNode)}
      </figcaption>
      {f.stop && (
        <div className={'story-stop' + (f.stop.edge ? ' edge' : '')}>
          <span className="kicker red">
            {f.stop.edge ? 'Edge case · ' : 'Why? · '}
            {f.stop.title}
          </span>
          <div className="story-stop-body">{f.stop.body as ReactNode}</div>
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

function inlineCode(c: ReactNode): ReactNode {
  if (typeof c !== 'string' || !c.includes('`')) return c
  return c.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') && part.endsWith('`') && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : part))
}

const cls = (tone: Tone | undefined) => 'fl-' + (tone ?? 'ink')

function Lines({ text, x = 0, y, size, cls: c, anchor = 'middle' }: { text: string; x?: number; y: number; size: number; cls?: string; anchor?: 'start' | 'middle' | 'end' }) {
  const ls = text.split('\n')
  const y0 = y - ((ls.length - 1) * size * 1.2) / 2
  return (
    <text className={c} x={x} y={y0} fontSize={size} textAnchor={anchor} dominantBaseline="central">
      {ls.map((l, k) => (
        <tspan key={k} x={x} dy={k === 0 ? 0 : size * 1.2}>
          {l}
        </tspan>
      ))}
    </text>
  )
}

function Item({ s, shown, age, all }: { s: Shown; shown: boolean; age: number; all: Shown[] }) {
  const e = s.el
  const op = shown ? (e.t === 'gopher' && e.dim ? 0.35 : 1) : 0
  switch (e.t) {
    case 'box':
      return (
        <g className="fl-el" style={{ opacity: op, transform: `translate(${e.x}px, ${e.y}px)` }}>
          <rect className={'fl-shape ' + cls(e.tone) + (e.dashed ? ' dash' : '')} width={e.w} height={e.h} rx={3} />
          {e.label && (
            <text className="fl-kick" x={8} y={13} fontSize={FS.label}>
              {e.label}
            </text>
          )}
          {e.text && <Lines text={e.text} x={e.w / 2} y={e.h / 2 + (e.label ? 6 : 0) - (e.sub ? 7 : 0)} size={FS.text} cls="fl-t" />}
          {e.sub && <Lines text={e.sub} x={e.w / 2} y={e.h / 2 + (e.label ? 6 : 0) + (e.text ? 12 : 0)} size={FS.sub} cls="fl-sub" />}
        </g>
      )
    case 'node': {
      const r = e.r ?? 26
      return (
        <g className="fl-el" style={{ opacity: op, transform: `translate(${e.x}px, ${e.y}px)` }}>
          <circle className={'fl-shape ' + cls(e.tone) + (e.dashed ? ' dash' : '')} r={r} />
          {e.text && <Lines text={e.text} y={e.sub ? -6 : 0} size={FS.text} cls="fl-t" />}
          {e.sub && <Lines text={e.sub} y={e.text ? 10 : 0} size={FS.sub} cls="fl-sub" />}
        </g>
      )
    }
    case 'lane': {
      const w = e.w ?? Math.max(70, Math.max(...e.text.split('\n').map((l) => l.length)) * FS.text * 0.6 + 16)
      const hh = 30 + (e.sub ? 16 : 0)
      return (
        <g className="fl-el" style={{ opacity: op, transform: `translate(${e.x}px, ${e.y}px)` }}>
          <line className={'fl-life' + (e.dead ? ' dead' : '')} x1={0} y1={hh} x2={0} y2={e.len} />
          <rect className={'fl-shape ' + cls(e.dead ? 'grey' : e.tone)} x={-w / 2} width={w} height={hh} rx={3} />
          <Lines text={e.text} y={e.sub ? 13 : 15} size={FS.text} cls="fl-t" />
          {e.sub && <Lines text={e.sub} y={hh - 11} size={FS.sub} cls="fl-sub" />}
          {e.dead && (
            <text className="fl-x" x={0} y={hh + 26} fontSize={22} textAnchor="middle">
              ✕
            </text>
          )}
        </g>
      )
    }
    case 'msg':
      return <Msg m={e} shown={shown} fresh={age === 0} all={all} />
    case 'line': {
      const dx = e.x2 - e.x1
      const dy = e.y2 - e.y1
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      const ax = e.x2 - ux * 9
      const ay = e.y2 - uy * 9
      return (
        <g className="fl-el" style={{ opacity: op }}>
          <line className={'fl-ln ' + cls(e.tone) + (e.dashed ? ' dash' : '')} x1={e.x1} y1={e.y1} x2={e.arrow ? ax : e.x2} y2={e.arrow ? ay : e.y2} />
          {e.arrow && <polygon className={'fl-head ' + cls(e.tone)} points={`${e.x2},${e.y2} ${ax - uy * 5},${ay + ux * 5} ${ax + uy * 5},${ay - ux * 5}`} />}
          {e.text && (
            <text className="fl-msgt" x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 6} fontSize={FS.msg} textAnchor="middle">
              {e.text}
            </text>
          )}
        </g>
      )
    }
    case 'text':
      return (
        <g className="fl-el" style={{ opacity: op, transform: `translate(${e.x}px, ${e.y}px)` }}>
          <Lines text={e.text} y={0} size={e.size ?? FS.text} cls={'fl-free ' + cls(e.tone) + (e.mono === false ? ' prop' : '')} anchor={e.anchor ?? 'middle'} />
        </g>
      )
    case 'path':
      return (
        <g className="fl-el" style={{ opacity: op }}>
          <path className={'fl-ln ' + cls(e.tone) + (e.dashed ? ' dash' : '') + (e.fill ? ' fill' : '')} d={e.d} style={e.width ? { strokeWidth: e.width } : undefined} />
        </g>
      )
    case 'gopher': {
      const h = e.h ?? 90
      const w = h * 1.2
      return (
        <g className="fl-el" style={{ opacity: op, transform: `translate(${e.x}px, ${e.y}px)` }}>
          <image href={`/gophers/${e.sprite}.webp`} x={-w / 2} y={-h} width={w} height={h} preserveAspectRatio="xMidYMax meet" transform={e.flip ? 'scale(-1,1)' : undefined} />
          {e.bubble && <Bubble text={e.bubble} y={-h - 8} />}
          {e.tag && (
            <g>
              <rect className={'fl-tagbg' + (e.hot ? ' hot' : '')} x={(-e.tag.length * 8.4) / 2 - 4} y={3} width={e.tag.length * 8.4 + 8} height={17} />
              <text className="fl-tag" y={12} fontSize={FS.label} textAnchor="middle" dominantBaseline="central">
                {e.tag}
              </text>
            </g>
          )}
        </g>
      )
    }
  }
}

function Bubble({ text, y }: { text: string; y: number }) {
  const w = text.length * FS.msg * 0.6 + 14
  return (
    <g>
      <rect className="fl-bub" x={-w / 2} y={y - 24} width={w} height={24} rx={9} />
      <text className="fl-bubt" y={y - 12} fontSize={FS.msg} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}

function Msg({ m, shown, fresh, all }: { m: MsgEl; shown: boolean; fresh: boolean; all: Shown[] }) {
  const { x1, x2, y1, y2 } = msgEnds(m, all)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const dashed = m.dashed || m.lost
  const cutoff = m.lost ? 0.58 : 1
  const ex = x1 + dx * cutoff - (m.lost ? 0 : ux * 9)
  const ey = y1 + dy * cutoff - (m.lost ? 0 : uy * 9)
  const tone = m.tone ?? 'ink'
  return (
    <g className={'fl-el fl-msg ' + cls(tone) + (fresh ? ' fresh' : ' old')} style={{ opacity: shown ? 1 : 0 }}>
      <path
        className={'fl-ln ' + (dashed ? 'dash' : 'draw')}
        d={`M${x1},${y1} L${ex},${ey}`}
        pathLength={dashed ? undefined : 1}
        style={dashed ? undefined : { strokeDasharray: 1, strokeDashoffset: shown ? 0 : 1 }}
      />
      {!m.lost && <polygon className="fl-head" points={`${x2},${y2} ${ex - uy * 5},${ey + ux * 5} ${ex + uy * 5},${ey - ux * 5}`} />}
      {m.lost && (
        <text className="fl-x" x={ex + ux * 6} y={ey + uy * 6} fontSize={22} textAnchor="middle" dominantBaseline="central">
          ✕
        </text>
      )}
      {m.text && (
        <text className="fl-msgt" x={(x1 + x2) / 2} y={msgLabelY(m, all)} fontSize={FS.msg} textAnchor="middle">
          {m.text}
        </text>
      )}
    </g>
  )
}

export type { El }
