import { useEffect, useMemo, useState } from 'react'
import { Stage, type Actor, type Prop } from '../../components/Story'
import { classicStart, classicStep, greenStart, greenStep, tourHeap, type GCState, type GEvent, type GEventKind } from '../../sim/greentea'
import { whyTea, type Card } from './explain'
import { gopher, RY, town, type House, type Road } from './town'

type Mode = 'classic' | 'green'
const CACHE = 2 // the CPU cache holds two streets' worth of memory in this toy
const heap = tourHeap()
const STREET = 'abc'
const name = (id: number) => STREET[heap.objs[id].span] + heap.objs[id].slot
const col = (id: number) => heap.objs[id].slot + 1
const row = (id: number) => heap.objs[id].span

const stops: Record<Mode, GEventKind[]> = {
  classic: ['c-root', 'c-scan', 'c-jump', 'c-skip', 'done'],
  green: ['g-enqueue', 'g-accumulate', 'g-dequeue-many', 'g-requeue', 'g-dequeue-one', 'done'],
}

const init = (m: Mode) => (m === 'classic' ? classicStart(heap, CACHE) : greenStart(heap, CACHE))
const runAll = (m: Mode) => {
  const s = init(m)
  while (!s.done) (m === 'classic' ? classicStep : greenStep)(heap, s, CACHE)
  return s
}
const totals = { classic: runAll('classic'), green: runAll('green') }

const doneCard: Card = {
  title: 'same houses, fewer trips',
  body: (
    <p>
      Both marked exactly the same {totals.green.scanned.size} reachable houses (a3 is garbage). Classic: <b>{totals.classic.steps} visits</b>, {totals.classic.misses} cache misses. Green Tea:{' '}
      <b>{totals.green.steps} street visits</b> (sizes {totals.green.batches.join(', ')}), {totals.green.misses} cache misses. Real heaps have hundreds of houses per street, which is where the 10–40%
      comes from.
    </p>
  ),
}
const card = (k: GEventKind) => (k === 'done' ? doneCard : whyTea[k])

function bits(span: number, set: Set<number>) {
  return heap.objs
    .filter((o) => o.span === span)
    .map((o) => (set.has(o.id) ? '1' : '0'))
    .join('')
}

function scene(mode: Mode, s: GCState, fresh: GEvent[], prev: number | null): { actors: Actor[]; props: Prop[] } {
  const batch = new Set(fresh.filter((e) => e.kind === 'c-scan' || e.kind.startsWith('g-dequeue')).flatMap((e) => e.objs))
  const houses: House[] = heap.objs.map((o) => ({
    id: 'o' + o.id,
    col: col(o.id),
    row: row(o.id),
    label: name(o.id),
    paint: batch.has(o.id) ? 'red' : s.scanned.has(o.id) ? 'black' : s.marked.has(o.id) ? 'grey' : 'white',
  }))
  const roads: Road[] = []
  if (s.steps === 0) for (const r of heap.roots) roads.push({ from: 'root:r', to: 'o' + r, tone: 'red' })
  for (const id of batch) for (const p of heap.objs[id].ptrs) roads.push({ from: 'o' + id, to: 'o' + p, tone: 'red' })
  const cur = [...batch][0]
  if (mode === 'classic' && prev !== null && cur !== undefined && row(prev) !== row(cur)) roads.push({ from: 'o' + prev, to: 'o' + cur, tone: 'trail' })
  const notes = mode === 'green' ? Object.fromEntries([0, 1, 2].map((r) => [r, `seen ${bits(r, s.marked)} · scanned ${bits(r, s.scanned)}`])) : undefined
  const props: Prop[] = [
    town({ rows: [0, 1, 2], houses, roads, roots: [{ id: 'r', label: 'roots', row: 0, scanned: true }], notes, streetLabel: (r) => `STREET ${STREET[r]} · 8 KIB SPAN` }),
    {
      id: 'work',
      x: 330,
      y: 2,
      w: 262,
      h: 54,
      tone: fresh.some((e) => e.kind === 'g-enqueue' || e.kind === 'g-requeue') ? 'red' : 'dashed',
      label: mode === 'green' ? 'FIFO queue' : 'LIFO stack',
      text: mode === 'green' ? s.queue.map((q) => 'street ' + STREET[q]).join(' → ') || 'empty' : s.stack.map(name).join(' ') || 'empty',
    },
    { id: 'count', x: 600, y: 2, w: 192, h: 54, tone: fresh.some((e) => e.misses > 0) ? 'red' : 'soft', label: 'misses', text: `${s.misses} / ${s.loads} trips` },
  ]
  const actors: Actor[] = []
  if (mode === 'classic') {
    const at = cur !== undefined ? { x: 130 + col(cur) * 150 + (col(cur) === 4 ? -62 : 62), y: RY(row(cur)) } : { x: 192, y: RY(0) }
    const jump = fresh.some((e) => e.kind === 'c-jump')
    actors.push(gopher('marker', at, { tag: 'marker', bubble: cur !== undefined ? (jump ? 'new street: miss!' : `scan ${name(cur)}`) : s.done ? 'done' : undefined, hot: jump }))
  } else {
    const deq = fresh.find((e) => e.kind.startsWith('g-dequeue'))
    actors.push(
      gopher('pirate', { x: 192, y: RY(deq ? deq.span : 0) }, {
        tag: 'span scanner',
        bubble: deq ? (deq.objs.length > 1 ? `${deq.objs.length} at once!` : 'just one') : s.done ? 'done' : undefined,
        hot: !!deq,
      }),
    )
  }
  return { actors, props }
}

