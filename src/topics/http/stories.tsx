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
    caption: 'First the client asks DNS, the internet’s phone book, for the server’s IP address.',
    actors: [client('example.com?'), { id: 'dns', sprite: 'fairy-tale-witch-learning', x: 400, y: 330, h: 110, tag: 'DNS', bubble: '203.0.113.7' }, server()],
    props: [wire],
  },
  {
    caption: 'TCP handshake: the client sends SYN, asking to open a connection.',
    actors: [client(), pkt(560, 'SYN'), server()],
    props: [wire, rt(0)],
  },
  {
    caption: 'SYN-ACK comes back. That’s one round trip (RT): there and back.',
    actors: [client(), pkt(240, 'SYN-ACK', true), server()],
    props: [wire, rt(1)],
  },
  {
    caption: 'TLS sets up encryption: one more round trip for keys and the certificate.',
    actors: [client(), pkt(430, 'hello'), server('cert')],
    props: [wire, rt(2)],
    stop: {
      title: 'TLS 1.3 saves one',
      body: <p>TLS 1.2 needed two round trips to agree on keys. TLS 1.3 sends its key share in the first message.</p>,
    },
  },
  {
    caption: 'Now the encrypted GET request goes out.',
    actors: [client(), pkt(560, 'GET /'), server()],
    props: [wire, rt(2)],
  },
  {
    caption: '200 OK arrives after 3 round trips. At 100 ms each, that’s 300 ms.',
    actors: [client('finally!'), pkt(240, '200 OK', true, true), server()],
    props: [wire, rt(3, true)],
  },
]

/* Anatomy: one big letter in the middle of the stage. */
const letter = (label: string, lines: ReactNode): Prop => ({
  id: 'msg',
  x: 195,
  y: 150,
  w: 410,
  h: 150,
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
    ['safe', 'GET'],
    ['idempotent', 'PUT DELETE'],
    ['neither', 'POST PATCH'],
  ].map(([k, v], i) => ({ id: 'b' + i, x: 195 + i * 140, y: 160, w: 130, h: 130, tone: i === hot ? 'red' : 'line', text: <Cell k={k} v={v} /> }))

export const anatomy: Frame[] = [
  {
    caption: 'A request: a first line, then headers, a blank line, and an optional body.',
    actors: [client(), server()],
    props: [
      letter(
        'request',
        <>
          <b>GET /orders/42 HTTP/1.1</b>
          <br />
          Host: shop.example
          <br />
          <br />
          <i>(no body)</i>
        </>,
      ),
    ],
  },
  {
    caption: 'The response has the same shape, but starts with a status line.',
    actors: [client(), server()],
    props: [
      letter(
        'response',
        <>
          <b>HTTP/1.1 200 OK</b>
          <br />
          Content-Type: application/json
          <br />
          <br />
          {'{"id":42}'}
        </>,
      ),
    ],
  },
  {
    caption: 'The status code’s first digit says who failed: 4xx the client, 5xx the server.',
    actors: [client('404?'), server('your fault')],
    props: fam(3),
    stop: {
      title: 'Codes they ask about',
      body: (
        <p>
          <b>401</b> means not logged in; <b>403</b> means logged in but not allowed. <b>502</b> is a bad reply from upstream, <b>503</b> overloaded, <b>504</b> upstream timed out.
        </p>
      ),
    },
  },
  {
    caption: 'Idempotent methods can be repeated with the same end result. POST can’t.',
    actors: [client(), server()],
    props: buckets(2),
  },
  {
    caption: 'The client POSTs a payment. The server charges, but the reply is lost.',
    actors: [client(), { id: 'pkt', sprite: 'science-experiment-mishap', x: 400, y: 290, h: 80, bubble: 'lost!', hot: true }, server('charged')],
    props: [wire],
  },
  {
    caption: 'The client times out and retries, so the card is charged twice.',
    actors: [client('retry…'), pkt(470, 'POST /pay'), server('charged ×2', true)],
    props: [wire],
    stop: {
      title: 'Idempotency-Key',
      body: (
        <p>
          The client sends a unique <code>Idempotency-Key</code> header. The server saves each key’s result and returns it again instead of charging twice.
        </p>
      ),
    },
  },
]

/* Keep-alive: the connection is a cart; idle carts park in the Transport's pool. */
const g = (bubble?: string, hot?: boolean): Actor => ({ id: 'g', sprite: 'misc-standing-v2', x: 100, y: 330, h: 100, tag: 'goroutine', bubble, hot })
const pool: Prop = { id: 'pool', x: 200, y: 210, w: 320, h: 140, tone: 'dashed', label: 'idle pool' }
const cart = (id: string, x: number, y: number, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'adventure-pushing-cart', x, y, h: 95, tag: id, ...extra })
const road = (id: string, extra: Partial<Actor> = {}) => cart(id, 540, 190, extra)

