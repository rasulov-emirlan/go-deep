import type { FlowDef, El } from '../../components/flow'
import { Code } from '../../components/Code'

/* Shared map: client on the left (x=80), the other end on the right (x=480). Ink = normal, grey = history, red = this step. */
const CX = 80
const SX = 480
const pair = (len: number, csub = 'ESTAB.', ssub = 'ESTAB.'): El[] => [
  { t: 'lane', id: 'c', x: CX, y: 8, len, text: 'client', sub: csub, w: 110 },
  { t: 'lane', id: 's', x: SX, y: 8, len, text: 'server', sub: ssub, w: 110 },
]

/* ---------- 01 · accept queue ---------- */
const slot = (id: string, x: number): El => ({ t: 'box', id, x, y: 200, w: 44, h: 34, tone: 'grey', dashed: true })

export const acceptQueue: FlowDef = {
  h: 246,
  steps: [
    {
      caption: 'Handshakes finish inside the kernel. `accept()` only takes finished connections off the accept queue. Here the queue holds 2.',
      add: [
        { t: 'lane', id: 'c', x: 70, y: 8, len: 176, text: 'client', sub: 'connect()', w: 110 },
        { t: 'lane', id: 'k', x: 290, y: 8, len: 176, text: 'kernel', sub: 'listening', w: 110 },
        { t: 'lane', id: 'a', x: 490, y: 8, len: 176, text: 'your app', sub: 'accept()', w: 110 },
        { t: 'text', id: 'ql', x: 290, y: 188, text: 'accept queue', size: 14, tone: 'grey' },
        slot('q1', 246),
        slot('q2', 294),
      ],
    },
    {
      caption: 'The final ACK moves the connection into the accept queue. The client already believes it is connected.',
      add: [
        { t: 'msg', id: 'syn', from: 'c', to: 'k', y: 66, y2: 82, text: 'SYN' },
        { t: 'msg', id: 'sa', from: 'k', to: 'c', y: 98, y2: 114, text: 'SYN-ACK' },
        { t: 'msg', id: 'ack', from: 'c', to: 'k', y: 130, y2: 146, text: 'ACK', tone: 'red' },
      ],
      set: { q1: { text: 'c1', tone: 'ink', dashed: false }, c: { sub: 'ESTAB.' } },
      stop: {
        title: 'SYN queue and cookies',
        edge: true,
        body: (
          <p>
            Half-open connections wait in a separate SYN queue. If a flood overflows it, SYN cookies keep no state and rebuild it from the returning ACK. That is a fallback, not a fix for real load.
          </p>
        ),
      },
    },
    {
      caption: 'Your accept loop stalls (GC pause, out of fds). The queue drains only as fast as `accept()` runs, so it fills.',
      drop: ['syn', 'sa', 'ack'],
      set: { q1: { tone: 'red' }, q2: { text: 'c2', tone: 'red', dashed: false }, a: { sub: 'stalled', tone: 'red' }, k: { sub: 'queue full' } },
    },
    {
      caption: 'Queue full: the next SYN is silently dropped. No RST, no answer. The client just keeps retrying.',
      add: [
        { t: 'msg', id: 'syn2', from: 'c', to: 'k', y: 66, y2: 82, text: 'SYN', tone: 'red', lost: true },
        { t: 'text', id: 'retry', x: 70, y: 130, text: 'retry\n1s 3s 7s', tone: 'red' },
      ],
      set: { c: { sub: 'SYN_SENT' } },
      stop: {
        title: 'Timeout, not refused',
        edge: true,
        body: (
          <p>
            The client sees <code>i/o timeout</code> after its dial timeout, not <code>connection refused</code>. The kernel gives up on a connect after <code>tcp_syn_retries=6</code>, about 131 s.
          </p>
        ),
      },
    },
    {
      caption: 'If the queue fills after the SYN-ACK, the final ACK is dropped. The client is ESTABLISHED; the server has no such connection.',
      drop: ['syn2', 'retry'],
      add: [
        { t: 'msg', id: 'sa2', from: 'k', to: 'c', y: 66, y2: 82, text: 'SYN-ACK' },
        { t: 'msg', id: 'ack2', from: 'c', to: 'k', y: 108, y2: 124, text: 'ACK', tone: 'red', lost: true },
      ],
      set: { c: { sub: 'ESTAB.' }, k: { sub: 'SYN_RECV' } },
      stop: {
        title: 'Spikes of exactly 1 s, 3 s',
        edge: true,
        body: (
          <p>
            The server resends SYN-ACK (1 s, 3 s, ...) until there is room, so requests can stall in 1 s / 3 s steps with no errors. Look for “listen queue overflowed” in <code>netstat -s</code>. Fix the accept loop; <code>tcp_abort_on_overflow=1</code> sends RST but the kernel docs warn it can harm clients.
          </p>
        ),
      },
    },
  ],
}

