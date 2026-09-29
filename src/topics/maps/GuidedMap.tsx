import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Stage, type Actor, type Prop } from '../../components/Story'
import { DELETED, EMPTY, tables, type Group, type Step, type SwissMap } from '../../sim/swiss'
import { buildTours, type Kind, type Tour, type TourFrame } from './tours'
import { why } from './explain'

const W = 800

/** Wide: directory column + 2 table columns. Narrow (phones): directory band + 1 big table column. */
type Geo = { top: number; hikerH: number; narrow: boolean; cols: number[]; cw: number; lightH: number; lockH: number; row: number; dirBand: number }
const WIDE: Geo = { top: 132, hikerH: 80, narrow: false, cols: [104, 448], cw: 38, lightH: 18, lockH: 30, row: 56, dirBand: 0 }
const NARROW: Geo = { top: 176, hikerH: 124, narrow: true, cols: [8], cw: 92, lightH: 26, lockH: 40, row: 74, dirBand: 58 }
const tw = (g: Geo) => 8 * g.cw + 12
const tableH = (g: Geo, groups: number) => 28 + groups * g.row

const hex = (n: number) => n.toString(16).padStart(2, '0')
const bits = (i: number, depth: number) => (depth ? i.toString(2).padStart(depth, '0') : '·')

type Box = { id: string; x: number; y: number; groups: Group[]; label: string; tid: number }

function layout(s: SwissMap, G: Geo): { boxes: Box[]; h: number } {
  const TOP = G.top
  const y0 = TOP + 8 + G.dirBand
  const one = y0 + tableH(G, 1) + 16
  if (s.small) return { boxes: [{ id: 'small', x: G.cols[0], y: y0, groups: [s.small], label: `small map · ${s.used}/8 · no table`, tid: -1 }], h: one }
  const ts = tables(s)
  if (!ts.length) return { boxes: [], h: one }
  const n = G.cols.length
  const th = Math.max(...ts.map((t) => tableH(G, t.groups.length)))
  const boxes = ts.map((t, i) => ({
    id: 't' + t.id,
    x: G.cols[i % n],
    y: y0 + Math.floor(i / n) * (th + 18),
    groups: t.groups,
    label: `T${t.id} · ${t.used}/${t.capacity} slots · depth ${t.localDepth}`,
    tid: t.id,
  }))
  return { boxes, h: y0 + Math.ceil(ts.length / n) * (th + 18) }
}

const where = (st: Step | null) => (st && 'group' in st ? { table: st.table, group: st.group, slot: 'slot' in st ? st.slot : -1 } : null)

