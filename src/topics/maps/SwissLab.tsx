import { useEffect, useState } from 'react'
import { Lab, Seg, Stat } from '../../components/Lab'
import { DELETED, EMPTY, del, get, len, newMap, put, tables, tombstones, type Group, type Step, type SwissMap } from '../../sim/swiss'

const WORDS = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ')

function cloneMap(m: SwissMap): SwissMap {
  const tabs = new Map(tables(m).map((t) => [t.id, structuredClone(t)]))
  return { ...m, small: m.small ? structuredClone(m.small) : null, dir: m.dir.map((t) => tabs.get(t.id)!) }
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

export function Bits({ hash, depth }: { hash: bigint; depth: number }) {
  const bits = hash.toString(2).padStart(64, '0')
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, wordBreak: 'break-all', lineHeight: 1.7 }}>
      {bits.split('').map((b, i) => {
        const band = i < depth ? 'dir' : i >= 57 ? 'h2' : 'h1'
        const style =
          band === 'h2' ? { background: '#e63946', color: '#fff' } : band === 'dir' ? { background: '#0a0a0a', color: '#fafafa' } : { background: i % 8 < 4 ? '#f5f5f5' : '#ebebeb' }
        return (
          <span key={i} style={{ ...style, padding: '1px 1px', marginRight: i % 8 === 7 ? 4 : 0 }}>
            {b}
          </span>
        )
      })}
    </div>
  )
}

function GroupRow({ g, tid, gi, active, marks, onPick }: { g: Group; tid: number; gi: number; active: Step | undefined; marks: Map<string, string>; onPick?: (k: string) => void }) {
  const probing = active && (active.t === 'probe' || active.t === 'miss') && active.table === tid && active.group === gi
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, outline: probing ? '2px solid #e63946' : undefined, outlineOffset: 1 }}>
      <div style={{ width: 26, fontFamily: 'var(--mono)', fontSize: 10, color: '#737373', display: 'flex', alignItems: 'center' }}>g{gi}</div>
      {g.ctrl.map((c, s) => {
        const k = `${tid}:${gi}:${s}`
        const mark = marks.get(k)
        const full = c !== EMPTY && c !== DELETED
        const hl = active && 'slot' in active && active.table === tid && active.group === gi && active.slot === s
        const matchHl = probing && active.t === 'probe' && active.match.includes(s)
        return (
          <div
            key={s}
            title={full ? `${g.keys[s]} · h2=0x${hex2(c)} · click to delete` : c === DELETED ? 'tombstone 0xFE' : 'empty 0x80'}
            onClick={() => full && onPick?.(g.keys[s]!)}
            style={{
              cursor: full ? 'pointer' : undefined,
              width: 38,
              height: 38,
              border: '1px solid #d4d4d4',
              marginLeft: -1,
              background: c === DELETED ? '#0a0a0a' : full ? (mark === 'place' ? '#e63946' : '#fff') : '#f5f5f5',
              color: c === DELETED || mark === 'place' ? '#fff' : '#0a0a0a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mono)',
              position: 'relative',
              boxShadow: hl || matchHl ? 'inset 0 0 0 2px #e63946' : undefined,
              transition: 'background .2s ease',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: full ? undefined : c === DELETED ? '#fff' : '#a3a3a3' }}>{full ? hex2(c) : c === DELETED ? 'FE' : '80'}</span>
            <span style={{ fontSize: 8, maxWidth: 36, overflow: 'hidden', whiteSpace: 'nowrap', opacity: 0.8 }}>{full ? g.keys[s] : c === DELETED ? 'tomb' : ''}</span>
          </div>
        )
      })}
      {probing && active.t === 'probe' && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#e63946', alignSelf: 'center', marginLeft: 6 }}>probe #{active.i}</span>
      )}
    </div>
  )
}

