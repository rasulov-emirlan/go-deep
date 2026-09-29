import { Code } from '../../components/Code'
import type { FlowDef } from '../../components/flow'

// Map used by every ladder on this page: Client on the left (x=70), Server on the right (x=490).
const C = 70
const S = 490

/** 01 — resumption, 0-RTT, replay, ticket keys */
export const resumeFlow: FlowDef = {
  h: 380,
  steps: [
    {
      caption: 'A new TLS 1.3 connection over TCP: two round trips (TCP, then TLS) before the first request is sent.',
      add: [
        { t: 'lane', id: 'c', x: C, y: 6, len: 370, text: 'Client' },
        { t: 'lane', id: 's', x: S, y: 6, len: 370, text: 'Server' },
        { t: 'msg', id: 'syn', from: 'c', to: 's', y: 66, y2: 78, text: 'SYN' },
        { t: 'msg', id: 'synack', from: 's', to: 'c', y: 104, y2: 116, text: 'SYN-ACK' },
        { t: 'msg', id: 'ch', from: 'c', to: 's', y: 148, y2: 160, text: 'ClientHello' },
        { t: 'msg', id: 'sh', from: 's', to: 'c', y: 188, y2: 200, text: 'cert+Finished' },
        { t: 'msg', id: 'fin', from: 'c', to: 's', y: 234, y2: 246, text: 'Finished+GET' },
        { t: 'text', id: 'rtt', x: 280, y: 310, text: '1 RTT TCP + 1 RTT TLS', tone: 'red' },
      ],
    },
    {
      caption: 'After the handshake the server sends a session ticket. The client keeps it for next time.',
      drop: ['syn', 'synack', 'ch', 'sh', 'fin', 'rtt'],
      add: [
        { t: 'msg', id: 'tk', from: 's', to: 'c', y: 80, y2: 92, text: 'new ticket', tone: 'red' },
        { t: 'box', id: 'tkbox', x: 20, y: 300, w: 100, h: 50, text: 'ticket', sub: 'saved' },
      ],
    },
    {
      caption: 'Resuming: the ClientHello carries the ticket. No certificate flight, but the request still waits one TLS round trip.',
      drop: ['tk'],
      add: [
        { t: 'msg', id: 'r1', from: 'c', to: 's', y: 66, y2: 78, text: 'Hello+ticket' },
        { t: 'msg', id: 'r2', from: 's', to: 'c', y: 110, y2: 122, text: 'Finished' },
        { t: 'msg', id: 'r3', from: 'c', to: 's', y: 156, y2: 168, text: 'GET /img' },
        { t: 'text', id: 'rt', x: 280, y: 230, text: 'no cert flight', tone: 'red' },
      ],
    },
    {
      caption: '0-RTT: the request rides in the first flight, encrypted with a key derived from the ticket. Zero extra round trips.',
      drop: ['r1', 'r2', 'r3', 'rt'],
      add: [
        { t: 'msg', id: 'z1', from: 'c', to: 's', y: 66, y2: 78, text: 'Hello+ticket' },
        { t: 'msg', id: 'z2', from: 'c', to: 's', y: 108, y2: 120, text: 'GET /img', tone: 'red' },
        { t: 'msg', id: 'z3', from: 's', to: 'c', y: 160, y2: 172, text: 'reply' },
        { t: 'text', id: 'zt', x: 280, y: 236, text: '0 extra RTT', tone: 'red' },
      ],
    },
    {
      caption: 'An on-path attacker copies the first flight and sends it to Server B. B never saw the original, so the POST runs twice.',
      drop: ['z1', 'z2', 'z3', 'zt'],
      set: { s: { x: 270, text: 'Server A' } },
      add: [
        { t: 'lane', id: 'b', x: S, y: 6, len: 370, text: 'Server B' },
        { t: 'msg', id: 'p1', from: 'c', to: 's', y: 66, y2: 78, text: 'Hello+POST' },
        { t: 'text', id: 'ta', x: 270, y: 118, text: 'POST ran', tone: 'grey' },
        { t: 'box', id: 'cp', x: 110, y: 170, w: 110, h: 50, text: 'on-path', sub: 'copy', tone: 'red', dashed: true },
        { t: 'msg', id: 'p2', x1: 220, to: 'b', y: 188, y2: 200, text: 'same bytes', tone: 'red' },
        { t: 'text', id: 'tb', x: 470, y: 250, text: 'POST ran again', tone: 'red' },
      ],
      stop: {
        title: 'Safe in 0-RTT?',
        edge: true,
        body: (
          <>
            Only requests that are safe to run twice: cacheable GET or HEAD with no side effects. Never POST, login, or one-time tokens. Early data also has no forward secrecy.
          </>
        ),
      },
    },
    {
      caption: 'Defence: the proxy tags early requests `Early-Data: 1`. The origin answers 425 Too Early; the client retries after the handshake.',
      drop: ['p1', 'p2', 'cp', 'ta', 'tb'],
      set: { s: { tone: 'grey' } },
      add: [
        { t: 'msg', id: 'e1', from: 'c', to: 'b', y: 66, y2: 78, text: 'POST /pay' },
        { t: 'msg', id: 'e2', from: 'b', to: 'c', y: 112, y2: 124, text: '425 Too Early', tone: 'red' },
        { t: 'msg', id: 'e3', from: 'c', to: 'b', y: 162, y2: 174, text: 'POST again' },
        { t: 'text', id: 'eh', x: 400, y: 225, text: 'proxy adds\nEarly-Data: 1', tone: 'ink' },
      ],
    },
    {
      caption: 'A ticket opens only under the key that made it. Server B has another key, so it falls back to a full handshake.',
      drop: ['e1', 'e2', 'e3', 'eh'],
      set: { s: { tone: 'ink' }, tkbox: { sub: 'from A' } },
      add: [
        { t: 'box', id: 'ka', x: 220, y: 300, w: 100, h: 50, text: 'key K1' },
        { t: 'box', id: 'kb', x: 440, y: 300, w: 100, h: 50, text: 'key K2' },
        { t: 'msg', id: 'h1', from: 'c', to: 'b', y: 70, y2: 82, text: 'Hello+ticket' },
        { t: 'msg', id: 'h2', from: 'b', to: 'c', y: 120, y2: 132, text: 'full handshake', tone: 'red' },
      ],
      stop: {
        title: 'Tickets in Go',
        edge: true,
        body: (
          <>
            <p>Share ticket keys across a fleet; give clients a cache. Go's server never accepts 0-RTT.</p>
            <Code>{`cfg.SetSessionTicketKeys(keys)

tr.TLSClientConfig = &tls.Config{
  ClientSessionCache: cache,
}`}</Code>
          </>
        ),
      },
    },
  ],
}