function scene(f: TourFrame, G: Geo): { actors: Actor[]; props: Prop[]; h: number } {
  const { state: s, step } = f
  const { boxes, h } = layout(s, G)
  const props: Prop[] = []
  const at = where(step)
  const probe = step?.t === 'probe' ? step : null
  const TW = tw(G)
  const TOP = G.top

  // directory (signpost): a column on wide screens, a band under the lobby on phones
  const dirBox = (i: number) => (G.narrow ? { x: 10 + i * 190, y: TOP + 14, w: 180, h: 36 } : { x: 4, y: TOP + 34 + i * 34, w: 92, h: 28 })
  if (s.dir.length) {
    if (!G.narrow) props.push({ id: 'dirlbl', x: 4, y: TOP + 8, w: 92, h: 22, tone: 'none', label: 'directory' })
    s.dir.forEach((t, i) => {
      const hot = step?.t === 'hash' && step.dirIdx === i
      const dd = step?.t === 'dirDouble'
      props.push({ id: 'dir' + i, ...dirBox(i), tone: hot ? 'red' : dd ? 'soft' : 'line', text: <span className="mp-dir">{`${bits(i, s.globalDepth)} → T${t.id}`}</span> })
    })
  } else props.push({ id: 'dirlbl', ...dirBox(0), h: G.narrow ? 36 : 60, tone: 'dashed', text: <span className="mp-dir">no directory</span> })

  if (!boxes.length) props.push({ id: 'nothing', x: G.cols[0], y: TOP + 8 + G.dirBand, w: TW, h: tableH(G, 1), tone: 'dashed', text: 'nothing allocated yet' })

  for (const b of boxes) {
    props.push({ id: b.id, x: b.x, y: b.y, w: TW, h: tableH(G, b.groups.length), tone: 'line', label: b.label })
    b.groups.forEach((g, gi) => {
      const gy = b.y + 28 + gi * G.row
      const here = at && at.table === b.tid && at.group === gi
      props.push({ id: `${b.id}g${gi}`, x: b.x + TW, y: gy + 4, w: 34, h: G.lightH + G.lockH - 8, tone: 'none', text: <span className={'mp-dir' + (here ? ' mp-hot' : '')}>g{gi}</span> })
      if (here) props.push({ id: 'rowhl', x: b.x + 3, y: gy - 4, w: TW - 6, h: G.row - 2, tone: 'red' })
      g.ctrl.forEach((c, si) => {
        const x = b.x + 6 + si * G.cw
        const hot = here && (si === at!.slot || (probe !== null && probe.match.includes(si)))
        const full = c !== EMPTY && c !== DELETED
        props.push({
          id: `${b.id}l${gi}.${si}`,
          x: x + 4,
          y: gy,
          w: G.cw - 8,
          h: G.lightH,
          tone: hot ? 'red' : c === DELETED ? 'ink' : full ? 'line' : 'dashed',
          text: <span className="mp-light">{full ? hex(c) : c === DELETED ? '×' : ''}</span>,
        })
        props.push({
          id: `${b.id}k${gi}.${si}`,
          x: x + 1,
          y: gy + G.lightH + 3,
          w: G.cw - 2,
          h: G.lockH,
          tone: here && si === at!.slot ? 'red' : c === DELETED ? 'ink' : full ? 'line' : 'soft',
          text: <span className="mp-key">{full ? g.keys[si] : c === DELETED ? '†' : ''}</span>,
        })
      })
    })
  }

  // ticket: what the hiker is doing right now
  const op = f.op
  if (op && op.k !== 'fill') {
    const hs = step?.t === 'hash' ? step : null
    const code = op.k === 'put' ? `m["${op.key}"] = ${op.val}` : op.k === 'get' ? `v, ok := m["${op.key}"]` : `delete(m, "${op.key}")`
    props.push({
      id: 'ticket',
      x: G.narrow ? 150 : 150,
      y: G.narrow ? 40 : 46,
      w: G.narrow ? 640 : 460,
      h: G.narrow ? 120 : 70,
      tone: 'line',
      label: 'ticket',
      text: (
        <span className="mp-ticket">
          <code>{code}</code>
          {hs && (
            <span>
              H2 = <b>{hex(hs.h2)}</b>
              {hs.dirIdx !== null ? ` · directory[${bits(hs.dirIdx, s.globalDepth)}]` : ' · one group'}
            </span>
          )}
        </span>
      ),
    })
  }

  const hiker: Actor = {
    id: 'hiker',
    sprite: 'adventure-hiking',
    x: G.narrow ? 72 : 64,
    y: TOP - 8,
    h: G.hikerH,
    tag: op && op.k !== 'fill' ? `"${op.key}"` : undefined,
    hot: !!at,
    bubble: bubble(step),
    hidden: !op || op.k === 'fill',
    z: 5,
  }
  const moving = step && (step.t === 'grow' || step.t === 'dirDouble' || step.t === 'prune')
  const mover: Actor = {
    id: 'mover',
    sprite: step?.t === 'dirDouble' ? 'fairy-tale-king' : 'adventure-pushing-cart',
    x: G.narrow ? 720 : 690,
    y: TOP - 8,
    h: 80,
    tag: step?.t === 'dirDouble' ? 'directory' : 'rehash',
    hot: true,
    bubble: moving ? moverBubble(step) : undefined,
    hidden: !moving,
    z: 4,
  }
  return { actors: [hiker, mover], props, h }
}

