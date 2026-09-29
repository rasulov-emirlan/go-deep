import { describe, expect, it } from 'vitest'
import { box } from './box'

describe('nil box', () => {
  it('only a plain nil is == nil', () => {
    expect(box('nil')).toMatchObject({ type: null, data: null, isNil: true })
    expect(box('ptr').isNil).toBe(false)
  })
  it('typed nil keeps the type word, drops the data word', () => {
    expect(box('typedNil')).toMatchObject({ type: '*T', data: null, isNil: false })
  })
  it('renders the Go source', () => {
    expect(box('typedNil').code).toBe('var err error = (*T)(nil)')
  })
})
