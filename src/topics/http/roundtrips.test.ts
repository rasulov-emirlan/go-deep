import { describe, expect, it } from 'vitest'
import { setups, trips, ttfb } from './roundtrips'

describe('round trips to first byte', () => {
  it('counts round trips per setup', () => {
    const n = Object.fromEntries(setups.map((s) => [s.id, trips(s.id).length]))
    expect(n).toEqual({ tls12: 4, tls13: 3, quic: 2, reuse: 1 })
  })
  it('every setup ends with the HTTP response', () => {
    for (const s of setups) expect(trips(s.id).at(-1)!.kind).toBe('http')
  })
  it('ttfb is round trips × RTT', () => {
    expect(ttfb('tls12', 100)).toBe(400)
    expect(ttfb('reuse', 80)).toBe(80)
  })
})
