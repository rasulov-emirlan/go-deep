import { Code } from '../../components/Code'
import type { El, FlowDef } from '../../components/flow'

/* Shared map: lanes at x = 80 (client) / 280 (proxy) / 480 (server). Ink = normal, grey = old, red = this step. */

/* ---------- A. TTL is not the failover time ---------- */
export const ttlFlow: FlowDef = {
  h: 275,
  steps: [
    {
      caption: 'Operator flips the A record to 10.0.0.2 with TTL 30 s. The authoritative server answers the new IP from t=0.',
      add: [
        { id: 'axis', t: 'line', x1: 130, y1: 232, x2: 545, y2: 232, tone: 'grey', arrow: true },
        { id: 'k0', t: 'text', x: 130, y: 254, text: 't=0', size: 13, tone: 'grey' },
        { id: 'k30', t: 'text', x: 250, y: 254, text: '+30 s', size: 13, tone: 'grey' },
        { id: 'la', t: 'text', x: 6, y: 77, text: 'authoritative', anchor: 'start' },
        { id: 'a1', t: 'box', x: 130, y: 60, w: 420, h: 34, text: '10.0.0.2  (TTL 30 s)', tone: 'red' },
      ],
    },
    {
      caption: 'A resolver that cached the old answer keeps serving 10.0.0.1 until its 30 s run out. Some resolvers clamp the TTL upward.',
      set: { a1: { tone: 'ink' } },
      add: [
        { id: 'lr', t: 'text', x: 6, y: 137, text: 'resolver', anchor: 'start' },
        { id: 'r1', t: 'box', x: 130, y: 120, w: 120, h: 34, text: 'cached .1', tone: 'red' },
      ],
      stop: {
        title: 'No answer is cached too',
        edge: true,
        body: <>NXDOMAIN (“no such host”) is cached as well, bounded by the zone’s SOA values. Ask before the record exists and the miss can stick for a while.</>,
      },
    },
    {
      caption: 'After the TTL, new lookups get 10.0.0.2. So far so good: failover ≈ TTL, but only for connections not yet dialled.',
      set: { r1: { tone: 'grey' } },
      add: [{ id: 'r2', t: 'box', x: 250, y: 120, w: 300, h: 34, text: '10.0.0.2 for new dials', tone: 'ink' }],
    },
    {
      caption: 'An established connection never asks DNS again. A pooled or long-lived one keeps hitting 10.0.0.1.',
      add: [
        { id: 'lc', t: 'text', x: 6, y: 197, text: 'pooled conn', anchor: 'start' },
        { id: 'c1', t: 'box', x: 130, y: 180, w: 420, h: 34, text: 'still talking to 10.0.0.1', tone: 'red' },
      ],
      stop: {
        title: 'TTL is not failover',
        edge: true,
        body: <>Failover = TTL + how long clients keep old connections. Go has no resolver cache, but a pooled <code>http.Transport</code> conn skips DNS entirely.</>,
      },
    },
    {
      caption: 'Bound connection age (server MaxConnectionAge, a periodic Connection: close) so reconnects re-resolve. Or steer with an L7/VIP health check.',
      set: { c1: { tone: 'grey', w: 200, text: 'old .1' } },
      add: [
        { id: 'kc', t: 'text', x: 330, y: 254, text: 'max age', size: 13, tone: 'grey' },
        { id: 'c2', t: 'box', x: 330, y: 180, w: 220, h: 34, text: 'reconnect: .2', tone: 'ink' },
      ],
    },
  ],
}

