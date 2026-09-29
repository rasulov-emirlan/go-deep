import { useState } from 'react'
import { Lab } from '../../components/Lab'
import { sameCopy, shapeOf, TYPES, verdict, type TypeArg } from './shapelab'

function Pick({ name, value, onChange }: { name: string; value: TypeArg; onChange: (t: TypeArg) => void }) {
  return (
    <div className="gn-pick" role="group" aria-label={name}>
      <span className="gn-pname">{name}</span>
      <div className="gn-chips">
        {TYPES.map((t) => (
          <button key={t} className={t === value ? 'on' : ''} aria-pressed={t === value} onClick={() => onChange(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ShapeLab() {
  const [a, setA] = useState<TypeArg>('*User')
  const [b, setB] = useState<TypeArg>('*Order')
  const one = sameCopy(a, b)
  return (
    <Lab title="Shape lab" className="gn-lab">
      <p className="gn-try">Pick two type arguments for <code>F[T any]</code>. Do they share one compiled copy?</p>
      <div className="gn-picks">
        <Pick name="F[first]" value={a} onChange={setA} />
        <Pick name="F[second]" value={b} onChange={setB} />
      </div>
      <div className={'gn-result' + (one ? ' one' : '')} aria-live="polite">
        <b>{one ? 'One copy' : 'Two copies'}</b>
        <span>{verdict(a, b)}</span>
      </div>
      <div className="gn-shapes">
        <code>{shapeOf(a)}</code>
        {!one && <code>{shapeOf(b)}</code>}
      </div>
    </Lab>
  )
}
