import { useState } from 'react'
import { Code } from '../../components/Code'
import { Lab, Seg } from '../../components/Lab'
import { layout, orders, words, type Byte } from './layout'

type Order = keyof typeof orders

/** Runs of neighbouring bytes owned by the same field (or padding), within one word. */
function runs(row: Byte[]) {
  const out: { field: string | null; n: number }[] = []
  for (const b of row) {
    const last = out[out.length - 1]
    if (last && last.field === b.field && !b.first) last.n++
    else out.push({ field: b.field, n: 1 })
  }
  return out
}

export function LayoutLab() {
  const [order, setOrder] = useState<Order>('bad')
  const fields = orders[order]
  const l = layout(fields)
  const src = ['type Order struct {', ...fields.map((f) => `    ${f.name.padEnd(5)} ${f.type}`), '}'].join('\n')
  return (
    <Lab
      title="Field order lab"
      className="ml-lab"
      foot="On 32-bit CPUs an int64 aligns to only 4 bytes; atomic.Int64 always aligns to 8."
      controls={
        <Seg
          value={order}
          onChange={setOrder}
          options={[
            { v: 'bad', label: 'Bad order' },
            { v: 'good', label: 'Good order' },
          ]}
        />
      }
    >
      <p className="ml-try">Flip the order. Same fields, different size.</p>
      <div className="ml-lab-grid">
        <Code>{src}</Code>
        <div>
          <div className="ml-words" aria-label={`${l.size} bytes, ${l.padding} of them padding`}>
            {words(l.bytes).map((row, r) => (
              <div className="ml-word" key={r}>
                {runs(row).map((run, i) => (
                  <span key={i} className={'ml-cell' + (run.field ? '' : ' pad')} style={{ gridColumn: `span ${run.n}` }}>
                    {run.field ?? 'pad'}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="ml-size" aria-live="polite">
            <b className={order === 'bad' ? 'hot' : ''}>{l.size} B</b>
            <span>{l.padding} B of red padding</span>
          </p>
        </div>
      </div>
    </Lab>
  )
}