/** 02 — chain of trust, then cert rotation */
export const certFlow: FlowDef = {
  h: 344,
  steps: [
    {
      caption: 'The client must build a path from the leaf up to a root it trusts. This server sends only the leaf.',
      add: [
        { t: 'box', id: 'root', x: 20, y: 20, w: 180, h: 54, text: 'Root CA', sub: 'in trust store' },
        { t: 'box', id: 'inter', x: 20, y: 120, w: 180, h: 54, text: 'Intermediate', sub: 'not sent', tone: 'grey', dashed: true },
        { t: 'box', id: 'leaf', x: 20, y: 220, w: 180, h: 54, text: 'Leaf', sub: 'example.com' },
        { t: 'line', id: 'l1', x1: 110, y1: 120, x2: 110, y2: 74, arrow: true, tone: 'grey' },
        { t: 'line', id: 'l2', x1: 110, y1: 220, x2: 110, y2: 174, arrow: true, tone: 'grey' },
        { t: 'text', id: 'sb1', x: 124, y: 98, text: 'signed by', anchor: 'start', tone: 'grey' },
        { t: 'text', id: 'sb2', x: 124, y: 198, text: 'signed by', anchor: 'start', tone: 'grey' },
        { t: 'box', id: 'srv', x: 340, y: 220, w: 200, h: 54, label: 'server sends', text: '[ leaf ]', tone: 'red' },
        { t: 'line', id: 'send', x1: 340, y1: 247, x2: 200, y2: 247, arrow: true, tone: 'red' },
      ],
    },
    {
      caption: 'Browsers may fetch the intermediate from a URL in the leaf (AIA) or reuse a cached copy. The site looks fine.',
      set: { inter: { tone: 'ink', dashed: false, sub: 'fetched' }, srv: { tone: 'ink' }, send: { tone: 'ink' } },
      add: [
        { t: 'box', id: 'br', x: 340, y: 20, w: 200, h: 54, text: 'Browser', sub: 'fetches issuer' },
        { t: 'line', id: 'aia', x1: 340, y1: 60, x2: 200, y2: 147, arrow: true, text: 'AIA URL' },
      ],
    },
    {
      caption: 'Go, curl and Java do not fetch it. They stop with an unknown-authority error.',
      drop: ['br', 'aia'],
      set: { inter: { tone: 'red', dashed: true, sub: 'unknown' } },
      add: [
        { t: 'box', id: 'go', x: 340, y: 20, w: 200, h: 54, text: 'Go · curl', sub: 'no AIA fetch', tone: 'red' },
        { t: 'text', id: 'err', x: 440, y: 120, text: '✕ unknown authority', tone: 'red' },
      ],
      stop: {
        title: 'Chrome OK, Go fails',
        edge: true,
        body: (
          <>
            <p>Serve the full chain: leaf first, then intermediates, no root.</p>
            <Code>{`tls.LoadX509KeyPair(
  "fullchain.pem", "privkey.pem")`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Send the leaf plus every intermediate, and leave out the root. Now Go verifies the chain without help.',
      set: {
        srv: { text: '[ leaf, inter ]', tone: 'ink' },
        send: { tone: 'ink' },
        inter: { tone: 'ink', dashed: false, sub: 'sent' },
        go: { tone: 'ink', sub: 'verifies' },
        err: { text: '✓ chain verified', tone: 'ink' },
      },
    },
    {
      caption: 'Rotating without a restart: swap a cached pointer. New handshakes get the new cert; open connections keep the old one.',
      drop: ['root', 'inter', 'leaf', 'l1', 'l2', 'sb1', 'sb2', 'srv', 'send', 'go', 'err'],
      add: [
        { t: 'box', id: 'disk', x: 20, y: 30, w: 150, h: 56, text: 'fullchain.pem', sub: 'on disk', tone: 'grey' },
        { t: 'box', id: 'cur', x: 205, y: 30, w: 150, h: 56, text: 'atomic.Pointer', sub: 'cert v2', tone: 'red' },
        { t: 'box', id: 'gc', x: 390, y: 30, w: 150, h: 56, text: 'GetCertificate', sub: 'per handshake' },
        { t: 'line', id: 'a1', x1: 170, y1: 58, x2: 205, y2: 58, arrow: true, tone: 'grey' },
        { t: 'line', id: 'a2', x1: 355, y1: 58, x2: 390, y2: 58, arrow: true },
        { t: 'box', id: 'old', x: 20, y: 200, w: 240, h: 56, text: 'open connections', sub: 'keep cert v1', tone: 'grey' },
        { t: 'box', id: 'new', x: 300, y: 200, w: 240, h: 56, text: 'new handshakes', sub: 'get cert v2', tone: 'red' },
        { t: 'line', id: 'a3', x1: 465, y1: 86, x2: 465, y2: 200, arrow: true, tone: 'red' },
      ],
      stop: {
        title: 'Reload without restart',
        edge: true,
        body: (
          <>
            <p>Reload on file change, not per handshake. Kubernetes Secret mounts swap a symlink, so watch the directory.</p>
            <Code>{`var c atomic.Pointer[tls.Certificate]
cfg.GetCertificate = func(
  _ *tls.ClientHelloInfo,
) (*tls.Certificate, error) {
  return c.Load(), nil
}`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'A resumed handshake skips GetCertificate, so it never sees the new cert. Go tickets stay valid up to 7 days.',
      add: [{ t: 'box', id: 'res', x: 20, y: 286, w: 520, h: 48, text: 'resumed handshake', sub: 'GetCertificate not called', tone: 'red', dashed: true }],
    },
  ],
}

/** 03a — PMTUD black hole */
export const mtuFlow: FlowDef = {
  h: 310,
  steps: [
    {
      caption: 'Handshakes and tiny requests fit in small packets. Somewhere on the path a tunnel has MTU (largest packet) 1420, under Ethernet’s 1500.',
      add: [
        { t: 'lane', id: 'c', x: C, y: 6, len: 300, text: 'Client' },
        { t: 'lane', id: 't', x: 250, y: 6, len: 300, text: 'Tunnel', sub: 'MTU 1420' },
        { t: 'lane', id: 's', x: S, y: 6, len: 300, text: 'Server' },
        { t: 'msg', id: 'm1', from: 'c', to: 's', y: 76, y2: 88, text: 'SYN' },
        { t: 'msg', id: 'm2', from: 's', to: 'c', y: 112, y2: 124, text: 'SYN-ACK' },
        { t: 'msg', id: 'm3', from: 'c', to: 's', y: 152, y2: 164, text: 'GET /small' },
        { t: 'msg', id: 'm4', from: 's', to: 'c', y: 192, y2: 204, text: '200 · 300 B' },
      ],
    },
    {
      caption: 'A full 1500-byte packet marked DF (do not fragment) hits the tunnel. It is dropped, and the router sends ICMP “too big” back.',
      drop: ['m1', 'm2', 'm3', 'm4'],
      add: [
        { t: 'msg', id: 'big', from: 's', to: 'c', y: 82, y2: 94, text: '1500 B · DF', lost: true, tone: 'red' },
        { t: 'msg', id: 'icmp', x1: 250, to: 's', y: 150, y2: 162, text: 'ICMP too big', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'A firewall eats the ICMP. The sender never learns the limit and keeps retransmitting the same size.',
      set: { icmp: { lost: true } },
      add: [{ t: 'text', id: 'fw', x: 360, y: 214, text: 'firewall drops ICMP', tone: 'red' }],
      stop: {
        title: 'Small works, big hangs',
        edge: true,
        body: (
          <>
            Fingerprint: SYN fine, first full-size segment retransmits; <code>ping -M do -s 1472</code> fails, <code>-s 1372</code> works. A bigger ClientHello (Go 1.24+ hybrid ML-KEM) can hang on old middleboxes too; <code>tlsmlkem=0</code> reverts.
          </>
        ),
      },
    },
    {
      caption: 'Fix: the tunnel rewrites the MSS (biggest TCP payload) in SYNs to 1380, so both ends send packets that fit. QUIC starts at 1200 bytes and probes up.',
      drop: ['big', 'icmp', 'fw'],
      add: [
        { t: 'msg', id: 'f1', from: 'c', to: 's', y: 82, y2: 94, text: 'SYN MSS 1460' },
        { t: 'text', id: 'ft', x: 250, y: 130, text: 'rewrites to 1380', tone: 'red' },
        { t: 'msg', id: 'f2', from: 's', to: 'c', y: 184, y2: 196, text: '1380 B' },
      ],
      stop: {
        title: 'Ways out',
        edge: true,
        body: (
          <>
            <p>Clamp MSS at the edge, allow ICMP type 3 code 4 (IPv6: type 2), or let the kernel probe.</p>
            <Code>{`iptables -t mangle -A FORWARD \\
  -p tcp --tcp-flags SYN,RST SYN \\
  -j TCPMSS --clamp-mss-to-pmtu
sysctl net.ipv4.tcp_mtu_probing=1`}</Code>
          </>
        ),
      },
    },
  ],
}

/** 03b — head-of-line blocking, migration, UDP fallback, Go */
const row = (id: string, x: number, y: number, text: string, extra: object = {}) => ({ t: 'box' as const, id, x, y, w: 72, h: 44, text, ...extra })

export const quicFlow: FlowDef = {
  h: 250,
  steps: [
    {
      caption: 'HTTP/2 puts many streams (A, B, C) on one TCP connection. TCP delivers a single ordered byte stream.',
      add: [
        { t: 'text', id: 'hd', x: 280, y: 24, text: 'one TCP connection', tone: 'grey' },
        row('p1', 20, 50, 'A1'),
        row('p2', 108, 50, 'B1'),
        row('p3', 196, 50, 'C1'),
        row('p4', 284, 50, 'A2'),
        row('p5', 372, 50, 'B2'),
        row('p6', 460, 50, 'C2'),
      ],
    },
    {
      caption: 'Packet B1 is lost. TCP holds every later packet, from every stream, until B1 is retransmitted.',
      set: {
        p2: { tone: 'red', dashed: true, text: 'B1 ✕' },
        p3: { tone: 'grey' },
        p4: { tone: 'grey' },
        p5: { tone: 'grey' },
        p6: { tone: 'grey' },
      },
      add: [
        { t: 'path', id: 'br', d: 'M198,106 L198,114 L532,114 L532,106', tone: 'red' },
        { t: 'text', id: 'held', x: 365, y: 138, text: 'held for ALL streams', tone: 'red' },
      ],
    },
    {
      caption: 'QUIC orders each stream separately. B1 is lost, so only stream B waits; A and C keep flowing.',
      drop: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'br', 'held', 'hd'],
      add: [
        { t: 'text', id: 'la', x: 30, y: 66, text: 'A' },
        { t: 'text', id: 'lb', x: 30, y: 120, text: 'B' },
        { t: 'text', id: 'lc', x: 30, y: 174, text: 'C' },
        row('a1', 70, 44, 'A1'),
        row('a2', 160, 44, 'A2'),
        row('a3', 250, 44, 'A3'),
        row('b1', 70, 98, 'B1 ✕', { tone: 'red', dashed: true }),
        row('b2', 160, 98, 'B2', { tone: 'grey' }),
        row('b3', 250, 98, 'B3', { tone: 'grey' }),
        row('c1', 70, 152, 'C1'),
        row('c2', 160, 152, 'C2'),
        row('c3', 250, 152, 'C3'),
        { t: 'text', id: 'ob', x: 450, y: 120, text: 'only B waits', tone: 'red' },
      ],
    },
    {
      caption: 'Still shared: congestion control and flow-control limits are per connection, so heavy loss can slow every stream.',
      drop: ['ob'],
      add: [
        { t: 'path', id: 'cw', d: 'M352,44 L362,44 L362,196 L352,196', tone: 'red' },
        { t: 'text', id: 'cwt', x: 460, y: 120, text: 'one congestion\nwindow for all', tone: 'red' },
      ],
      stop: {
        title: 'Not fully free',
        edge: true,
        body: <>HTTP/3 removes head-of-line blocking at the transport level only. One congestion window still governs the whole connection.</>,
      },
    },
    {
      caption: 'The phone leaves Wi-Fi. Same connection ID, new address: the server sends PATH_CHALLENGE and, until answered, at most 3× the bytes it received.',
      drop: ['la', 'lb', 'lc', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'cw', 'cwt'],
      add: [
        { t: 'lane', id: 'c', x: C, y: 6, len: 236, text: 'Client', sub: 'LTE' },
        { t: 'lane', id: 's', x: S, y: 6, len: 236, text: 'Server' },
        { t: 'msg', id: 'q1', from: 'c', to: 's', y: 88, y2: 100, text: 'Wi-Fi · CID 7', tone: 'grey' },
        { t: 'msg', id: 'q2', from: 'c', to: 's', y: 128, y2: 140, text: 'LTE · CID 7', tone: 'red' },
        { t: 'msg', id: 'q3', from: 's', to: 'c', y: 168, y2: 180, text: 'PATH_CHALLENGE', tone: 'red' },
      ],
    },
    {
      caption: 'PATH_RESPONSE proves the client owns the new address. The connection carries on with no new handshake.',
      set: { q2: { tone: 'grey' }, q3: { tone: 'grey' } },
      add: [{ t: 'msg', id: 'q4', from: 'c', to: 's', y: 208, y2: 220, text: 'PATH_RESPONSE' }],
      stop: {
        title: 'LBs must route by CID',
        edge: true,
        body: (
          <>
            An L4 balancer that hashes the 4-tuple breaks migration. QUIC-LB encodes a server ID in the CID. UDP NAT mappings expire fast, so QUIC sends keep-alive pings.
          </>
        ),
      },
    },
    {
      caption: 'Some networks block UDP/443. The client tries QUIC (learned from an Alt-Svc header), times out, then falls back to TCP and h2.',
      drop: ['c', 's', 'q1', 'q2', 'q3', 'q4'],
      add: [
        { t: 'lane', id: 'c2', x: C, y: 6, len: 236, text: 'Client' },
        { t: 'lane', id: 's2', x: S, y: 6, len: 236, text: 'Server' },
        { t: 'msg', id: 'u1', from: 'c2', to: 's2', y: 76, y2: 88, text: 'QUIC UDP/443', lost: true, tone: 'red' },
        { t: 'text', id: 'ut', x: 290, y: 128, text: 'blocked, then timeout', tone: 'red' },
        { t: 'msg', id: 'u2', from: 'c2', to: 's2', y: 168, y2: 180, text: 'TCP + TLS' },
        { t: 'msg', id: 'u3', from: 's2', to: 'c2', y: 198, y2: 210, text: 'h2 response' },
      ],
      stop: {
        title: 'h3 is an upgrade',
        edge: true,
        body: <>Keep the TCP listener on the same port and send Alt-Svc. Open UDP/443 in firewalls and security groups, not only TCP.</>,
      },
    },
    {
      caption: 'In Go, net/http has no HTTP/3 (none in the Go 1.26 notes). quic-go serves h3 over UDP; the TCP server advertises it.',
      drop: ['c2', 's2', 'u1', 'ut', 'u2', 'u3'],
      add: [
        { t: 'box', id: 'cl', x: 20, y: 100, w: 110, h: 56, text: 'Client' },
        { t: 'box', id: 'nh', x: 380, y: 20, w: 160, h: 56, text: 'net/http', sub: 'TCP · h1 · h2' },
        { t: 'box', id: 'qg', x: 380, y: 170, w: 160, h: 56, text: 'quic-go', sub: 'UDP · h3', tone: 'red' },
        { t: 'line', id: 'tcp', x1: 130, y1: 118, x2: 380, y2: 52, arrow: true, text: 'TCP 443' },
        { t: 'line', id: 'udp', x1: 130, y1: 140, x2: 380, y2: 200, arrow: true, tone: 'red', text: 'UDP 443' },
        { t: 'text', id: 'alt', x: 460, y: 122, text: 'sends Alt-Svc: h3', tone: 'grey' },
      ],
    },
  ],
}
