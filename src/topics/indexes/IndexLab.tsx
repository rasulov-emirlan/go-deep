import { useMemo, useState, type ChangeEvent } from 'react'
import { Seg } from '../../components/Lab'
import { buildTree, lookup } from './btree'

const T = buildTree()

export function IndexLab() {
  const [mode, setMode] = useState<'key' | 'range'>('key')
  const [cols, setCols] = useState<'star' | 'id'>('star')
  const [lo, setLo] = useState(130)
  const [hi, setHi] = useState(160)
  const top = mode === 'key' ? lo : hi
  const v = useMemo(() => lookup(T, lo, top, cols === 'id'), [lo, top, cols])
  const hit = new Set(v.hits)
  const total = v.indexPages + v.heapFetches
  const num = (set: (n: number) => void) => (e: ChangeEvent<HTMLInputElement>) => set(Math.max(0, Math.min(999, Number(e.target.value) || 0)))

  return (
    <div className="lab ix-lab">
      <div className="lab-head">
        <span className="kicker">Lab · B-tree lookup</span>
        <Seg value={mode} onChange={setMode} options={[{ v: 'key', label: 'id =' }, { v: 'range', label: 'between' }]} />
      </div>
      <div className="lab-body">
        <div className="ix-ctl">
          <label className="field">
            <span>{mode === 'key' ? 'id' : 'from'}</span>
            <input type="number" step={5} value={lo} onChange={num(setLo)} />
          </label>
          {mode === 'range' && (
            <label className="field">
              <span>to</span>
              <input type="number" step={5} value={hi} onChange={num(setHi)} />
            </label>
          )}
          <Seg value={cols} onChange={setCols} options={[{ v: 'star', label: 'select *' }, { v: 'id', label: 'select id' }]} />
        </div>

        <div className="ix-tree">
          <div className="ix-row">
            <div className="ix-pg on">
              <i>root</i>
              {T.root.seps.join(' · ')}
            </div>
          </div>
          <div className="ix-row">
            {T.inner.map((n, i) => (
              <div key={i} className={'ix-pg' + (v.inner === i ? ' on' : '')}>
                {n.seps.join(' · ')}
              </div>
            ))}
          </div>
          <div className="ix-row ix-leaves">
            {T.leaves.map((l, i) => (
              <div key={i} className={'ix-pg ix-leafpg' + (v.leaves.includes(i) ? ' on' : '')}>
                {l.keys.map((k) => (
                  <span key={k} className={hit.has(k) ? 'hit' : undefined}>
                    {k}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <span className="ix-cap">heap · rows in insertion order, 4 per page</span>
          <div className="ix-heap">
            {T.heap.map((rows, p) => (
              <div key={p} className={'ix-pg ix-heappg' + (v.heapPages.includes(p) ? ' on' : '')}>
                {rows.map((k) => (
                  <span key={k} className={hit.has(k) && cols === 'star' ? 'hit' : undefined}>
                    {k}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="ix-score">
          <div>
            <b>{v.indexPages}</b> index pages
          </div>
          <div>
            <b>{v.heapFetches}</b> heap fetches{v.heapFetches > v.heapPages.length && <small> ({v.heapPages.length} pages)</small>}
          </div>
          <div className={total > v.seqPages ? 'bad' : 'good'}>
            <b>{total}</b> vs <b>{v.seqPages}</b> Seq Scan
          </div>
        </div>
        <p className="ix-note">
          {v.hits.length === 0
            ? 'No match: the descent alone proves the key is absent, with zero heap reads.'
            : total > v.seqPages
              ? 'Too many matches: the jumps cost more than reading the whole heap once. The planner would pick a Seq Scan or a Bitmap Heap Scan.'
              : mode === 'key'
                ? 'Toy size: Postgres would still Seq Scan 12 pages. At 1M rows this lookup is 4 pages vs 9,346.'
                : 'Index cost grows with the matches; Seq Scan cost grows with the table. Widen the range to find the crossover.'}
        </p>
      </div>
    </div>
  )
}
