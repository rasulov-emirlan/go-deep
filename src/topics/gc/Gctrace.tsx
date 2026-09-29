import { useState } from 'react'
import { Lab } from '../../components/Lab'

const SAMPLE = 'gc 3 @0.008s 25%: 0.046+0.35+2.5 ms clock, 0.37+0.043/0.12/0+20 ms cpu, 3->3->0 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 8 P'

type Field = { re: RegExp; name: string; say: (m: RegExpMatchArray) => string }

const FIELDS: Field[] = [
  { re: /gc (\d+)/, name: 'cycle', say: (m) => `GC cycle #${m[1]} since program start.` },
  { re: /@([\d.]+)s/, name: 'when', say: (m) => `Started ${m[1]}s after program start (at sweep termination).` },
  { re: / (\d+)%:/, name: 'GC %', say: (m) => `${m[1]}% of all CPU since program start went to GC — cumulative, not this cycle. Creeping up = GC eating throughput.` },
  {
    re: /([\d.]+)\+([\d.]+)\+([\d.]+) ms clock/,
    name: 'wall clock',
    say: (m) => `Wall time: ${m[1]} ms STW sweep termination (write barrier on) + ${m[2]} ms concurrent mark + ${m[3]} ms STW mark termination. Only the 1st and 3rd are pauses.`,
  },
  {
    re: /([\d.]+)\+([\d.]+)\/([\d.]+)\/([\d.]+)\+([\d.]+) ms cpu/,
    name: 'CPU',
    say: (m) =>
      `CPU time: ${m[1]} STW + ${m[2]} mark ASSISTS (your goroutines doing GC work — the latency you feel) / ${m[3]} dedicated+fractional background workers / ${m[4]} idle workers (free CPU) + ${m[5]} STW. Assists ≫ background = allocating faster than GOGC allows.`,
  },
  {
    re: /(\d+)->(\d+)->(\d+) MB/,
    name: 'heap',
    say: (m) => `Heap ${m[1]} MB when GC started → ${m[2]} MB when marking finished (allocation continued meanwhile) → ${m[3]} MB actually live (marked). The next goal is computed from ${m[3]}.`,
  },
  { re: /(\d+) MB goal/, name: 'goal', say: (m) => `This cycle’s heap goal. If the middle heap number exceeds ${m[1]}, the pacer overshot. 4 MB is the floor (4 MiB × GOGC/100).` },
  { re: /(\d+) MB stacks/, name: 'stacks', say: (m) => `${m[1]} MB of scannable goroutine stacks — counted in the goal formula since Go 1.18.` },
  { re: /(\d+) MB globals/, name: 'globals', say: (m) => `${m[1]} MB of scannable globals — also part of the goal formula.` },
  { re: /(\d+) P/, name: 'P', say: (m) => `GOMAXPROCS during the cycle: ${m[1]}. Background workers get 25% of these.` },
]

export function GctraceDecoder() {
  const [line, setLine] = useState(SAMPLE)
  const [hi, setHi] = useState(3)
  const found = FIELDS.map((f) => ({ f, m: line.match(f.re) }))
  const cur = found[hi]
  let spans: { text: string; i: number | null }[] = [{ text: line, i: null }]
  if (cur?.m && cur.m.index !== undefined) {
    const a = cur.m.index
    const b = a + cur.m[0].length
    spans = [
      { text: line.slice(0, a), i: null },
      { text: line.slice(a, b), i: hi },
      { text: line.slice(b), i: null },
    ]
  }
  return (
    <Lab title="gctrace decoder" controls={<button className="btn ghost sm" onClick={() => setLine(SAMPLE)}>Real sample</button>}>
      <label className="field" style={{ width: '100%', marginBottom: '.7rem' }}>
        <input type="text" value={line} onChange={(e) => setLine(e.target.value)} style={{ width: '100%' }} aria-label="gctrace line" />
      </label>
      <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {spans.map((s, k) => (
          <span key={k} style={s.i !== null ? { background: '#e63946', color: '#fff' } : undefined}>
            {s.text}
          </span>
        ))}
      </pre>
      <div className="controls" style={{ marginBottom: '.7rem' }}>
        {found.map(({ f, m }, i) => (
          <button key={f.name} className={'btn sm ' + (i === hi ? 'on' : 'ghost')} disabled={!m} onClick={() => setHi(i)}>
            {f.name}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, minHeight: '3em' }}>{cur?.m ? cur.f.say(cur.m) : 'Field not found in this line.'}</p>
    </Lab>
  )
}
