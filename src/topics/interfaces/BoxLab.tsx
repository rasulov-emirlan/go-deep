import { useState } from 'react'
import { Lab, Seg } from '../../components/Lab'
import { box, valSrc, type Val } from './box'

const vals = (Object.keys(valSrc) as Val[]).map((v) => ({ v, label: valSrc[v] }))

export function BoxLab() {
  const [val, setVal] = useState<Val>('typedNil')
  const b = box(val)
  return (
    <Lab title="Nil box">
      <p className="if-try">Pick a value and see if err == nil.</p>
      <Seg value={val} onChange={setVal} options={vals} />
      <pre className="if-lab-code">{b.code}</pre>
      <div className="if-words">
        <div className={'if-word' + (b.type ? (b.data ? '' : ' hot') : ' empty')}>
          <span>type</span>
          <b>{b.type ?? 'nil'}</b>
        </div>
        <div className={'if-word' + (b.data ? '' : ' empty')}>
          <span>value</span>
          <b>{b.data ?? 'nil'}</b>
        </div>
      </div>
      <p className={'if-verdict' + (b.isNil ? '' : ' r')} aria-live="polite">
        err == nil → {String(b.isNil)}
      </p>
    </Lab>
  )
}