/* ---------- B. ndots:5 ---------- */
export const ndotsFlow: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Every k8s pod gets this resolv.conf. ndots:5 means: a name with fewer than 5 dots is tried with each search suffix first.',
      add: [{ id: 'rc', t: 'box', x: 40, y: 14, w: 480, h: 100, label: 'pod /etc/resolv.conf', text: 'search <ns>.svc.cluster.local\nsvc.cluster.local cluster.local\noptions ndots:5' }],
    },
    {
      caption: 'api.stripe.com has 2 dots. Each suffix is tried first and fails with NXDOMAIN (“no such name”), for A and for AAAA.',
      set: { rc: { tone: 'grey' } },
      add: [
        { id: 'hd', t: 'text', x: 280, y: 148, text: 'lookup api.stripe.com  (2 dots)' },
        { id: 'r1', t: 'text', x: 30, y: 182, text: '+ <ns>.svc.cluster.local', anchor: 'start' },
        { id: 'x1', t: 'text', x: 540, y: 182, text: 'A+AAAA ✕ NXDOMAIN', anchor: 'end', tone: 'red' },
        { id: 'r2', t: 'text', x: 30, y: 210, text: '+ svc.cluster.local', anchor: 'start' },
        { id: 'x2', t: 'text', x: 540, y: 210, text: 'A+AAAA ✕ NXDOMAIN', anchor: 'end', tone: 'red' },
        { id: 'r3', t: 'text', x: 30, y: 238, text: '+ cluster.local', anchor: 'start' },
        { id: 'x3', t: 'text', x: 540, y: 238, text: 'A+AAAA ✕ NXDOMAIN', anchor: 'end', tone: 'red' },
      ],
    },
    {
      caption: 'Only then is the name tried as typed. 8 queries for one lookup, more when the cloud adds node suffixes.',
      add: [
        { id: 'r4', t: 'text', x: 30, y: 266, text: 'api.stripe.com  (as typed)', anchor: 'start' },
        { id: 'x4', t: 'text', x: 540, y: 266, text: 'A+AAAA ✓ answer', anchor: 'end' },
        { id: 'n8', t: 'text', x: 280, y: 306, text: '8 queries, 1 useful', size: 18, tone: 'red' },
      ],
    },
    {
      caption: 'Fix: a trailing dot makes the name absolute, so no search list. Or ndots:2 per pod, NodeLocal DNSCache, CoreDNS autopath.',
      drop: ['r1', 'x1', 'r2', 'x2', 'r3', 'x3', 'n8'],
      set: { hd: { text: 'lookup api.stripe.com.  (trailing dot)' }, r4: { y: 190, text: 'api.stripe.com.' }, x4: { y: 190 } },
      add: [{ id: 'n2', t: 'text', x: 280, y: 250, text: '2 queries', size: 18 }],
      stop: {
        title: 'A different stall: 5 s',
        edge: true,
        body: (
          <>
            glibc sends A and AAAA from one socket; behind kube-proxy DNAT they can race in conntrack and one is dropped. The resolver then waits its 5 s timeout (tell: <code>insert_failed</code> in <code>conntrack -S</code>). Go uses separate ports, so it mostly dodges it.
          </>
        ),
      },
    },
  ],
}

/* ---------- C. one connection, all the load ---------- */
const PODS = ['A', 'B', 'C', 'D', 'E', 'F']
const py = (k: number) => 14 + k * 47
const pcy = (k: number) => py(k) + 19
const podBox = (k: number, pct: string, tone: 'ink' | 'grey' | 'red' = 'ink', dashed = false): El => ({ id: 'p' + k, t: 'box', x: 400, y: py(k), w: 150, h: 38, text: `pod ${PODS[k]} · ${pct}`, tone, dashed })
const fan = (pre: string, x: number, ks: number[], tone: 'ink' | 'red' = 'ink'): El[] =>
  ks.map((k) => ({ id: pre + k, t: 'line', x1: x, y1: 147, x2: 400, y2: pcy(k), tone, arrow: true }))

