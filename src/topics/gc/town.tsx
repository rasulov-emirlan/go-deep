import type { ReactNode } from 'react'
import type { Actor, Prop } from '../../components/Story'

/**
 * "Paint the reachable town": houses (objects) on streets (8 KiB spans),
 * roads (pointers) between them, roots in the station on the left.
 * The whole town is one full-width Story prop holding an SVG, so every GC
 * scene shares the same map.
 */

export type Paint = 'white' | 'grey' | 'black' | 'red' | 'freed' | 'lost'
export type House = { id: string; col: number; row: number; paint: Paint; label?: string; tag?: string; big?: boolean }
export type Road = { from: string; to: string; tone?: 'ink' | 'red' | 'gone' | 'faint' | 'trail' }
export type RootBox = { id: string; label: string; row: number; scanned?: boolean; hot?: boolean }
export type TownSpec = {
  rows: number[] // which street rows to draw
  houses: House[]
  roads?: Road[]
  roots?: RootBox[]
  streetLabel?: (row: number) => string
  notes?: Record<number, ReactNode> // per-row mono note at the right end of the street
  top?: number
}

export const W = 800
export const H = 360
export const RY = (row: number) => 130 + row * 105 // street baseline
export const CX = (col: number) => 130 + col * 150 // house centre
const HW = 22 // half house width
const HH = 44 // house height incl. roof

const INK = '#0a0a0a'
const RED = '#e63946'
const G300 = '#d4d4d4'
const G500 = '#737373'

type Pt = { x: number; y: number }

function centre(h: House): Pt {
  return { x: CX(h.col), y: RY(h.row) - 18 }
}

function endpoint(id: string, spec: TownSpec): Pt | null {
  if (id.startsWith('root:')) {
    const r = spec.roots?.find((x) => x.id === id.slice(5))
    return r ? { x: 118, y: RY(r.row) - 22 } : null
  }
  const h = spec.houses.find((x) => x.id === id)
  return h ? centre(h) : null
}

function roadPath(a: Pt, b: Pt, fromRoot: boolean) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  // bend to the left of travel; same-row roads arc over the houses in between
  const bend = fromRoot ? Math.min(30, d * 0.12) : Math.min(60, 18 + d * 0.16)
  const mx = (a.x + b.x) / 2 + (dy / d) * bend
  const my = (a.y + b.y) / 2 - (dx / d) * bend
  const trim = (p: Pt, q: Pt, by: number) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1
    return { x: p.x + ((q.x - p.x) / l) * by, y: p.y + ((q.y - p.y) / l) * by }
  }
  const s = fromRoot ? a : trim(a, { x: mx, y: my }, HW + 2)
  const e = trim(b, { x: mx, y: my }, HW + 6)
  // arrow head along the curve's end tangent
  const tx = e.x - mx
  const ty = e.y - my
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const head = `M${e.x + ux * 2},${e.y + uy * 2} L${e.x - ux * 11 - uy * 6},${e.y - uy * 11 + ux * 6} L${e.x - ux * 11 + uy * 6},${e.y - uy * 11 - ux * 6} Z`
  return { d: `M${s.x},${s.y} Q${mx},${my} ${e.x},${e.y}`, head }
}

