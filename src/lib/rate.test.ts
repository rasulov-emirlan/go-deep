import { describe, expect, it, vi } from 'vitest'
import { payload, send } from './rate'

describe('rating payload', () => {
  it('sends only topic and vote for a like', () => {
    expect(payload({ topic: 'gc', vote: 'up', reasons: ['wrong'], note: 'x' })).toEqual({ topic: 'gc', vote: 'up' })
  })
  it('keeps reasons, section and a trimmed note for a dislike', () => {
    expect(payload({ topic: 'gc', vote: 'down', reasons: ['wrong', 'wrong'], section: ' Stack or heap? ', note: '  lost me  ' })).toEqual({
      topic: 'gc',
      vote: 'down',
      reasons: ['wrong'],
      section: 'Stack or heap?',
      note: 'lost me',
    })
  })
  it('drops empty fields and caps the note', () => {
    const p = payload({ topic: 'gc', vote: 'down', reasons: [], section: '', note: 'a'.repeat(1500) })
    expect(p.reasons).toBeUndefined()
    expect(p.section).toBeUndefined()
    expect(p.note).toHaveLength(1000)
  })
  it('explains a rate limit', async () => {
    const post = vi.fn(async () => new Response('', { status: 429 }))
    await expect(send({ topic: 'gc', vote: 'up' }, post as unknown as typeof fetch)).rejects.toThrow(/Too many/)
    expect(post).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'POST' }))
  })
})