export const l4Flow: FlowDef = {
  h: 296,
  steps: [
    {
      caption: 'gRPC is HTTP/2: every call is a stream on one long-lived TCP connection. An L4 balancer picks a pod once, at connect.',
      add: [
        { id: 'cl', t: 'box', x: 10, y: 115, w: 100, h: 64, text: 'client', sub: '1 conn' },
        { id: 'cl2lb', t: 'line', x1: 110, y1: 147, x2: 184, y2: 147, arrow: true },
        { id: 'lb', t: 'box', x: 185, y: 115, w: 90, h: 64, text: 'L4 LB', sub: 'per conn' },
        ...fan('lb', 275, [0]),
        podBox(0, '100%'),
        podBox(1, '0%', 'grey'),
        podBox(2, '0%', 'grey'),
      ],
    },
    {
      caption: 'Scale 3 → 6 pods. The new pods get nothing and pod A stays hot: the balancer only ever decides on new connections.',
      add: [podBox(3, '0%', 'red', true), podBox(4, '0%', 'red', true), podBox(5, '0%', 'red', true)],
      set: { p0: { tone: 'red' } },
      stop: {
        title: 'Why no rebalance?',
        edge: true,
        body: <>L4 sees connections, not calls. One connection is one decision, made once; <code>least_conn</code> at L4 only affects new ones. A Go HTTP/2 client also tends to keep one connection per host.</>,
      },
    },
    {
      caption: 'Fix 1: server MaxConnectionAge makes it send GOAWAY (±10 % jitter). The client reconnects and the LB can pick a new pod.',
      set: { lb0: { tone: 'grey', dashed: true, text: 'old conn ends' }, p0: { tone: 'grey', text: 'pod A · 0%' }, p3: { tone: 'ink', dashed: false, text: 'pod D · 100%' } },
      add: fan('lb', 275, [3], 'red'),
      stop: {
        title: 'DNS is not polled',
        edge: true,
        body: (
          <>
            grpc-go re-resolves only after a connection breaks, at most every 30 s.
            <Code>{`keepalive.ServerParameters{
  MaxConnectionAge: 5 * time.Minute,
}`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Fix 2: an HTTP/2-aware L7 proxy (Envoy, linkerd) balances every call, not every connection.',
      drop: ['lb0', 'lb3'],
      set: { lb: { text: 'L7 proxy', sub: 'per call', tone: 'red' }, p0: { tone: 'ink', text: 'pod A · ~1/6' }, p1: { tone: 'ink', text: 'pod B · ~1/6' }, p2: { tone: 'ink', text: 'pod C · ~1/6' }, p3: { text: 'pod D · ~1/6' }, p4: { tone: 'ink', dashed: false, text: 'pod E · ~1/6' }, p5: { tone: 'ink', dashed: false, text: 'pod F · ~1/6' } },
      add: fan('px', 275, [0, 1, 2, 3, 4, 5]),
    },
    {
      caption: 'Fix 3: client-side round_robin. A headless Service gives every pod IP via dns:///, one subchannel each. The default, pick_first, uses one.',
      drop: ['lb', 'cl2lb', 'px0', 'px1', 'px2', 'px3', 'px4', 'px5'],
      set: { cl: { sub: 'round_robin', tone: 'red' } },
      add: fan('rr', 110, [0, 1, 2, 3, 4, 5]),
    },
  ],
}

/* ---------- D. idle timeout: who closes first ---------- */
const lanes3 = (targetSub: string): El[] => [
  { id: 'c', t: 'lane', x: 80, y: 8, len: 330, text: 'client' },
  { id: 'lbn', t: 'lane', x: 280, y: 8, len: 330, text: 'ALB', sub: 'idle 60 s', w: 100 },
  { id: 'tg', t: 'lane', x: 480, y: 8, len: 330, text: 'target', sub: targetSub, w: 130 },
]
export const idleFlow: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'The ALB keeps an idle connection to its target for 60 s. This target’s keep-alive is only 30 s: the wrong way round.',
      add: [...lanes3('keepalive 30 s'), { id: 'conn', t: 'line', x1: 280, y1: 90, x2: 480, y2: 90, tone: 'grey', dashed: true, text: 'idle conn' }],
    },
    {
      caption: 't = 30 s: the target closes its idle connection just as a request arrives. The ALB writes into a dying connection.',
      add: [
        { id: 'fin', t: 'msg', from: 'tg', to: 'lbn', y: 130, y2: 190, text: 'FIN', tone: 'grey', dashed: true },
        { id: 'g1', t: 'msg', from: 'c', to: 'lbn', y: 150, y2: 170, text: 'GET /' },
        { id: 'g2', t: 'msg', from: 'lbn', to: 'tg', y: 175, y2: 215, text: 'GET /', below: true, tone: 'red' },
      ],
    },
    {
      caption: 'The target answers RST, so the ALB returns 502 to a client whose request was fine.',
      add: [
        { id: 'rst', t: 'msg', from: 'tg', to: 'lbn', y: 245, y2: 272, text: 'RST', tone: 'red' },
        { id: 'e502', t: 'msg', from: 'lbn', to: 'c', y: 288, y2: 314, text: '502', tone: 'red' },
      ],
      stop: {
        title: 'Who must close last?',
        edge: true,
        body: <>The target’s keep-alive must be LONGER than the ALB’s idle timeout, so the ALB always closes first. The tempting rule “LB timeout &gt; server timeout” is backwards for ALB.</>,
      },
    },
    {
      caption: 'Fix: target keep-alive 75 s > ALB idle 60 s. The ALB closes first, so it never sends into a dying connection.',
      drop: ['fin', 'g1', 'g2', 'rst', 'e502'],
      set: { tg: { sub: 'keepalive 75 s' }, conn: { text: 'idle 60 s' } },
      add: [{ id: 'fin2', t: 'msg', from: 'lbn', to: 'tg', y: 150, y2: 175, text: 'FIN @ 60 s' }],
      stop: {
        title: 'NLB is different',
        edge: true,
        body: <>After its idle timeout (TCP: 350 s by default) an NLB silently drops the flow: no FIN. The next packet gets RST. Send TCP keepalives below the timeout (an ALB needs real data, not keepalives).</>,
      },
    },
  ],
}

