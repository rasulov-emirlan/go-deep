/** The "interface box" lab: what `var x <target> = <value>` stores in the two interface words. */

export type Target = 'error' | 'any'
export type Recv = 'ptr' | 'value' // func (*T) Error() vs func (T) Error()
export type Val = 'nil' | 'typedNil' | 'value' | 'ptr'

export const valSrc: Record<Val, string> = { nil: 'nil', typedNil: '(*T)(nil)', value: 'T{}', ptr: '&T{}' }

export type Boxed =
  | { ok: false; code: string; error: string }
  | { ok: true; code: string; word1: string | null; word1Label: string; data: string | null; isNil: boolean; note: string }

export function box(target: Target, recv: Recv, val: Val): Boxed {
  const code = `var x ${target} = ${valSrc[val]}`
  const word1Label = target === 'error' ? 'itab' : 'type'
  const dyn = val === 'value' ? 'T' : '*T'
  if (target === 'error' && val === 'value' && recv === 'ptr') {
    return { ok: false, code, error: 'T does not implement error (method Error has pointer receiver)' }
  }
  if (val === 'nil') return { ok: true, code, word1: null, word1Label, data: null, isNil: true, note: 'Both words nil: the only interface value that equals nil.' }
  const word1 = target === 'error' ? `(error, ${dyn})` : dyn
  if (val === 'typedNil') {
    const call = target === 'error' && recv === 'value' ? ' Calling x.Error() panics: the value receiver dereferences nil.' : ''
    return { ok: true, code, word1, word1Label, data: null, isNil: false, note: `The type word is set, so x != nil even though the pointer is nil.${call}` }
  }
  if (val === 'value') return { ok: true, code, word1, word1Label, data: '→ copy of T', isNil: false, note: 'The box holds a copy. Changing the original T later does not change x.' }
  return { ok: true, code, word1, word1Label, data: '→ the T', isNil: false, note: 'The box holds the pointer, so x and the caller share one T.' }
}
