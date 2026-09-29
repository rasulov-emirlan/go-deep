/**
 * Pure model behind <Flow>: diagram steps are written as DIFFS ("add this arrow", "turn that node red"),
 * and `resolve` folds them into the full picture for every step. Also holds the layout checks the tests use.
 */

export type Tone = 'ink' | 'red' | 'grey' | 'soft'

type Base = { id: string; z?: number }

/** rectangle with optional label (mono kicker), centered text and a smaller sub line */
export type BoxEl = Base & { t: 'box'; x: number; y: number; w: number; h: number; text?: string; sub?: string; label?: string; tone?: Tone; dashed?: boolean }
/** circle centered on x,y */
export type NodeEl = Base & { t: 'node'; x: number; y: number; r?: number; text?: string; sub?: string; tone?: Tone; dashed?: boolean }
/** sequence-diagram participant: a head box at (x,y) and a dashed lifeline that runs `len` units down */
export type LaneEl = Base & { t: 'lane'; x: number; y: number; len: number; text: string; sub?: string; tone?: Tone; w?: number; dead?: boolean }
/**
 * arrow. Endpoints are x1,y1 → x2,y2 (y2 defaults to y1), or `from`/`to` = ids of lanes/nodes/boxes (their x);
 * a slanted arrow (y2 > y1) shows travel time. `lost` draws it dashed and stops it with ✕ before the target.
 */