/* ---------- 01 · TIME_WAIT ---------- */
export const timeWait: FlowDef = {
  h: 262,
  steps: [
    {
      caption: 'Whoever calls `close()` first is the active closer. It sends FIN and gets an ACK.',
      add: [
        ...pair(250),
        { t: 'msg', id: 'f1', from: 'c', to: 's', y: 66, y2: 84, text: 'FIN' },
        { t: 'msg', id: 'a1', from: 's', to: 'c', y: 104, y2: 122, text: 'ACK' },
      ],
      set: { c: { sub: 'FIN_WAIT_2' }, s: { sub: 'CLOSE_WAIT' } },
    },
    {
      caption: 'After the last ACK the active closer sits in TIME_WAIT for 60 s on Linux (2 x MSL, the longest a segment may live). That 4-tuple stays reserved.',
      add: [
        { t: 'msg', id: 'f2', from: 's', to: 'c', y: 142, y2: 160, text: 'FIN' },
        { t: 'msg', id: 'a2', from: 'c', to: 's', y: 180, y2: 198, text: 'ACK', tone: 'red' },
        { t: 'text', id: 'tw', x: CX, y: 232, text: 'waits 60 s', tone: 'red' },
      ],
      set: { c: { sub: 'TIME_WAIT', tone: 'red' }, s: { sub: 'CLOSED' } },
      stop: {
        title: 'Restart while TIME_WAIT?',
        edge: true,
        body: (
          <p>
            Go sets <code>SO_REUSEADDR</code> on listeners, so <code>bind()</code> works despite TIME_WAIT. It does not let two live listeners share a port on Linux; <code>SO_REUSEPORT</code> does.
          </p>
        ),
      },
    },
    {
      caption: 'Why wait? If the last ACK is lost, the peer resends FIN, and someone must still be there to re-ACK instead of answering RST.',
      drop: ['f1', 'a1', 'f2', 'a2', 'tw'],
      add: [
        { t: 'msg', id: 'l1', from: 'c', to: 's', y: 66, y2: 84, text: 'ACK', tone: 'red', lost: true },
        { t: 'msg', id: 'f3', from: 's', to: 'c', y: 112, y2: 130, text: 'FIN again' },
        { t: 'msg', id: 'a3', from: 'c', to: 's', y: 158, y2: 176, text: 'ACK', tone: 'red' },
      ],
      set: { s: { sub: 'LAST_ACK' } },
      stop: {
        title: 'Two reasons to wait',
        body: <p>1. Re-ACK a resent FIN. 2. Let stray old segments of this 4-tuple die, so they can never be mistaken for a new connection.</p>,
      },
    },
    {
      caption: 'A client opening short connections to ONE dst ip:port burns a local port per connection for 60 s. About 28k / 60 s is roughly 470 new connections per second.',
      drop: ['c', 's', 'l1', 'f3', 'a3'],
      add: [
        { t: 'text', id: 'pl', x: 280, y: 30, text: 'ports 32768–60999', size: 17, tone: 'grey' },
        { t: 'box', id: 'ports', x: 30, y: 46, w: 500, h: 50, text: '~28k ports, all in TIME_WAIT', tone: 'red' },
        { t: 'text', id: 'rate', x: 280, y: 138, text: '28k / 60 s ≈ 470 conns/s', size: 20 },
        { t: 'text', id: 'err', x: 280, y: 190, text: 'connect: cannot assign\nrequested address', size: 18, tone: 'red' },
      ],
    },
    {
      caption: 'Fix it by reusing connections. `http.Transport` keeps only 2 idle connections per host by default, so raise `MaxIdleConnsPerHost`.',
      drop: ['rate', 'err', 'pl'],
      set: { ports: { tone: 'grey', y: 20 } },
      add: [
        { t: 'text', id: 'x1', x: 30, y: 122, size: 18, anchor: 'start', text: '✓ pool and keep-alive' },
        { t: 'text', id: 'x2', x: 30, y: 156, size: 18, anchor: 'start', text: '✓ more source or dest IPs' },
        { t: 'text', id: 'x3', x: 30, y: 190, size: 18, anchor: 'start', text: '~ tw_reuse: outgoing only', tone: 'grey' },
        { t: 'text', id: 'x4', x: 30, y: 232, size: 18, anchor: 'start', text: '✕ tw_recycle: removed', tone: 'red' },
      ],
      stop: {
        title: 'tw_recycle is gone',
        edge: true,
        body: (
          <p>
            Removed in Linux 4.12: it dropped SYNs from hosts whose timestamps went backwards, so clients behind one NAT randomly failed. <code>tcp_tw_reuse</code> (default 2, loopback only) needs timestamps and only helps outgoing connects.
          </p>
        ),
      },
    },
  ],
}