function HouseShape({ h }: { h: House }) {
  const { x } = centre(h)
  const base = RY(h.row)
  const hw = h.big ? 60 : HW
  const body = 26
  const fill = { white: '#fff', grey: '#a3a3a3', black: INK, red: RED, freed: 'none', lost: 'none' }[h.paint]
  const stroke = h.paint === 'red' || h.paint === 'lost' ? RED : h.paint === 'freed' ? G300 : INK
  const dash = h.paint === 'freed' || h.paint === 'lost' ? '5 4' : undefined
  const text = h.paint === 'black' || h.paint === 'red' ? '#fff' : h.paint === 'freed' ? G300 : h.paint === 'lost' ? RED : INK
  return (
    <g className="gc-house">
      <path
        d={`M${x - hw},${base} V${base - body} L${x},${base - HH} L${x + hw},${base - body} V${base} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.5}
        strokeDasharray={dash}
        strokeLinejoin="round"
      />
      {h.label && (
        <text x={x} y={base - 7} textAnchor="middle" fontSize={17} fontWeight={700} fill={text} fontFamily="var(--mono)">
          {h.label}
        </text>
      )}
      {h.tag && (
        <text x={x} y={base - HH - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={RED} fontFamily="var(--mono)">
          {h.tag}
        </text>
      )}
    </g>
  )
}

function TownSvg({ spec }: { spec: TownSpec }) {
  const top = spec.top ?? 0
  const freed = new Set(spec.houses.filter((h) => h.paint === 'freed').map((h) => h.id))
  const roads = (spec.roads ?? []).flatMap((r) => {
    if (freed.has(r.from) || freed.has(r.to)) return []
    const a = endpoint(r.from, spec)
    const b = endpoint(r.to, spec)
    if (!a || !b) return []
    return [{ ...r, ...roadPath(a, b, r.from.startsWith('root:')) }]
  })
  return (
    <svg className="gc-town" viewBox={`0 ${top} ${W} ${H - top}`} preserveAspectRatio="none" aria-hidden>
      {spec.rows.map((r) => (
        <g key={'st' + r}>
          <line x1={150} x2={W - 8} y1={RY(r)} y2={RY(r)} stroke={G300} strokeWidth={4} />
          <text x={152} y={RY(r) + 15} fontSize={11} fill={G500} fontFamily="var(--mono)" letterSpacing=".06em">
            {spec.streetLabel ? spec.streetLabel(r) : `STREET ${r + 1} · 8 KIB SPAN`}
          </text>
          {spec.notes?.[r] && (
            <text x={W - 10} y={RY(r) + 15} fontSize={12} fill={INK} textAnchor="end" fontFamily="var(--mono)" fontWeight={600}>
              {spec.notes[r]}
            </text>
          )}
        </g>
      ))}
      {spec.roots && spec.roots.length > 0 && (
        <g>
          <rect x={10} y={RY(Math.min(...spec.roots.map((r) => r.row))) - 78} width={116} height={RY(Math.max(...spec.roots.map((r) => r.row))) - RY(Math.min(...spec.roots.map((r) => r.row))) + 86} fill="#f5f5f5" />
          <text x={16} y={RY(Math.min(...spec.roots.map((r) => r.row))) - 64} fontSize={11} fill={G500} fontFamily="var(--mono)" letterSpacing=".06em">
            ROOTS
          </text>
          {spec.roots.map((r) => (
            <g key={r.id} className="gc-house">
              <rect x={18} y={RY(r.row) - 44} width={100} height={44} fill={r.scanned ? INK : '#fff'} stroke={r.hot ? RED : INK} strokeWidth={r.hot ? 3.5 : 2} />
              <text x={68} y={RY(r.row) - 17} textAnchor="middle" fontSize={13} fontWeight={700} fill={r.scanned ? '#fff' : INK} fontFamily="var(--mono)">
                {r.label}
              </text>
            </g>
          ))}
        </g>
      )}
      {roads.map((r) => {
        const c = r.tone === 'red' || r.tone === 'trail' ? RED : r.tone === 'gone' ? G300 : r.tone === 'faint' ? G300 : INK
        const w = r.tone === 'red' ? 3.5 : r.tone === 'trail' ? 3 : 2
        return (
          <g key={r.from + '>' + r.to} className="gc-road">
            <path d={r.d} fill="none" stroke={c} strokeWidth={w} strokeDasharray={r.tone === 'gone' || r.tone === 'trail' ? '7 5' : undefined} strokeLinecap="round" />
            {r.tone !== 'gone' && <path d={r.head} fill={c} />}
          </g>
        )
      })}
      {spec.houses.map((h) => (
        <HouseShape key={h.id} h={h} />
      ))}
    </svg>
  )
}

/** The town as a single Story prop. Put it first in every frame's props so it draws underneath. */
export function town(spec: TownSpec): Prop {
  const top = spec.top ?? 0
  return { id: 'town', x: 0, y: top, w: W, h: H - top, tone: 'none', text: <TownSvg spec={spec} /> }
}

// ---- gopher cast ------------------------------------------------------------------------

export const SPR = {
  marker: 'science-lightbulb',
  program: 'fairy-tale-messenger-running',
  sweeper: 'fairy-tale-witch-broom',
  pirate: 'adventure-pirate-lifting-goods',
  barrier: 'science-welding',
}

/** Where a gopher stands to work on a house: right of it (marker) or left of it (program). */
export const beside = (col: number, row: number, side: 1 | -1 = 1) => ({ x: CX(col) + side * 62, y: RY(row) })
export const atRoots = (row: number) => ({ x: 192, y: RY(row) })

export const gopher = (id: keyof typeof SPR, at: { x: number; y: number }, more: Partial<Actor> = {}): Actor => ({
  id,
  sprite: SPR[id],
  x: at.x,
  y: at.y,
  h: 72,
  ...more,
})