export type MsgEl = Base & {
  t: 'msg'
  y: number
  y2?: number
  x1?: number
  x2?: number
  from?: string
  to?: string
  text?: string
  tone?: Tone
  dashed?: boolean
  lost?: boolean
  /** which side of the line the label sits on (default above) */
  below?: boolean
}
/** free line or arrow between two points */
export type LineEl = Base & { t: 'line'; x1: number; y1: number; x2: number; y2: number; tone?: Tone; dashed?: boolean; arrow?: boolean; text?: string }
export type TextEl = Base & { t: 'text'; x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end'; tone?: Tone; mono?: boolean }
/** raw SVG path (rings, arcs, brackets). Not layout-checked. */
export type PathEl = Base & { t: 'path'; d: string; tone?: Tone; dashed?: boolean; fill?: boolean; width?: number }
/** gopher sprite standing with its feet at x,y; optional speech bubble and tag */
export type GopherEl = Base & { t: 'gopher'; sprite: string; x: number; y: number; h?: number; bubble?: string; tag?: string; flip?: boolean; dim?: boolean; hot?: boolean }

export type El = BoxEl | NodeEl | LaneEl | MsgEl | LineEl | TextEl | PathEl | GopherEl

export type FlowStop = { title: string; body: unknown; edge?: boolean }
export type FlowStep = {
  caption: unknown
  /** elements new in this step */
  add?: El[]
  /** change fields of existing elements by id */
  set?: Record<string, Record<string, unknown>>
  /** remove elements */
  drop?: string[]
  stop?: FlowStop
}
export type FlowDef = { h: number; steps: FlowStep[] }

export const FLOW_W = 560

export type Shown = { el: El; born: number }
export type Resolved = { caption: unknown; stop?: FlowStop; els: Shown[] }

export function resolve(def: FlowDef): Resolved[] {
  const live = new Map<string, Shown>()
  return def.steps.map((s, i) => {
    for (const id of s.drop ?? []) live.delete(id)
    for (const e of s.add ?? []) {
      if (live.has(e.id)) throw new Error(`flow: duplicate id "${e.id}" in step ${i + 1}`)
      live.set(e.id, { el: e, born: i })
    }
    for (const [id, patch] of Object.entries(s.set ?? {})) {
      const cur = live.get(id)
      if (!cur) throw new Error(`flow: set on missing id "${id}" in step ${i + 1}`)
      live.set(id, { ...cur, el: { ...cur.el, ...patch } as El })
    }
    return { caption: s.caption, stop: s.stop, els: [...live.values()] }
  })
}

/** x of a lane/node/box, for message endpoints */
export function anchorX(els: Shown[], id: string): number {
  const e = els.find((s) => s.el.id === id)?.el
  if (!e) throw new Error(`flow: no element "${id}" to anchor a message to`)
  if (e.t === 'box') return e.x + e.w / 2
  if (e.t === 'node' || e.t === 'lane' || e.t === 'gopher' || e.t === 'text') return e.x
  throw new Error(`flow: cannot anchor to "${id}" (${e.t})`)
}

export function msgEnds(m: MsgEl, els: Shown[]) {
  const x1 = m.x1 ?? anchorX(els, m.from!)
  const x2 = m.x2 ?? anchorX(els, m.to!)
  return { x1, x2, y1: m.y, y2: m.y2 ?? m.y }
}

/** baseline y of a message label: clear of the slanted line across the label's whole width */
export function msgLabelY(m: MsgEl, els: Shown[]): number {
  const { x1, x2, y1, y2 } = msgEnds(m, els)
  const w = (m.text ?? '').length * FS.msg * 0.6
  const cx = (x1 + x2) / 2
  const at = (x: number) => y1 + ((x - x1) / (x2 - x1 || 1)) * (y2 - y1)
  const [a, b] = [at(cx - w / 2), at(cx + w / 2)]
  return m.below ? Math.max(a, b) + FS.msg + 3 : Math.min(a, b) - 6
}

/* ---- layout estimate (tests + nothing at runtime) ---- */

export type Rect = { x: number; y: number; w: number; h: number }
const CH = 0.6 // mono glyph width / font size
export const FS = { text: 15, sub: 13, label: 12, msg: 14 }

const lines = (s?: string) => (s ? s.split('\n') : [])
const textW = (s: string | undefined, size: number) => Math.max(0, ...lines(s).map((l) => l.length)) * size * CH

/** rectangles that must not overlap one another: the inked footprint of each element */
export function footprint(e: El, els: Shown[]): Rect[] {
  switch (e.t) {
    case 'box':
      return [{ x: e.x, y: e.y, w: e.w, h: e.h }]
    case 'node': {
      const r = e.r ?? 26
      return [{ x: e.x - r, y: e.y - r, w: 2 * r, h: 2 * r }]
    }
    case 'lane': {
      const w = e.w ?? Math.max(70, textW(e.text, FS.text) + 16)
      return [{ x: e.x - w / 2, y: e.y, w, h: 30 + (e.sub ? 16 : 0) }]
    }
    case 'text': {
      const size = e.size ?? FS.text
      const w = textW(e.text, size)
      const h = lines(e.text).length * size * 1.25
      const x = e.anchor === 'middle' || !e.anchor ? e.x - w / 2 : e.anchor === 'end' ? e.x - w : e.x
      return [{ x, y: e.y - size, w, h }]
    }
    case 'msg': {
      if (!e.text) return []
      const { x1, x2 } = msgEnds(e, els)
      const w = textW(e.text, FS.msg)
      return [{ x: (x1 + x2) / 2 - w / 2, y: msgLabelY(e, els) - FS.msg + 1, w, h: FS.msg + 2 }]
    }
    case 'line': {
      if (!e.text) return []
      const w = textW(e.text, FS.msg)
      return [{ x: (e.x1 + e.x2) / 2 - w / 2, y: (e.y1 + e.y2) / 2 - FS.msg - 3, w, h: FS.msg + 2 }]
    }
    case 'gopher': {
      const h = e.h ?? 90
      const out: Rect[] = [{ x: e.x - h * 0.4, y: e.y - h, w: h * 0.8, h }]
      if (e.bubble) {
        const w = textW(e.bubble, FS.msg) + 14
        out.push({ x: e.x - w / 2, y: e.y - h - 30, w, h: 24 })
      }
      return out
    }
    default:
      return []
  }
}

const overlap = (a: Rect, b: Rect, tol = 2) => a.x + tol < b.x + b.w && b.x + tol < a.x + a.w && a.y + tol < b.y + b.h && b.y + tol < a.y + a.h
const contains = (a: Rect, b: Rect, tol = 1) => a.x - tol <= b.x && a.y - tol <= b.y && a.x + a.w + tol >= b.x + b.w && a.y + a.h + tol >= b.y + b.h

/** human-readable layout problems for one resolved step (empty = fine) */
export function problems(step: Resolved, h: number): string[] {
  const out: string[] = []
  const rects = step.els.map((s) => ({ id: s.el.id, t: s.el.t, rs: footprint(s.el, step.els) }))
  for (const r of rects)
    for (const q of r.rs)
      if (q.x < -1 || q.y < -1 || q.x + q.w > FLOW_W + 1 || q.y + q.h > h + 1) out.push(`${r.id} sticks out of the ${FLOW_W}×${h} stage`)
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      for (const ra of a.rs)
        for (const rb of b.rs) {
          if (!overlap(ra, rb)) continue
          // a box may hold other things; a node may sit in a box
          if ((a.t === 'box' && contains(ra, rb)) || (b.t === 'box' && contains(rb, ra))) continue
          out.push(`${a.id} overlaps ${b.id}`)
        }
    }
  return [...new Set(out)]
}