export function GuidedGreenTea() {
  const [mode, setMode] = useState<Mode>('classic')
  const [sim, setSim] = useState<GCState>(() => init('classic'))
  const [fresh, setFresh] = useState<GEvent[]>(() => init('classic').events)
  const [prev, setPrev] = useState<number | null>(null)
  const [queue, setQueue] = useState<GEvent[]>([])
  const [explained, setExplained] = useState<Set<GEventKind>>(new Set())
  const [auto, setAuto] = useState(false)
  const stop = queue[0] ?? null

  const reset = (m = mode) => {
    const s = init(m)
    setSim(s)
    setFresh(s.events)
    setPrev(null)
    setQueue([])
    setExplained(new Set())
    setAuto(false)
  }
  const advance = () => {
    if (sim.done) return
    const s = structuredClone(sim)
    const n = s.events.length
    const last = [...sim.batch][0]
    ;(mode === 'classic' ? classicStep : greenStep)(heap, s, CACHE)
    const evs = s.events.slice(n)
    const ex = new Set(explained)
    const hits: GEvent[] = []
    const all = sim.steps === 0 ? [...sim.events, ...evs] : evs // root events from the start are explained on the first step
    for (const e of all)
      if (stops[mode].includes(e.kind) && !ex.has(e.kind) && card(e.kind)) {
        ex.add(e.kind)
        hits.push(e)
      }
    setPrev(sim.steps === 0 ? null : (last ?? null))
    setSim(s)
    setFresh(evs)
    setQueue(hits)
    setExplained(ex)
  }

  useEffect(() => {
    if (!auto || stop || sim.done) {
      if (sim.done && auto && !stop) setAuto(false)
      return
    }
    const t = setTimeout(advance, 1300)
    return () => clearTimeout(t)
  })

  const { actors, props } = useMemo(() => scene(mode, sim, fresh, prev), [mode, sim, fresh, prev])
  const c = stop ? card(stop.kind)! : null
  const caption = fresh.length ? fresh.map((e) => e.text.replace(/#(\d+)/g, (_, d) => name(+d)).replace(/span (\d)/g, (_, d) => 'street ' + STREET[+d])).join(' · ') : 'Press Autoplay or Step.'

  return (
    <figure className="story" id="guided-tea">
      <div className="story-head">
        <span className="kicker">Guided tour · classic vs Green Tea, same heap</span>
        <button className={'btn sm ' + (auto ? 'on' : 'ghost')} onClick={() => (sim.done ? (reset(), setAuto(true)) : setAuto(!auto))}>
          {auto ? '❚❚ Pause' : '▶ Autoplay'}
        </button>
      </div>
      <div className="story-tabs">
        {(['classic', 'green'] as const).map((m) => (
          <button
            key={m}
            className={m === mode ? 'on' : ''}
            onClick={() => {
              setMode(m)
              reset(m)
            }}
          >
            {m === 'classic' ? '1 · classic: house by house' : '2 · Green Tea: street by street'}
          </button>
        ))}
      </div>
      <p className="story-blurb">
        Three streets (spans) of four houses. Roots point at a0 and a1. The toy CPU cache remembers only the last {CACHE} pieces of memory it touched, so every trip elsewhere is a miss.
      </p>
      <Stage actors={actors} props={props} />
      <figcaption className="story-cap" aria-live="polite">
        <span className="story-count">step {sim.steps}</span>
        {caption}
      </figcaption>
      {c && stop && (
        <div className={'story-stop' + (c.edge ? ' edge' : '')}>
          <span className="kicker red">
            {c.edge ? 'Edge case · ' : 'Why? · '}
            {c.title}
          </span>
          <div className="story-stop-body">{c.body}</div>
          <button className="btn" onClick={() => setQueue(queue.slice(1))}>
            {queue.length > 1 ? `OK (${queue.length - 1} more) →` : 'OK, next →'}
          </button>
        </div>
      )}
      <div className="story-nav">
        <button className="btn ghost" onClick={() => reset()}>
          ↺ Restart
        </button>
        <div className="story-chips" title="stops explained in this tour">
          {stops[mode].map((k) => (
            <span key={k} className={explained.has(k) ? 'on' : ''}>
              {card(k)!.title}
            </span>
          ))}
        </div>
        <button className="btn" onClick={advance} disabled={sim.done || !!stop}>
          Step →
        </button>
      </div>
    </figure>
  )
}