function describe(s: Step): string {
  switch (s.t) {
    case 'hash':
      return `hash("${s.key}") → H1=…${(s.h1 & 0xffffn).toString(16)} H2=0x${hex2(s.h2)}` + (s.dirIdx !== null ? ` · top bits → directory[${s.dirIdx}]` : ' · small map: one group, no directory')
    case 'probe':
      return `probe #${s.i}: group ${s.group} — matchH2 → [${s.match.join(',') || '∅'}], empty slots [${s.empty.join(',') || '∅'}]`
    case 'cmp':
      return `compare key in slot ${s.slot}: ${s.eq ? 'equal ✓' : 'H2 false positive, keep going'}`
    case 'place':
      return s.reuse === 'update' ? `key exists → overwrite value in slot ${s.slot}` : `insert into slot ${s.slot} (${s.reuse === 'tombstone' ? 'reusing a tombstone' : 'empty slot, growthLeft--'})`
    case 'delete':
      return s.to === 'empty' ? `delete: group still has an empty slot → mark EMPTY (0x80)` : `delete: group is full → leave a TOMBSTONE (0xFE) so later probes keep going`
    case 'miss':
      return `group ${s.group} has an empty slot → key cannot be further along. Not found.`
    case 'grow':
      return s.note
    case 'dirDouble':
      return `directory doubles → globalDepth ${s.depth}: every entry duplicated, other tables now span 2 entries`
  }
}