function bubble(st: Step | null): string | undefined {
  if (!st) return undefined
  switch (st.t) {
    case 'hash':
      return st.dirIdx === null ? 'one group only' : 'which group?'
    case 'probe':
      return `group ${st.group}: ` + (st.match.length ? `${st.match.length} match` : st.empty.length ? 'no match' : 'full, walk on')
    case 'cmp':
      return st.eq ? 'it’s me!' : 'not me!'
    case 'place':
      return st.reuse === 'update' ? 'updated' : st.reuse === 'tombstone' ? 'reused ×' : 'moved in!'
    case 'delete':
      return st.to === 'empty' ? 'emptied' : 'tombstone'
    case 'miss':
      return 'not here'
    case 'grow':
    case 'prune':
      return 'no room!'
    default:
      return undefined
  }
}

function moverBubble(st: Step): string {
  if (st.t === 'grow') return st.kind === 'split' ? `split ${st.moved} keys` : `move ${st.moved} keys`
  if (st.t === 'prune') return st.freed ? `freed ${st.freed} ×` : 'can’t free any'
  if (st.t === 'dirDouble') return 'directory ×2'
  return ''
}

const k = (s: string) => <code>{s}</code>

function caption(f: TourFrame, tour: Tour): ReactNode {
  const st = f.step
  const op = f.op
  if (!op) return tour.id === 'small' ? 'An empty map. Press Step or Autoplay.' : 'The starting state. Press Step or Autoplay.'
  if (op.k === 'fill') return `Fast-forward: ${op.keys.length} more keys move in, no surprises.`
  const key = `"${op.key}"`
  if (!st) return null
  switch (st.t) {
    case 'hash':
      return st.dirIdx === null ? (
        <>
          Hash {key}: its fingerprint (H2) is {k(hex(st.h2))}. A small map has one group, so that’s all it needs.
        </>
      ) : (
        <>
          Hash {key}: the top bits pick the table, H1 picks the starting group, and H2 = {k(hex(st.h2))} is the fingerprint.
        </>
      )
    case 'probe': {
      const g = `Group ${st.group}`
      if (st.match.length) return `${g}: all 8 lights are compared with the fingerprint at once, and ${st.match.length} match${st.match.length > 1 ? '' : 'es'}.`
      if (st.empty.length) return `${g}: no light matches the fingerprint.`
      return `${g}: no light matches, and there’s no empty light, so ${key} could be further along.`
    }
    case 'cmp':
      return st.eq ? `Open locker ${st.slot} and compare the whole key: it’s ${key}.` : `Open locker ${st.slot}: the fingerprint matched, but the key inside isn’t ${key}.`
    case 'place':
      if (st.reuse === 'update') return `${key} already lives here, so only its value is overwritten.`
      if (st.reuse === 'tombstone') return `${key} moves into the tombstone it passed earlier.`
      return `${key} moves into the first empty locker of group ${st.group}.`
    case 'delete':
      return st.to === 'empty' ? `${key} is removed and its locker is simply empty again.` : `${key} is removed, but its light becomes a tombstone (×), not empty.`
    case 'miss':
      return st.table === -1 ? `No locker in the group holds ${key}, so it isn’t in the map.` : `Group ${st.group} has an empty light, so ${key} isn’t anywhere further: not found.`
    case 'grow':
      if (st.kind === 'small→table') return `The small map is full: it becomes a ${st.to}-slot table (2 groups) and all 8 keys are re-inserted.`
      if (st.kind === 'double') return `The ${st.from}-slot table is 7/8 full: all ${st.moved} keys move to a new ${st.to}-slot table.`
      return `The table is at max size (${st.from}): it splits into two ${st.to}-slot tables by the next top hash bit.`
    case 'dirDouble':
      return `The directory doubles to ${2 ** st.depth} entries: every old entry now appears twice.`
    case 'prune':
      return st.freed ? `The table is out of room, but ${st.tombstones} slots are tombstones: ${st.freed} of them are freed instead of growing.` : `Out of room, and every tombstone is still needed, so the table must grow.`
  }
}

