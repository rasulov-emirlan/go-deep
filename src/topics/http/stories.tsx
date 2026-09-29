import type { ReactNode } from 'react'
import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'
import { Cell } from './Cell'

/* Shared cast: client on the left, server (king) on the right, a messenger carries each packet between them. */
const client = (bubble?: string, hot?: boolean): Actor => ({ id: 'client', sprite: 'fairy-tale-messenger-running', x: 110, y: 330, h: 120, tag: 'client', bubble, hot })
const server = (bubble?: string, hot?: boolean): Actor => ({ id: 'server', sprite: 'fairy-tale-king', x: 690, y: 330, h: 130, tag: 'server', bubble, hot })
const pkt = (x: number, bubble: string, back = false, hot = false): Actor => ({ id: 'pkt', sprite: 'fairy-tale-messenger-red-letter', x, y: 290, h: 84, bubble, flip: back, hot })
const wire: Prop = { id: 'wire', x: 190, y: 300, w: 420, h: 2, tone: 'dashed' }
const rt = (n: number, hot = false): Prop => ({ id: 'rt', x: 345, y: 310, w: 110, h: 28, tone: hot ? 'red' : 'ink', text: `${n} RT` })

export const urlToByte: Frame[] = [
  {
    caption: 'You enter https://example.com. Before anything else, the client needs the server’s IP address.',
    actors: [client('example.com?'), server()],
    props: [wire, rt(0)],
  },
  {
    caption: 'DNS: OS cache first, else a resolver walks root → .com → the authoritative server. Cached answers are free.',
    actors: [client(), { id: 'dns', sprite: 'fairy-tale-witch-learning', x: 400, y: 330, h: 110, tag: 'DNS', bubble: '203.0.113.7' }, server()],
    props: [wire],
  },
  {
    caption: 'TCP handshake: the client sends SYN. Nothing useful can travel until the server answers.',
    actors: [client(), pkt(560, 'SYN'), server()],
    props: [wire, rt(0)],
  },
  {
    caption: 'SYN-ACK comes back: one round trip (RT) gone. The final ACK rides along with the next message.',
    actors: [client(), pkt(240, 'SYN-ACK', true), server()],
    props: [wire, rt(1)],
  },
  {
    caption: 'TLS 1.3: ClientHello carries a key share; the server answers with its cert and Finished.',
    actors: [client(), pkt(430, 'hello + key share'), server('cert, Finished')],
    props: [wire, rt(2)],
    stop: {
      title: 'one round trip, not two',
      body: (
        <p>
          TLS 1.2 negotiated first and exchanged keys second: 2 round trips. TLS 1.3 guesses the key group and sends its share immediately, so keys exist after 1. A wrong guess costs a{' '}
          <code>HelloRetryRequest</code> (+1 RT).
        </p>
      ),
    },
  },
  {
    caption: 'The GET rides right behind the client’s Finished, already encrypted, with Host and headers.',
    actors: [client(), pkt(560, 'GET /'), server()],
    props: [wire, rt(2)],
  },
  {
    caption: '200 OK arrives after three round trips, even with DNS cached. At 100 ms RTT that’s 300 ms of waiting.',
    actors: [client('finally!'), pkt(240, '200 OK', true, true), server()],
    props: [wire, rt(3, true)],
    stop: {
      title: 'latency, not bandwidth',
      body: (
        <p>
          A round trip is bounded by distance and the speed of light, so a fatter pipe doesn’t help. The fixes are fewer round trips (TLS 1.3, QUIC) or not repeating them (keep-alive, resumption).
        </p>
      ),
    },
  },
  {
    caption: 'A returning client can resume TLS 1.3 and send the GET inside its very first flight: 0-RTT.',
    actors: [client(), pkt(450, 'hello + GET', false, true), server('200 OK')],
    props: [wire, rt(2, true)],
    stop: {
      edge: true,
      title: '0-RTT can be replayed',
      body: (
        <p>
          Early data has no replay protection: an attacker can resend it. Send only idempotent requests, and expect servers to reject it. Go’s <code>crypto/tls</code> does 0-RTT only for QUIC, never
          over TCP.
        </p>
      ),
    },
  },
]

