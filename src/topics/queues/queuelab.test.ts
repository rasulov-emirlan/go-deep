import { describe, expect, it } from 'vitest'
import { canSend, initial, lastReaders, MAX, send, type LabState, type Mode } from './queuelab'

const sendN = (mode: Mode, n: number) => Array.from({ length: n }).reduce<LabState>((s) => send(s), initial(mode))

describe('log mode', () => {
  it('gives every message to both readers and keeps it', () => {
    const st = sendN('log', 3)
    expect(st.a).toEqual([1, 2, 3])
    expect(st.b).toEqual([1, 2, 3])
    expect(st.stored).toEqual([1, 2, 3])
    expect(lastReaders(st)).toEqual(['A', 'B'])
  })
})

describe('queue mode', () => {
  it('gives each message to exactly one reader', () => {
    const st = sendN('queue', 4)
    expect(st.a).toEqual([1, 3])
    expect(st.b).toEqual([2, 4])
    expect([...st.a, ...st.b].sort()).toEqual([1, 2, 3, 4])
    expect(lastReaders(st)).toEqual(['B'])
  })
  it('deletes acked messages', () => {
    expect(sendN('queue', 3).stored).toEqual([])
  })
})

describe('limits', () => {
  it('starts empty and stops at MAX', () => {
    expect(lastReaders(initial('log'))).toEqual([])
    const full = sendN('log', MAX)
    expect(canSend(full)).toBe(false)
    expect(send(full)).toBe(full)
  })
})
