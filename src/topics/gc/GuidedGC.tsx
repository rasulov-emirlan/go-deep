import { useEffect, useMemo, useState } from 'react'
import { Stage, type Actor, type Prop } from '../../components/Story'
import { paintTown, scenarios, start, stepOne, type Barrier, type Scenario, type State, type TEvent, type TEventKind } from '../../sim/tricolor'
import { whyMark, type Card } from './explain'
import { atRoots, beside, gopher, RY, town, type House, type Road } from './town'

type Tour = { id: string; label: string; sc: Scenario; stops: TEventKind[]; barriers: boolean }

const barrierStops: TEventKind[] = ['heap-write', 'black-to-white', 'stack-write', 'barrier-insertion', 'barrier-deletion', 'insert-skipped', 'sweep-free', 'lost', 'safe']

const tours: Tour[] = [
  { id: 'plain', label: '1 · paint the town', sc: paintTown, barriers: false, stops: ['root-scan', 'shade', 'scan-black', 'alloc-black', 'mark-done', 'sweep-free', 'sweep-cycle', 'safe'] },
  { id: 'heap', label: '2 · hide it in the heap', sc: scenarios[0], barriers: true, stops: barrierStops },
  { id: 'stack-hide', label: '3 · hide it on a stack', sc: scenarios[1], barriers: true, stops: barrierStops },
  { id: 'stack-to-heap', label: '4 · stack → heap', sc: scenarios[2], barriers: true, stops: barrierStops },
]

const barriers: { v: Barrier; label: string }[] = [
  { v: 'none', label: 'No barrier' },
  { v: 'dijkstra', label: 'Dijkstra' },
  { v: 'yuasa', label: 'Yuasa' },
  { v: 'hybrid', label: 'Hybrid (Go 1.8+)' },
]

const REST = (row: number) => ({ x: 712, y: RY(row) })
const short = (say?: string) => (say ?? '').split('//')[0].trim()

function scene(s: State, fresh: TEvent[], barrier: Barrier): { actors: Actor[]; props: Prop[] } {
  const obj = (id: string) => s.objs.find((o) => o.id === id)!
  const root = (id: string) => s.roots.find((r) => r.id === id)!
  const scanning = new Set(fresh.filter((e) => e.kind === 'scan-black').flatMap((e) => e.ids))
  const hotRoads = new Set<string>()
  const gone: Road[] = []
  for (const e of fresh) {
    if (e.kind === 'scan-black') for (const id of e.ids) for (const f of obj(id).fields) if (f) hotRoads.add(`${id}>${f}`)
    if (e.kind === 'root-scan') for (const t of e.ids) hotRoads.add(`root:${e.root}>${t}`)
    if (e.kind === 'heap-write') {
      if (e.to) hotRoads.add(`${e.obj}>${e.to}`)
      if (e.old) gone.push({ from: e.obj!, to: e.old, tone: 'gone' })
    }
    if (e.kind === 'stack-write' || e.kind === 'alloc-black') {
      if (e.to) hotRoads.add(`root:${e.root}>${e.to}`)
      if (e.old) gone.push({ from: 'root:' + e.root, to: e.old, tone: 'gone' })
    }
  }
  const houses: House[] = s.objs.map((o) => ({
    id: o.id,
    col: o.x,
    row: o.y,
    label: o.id,
    tag: o.born ? 'NEW' : undefined,
    paint: o.freed ? (s.dangling.includes(o.id) ? 'lost' : 'freed') : scanning.has(o.id) ? 'red' : o.color,
  }))
  const roads: Road[] = [
    ...s.roots.flatMap((r) => r.slots.filter((t): t is string => !!t).map((t) => ({ from: 'root:' + r.id, to: t }))),
    ...s.objs.flatMap((o) => o.fields.filter((t): t is string => !!t).map((t) => ({ from: o.id, to: t }))),
  ].map((r) => (hotRoads.has(`${r.from}>${r.to}`) || s.dangling.includes(r.to) ? { ...r, tone: 'red' as const } : r))
  roads.push(...gone.filter((g) => !roads.some((r) => r.from === g.from && r.to === g.to)))

  const props = [town({ rows: [0, 1, 2], houses, roads, roots: s.roots.map((r) => ({ id: r.id, label: r.label, row: r.y, scanned: r.scanned })) })]

  // gophers
  let m = { at: REST(0), bubble: undefined as string | undefined, hot: false }
  let p = { at: REST(1), bubble: undefined as string | undefined, hot: false }
  let g = { at: REST(2), bubble: undefined as string | undefined, hot: false, dim: false }
  let sweep: Actor | null = null
  for (const e of fresh) {
    if (e.kind === 'root-scan') m = { at: atRoots(root(e.root!).y), bubble: `scan ${root(e.root!).label}`, hot: true }
    if (e.kind === 'scan-black') m = { at: beside(obj(e.ids[0]).x, obj(e.ids[0]).y), bubble: `look inside ${e.ids[0]}`, hot: true }
    if (e.kind === 'mark-done') m = { ...m, bubble: 'no grey left', hot: false }
    if (e.kind === 'heap-write') p = { at: beside(obj(e.obj!).x, obj(e.obj!).y, -1), bubble: short(e.say), hot: true }
    if (e.kind === 'stack-write') {
      p = { at: atRoots(root(e.root!).y), bubble: short(e.say), hot: true }
      g = { ...g, bubble: 'no barrier here', dim: true }
    }
    if (e.kind === 'alloc-black') p = { at: beside(obj(e.to!).x, obj(e.to!).y, -1), bubble: short(e.say), hot: true }
    if (e.kind === 'barrier-deletion' || e.kind === 'barrier-insertion')
      g = { at: beside(obj(e.ids[0]).x, obj(e.ids[0]).y), bubble: `${e.kind === 'barrier-deletion' ? 'old' : 'new'} ${e.ids[0]} → grey`, hot: true, dim: false }
    if (e.kind === 'insert-skipped') g = { ...g, bubble: 'stack black: skip', hot: false }
    if (e.kind === 'sweep-free' && e.ids.length) {
      const o = obj(e.ids[0])
      sweep = gopher('sweeper', beside(o.x, o.y, o.x === 1 ? 1 : -1), { tag: 'sweeper', bubble: `free ${e.ids.join(', ')}`, hot: true })
    }
    if (e.kind === 'lost') p = { at: REST(1), bubble: `${e.ids[0]}?! use-after-free`, hot: true }
  }
  if (sweep) m = { at: REST(0), bubble: undefined, hot: false }
  const actors: Actor[] = [
    gopher('marker', m.at, { tag: 'marker', bubble: m.bubble, hot: m.hot }),
    gopher('program', p.at, { tag: 'your program', bubble: p.bubble, hot: p.hot }),
  ]
  if (barrier !== 'none') actors.push(gopher('barrier', g.at, { tag: 'write barrier', bubble: g.bubble, hot: g.hot, dim: g.dim }))
  if (sweep) actors.push(sweep)
  return { actors, props }
}