/* ---------- 02 · close is not one thing ---------- */
export const closing: FlowDef = {
  h: 262,
  steps: [
    {
      caption: 'FIN means “I am done sending”. The peer’s `Read` returns `io.EOF`. `CloseWrite()` sends exactly this.',
      add: [...pair(250), { t: 'msg', id: 'f', from: 'c', to: 's', y: 66, y2: 84, text: 'FIN' }],
      set: { s: { sub: 'Read: EOF' } },
    },
    {
      caption: 'Half-close: FIN shuts one direction only. The server can still reply and the client still reads it. Proxies do this per direction.',
      add: [{ t: 'msg', id: 'r', from: 's', to: 'c', y: 108, y2: 126, text: 'reply' }],
      set: { c: { sub: 'Read: ok' } },
    },
    {
      caption: 'Server answers 413 and calls `Close()` while the client’s upload still sits unread in its receive buffer.',
      drop: ['f', 'r'],
      add: [
        { t: 'msg', id: 'up', from: 'c', to: 's', y: 66, y2: 84, text: 'upload' },
        { t: 'msg', id: 'e413', from: 's', to: 'c', y: 108, y2: 126, text: '413' },
      ],
      set: { c: { sub: 'Read…' }, s: { sub: 'unread data', tone: 'red' } },
    },
    {
      caption: 'Closing with unread bytes sends RST, not FIN. RST aborts: unsent data is dropped and the client’s next Read errors, so the 413 is often lost.',
      add: [{ t: 'msg', id: 'rst', from: 's', to: 'c', y: 152, y2: 170, text: 'RST', tone: 'red' }],
      set: { e413: { lost: true }, c: { sub: 'ECONNRESET', tone: 'red' } },
      stop: {
        title: 'Where did my 413 go?',
        edge: true,
        body: (
          <p>
            The client’s <code>Read</code> fails with <code>connection reset by peer</code> and the error body is often lost (my Linux loopback test still delivered bytes that had already arrived; BSD and slow paths lose more). Send <code>CloseWrite()</code>, drain reads, then close; net/http’s server does <code>CloseWrite</code> and sleeps 500 ms first.
          </p>
        ),
      },
    },
    {
      caption: 'The peer already sent FIN. Our first write returns nil: it only reached the kernel buffer. The peer’s kernel answers RST.',
      drop: ['up', 'e413', 'rst'],
      add: [
        { t: 'msg', id: 'pf', from: 's', to: 'c', y: 66, y2: 84, text: 'FIN' },
        { t: 'msg', id: 'w1', from: 'c', to: 's', y: 108, y2: 126, text: 'write 1' },
        { t: 'msg', id: 'rst2', from: 's', to: 'c', y: 152, y2: 170, text: 'RST', tone: 'red' },
      ],
      set: { c: { sub: 'write: nil', tone: 'ink' }, s: { sub: 'closed', tone: 'ink' } },
    },
    {
      caption: 'The second write fails with EPIPE. In Go, a broken pipe kills the process only on fd 1 or 2; on sockets it is just an error.',
      add: [{ t: 'text', id: 'ep', x: 280, y: 222, text: 'write 2 → EPIPE', size: 18, tone: 'red' }],
      set: { c: { sub: 'EPIPE', tone: 'red' } },
      stop: {
        title: 'nil is not delivered',
        edge: true,
        body: (
          <p>
            <code>Write</code> returning nil means the bytes are in the kernel send buffer, nothing more. Classify with <code>errors.Is(err, syscall.EPIPE)</code> or <code>ECONNRESET</code>; a clean close is <code>io.EOF</code>.
          </p>
        ),
      },
    },
  ],
}

