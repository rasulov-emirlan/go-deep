import { describe, expect, it } from 'vitest'
import { box, type Recv, type Target, type Val } from './box'

describe('interface box', () => {
  it('only a plain nil is == nil', () => {
    for (const t of ['error', 'any'] as Target[])
      for (const r of ['ptr', 'value'] as Recv[])
        for (const v of ['nil', 'typedNil', 'value', 'ptr'] as Val[]) {
          const b = box(t, r, v)
          if (b.ok) expect(b.isNil).toBe(v === 'nil')
        }
  })
  it('typed nil keeps the type word, drops the data word', () => {
    const b = box('error', 'ptr', 'typedNil')
    expect(b).toMatchObject({ ok: true, word1: '(error, *T)', data: null, isNil: false })
  })
  it('T{} does not fit error when Error has a pointer receiver', () => {
    expect(box('error', 'ptr', 'value').ok).toBe(false)
    expect(box('error', 'value', 'value')).toMatchObject({ ok: true, word1: '(error, T)' })
    expect(box('any', 'ptr', 'value')).toMatchObject({ ok: true, word1: 'T', word1Label: 'type' })
  })
  it('value receiver + typed nil warns about the panic', () => {
    const b = box('error', 'value', 'typedNil')
    expect(b.ok && b.note).toContain('panics')
    const p = box('error', 'ptr', 'typedNil')
    expect(p.ok && p.note).not.toContain('panics')
  })
  it('renders the Go source', () => {
    expect(box('any', 'ptr', 'typedNil').code).toBe('var x any = (*T)(nil)')
  })
})