export function SwissLab() {
  const [maxCap, setMaxCap] = useState(32)
  const [m, setM] = useState(() => newMap(32))
  const [key, setKey] = useState('alpha')
  const [steps, setSteps] = useState<Step[]>([])
  const [cur, setCur] = useState(0)
  const [result, setResult] = useState('')
  const [n, setN] = useState(0)

  useEffect(() => {
    if (cur >= steps.length - 1) return
    const t = setTimeout(() => setCur((c) => c + 1), 650)
    return () => clearTimeout(t)
  }, [cur, steps])

  const run = (op: 'put' | 'get' | 'del', k = key) => {
    const next = cloneMap(m)
    let st: Step[]
    if (op === 'put') {
      st = put(next, k, n)
      setN(n + 1)
      setResult(`m["${k}"] = ${n}`)
    } else if (op === 'get') {
      const r = get(next, k)
      st = r.steps
      setResult(r.found ? `m["${k}"] → ${r.val}, true` : `m["${k}"] → 0, false`)
    } else {
      st = del(next, k)
      setResult(`delete(m, "${k}")`)
    }
    setM(next)
    setSteps(st)
    setCur(0)
  }
  const bulk = (count: number) => {
    const next = cloneMap(m)
    let last: Step[] = []
    let i = n
    for (let c = 0; c < count; c++, i++) last = put(next, WORDS[i % WORDS.length] + (i >= WORDS.length ? i : ''), i)
    setN(i)
    setM(next)
    setSteps(last)
    setCur(last.length - 1)
    setResult(`inserted ${count} keys`)
  }
  const reset = (cap = maxCap) => {
    setM(newMap(cap))
    setSteps([])
    setResult('')
    setN(0)
  }

  const active = steps[cur]
  const hashStep = steps.filter((s): s is Extract<Step, { t: 'hash' }> => s.t === 'hash').at(-1)
  const marks = new Map<string, string>()
  const placed = steps.slice(0, cur + 1).find((s) => s.t === 'place')
  if (placed && placed.t === 'place') marks.set(`${placed.table}:${placed.group}:${placed.slot}`, 'place')
  const tabs = tables(m)

  return (
    <Lab
      title="Swiss map lab"
      controls={
        <>
          <span className="field">maxTableCapacity</span>
          <Seg
            value={maxCap}
            onChange={(v) => {
              setMaxCap(v)
              reset(v)
            }}
            options={[16, 32, 64].map((v) => ({ v, label: String(v) }))}
          />
          <button className="btn ghost" onClick={() => reset()}>
            Reset
          </button>
        </>
      }
      foot={
        <span>
          Real Go caps a table at <b>1024</b> slots; shrunk here so you can watch tables double and split. Everything else — 8-slot groups, 7-bit H2, 7/8 load, triangular probing, tombstones, small-map
          mode, extendible-hash directory — follows <code>internal/runtime/maps</code>. The hash function is a stand-in (Go uses AES-based hashing with a per-map random seed).
        </span>
      }
    >
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <label className="field">
          key
          <input type="text" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run('put')} />
        </label>
        <button className="btn" onClick={() => run('put')}>
          m[k] = v
        </button>
        <button className="btn ghost" onClick={() => run('get')}>
          v, ok := m[k]
        </button>
        <button className="btn ghost" onClick={() => run('del')}>
          delete
        </button>
        <button className="btn ghost sm" onClick={() => bulk(1)}>
          +1 key
        </button>
        <button className="btn ghost sm" onClick={() => bulk(8)}>
          +8 keys
        </button>
        <button className="btn ghost sm" onClick={() => bulk(40)}>
          +40 keys
        </button>
      </div>
      <div className="stats">
        <Stat label="len(m)" value={len(m)} />
        <Stat label="mode" value={m.small || !m.dir.length ? 'small' : 'tables'} />
        <Stat label="tables" value={tabs.length} />
        <Stat label="globalDepth" value={m.globalDepth} />
        <Stat label="tombstones" value={tombstones(m)} hot={tombstones(m) > 0} />
      </div>

      {hashStep && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="legend">
            <span>
              <i style={{ background: '#0a0a0a' }} />
              top {m.globalDepth} bits → directory
            </span>
            <span>
              <i style={{ background: '#ebebeb' }} />
              H1 = hash &gt;&gt; 7 → start group
            </span>
            <span>
              <i style={{ background: '#e63946' }} />
              H2 = low 7 bits → control byte
            </span>
          </div>
          <Bits hash={hashStep.hash} depth={m.small || !m.dir.length ? 0 : m.globalDepth} />
        </div>
      )}

      {steps.length > 0 && (
        <div style={{ border: '1px solid #d4d4d4', padding: '.6rem .8rem', marginBottom: '1rem', background: '#fafafa', fontFamily: 'var(--mono)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <b>{result}</b>
            <span style={{ display: 'flex', gap: 4 }}>
              <button className="btn ghost sm" onClick={() => setCur(0)}>
                ⟲ replay
              </button>
              <button className="btn ghost sm" onClick={() => setCur(steps.length - 1)}>
                skip
              </button>
            </span>
          </div>
          {steps.slice(0, cur + 1).map((s, i) => (
            <div key={i} style={{ color: i === cur ? '#0a0a0a' : '#737373', fontWeight: i === cur ? 600 : 400 }}>
              {String(i + 1).padStart(2, '0')} {describe(s)}
            </div>
          ))}
        </div>
      )}

      {m.small || !m.dir.length ? (
        <div>
          <span className="kicker">Small map — a single group, no table, no directory (≤ 8 entries)</span>
          {m.small ? <GroupRow g={m.small} tid={-1} gi={0} active={active} marks={marks} onPick={(k) => run('del', k)} /> : <p style={{ color: '#737373', fontSize: 14 }}>Nothing allocated yet: make(map) with hint ≤ 8 allocates on the first write.</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(7rem, auto) 1fr', gap: '1rem', alignItems: 'start' }} className="swiss-grid">
          <div>
            <span className="kicker">Directory · 2^{m.globalDepth}</span>
            {m.dir.map((t, i) => (
              <div
                key={i}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  border: '1px solid #0a0a0a',
                  marginTop: -1,
                  padding: '3px 6px',
                  background: hashStep?.dirIdx === i ? '#0a0a0a' : '#fff',
                  color: hashStep?.dirIdx === i ? '#fafafa' : undefined,
                }}
              >
                [{i.toString(2).padStart(Math.max(1, m.globalDepth), '0')}] → T{t.id}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: '1rem', overflowX: 'auto' }}>
            {tabs.map((t) => (
              <div key={t.id}>
                <span className="kicker" style={{ color: '#0a0a0a' }}>
                  Table T{t.id} · {t.used}/{t.capacity} used · growthLeft {t.growthLeft} · localDepth {t.localDepth}
                </span>
                <div style={{ display: 'grid', gap: 3 }}>
                  {t.groups.map((g, gi) => (
                    <GroupRow key={gi} g={g} tid={t.id} gi={gi} active={active} marks={marks} onPick={(k) => run('del', k)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="legend" style={{ marginTop: '1rem', marginBottom: 0 }}>
        <span>
          <i style={{ background: '#fff' }} />
          full: H2 byte
        </span>
        <span>
          <i style={{ background: '#f5f5f5' }} />
          empty 0x80
        </span>
        <span>
          <i style={{ background: '#0a0a0a' }} />
          tombstone 0xFE
        </span>
        <span>
          <i style={{ background: '#e63946' }} />
          just inserted
        </span>
        <span>tap a full slot to delete it</span>
      </div>
    </Lab>
  )
}

/** SWAR matchH2 on one control word, bit by bit. */
export function ControlWordLab() {
  const [ctrl, setCtrl] = useState<number[]>([0x80, 0x2a, 0x80, 0x80, 0x15, 0x80, 0x80, 0x80])
  const [h, setH] = useState(0x15)
  const lsb = 0x0101010101010101n
  const msb = 0x8080808080808080n
  const M = (1n << 64n) - 1n
  const word = ctrl.reduce((a, b, i) => a | (BigInt(b) << BigInt(8 * i)), 0n)
  const v = word ^ (lsb * BigInt(h))
  const r = ((v - lsb) & ~v & msb) & M
  const empty = (word & ~(word << 6n)) & msb & M
  const hx = (x: bigint) =>
    (x & M)
      .toString(16)
      .padStart(16, '0')
      .match(/../g)!
      .join(' ')
  const slots = (b: bigint) => [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => (b >> BigInt(8 * i + 7)) & 1n)
  const cycle = (i: number) =>
    setCtrl((c) => {
      const n = [...c]
      n[i] = n[i] === 0x80 ? h : n[i] === h ? 0xfe : n[i] === 0xfe ? (h + 1) & 0x7f : 0x80
      return n
    })
  const matches = slots(r)
  const real = ctrl.flatMap((c, i) => (c === h ? [i] : []))
  return (
    <Lab
      title="Control word lab — 8 slots, one 64-bit compare"
      controls={
        <button className="btn ghost sm" onClick={() => (setCtrl([0x02, 0x03, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), setH(2))}>
          Load false-positive case
        </button>
      }
      foot={<span>Tap a byte to cycle it: empty → H2 → tombstone → other → empty. On amd64 the compiler replaces this arithmetic with SSE2 PCMPEQB + PMOVMSKB.</span>}
    >
      <div className="controls" style={{ marginBottom: '.8rem' }}>
        <label className="field">
          looking for H2 = 0x
          <input type="text" value={h.toString(16)} onChange={(e) => setH(parseInt(e.target.value, 16) & 0x7f || 0)} style={{ width: '3.5rem' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: '.8rem', flexWrap: 'wrap' }}>
        {[...ctrl].reverse().map((c, ri) => {
          const i = 7 - ri
          const m = matches.includes(i)
          return (
            <button
              key={i}
              onClick={() => cycle(i)}
              style={{
                width: 48,
                height: 48,
                border: '1px solid #0a0a0a',
                marginLeft: -1,
                background: c === 0xfe ? '#0a0a0a' : c === 0x80 ? '#f5f5f5' : '#fff',
                color: c === 0xfe ? '#fff' : '#0a0a0a',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: m ? 'inset 0 0 0 3px #e63946' : undefined,
              }}
            >
              {hex2(c)}
              <div style={{ fontSize: 8, fontWeight: 400, color: c === 0xfe ? '#ccc' : '#737373' }}>slot {i}</div>
            </button>
          )
        })}
      </div>
      <pre className="code light" style={{ fontSize: 12 }}>
        {`ctrl                    = ${hx(word)}
v = ctrl ^ (0x01…01·h2) = ${hx(v)}      // matching bytes become 00
(v - 0x01…01) &^ v      = ${hx((v - lsb) & ~v)}
  & 0x80…80  → match    = ${hx(r)}      // high bit set = candidate
matchEmpty              = ${hx(empty)}`}
      </pre>
      <div className="stats" style={{ marginBottom: 0 }}>
        <Stat label="candidates" value={`[${matches.join(',')}]`} />
        <Stat label="true matches" value={`[${real.join(',')}]`} />
        <Stat label="false positives" value={matches.filter((x) => !real.includes(x)).length} hot={matches.some((x) => !real.includes(x))} />
        <Stat label="empty slots" value={`[${slots(empty).join(',')}]`} />
      </div>
    </Lab>
  )
}

