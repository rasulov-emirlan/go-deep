/** The "nil box" lab: what `var err error = <value>` stores in the two interface words. */

export type Val = 'nil' | 'typedNil' | 'ptr'

export const valSrc: Record<Val, string> = { nil: 'nil', typedNil: '(*T)(nil)', ptr: '&T{}' }

export type Boxed = { code: string; type: string | null; data: string | null; isNil: boolean }

export function box(val: Val): Boxed {
  const code = `var err error = ${valSrc[val]}`
  if (val === 'nil') return { code, type: null, data: null, isNil: true }
  return { code, type: '*T', data: val === 'ptr' ? '→ T' : null, isNil: false }
}