export function GuidedGC() {
  const [tid, setTid] = useState('plain')
  const tour = tours.find((t) => t.id === tid)!
  const [barrier, setBarrier] = useState<Barrier>('none')
  const eff = tour.barriers ? barrier : 'none'
  const [sim, setSim] = useState<State>(() => start(tour.sc, eff))
  const [fresh, setFresh] = useState<TEvent[]>([])
  const [stops, setStops] = useState<TEvent[]>([])
  const [explained, setExplained] = useState<Set<TEventKind>>(new Set())
  const [auto, setAuto] = useState(false)
  const stop = stops[0] ?? null

  const reset = (id = tid, b = barrier) => {
    const t = tours.find((x) => x.id === id)!
    setSim(start(t.sc, t.barriers ? b : 'none'))
    setFresh([])
    setStops([])
    setExplained(new Set())
    setAuto(false)
  }

  const finished = sim.done
  const advance = () => {
    if (finished) return
    const s = structuredClone(sim)
    const evs = stepOne(tour.sc, s)
    const ex = new Set(explained)
    const hits: TEvent[] = []
    for (const e of evs)
      if (tour.stops.includes(e.kind) && !ex.has(e.kind) && whyMark[e.kind]) {
        ex.add(e.kind)
        hits.push(e)
      }
    setSim(s)
    setFresh(evs)
    setStops(hits)
    setExplained(ex)
  }

  useEffect(() => {
    if (!auto || stop || finished) {
      if (finished && auto) setAuto(false)
      return
    }
    const t = setTimeout(advance, 1300)
    return () => clearTimeout(t)
  })

  const { actors, props } = useMemo(() => scene(sim, fresh, eff), [sim, fresh, eff])
  const card: Card | null = stop ? whyMark[stop.kind]! : null
  const covered = tour.stops.filter((k) => whyMark[k])
  const savers = barriers.filter((b) => tour.sc.needs.includes(b.v)).map((b) => b.label)
  const outcome = finished && tour.barriers ? (sim.dangling.length ? `Lost with “${barriers.find((b) => b.v === eff)!.label}”. Saved by: ${savers.join(', ')}. Pick one above and replay.` : `Safe with “${barriers.find((b) => b.v === eff)!.label}”. Try “No barrier” to see it fail.`) : null

  return (
    <figure className="story" id="guided-gc">
      <div className="story-head">
        <span className="kicker">Guided tour · real tri-color model</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (finished ? (reset(), setAuto(true)) : setAuto(!auto))}>
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
        {tour.sc.blurb}
        {tour.barriers && (
          <span className="seg gc-seg">
            {barriers.map((b) => (
              <button
                key={b.v}
                className={barrier === b.v ? 'on' : ''}
                onClick={() => {
                  setBarrier(b.v)
                  reset(tid, b.v)
                }}
              >
                {b.label}
              </button>
            ))}
          </span>
        )}
      </p>
      <Stage actors={actors} props={props} />
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">step {sim.pc}</span>
        {fresh.length ? fresh.map((e) => short(e.text)).join(' · ') : finished ? 'Done.' : 'Press Autoplay or Step.'}
        {outcome && <b> {outcome}</b>}
      </figcaption>
      {card && stop && (
        <div className={'story-stop' + (card.edge ? ' edge' : '')}>
          <span className="kicker red">
            {card.edge ? 'Edge case · ' : 'Why? · '}
            {card.title}
          </span>
          <div className="story-stop-body">{card.body}</div>
          <button className="btn" onClick={() => setStops(stops.slice(1))}>
            {stops.length > 1 ? `OK (${stops.length - 1} more) →` : 'OK, next →'}
          </button>
        </div>
      )}
      <div className="story-nav">
        <button className="btn ghost" onClick={() => reset()}>
          ↺ Restart
        </button>
        <div className="story-chips" title="stops explained in this tour">
          {covered.map((k) => (
            <span key={k} className={explained.has(k) ? 'on' : ''}>
              {whyMark[k]!.title.split(/[:(]/)[0].trim()}
            </span>
          ))}
        </div>
        <button className="btn" onClick={advance} disabled={finished || !!stop}>
          Step →
        </button>
      </div>
    </figure>
  )
}
