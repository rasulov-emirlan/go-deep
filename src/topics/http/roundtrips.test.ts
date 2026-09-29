import { describe, expect, it } from 'vitest'
import { replayable, setups, trips, ttfb } from './roundtrips'

describe('round trips to first byte', () => {
  it('counts handshake round trips per setup (DNS cached)', () => {
    const n = Object.fromEntries(setups.map((s) => [s.id, trips(s.id, true).length]))
    expect(n).toEqual({ tls12: 4, tls13: 3, 'tls13-0rtt': 2, quic: 2, 'quic-0rtt': 1, reuse: 1 })
  })
  it('an uncached DNS lookup adds one round trip up front, except on a reused conn', () => {
    expect(trips('reuse', false)).toEqual(trips('reuse', true))
    for (const s of setups.filter((x) => x.id !== 'reuse')) {
      const t = trips(s.id, false)
      expect(t.length).toBe(trips(s.id, true).length + 1)
      expect(t[0].kind).toBe('dns')
    }
  })
  it('every setup ends with the HTTP response', () => {
    for (const s of setups) expect(trips(s.id, true).at(-1)!.kind).toBe('http')
  })
  it('ttfb is round trips × RTT', () => {
    expect(ttfb('tls12', 100, true)).toBe(400)
    expect(ttfb('tls13', 100, false)).toBe(400)
    expect(ttfb('quic-0rtt', 80, true)).toBe(80)
  })
  it('only 0-RTT setups are replayable', () => {
    expect(setups.filter((s) => replayable(s.id)).map((s) => s.id)).toEqual(['tls13-0rtt', 'quic-0rtt'])
  })
})