/* ---------- F. retry on a reused connection ---------- */
export const retryFlow: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'The server closes an idle keep-alive connection. Its FIN is still in flight when the Go client reuses that connection.',
      add: [
        { id: 'c', t: 'lane', x: 80, y: 8, len: 280, text: 'Go client', w: 110 },
        { id: 's', t: 'lane', x: 480, y: 8, len: 280, text: 'server' },
        { id: 'fin', t: 'msg', from: 's', to: 'c', y: 105, y2: 150, text: 'FIN (idle)', tone: 'grey', dashed: true },
      ],
    },
    {
      caption: 'The next request goes out just as the FIN lands, and fails before any response byte.',
      add: [{ id: 'g1', t: 'msg', from: 'c', to: 's', y: 128, y2: 148, text: 'GET /a', tone: 'red', lost: true, below: true }],
    },
    {
      caption: 'GET is replayable and the connection was reused, so the Transport retries on a new connection. The app never sees the error.',
      add: [
        { id: 'g2', t: 'msg', from: 'c', to: 's', y: 190, y2: 205, text: 'GET /a (new)' },
        { id: 'ok', t: 'msg', from: 's', to: 'c', y: 225, y2: 245, text: '200' },
      ],
    },
    {
      caption: 'A POST without an Idempotency-Key is not replayed once its bytes were written. The app gets EOF or connection reset.',
      drop: ['fin', 'g1', 'g2', 'ok'],
      add: [{ id: 'p1', t: 'msg', from: 'c', to: 's', y: 120, y2: 140, text: 'POST /pay', tone: 'red', lost: true }],
      stop: {
        title: 'Only reused conns',
        edge: true,
        body: <>Go retries only on a reused connection, and only if nothing was written yet or the request is replayable (GET, HEAD, OPTIONS, TRACE, or an <code>Idempotency-Key</code> header) and the failure came before the first response byte. PUT and DELETE are idempotent in HTTP but not in Go’s list.</>,
      },
    },
  ],
}

/* ---------- E. graceful drain ---------- */
export const drainFlow: FlowDef = {
  h: 232,
  steps: [
    {
      caption: 'Pod deleted: endpoint removal and SIGTERM start in parallel. Removal takes seconds to reach every proxy.',
      add: [
        { id: 'l1', t: 'text', x: 6, y: 67, text: 'routing', anchor: 'start' },
        { id: 'e1', t: 'box', x: 110, y: 50, w: 210, h: 34, text: 'endpoint removal', dashed: true },
        { id: 'l2', t: 'text', x: 6, y: 129, text: 'process', anchor: 'start' },
        { id: 'pr', t: 'box', x: 110, y: 105, w: 100, h: 48, text: 'SIGTERM' },
      ],
    },
    {
      caption: 'Naive: close the listener on SIGTERM. Proxies still send traffic here for seconds: connection refused, or 502.',
      set: { pr: { tone: 'red', text: 'close\nlistener' } },
      add: [
        { id: 'l3', t: 'text', x: 6, y: 192, text: 'traffic', anchor: 'start' },
        { id: 'tr', t: 'box', x: 110, y: 175, w: 210, h: 34, text: 'still routed ✕', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'Right order: fail readiness, sleep while removal spreads, then Shutdown, then exit.',
      drop: ['l3', 'tr'],
      set: { pr: { tone: 'ink', text: 'fail\nreadiness' } },
      add: [
        { id: 'sl', t: 'box', x: 220, y: 105, w: 100, h: 48, text: 'sleep\n5–15 s' },
        { id: 'sd', t: 'box', x: 330, y: 105, w: 100, h: 48, text: 'Shutdown\n(ctx)' },
        { id: 'ex', t: 'box', x: 440, y: 105, w: 100, h: 48, text: 'exit' },
      ],
      stop: {
        title: 'Why sleep at all?',
        edge: true,
        body: <>Signals and endpoint removal are two asynchronous systems. Failing readiness only removes endpoints; existing connections stay until you close them.</>,
      },
    },
    {
      caption: 'One budget: terminationGracePeriodSeconds (30 s default) covers the preStop sleep and Shutdown together. Size it ≥ sleep + longest request.',
      add: [
        { id: 'l4', t: 'text', x: 6, y: 192, text: 'grace', anchor: 'start' },
        { id: 'gr', t: 'box', x: 110, y: 175, w: 430, h: 34, text: 'grace period 30 s (default)', tone: 'red' },
      ],
      stop: {
        title: 'Hijacked conns are yours',
        edge: true,
        body: <>Shutdown stops listeners, closes idle conns, waits for active ones. WebSocket/hijacked conns are not tracked: close them in <code>RegisterOnShutdown</code>.</>,
      },
    },
  ],
}