export function GuidedMap() {
  const tours = useMemo(() => buildTours(), [])
  const [tid, setTid] = useState(tours[0].id)
  const tour = tours.find((t) => t.id === tid)!
  const [i, setI] = useState(0)
  const [stops, setStops] = useState<Kind[]>(() => firstStops(tour, 0, new Set()))
  const [explained, setExplained] = useState<Set<Kind>>(() => new Set(firstStops(tour, 0, new Set())))
  const [auto, setAuto] = useState(false)
  const f = tour.frames[i]
  const last = i === tour.frames.length - 1
  const stop = stops[0] ?? null

  const reset = (id = tid) => {
    const t = tours.find((x) => x.id === id)!
    const s = firstStops(t, 0, new Set())
    setI(0)
    setStops(s)
    setExplained(new Set(s))
    setAuto(false)
  }
  const advance = () => {
    if (last) return
    const n = i + 1
    const hits = firstStops(tour, n, explained)
    setI(n)
    setStops(hits)
    setExplained(new Set([...explained, ...hits]))
  }

  useEffect(() => {
    if (!auto || stop || last) {
      if (last && !stop) setAuto(false)
      return
    }
    const t = setTimeout(advance, 1200)
    return () => clearTimeout(t)
  })

  const narrow = useNarrow()
  const sc = useMemo(() => scene(f, narrow ? NARROW : WIDE), [f, narrow])
  const card = stop ? why[stop] : null

  return (
    <figure className="story mp-guided mp-scenes">
      <div className="story-head">
        <span className="kicker">Guided tour · real Swiss-map model</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (last ? (reset(), setAuto(true)) : setAuto(!auto))}>
          {auto ? '❚❚ Pause' : '▶ Autoplay'}
        </button>
      </div>
      <div className="story-tabs">
        {tours.map((t) => (
          <button
            key={t.id}
            className={t.id === tid ? 'on' : ''}
            onClick={() => {
              setTid(t.id)
              reset(t.id)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="story-blurb">
        {tour.blurb}
        <span className="mp-legend">
          <i className="l-full">5a</i> light = fingerprint (H2) <i className="l-empty" /> empty <i className="l-tomb">×</i> tombstone <i className="l-hot" /> this step
        </span>
      </p>
      <Stage actors={sc.actors} props={sc.props} w={W} h={sc.h} />
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">
          {i + 1}/{tour.frames.length}
        </span>
        {caption(f, tour)}
        {f.result && <b className="mp-result"> {f.result}</b>}
      </figcaption>
      {card && (
        <div className={'story-stop' + (card.edge ? ' edge' : '')}>
          <span className="kicker red">
            {card.edge ? 'Edge case · ' : 'Why? · '}
            {card.title}
          </span>
          <div className="story-stop-body">{card.body}</div>
          <button className="btn" onClick={() => setStops(stops.slice(1))}>
            {stops.length > 1 ? `OK, next (${stops.length - 1} more) →` : 'OK, next →'}
          </button>
        </div>
      )}
      <div className="story-nav">
        <span className="mp-navl">
          <button className="btn ghost" onClick={() => reset()} aria-label="Restart">
            ↺
          </button>
          <button className="btn ghost" onClick={() => (setStops([]), setAuto(false), setI(Math.max(0, i - 1)))} disabled={i === 0} aria-label="Back">
            ←
          </button>
        </span>
        <div className="story-chips" title="cases explained in this tour">
          {tour.stops.map((s) => (
            <span key={s} className={explained.has(s) ? 'on' : ''}>
              {why[s].chip}
            </span>
          ))}
        </div>
        <button className="btn" onClick={advance} disabled={last || !!stop}>
          {last ? 'Done' : 'Step →'}
        </button>
      </div>
      <p className="mp-chipcount">
        {tour.stops.filter((s) => explained.has(s)).length}/{tour.stops.length} cases seen
      </p>
    </figure>
  )
}

function firstStops(t: Tour, i: number, seen: Set<Kind>): Kind[] {
  const out: Kind[] = []
  for (const k of t.frames[i].kinds) if (t.stops.includes(k) && !seen.has(k) && !out.includes(k)) out.push(k)
  return out
}

const PHONE = '(max-width: 640px)'
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia(PHONE)
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => window.matchMedia(PHONE).matches,
  )
}