export const keepAlive: Frame[] = [
  {
    caption: 'Go’s http.Transport keeps open connections to reuse. The first request must dial one.',
    actors: [g(), road('conn1', { bubble: 'dial + TLS' }), server()],
    props: [pool],
  },
  {
    caption: 'Read the body and close it: the connection goes back to the idle pool.',
    actors: [g('done'), cart('conn1', 330, 328), server()],
    props: [pool],
  },
  {
    caption: 'The next request reuses it: no handshakes, just one round trip.',
    actors: [g(), road('conn1', { bubble: 'reused!' }), server()],
    props: [pool],
  },
  {
    caption: 'Close the body without reading it, and the connection is thrown away.',
    actors: [g('Close() only', true), { id: 'boom', sprite: 'science-experiment-mishap', x: 540, y: 190, h: 90, tag: 'conn1', hot: true }, server()],
    props: [pool],
    stop: {
      title: 'Drain, then close',
      body: (
        <>
          <p>Unread bytes are still on the wire, so the connection can’t carry the next response.</p>
          <Code>{`defer resp.Body.Close()
io.Copy(io.Discard, resp.Body)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'The server stalls. The default http.Client has no timeout, so this waits forever.',
    actors: [g('still waiting…', true), road('conn1'), { ...server('…'), sprite: 'dandy-raining' }],
    props: [pool],
    stop: {
      title: 'Always set a timeout',
      body: (
        <>
          <p>By default nothing limits a slow response, so set one:</p>
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
const req = (id: string, x: number, y: number, extra: Partial<Actor> = {}): Actor => ({ id, sprite: 'misc-standing-left', x, y, h: 80, tag: id, flip: true, ...extra })
const frameBox = (id: string, i: number, n: string, tone: Prop['tone'] = 'ink'): Prop => ({ id, x: 190 + i * 66, y: 294, w: 56, h: 34, tone, text: n })
const frames2 = (lost: number | null): Prop[] => ['1', '3', '5', '1', '3', '5'].map((n, i) => frameBox('fr' + i, i, n, lost === null ? 'ink' : i === lost ? 'red' : 'soft'))
const king = server()

export const versions: Frame[] = [
  {
    caption: 'HTTP/1.1: one request at a time per connection. All wait behind the slow one.',
    actors: [req('/a', 540, 330, { sprite: 'convict-hard-times', bubble: 'slow…', hot: true, flip: false }), req('/b', 440, 330), req('/c', 350, 330), king],
    props: [lane('l1', 260, 'TCP conn')],
  },
  {
    caption: 'HTTP/2 sends many requests over one connection as interleaved streams.',
    actors: [king],
    props: [lane('l1', 260, 'one conn'), ...frames2(null)],
  },
  {
    caption: 'One lost packet stalls every stream: TCP delivers bytes strictly in order.',
    actors: [{ id: 'loss', sprite: 'science-experiment-mishap', x: 256, y: 256, h: 80, bubble: 'packet lost', hot: true }, king],
    props: [lane('l1', 260, 'one conn'), ...frames2(1)],
    stop: {
      title: 'TCP head-of-line blocking',
      body: <p>HTTP/2 stopped slow requests blocking each other, but TCP still blocks on a lost packet. On lossy mobile networks that hurts.</p>,
    },
  },
  {
    caption: 'HTTP/3 runs over QUIC, on UDP, so a loss stalls only its own stream.',
    actors: [{ id: 'loss', sprite: 'science-experiment-mishap', x: 256, y: 256, h: 80, bubble: 'only stream 3', hot: true }, king],
    props: [lane('l1', 260, 'QUIC'), ...['1', '3', '5', '1', '3', '5'].map((n, i) => frameBox('fr' + i, i, n, n === '3' ? (i === 1 ? 'red' : 'soft') : 'ink'))],
  },
  {
    caption: 'gRPC sends typed binary messages over HTTP/2, usually between services. Browsers get REST.',
    actors: [client(), king],
    props: [
      { id: 'rest', x: 205, y: 160, w: 190, h: 130, tone: 'line', text: <Cell k="REST" v="browsers" /> },
      { id: 'grpcb', x: 405, y: 160, w: 190, h: 130, tone: 'red', text: <Cell k="gRPC" v="services" /> },
    ],
  },
]