/* Anatomy: one big letter in the middle of the stage. */
const letter = (label: string, lines: ReactNode, tone: Prop['tone'] = 'line'): Prop => ({
  id: 'msg',
  x: 195,
  y: 130,
  w: 410,
  h: 190,
  tone,
  label,
  text: <span className="ht-msg">{lines}</span>,
})
const fam = (hot: number): Prop[] =>
  [
    ['1xx', 'hold on'],
    ['2xx', 'ok'],
    ['3xx', 'look there'],
    ['4xx', 'your fault'],
    ['5xx', 'my fault'],
  ].map(([k, v], i) => ({ id: 'f' + i, x: 195 + i * 84, y: 170, w: 78, h: 110, tone: i === hot ? 'red' : 'line', text: <Cell k={k} v={v} /> }))
const buckets = (hot: number): Prop[] =>
  [
    ['safe', 'GET · HEAD · OPTIONS'],
    ['idempotent', 'PUT · DELETE (+ safe)'],
    ['no promise', 'POST · PATCH'],
  ].map(([k, v], i) => ({ id: 'b' + i, x: 195 + i * 140, y: 160, w: 130, h: 130, tone: i === hot ? 'red' : 'line', text: <Cell k={k} v={v} /> }))

export const anatomy: Frame[] = [
  {
    caption: 'A request: method, path and version, then headers, a blank line, and an optional body.',
    actors: [client(), server()],
    props: [
      letter(
        'request',
        <>
          <b>GET /orders/42 HTTP/1.1</b>
          <br />
          Host: shop.example
          <br />
          Accept: application/json
          <br />
          <br />
          <i>(no body)</i>
        </>,
      ),
    ],
  },
  {
    caption: 'The response mirrors it: a status line, headers, a blank line, then the body.',
    actors: [client(), server()],
    props: [
      letter(
        'response',
        <>
          <b>HTTP/1.1 200 OK</b>
          <br />
          Content-Type: application/json
          <br />
          Content-Length: 17
          <br />
          <br />
          {'{"id":42,"qty":1}'}
        </>,
      ),
    ],
  },
  {
    caption: 'The first digit is the family: 4xx blames the client, 5xx blames the server.',
    actors: [client('404?'), server('your fault')],
    props: fam(3),
    stop: {
      edge: true,
      title: 'the pairs they ask about',
      body: (
        <p>
          <b>401</b> = not authenticated (who are you?), <b>403</b> = known but not allowed. <b>502</b> = bad reply from upstream, <b>503</b> = overloaded or down, <b>504</b> = upstream timed out.
        </p>
      ),
    },
  },
  {
    caption: 'Safe methods change nothing. Idempotent ones can repeat with the same end state. POST promises neither.',
    actors: [client(), server()],
    props: buckets(2),
  },
  {
    caption: 'The client POSTs a payment. The server charges the card, but the response is lost.',
    actors: [client(), { id: 'pkt', sprite: 'science-experiment-mishap', x: 400, y: 290, h: 80, bubble: 'lost!', hot: true }, server('charged')],
    props: [wire],
  },
  {
    caption: 'The client times out and retries. POST isn’t idempotent, so the card is charged twice.',
    actors: [client('retry…'), pkt(470, 'POST /pay'), server('charged ×2', true)],
    props: [wire],
    stop: {
      title: 'Idempotency-Key',
      body: (
        <p>
          The client sends a unique <code>Idempotency-Key</code> header with the POST. The server stores the result per key and replays it for repeats instead of charging again.
        </p>
      ),
    },
  },
  {
    caption: 'DELETE twice: the second returns 404, but the server ends in the same state. Still idempotent.',
    actors: [client(), pkt(240, '404', true), server('already gone')],
    props: [wire],
    stop: {
      edge: true,
      title: 'what Go retries for you',
      body: (
        <p>
          If a reused connection dies before any response, Go’s Transport silently retries only GET, HEAD, OPTIONS, TRACE, or requests carrying an <code>Idempotency-Key</code> header. Not PUT or
          DELETE.
        </p>
      ),
    },
  },
]

