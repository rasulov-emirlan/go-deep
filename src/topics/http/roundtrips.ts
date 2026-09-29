/** Round trips before the first response byte, per connection setup. Pure and deterministic. */

export type Setup = 'tls12' | 'tls13' | 'quic' | 'reuse'
export type Kind = 'tcp' | 'tls' | 'quic' | 'http'
export type Trip = { label: string; kind: Kind }

export const setups: { id: Setup; label: string }[] = [
  { id: 'tls12', label: 'TLS 1.2' },
  { id: 'tls13', label: 'TLS 1.3' },
  { id: 'quic', label: 'HTTP/3' },
  { id: 'reuse', label: 'Reused' },
]

const TRIPS: Record<Setup, Trip[]> = {
  tls12: [
    { label: 'TCP', kind: 'tcp' },
    { label: 'TLS', kind: 'tls' },
    { label: 'TLS', kind: 'tls' },
    { label: 'GET', kind: 'http' },
  ],
  tls13: [
    { label: 'TCP', kind: 'tcp' },
    { label: 'TLS', kind: 'tls' },
    { label: 'GET', kind: 'http' },
  ],
  // QUIC does the transport and TLS 1.3 handshakes in one combined round trip
  quic: [
    { label: 'QUIC', kind: 'quic' },
    { label: 'GET', kind: 'http' },
  ],
  // keep-alive: an earlier request already paid the handshakes
  reuse: [{ label: 'GET', kind: 'http' }],
}

/** Round trips with a warm DNS cache. */
export const trips = (setup: Setup): Trip[] => TRIPS[setup]

/** Time to first response byte in ms, ignoring server think time and bandwidth. */
export const ttfb = (setup: Setup, rttMs: number): number => trips(setup).length * rttMs
