import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { box, valSrc, type Recv, type Target, type Val } from './box'

const vals = (Object.keys(valSrc) as Val[]).map((v) => ({ v, label: valSrc[v] }))

export function BoxLab() {
  const [target, setTarget] = useState<Target>('error')
  const [recv, setRecv] = useState<Recv>('ptr')
  const [val, setVal] = useState<Val>('typedNil')
  const b = box(target, recv, val)
  return (
    <Lab title="Interface box" foot="Only the first choice gives x == nil. Try T{} with each receiver.">
      <div className="if-lab-row">
        <span className="kicker">method</span>
        <Seg value={recv} onChange={setRecv} options={[{ v: 'ptr', label: 'func (*T) Error' }, { v: 'value', label: 'func (T) Error' }]} />
      </div>
      <div className="if-lab-row">
        <span className="kicker">var x</span>
        <Seg value={target} onChange={setTarget} options={[{ v: 'error', label: 'error' }, { v: 'any', label: 'any' }]} />
      </div>
      <div className="if-lab-row">
        <span className="kicker">= </span>
        <Seg value={val} onChange={setVal} options={vals} />
      </div>
      <pre className="if-lab-code">{b.code}</pre>
      {b.ok ? (
        <>
          <div className="if-words">
            <div className={'if-word' + (b.word1 ? (b.data === null ? ' hot' : '') : ' empty')}>
              <span>word 1 · {b.word1Label}</span>
              <b>{b.word1 ?? 'nil'}</b>
            </div>
            <div className={'if-word' + (b.data ? '' : ' empty')}>
              <span>word 2 · data</span>
              <b>{b.data ?? 'nil'}</b>
            </div>
          </div>
          <p className="if-verdict">
            <code>x == nil</code> → <b className={b.isNil ? '' : 'r'}>{String(b.isNil)}</b>
          </p>
          <p className="if-note">{b.note}</p>
        </>
      ) : (
        <p className="if-err">
          <span className="kicker red">compile error</span>
          {b.error}
        </p>
      )}
    </Lab>
  )
}