/* Keep-alive: the connection is a cart; idle carts park in the Transport's pool. */
const g = (bubble?: string, hot?: boolean): Actor => ({ id: 'g', sprite: 'misc-standing-v2', x: 100, y: 330, h: 100, tag: 'goroutine', bubble, hot })
const pool: Prop = { id: 'pool', x: 200, y: 210, w: 320, h: 140, tone: 'dashed', label: 'Transport idle pool' }
const cart = (id: string, x: number, y: number, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'adventure-pushing-cart', x, y, h: 95, tag: id, ...extra })
const road = (id: string, extra: Partial<Actor> = {}) => cart(id, 540, 190, extra)

export const keepAlive: Frame[] = [
  {
    caption: 'First request to a host: the Transport dials TCP and does TLS, paying the expensive round trips.',
    actors: [g(), road('conn1', { bubble: 'dial + TLS' }), server()],
    props: [pool],
  },
  {
    caption: 'Body read to EOF and closed: the connection goes back to the idle pool.',
    actors: [g('done'), cart('conn1', 330, 328), server()],
    props: [pool],
  },
  {
    caption: 'The next request grabs the idle conn: no dial, no handshake, one round trip.',
    actors: [g(), road('conn1', { bubble: 'reused!' }), server()],
    props: [pool],
  },
  {
    caption: 'Close the body without reading it, and the Transport closes the conn instead of pooling it.',
    actors: [g('Close() only', true), { id: 'boom', sprite: 'science-experiment-mishap', x: 540, y: 190, h: 90, tag: 'conn1', hot: true }, server()],
    props: [pool],
    stop: {
      title: 'why unread bytes kill reuse',
      body: (
        <>
          <p>Leftover body bytes are still on the wire, so the next response would read garbage. Verified on Go 1.26: close-only means the next request dials fresh.</p>
          <Code>{`defer resp.Body.Close()
// drain, so the conn is reusable
io.Copy(io.Discard, resp.Body)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Never call Close and the conn stays busy forever: its socket and goroutines leak.',
    actors: [g('forgot Close', true), road('conn2', { tag: 'conn2 · busy', hot: true }), server()],
    props: [pool],
  },
  {
    caption: 'A burst opens many conns, but only MaxIdleConnsPerHost (default 2) stay idle. The rest are closed.',
    actors: [
      g(),
      cart('c1', 290, 328),
      cart('c2', 435, 328),
      cart('c3', 400, 180, { dim: true, tag: 'c3 closed' }),
      cart('c4', 560, 180, { dim: true, tag: 'c4 closed' }),
      server(),
    ],
    props: [pool],
    stop: {
      edge: true,
      title: 'connection churn',
      body: (
        <p>
          Under steady load to one backend that means constant dial and close, piles of TIME_WAIT sockets, even port exhaustion. Raise <code>MaxIdleConnsPerHost</code> and share one Client across
          the program.
        </p>
      ),
    },
  },
  {
    caption: 'The server stalls. A zero-value http.Client has no timeout, so this goroutine waits forever.',
    actors: [g('still waiting…', true), road('conn1'), { ...server('…'), sprite: 'dandy-raining' }],
    props: [pool],
    stop: {
      edge: true,
      title: 'set timeouts',
      body: (
        <>
          <p>DefaultTransport bounds only dialing (30 s) and TLS (10 s). Nothing bounds a slow response: use a Client timeout or a per-request context.</p>
          <Code>{`c := &http.Client{
    Timeout: 5 * time.Second,
}`}</Code>
        </>
      ),
    },
  },
]

/* Versions: lanes are connections, small boxes are frames. */
const lane = (id: string, y: number, label: string, tone: Prop['tone'] = 'dashed'): Prop => ({ id, x: 170, y, w: 430, h: 80, tone, label })
const req = (id: string, x: number, y: number, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'misc-standing-left', x, y, h: 66, tag: id, flip: true, ...extra })
const frameBox = (id: string, i: number, n: string, tone: Prop['tone'] = 'ink'): Prop => ({ id, x: 190 + i * 66, y: 294, w: 56, h: 34, tone, text: n })
const frames2 = (lost: number | null): Prop[] => ['1', '3', '5', '1', '3', '5'].map((n, i) => frameBox('fr' + i, i, n, lost === null ? 'ink' : i === lost ? 'red' : 'soft'))
const king = server()

export const versions: Frame[] = [
  {
    caption: 'HTTP/1.1: one request at a time per connection. Everyone waits behind the slow one.',
    actors: [req('/a', 540, 330, { sprite: 'convict-hard-times', bubble: 'slow…', hot: true, flip: false }), req('/b', 440, 330), req('/c', 350, 330), king],
    props: [lane('l1', 260, 'TCP conn')],
  },
  {
    caption: 'Workaround: browsers open about 6 connections per host, each with its own handshakes.',
    actors: [req('/a', 540, 330, { sprite: 'convict-hard-times', flip: false }), req('/b', 540, 245), req('/c', 540, 160), king],
    props: [lane('l1', 260, 'conn 1'), lane('l2', 175, 'conn 2'), lane('l3', 90, 'conn 3')],
    stop: {
      edge: true,
      title: 'what about pipelining?',
      body: <p>HTTP/1.1 pipelining sends requests back to back, but responses must return in order, so a slow one still blocks the rest. Browsers never enabled it.</p>,
    },
  },
  {
    caption: 'HTTP/2: one TCP connection; each request is a stream, chopped into binary frames that interleave.',
    actors: [king],
    props: [lane('l1', 260, 'one TCP conn'), ...frames2(null)],
  },
  {
    caption: 'One TCP packet is lost. TCP delivers bytes in order, so every stream waits for the resend.',
    actors: [{ id: 'loss', sprite: 'science-experiment-mishap', x: 256, y: 256, h: 80, bubble: 'packet lost', hot: true }, king],
    props: [lane('l1', 260, 'one TCP conn'), ...frames2(1)],
    stop: {
      title: 'TCP head-of-line blocking',
      body: <p>HTTP/2 removed head-of-line blocking at the HTTP layer, not in TCP. On a lossy mobile link one HTTP/2 connection can lose to six HTTP/1.1 ones.</p>,
    },
  },
  {
    caption: 'HTTP/3 runs over QUIC on UDP. Each stream is ordered on its own, so a loss stalls only that stream.',
    actors: [{ id: 'loss', sprite: 'science-experiment-mishap', x: 256, y: 256, h: 80, bubble: 'only stream 3', hot: true }, king],
    props: [
      lane('l1', 260, 'QUIC · UDP'),
      ...['1', '3', '5', '1', '3', '5'].map((n, i) => frameBox('fr' + i, i, n, n === '3' ? (i === 1 ? 'red' : 'soft') : 'ink')),
    ],
  },
  {
    caption: 'QUIC identifies a connection by ID, not IP and port, so a phone can switch networks mid-download.',
    actors: [{ id: 'phone', sprite: 'science-jetpack', x: 400, y: 250, h: 110, tag: 'conn ID 7f3a', bubble: 'Wi-Fi → LTE' }, king],
    props: [lane('l1', 260, 'QUIC · UDP')],
    stop: {
      edge: true,
      title: 'in Go',
      body: (
        <p>
          <code>net/http</code> negotiates HTTP/2 automatically over TLS (ALPN <code>h2</code>); cleartext h2c via <code>Protocols</code> since 1.24. HTTP/3 isn’t in the standard library: use{' '}
          <code>quic-go</code>.
        </p>
      ),
    },
  },
]

/* gRPC */
const stub = (bubble?: string, hot?: boolean): Actor => ({ ...client(bubble, hot), tag: 'client stub' })
const svc = (bubble?: string, hot?: boolean): Actor => ({ ...server(bubble, hot), tag: 'Orders server' })
const four: Prop[] = [
  ['unary', '1 → 1'],
  ['server stream', '1 → N'],
  ['client stream', 'N → 1'],
  ['bidi', 'N ↔ N'],
].map(([k, v], i) => ({ id: 'k' + i, x: 200 + i * 102, y: 180, w: 94, h: 110, tone: 'line', text: <Cell k={k} v={v} /> }))

export const grpc: Frame[] = [
  {
    caption: 'gRPC starts from a .proto contract. protoc generates a typed client stub and a server interface.',
    actors: [stub(), { id: 'protoc', sprite: 'science-lightbulb', x: 400, y: 330, h: 100, tag: 'protoc' }, svc()],
    props: [
      {
        id: 'proto',
        x: 195,
        y: 100,
        w: 410,
        h: 110,
        label: 'orders.proto',
        text: (
          <span className="ht-msg">
            service Orders {'{'}
            <br />
            &nbsp;&nbsp;rpc Get(Req) returns (Order);
            <br />
            {'}'}
          </span>
        ),
      },
    ],
  },
  {
    caption: 'Each call is an HTTP/2 stream: POST /package.Service/Method with a binary protobuf body.',
    actors: [stub(), { id: 'crate', sprite: 'adventure-pirate-lifting-goods', x: 420, y: 300, h: 84, bubble: 'protobuf bytes' }, svc()],
    props: [{ id: 'path', x: 215, y: 110, w: 370, h: 44, tone: 'ink', text: 'POST /shop.Orders/Get' }, wire],
    stop: {
      title: 'status comes in trailers',
      body: (
        <p>
          The HTTP status is 200 even when the call fails; the real result is <code>grpc-status</code> in the HTTP/2 trailers, after the body. A stream can fail at its very end.
        </p>
      ),
    },
  },
  {
    caption: 'Four call shapes on the same stream: unary, server streaming, client streaming and bidirectional.',
    actors: [stub(), svc()],
    props: four,
  },
  {
    caption: 'Deadlines travel as the grpc-timeout header. The server’s ctx inherits them and passes on what’s left.',
    actors: [stub('300 ms budget'), { id: 'down', sprite: 'fairy-tale-witch-learning', x: 400, y: 330, h: 100, tag: 'downstream', bubble: '~250 ms left' }, svc()],
    props: [{ id: 'path', x: 215, y: 110, w: 370, h: 44, tone: 'ink', text: 'grpc-timeout: 300m' }],
    stop: {
      edge: true,
      title: 'no deadline by default',
      body: (
        <>
          <p>Without one a call can hang forever. Set it per call; the server sees it as <code>ctx.Done()</code>.</p>
          <Code>{`ctx, cancel := context.WithTimeout(
    ctx, 300*time.Millisecond)
defer cancel()
o, err := client.Get(ctx, req)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'HTTP/2 conns are long-lived, so an L4 load balancer pins every call to one backend.',
    actors: [
      stub(),
      { id: 'b1', sprite: 'fairy-tale-king', x: 690, y: 190, h: 60, tag: 'pod 1', bubble: 'all of it', hot: true },
      { id: 'b2', sprite: 'fairy-tale-king', x: 690, y: 260, h: 60, tag: 'pod 2', dim: true },
      { id: 'b3', sprite: 'fairy-tale-king', x: 690, y: 330, h: 60, tag: 'pod 3', dim: true },
    ],
    props: [{ id: 'lb', x: 320, y: 200, w: 160, h: 100, tone: 'line', text: <Cell k="L4 LB" v="one TCP conn" /> }],
    stop: {
      edge: true,
      title: 'balance per call',
      body: <p>Use client-side load balancing (resolver + round_robin) or an L7 proxy such as Envoy that spreads individual streams across pods.</p>,
    },
  },
  {
    caption: 'Typical split: REST at the edge for browsers and humans, gRPC between internal services.',
    actors: [stub(), svc()],
    props: [
      { id: 'rest', x: 205, y: 160, w: 190, h: 130, tone: 'line', text: <Cell k="REST + JSON" v="browsers · caching · curl" /> },
      { id: 'grpcb', x: 405, y: 160, w: 190, h: 130, tone: 'red', text: <Cell k="gRPC" v="typed contract · streams" /> },
    ],
  },
]