/* ---------- 03 · Nagle + delayed ACK ---------- */
export const nagle: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'Nagle holds a small write while earlier data is unACKed. The 10 B header leaves at once; the 100 B body waits.',
      add: [
        ...pair(280, 'NODELAY off', 'idle'),
        { t: 'msg', id: 'h', from: 'c', to: 's', y: 66, y2: 84, text: 'header 10B' },
        { t: 'box', id: 'held', x: 12, y: 124, w: 136, h: 34, text: 'body held', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'The receiver delays its ACK, hoping to piggyback it on a reply (Linux: at least 40 ms). Each side waits on the other.',
      add: [{ t: 'text', id: 'gap', x: 300, y: 152, text: '≈ 40 ms stall', size: 18, tone: 'red' }],
      set: { s: { sub: 'delay ACK', tone: 'red' } },
      stop: {
        title: 'Why exactly 40 ms?',
        edge: true,
        body: (
          <p>
            Nagle waits for an ACK; the ACK waits on a timer for data to ride with. The pattern is write(header), write(body), then read. Loopback run of 20 requests: 44–48 ms each with Nagle (all but the first), under 50 µs with NODELAY.
          </p>
        ),
      },
    },
    {
      caption: 'The timer fires, the ACK leaves, and only then does the body go. That is about +40 ms per request once the connection leaves its initial quick-ACK phase.',
      drop: ['held'],
      add: [
        { t: 'msg', id: 'ak', from: 's', to: 'c', y: 190, y2: 206, text: 'ACK' },
        { t: 'msg', id: 'b', from: 'c', to: 's', y: 226, y2: 242, text: 'body 100B', tone: 'red' },
      ],
      set: { s: { sub: 'idle', tone: 'ink' } },
    },
    {
      caption: 'Fix: one `Write` per message (bufio + Flush), or NODELAY. Go already sets `TCP_NODELAY` on dialed and accepted conns.',
      drop: ['h', 'gap', 'ak', 'b'],
      add: [
        { t: 'msg', id: 'one', from: 'c', to: 's', y: 66, y2: 84, text: 'hdr+body', tone: 'red' },
        { t: 'msg', id: 'ak2', from: 's', to: 'c', y: 110, y2: 128, text: 'reply' },
      ],
      set: { c: { sub: 'one Write' } },
      stop: {
        title: 'NODELAY is not free',
        body: (
          <>
            <p>Tiny packets mean more syscalls. Coalesce in user space:</p>
            <Code>{`w := bufio.NewWriter(conn)
w.Write(hdr)
w.Write(body)
w.Flush() // one segment`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 03 · silent peers ---------- */
export const deadPeer: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'The peer vanished (cable pulled, NAT entry gone) with no FIN or RST. No traffic means no signal: the client stays ESTABLISHED.',
      add: [
        { t: 'lane', id: 'c', x: CX, y: 8, len: 270, text: 'client', sub: 'Read blocks', w: 110 },
        { t: 'lane', id: 's', x: SX, y: 8, len: 270, text: 'server', sub: 'gone', w: 110, dead: true },
        { t: 'text', id: 'nosig', x: 280, y: 150, text: 'silence', size: 20, tone: 'grey' },
      ],
    },
    {
      caption: 'Keepalive is the traffic. Go probes after 15 s idle, then every 15 s, 9 times: about 150 s. Raw Linux: off, then 7200 s idle.',
      drop: ['nosig'],
      add: [
        { t: 'msg', id: 'p1', from: 'c', to: 's', y: 76, y2: 86, text: 'probe', lost: true },
        { t: 'msg', id: 'p2', from: 'c', to: 's', y: 116, y2: 126, text: 'probe', lost: true },
        { t: 'msg', id: 'p3', from: 'c', to: 's', y: 156, y2: 166, text: 'probe', lost: true, tone: 'red' },
        { t: 'text', id: 'x9', x: 280, y: 212, text: '15 s apart, x9', size: 18, tone: 'red' },
      ],
      set: { c: { sub: 'keepalive' } },
      stop: {
        title: 'Keepalive is not liveness',
        edge: true,
        body: (
          <p>
            Probes only test the peer’s kernel; a hung process still ACKs them. Use app heartbeats (HTTP/2 PING, gRPC keepalive) and deadlines. <code>http.DefaultTransport</code> sets a 30 s dial timeout and a 30 s keepalive.
          </p>
        ),
      },
    },
    {
      caption: 'With data in flight, retransmit timers double up to `tcp_retries2=15`: roughly 15 minutes before the kernel gives up.',
      drop: ['p1', 'p2', 'p3', 'x9'],
      add: [
        { t: 'msg', id: 'd0', from: 'c', to: 's', y: 76, y2: 86, text: 'data', lost: true },
        { t: 'msg', id: 'd1', from: 'c', to: 's', y: 114, y2: 124, text: 'retry', lost: true },
        { t: 'msg', id: 'd2', from: 'c', to: 's', y: 172, y2: 182, text: 'retry', lost: true, tone: 'red' },
        { t: 'text', id: 'dbl', x: 280, y: 230, text: 'gaps double → ≈15 min', size: 16, tone: 'red' },
      ],
      set: { c: { sub: 'Write ok?' } },
    },
    {
      caption: '`TCP_USER_TIMEOUT` caps how long sent data may stay unACKed, then fails with ETIMEDOUT. Not in the stdlib: set it via `Dialer.Control`.',
      drop: ['dbl'],
      add: [
        { t: 'line', id: 'cut', x1: 20, y1: 206, x2: 540, y2: 206, tone: 'red', dashed: true },
        { t: 'text', id: 'ut', x: 280, y: 236, text: 'user timeout 30 s → ETIMEDOUT', size: 15, tone: 'red' },
      ],
      set: { c: { sub: 'ETIMEDOUT', tone: 'red' } },
    },
    {
      caption: 'Alive but not reading: the peer’s window hits 0, the sender pauses and sends probes. A stalled reader can pin your `Write` indefinitely.',
      drop: ['d0', 'd1', 'd2', 'cut', 'ut'],
      add: [
        { t: 'msg', id: 'z1', from: 'c', to: 's', y: 66, y2: 84, text: 'data' },
        { t: 'msg', id: 'z2', from: 's', to: 'c', y: 108, y2: 126, text: 'ACK win=0', tone: 'red' },
        { t: 'msg', id: 'z3', from: 'c', to: 's', y: 160, y2: 178, text: 'probe' },
        { t: 'box', id: 'blk', x: 12, y: 214, w: 136, h: 34, text: 'Write blocks', tone: 'red', dashed: true },
      ],
      set: { c: { sub: 'sending', tone: 'ink' }, s: { sub: 'not reading', dead: false, tone: 'red' } },
      stop: {
        title: 'Use write deadlines',
        edge: true,
        body: (
          <p>
            Probes keep the connection alive as long as they are ACKed, so TCP will not save you. Call <code>SetWriteDeadline</code> per write: deadlines are absolute times, so re-arm each call.
          </p>
        ),
      },
    },
  ],
}
