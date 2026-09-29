import { useEffect, useMemo, useState } from 'react'
import { Lab, Stat } from '../../components/Lab'
import { buildHeap, classicStart, classicStep, greenStart, greenStep, runToEnd, type GCState, type Heap } from '../../sim/greentea'

const CACHE = 4

function HeapGrid({ h, s, mode }: { h: Heap; s: GCState; mode: 'classic' | 'green' }) {
  const cell = 15
  const W = h.perSpan * cell + 58
  const H = h.spans * (cell + 3) + 6
  const batch = new Set(s.batch)
  const lastSpan = s.trail[s.trail.length - 1]
  const rowY = (sp: number) => 3 + sp * (cell + 3) + cell / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* access trail: the last spans the marker touched, most recent darkest */}
      {s.trail.map((sp, i) => (
        <rect key={i} x={W - 26 + (i % 3) * 7} y={rowY(sp) - cell / 2} width={5} height={cell} fill="#e63946" opacity={0.15 + (0.85 * (i + 1)) / s.trail.length} />
      ))}
      {Array.from({ length: h.spans }, (_, sp) => {
        const inCache = s.cache.includes('span' + sp)
        const queued = mode === 'green' && s.queue.includes(sp)
        return (
          <g key={sp}>
            <text x={0} y={rowY(sp) + 3} fontSize={8} fill={sp === lastSpan ? '#e63946' : '#737373'} fontWeight={sp === lastSpan ? 700 : 400}>
              {queued ? '◆' : ''}s{sp}
            </text>
            <rect x={24} y={rowY(sp) - cell / 2 - 1} width={h.perSpan * cell + 2} height={cell + 2} fill="none" stroke={inCache ? '#0a0a0a' : '#ebebeb'} strokeWidth={inCache ? 1.5 : 1} />
          </g>
        )
      })}
      {h.objs.map((o) => {
        const scanned = s.scanned.has(o.id)
        const marked = s.marked.has(o.id)
        const fill = scanned ? '#0a0a0a' : marked ? '#a3a3a3' : '#fff'
        return (
          <rect
            key={o.id}
            x={25 + o.slot * cell + 1}
            y={rowY(o.span) - cell / 2 + 1}
            width={cell - 2}
            height={cell - 2}
            fill={batch.has(o.id) ? '#e63946' : fill}
            stroke="#d4d4d4"
            strokeWidth={0.6}
          />
        )
      })}
    </svg>
  )
}

export function GreenTeaLab() {
  const [fanout, setFanout] = useState(3)
  const [locality, setLocality] = useState(0.75)
  const [seed, setSeed] = useState(5)
  const heap = useMemo(() => buildHeap({ fanout, locality, seed }), [fanout, locality, seed])
  return <Race key={`${fanout}-${locality}-${seed}`} heap={heap} fanout={fanout} setFanout={setFanout} locality={locality} setLocality={setLocality} newHeap={() => setSeed(seed + 1)} />
}

type RaceProps = { heap: Heap; fanout: number; setFanout: (n: number) => void; locality: number; setLocality: (n: number) => void; newHeap: () => void }

function Race({ heap, fanout, setFanout, locality, setLocality, newHeap }: RaceProps) {
  const [c, setC] = useState<GCState>(() => classicStart(heap, CACHE))
  const [g, setG] = useState<GCState>(() => greenStart(heap, CACHE))
  const [playing, setPlaying] = useState(false)
  const final = useMemo(() => ({ c: runToEnd(heap, 'classic', CACHE), g: runToEnd(heap, 'green', CACHE) }), [heap])

  const reset = () => {
    setC(classicStart(heap, CACHE))
    setG(greenStart(heap, CACHE))
    setPlaying(false)
  }

  const step = () => {
    setC((s) => {
      if (s.done) return s
      const n = cloneState(s)
      classicStep(heap, n, CACHE)
      return n
    })
    setG((s) => {
      if (s.done) return s
      const n = cloneState(s)
      greenStep(heap, n, CACHE)
      return n
    })
  }
  useEffect(() => {
    if (!playing || (c.done && g.done)) return
    const t = setTimeout(step, 180)
    return () => clearTimeout(t)
  })

  const avg = (s: GCState) => (s.batches.length ? (s.batches.reduce((a, b) => a + b, 0) / s.batches.length).toFixed(1) : '—')
  const pct = Math.round((1 - final.g.misses / final.c.misses) * 100)

  return (
    <Lab
      title="Graph flood vs span scanning — same heap, same marks"
      controls={
        <>
          <button className="btn" onClick={step} disabled={c.done && g.done}>
            Step
          </button>
          <button className={'btn ' + (playing ? 'on' : 'ghost')} onClick={() => setPlaying(!playing)} disabled={c.done && g.done}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn ghost" onClick={reset}>
            Reset
          </button>
          <button className="btn ghost sm" onClick={newHeap}>
            New heap
          </button>
        </>
      }
      foot={
        <span>
          Each row is an 8 KiB span of small objects. Framed rows are in the modelled CPU cache (last {CACHE} regions touched); red ticks on the right are the spans it touched most recently. Classic: one object per step,
          plus an out-of-line mark-bit lookup per pointer. Green Tea: one span per step, scanning every object marked since the span was queued (◆ = queued, FIFO).
        </span>
      }
    >
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <label className="field">
          pointers / object <input type="range" min={1} max={4} value={fanout} onChange={(e) => setFanout(+e.target.value)} />
          <output>{fanout}</output>
        </label>
        <label className="field">
          same-span locality <input type="range" min={0} max={0.95} step={0.05} value={locality} onChange={(e) => setLocality(+e.target.value)} />
          <output>{Math.round(locality * 100)}%</output>
        </label>
      </div>
      <div className="two">
        {[
          { s: c, mode: 'classic' as const, title: 'Classic — LIFO of objects', f: final.c },
          { s: g, mode: 'green' as const, title: 'Green Tea — FIFO of spans', f: final.g },
        ].map(({ s, mode, title, f }) => (
          <div key={mode}>
            <span className="kicker" style={{ color: '#0a0a0a' }}>
              {title}
            </span>
            <div className="stats" style={{ marginBottom: '.5rem' }}>
              <Stat label="steps" value={s.steps} />
              <Stat label="cache misses" value={s.misses} hot={mode === 'classic'} />
              <Stat label="objs / dequeue" value={avg(s)} />
            </div>
            <HeapGrid h={heap} s={s} mode={mode} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#737373', marginTop: 4 }}>
              at the end: {f.steps} dequeues · {f.loads} memory touches · <b style={{ color: '#0a0a0a' }}>{f.misses} misses</b>
            </div>
          </div>
        ))}
      </div>
      <div className="stats" style={{ marginTop: '1rem', marginBottom: 0 }}>
        <Stat label="objects reachable" value={final.c.marked.size} />
        <Stat label="Green Tea misses vs classic" value={pct >= 0 ? `−${pct}%` : `+${-pct}%`} hot />
        <Stat label="same set marked?" value={sameSet(final.c, final.g) ? 'yes' : 'NO'} />
      </div>
    </Lab>
  )
}

function cloneState(s: GCState): GCState {
  return { ...s, marked: new Set(s.marked), scanned: new Set(s.scanned), queued: new Set(s.queued), cache: [...s.cache], trail: [...s.trail], stack: [...s.stack], queue: [...s.queue], batches: [...s.batches] }
}

function sameSet(a: GCState, b: GCState) {
  return a.marked.size === b.marked.size && [...a.marked].every((x) => b.marked.has(x))
}
