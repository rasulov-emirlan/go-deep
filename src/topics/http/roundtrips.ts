/** Round trips before the first response byte, per connection setup. Pure and deterministic. */

export type Setup = 'tls12' | 'tls13' | 'tls13-0rtt' | 'quic' | 'quic-0rtt' | 'reuse'
export type Kind = 'dns' | 'tcp' | 'tls' | 'quic' | 'http'
export type Trip = { label: string; kind: Kind }

export const setups: { id: Setup; label: string; note: string }[] = [
  { id: 'tls12', label: 'TCP + TLS 1.2', note: 'TLS 1.2 needs two round trips before keys exist.' },
  { id: 'tls13', label: 'TCP + TLS 1.3', note: 'The client guesses the key group and sends its key share in the first flight.' },
  { id: 'tls13-0rtt', label: 'TLS 1.3 0-RTT', note: 'A resumed session sends GET inside the first flight. Replayable: idempotent requests only.' },
  { id: 'quic', label: 'QUIC (HTTP/3)', note: 'Transport and TLS 1.3 handshakes are one combined round trip over UDP.' },
  { id: 'quic-0rtt', label: 'QUIC 0-RTT', note: 'Resumed QUIC sends GET with the very first packet. Same replay caveat.' },
  { id: 'reuse', label: 'Reused conn', note: 'Keep-alive: the handshakes were paid by an earlier request.' },
]

const HANDSHAKE: Record<Setup, Trip[]> = {
  tls12: [
    { label: 'TCP SYN → SYN-ACK', kind: 'tcp' },
    { label: 'TLS ClientHello → ServerHello, cert', kind: 'tls' },
    { label: 'TLS key exchange → Finished', kind: 'tls' },
    { label: 'GET → 200 OK', kind: 'http' },
  ],
  tls13: [
    { label: 'TCP SYN → SYN-ACK', kind: 'tcp' },
    { label: 'ClientHello + key share → ServerHello … Finished', kind: 'tls' },
    { label: 'Finished + GET → 200 OK', kind: 'http' },
  ],
  'tls13-0rtt': [
    { label: 'TCP SYN → SYN-ACK', kind: 'tcp' },
    { label: 'ClientHello + PSK + GET → 200 OK', kind: 'http' },
  ],
  quic: [
    { label: 'QUIC Initial (TLS 1.3) → handshake done', kind: 'quic' },
    { label: 'GET → 200 OK', kind: 'http' },
  ],
  'quic-0rtt': [{ label: 'Initial + 0-RTT GET → 200 OK', kind: 'http' }],
  reuse: [{ label: 'GET → 200 OK', kind: 'http' }],
}

export function trips(setup: Setup, dnsCached: boolean): Trip[] {
  // a reused connection already knows the IP
  const dns: Trip[] = dnsCached || setup === 'reuse' ? [] : [{ label: 'DNS query → A record', kind: 'dns' }]
  return [...dns, ...HANDSHAKE[setup]]
}

/** Time to first response byte in ms, ignoring server think time and bandwidth. */
export function ttfb(setup: Setup, rttMs: number, dnsCached: boolean): number {
  return trips(setup, dnsCached).length * rttMs
}

/** True when the request itself travels before the handshake finishes, so an attacker can replay it. */
export const replayable = (setup: Setup) => setup === 'tls13-0rtt' || setup === 'quic-0rtt'
