import { Code } from '../../components/Code'
import type { El, FlowDef, Tone } from '../../components/flow'

/* ---------- small drawing helpers ---------- */

type Pt = [number, number]

/** arrow between two points, shortened so it starts/ends at the edge of circles of radius ra / rb; `off` shifts it sideways */
function link(id: string, a: Pt, b: Pt, o: { tone?: Tone; dashed?: boolean; text?: string; ra?: number; rb?: number; off?: number; arrow?: boolean } = {}): El {
  const [ax, ay] = a
  const [bx, by] = b
  const len = Math.hypot(bx - ax, by - ay) || 1
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const ra = (o.ra ?? 22) + 3
  const rb = (o.rb ?? 22) + 3
  const px = -uy * (o.off ?? 0)
  const py = ux * (o.off ?? 0)
  return {
    t: 'line',
    id,
    x1: ax + ux * ra + px,
    y1: ay + uy * ra + py,
    x2: bx - ux * rb + px,
    y2: by - uy * rb + py,
    tone: o.tone,
    dashed: o.dashed,
    arrow: o.arrow ?? true,
    text: o.text,
  }
}

const node = (id: string, p: Pt, text: string, tone?: Tone, dashed?: boolean): El => ({ t: 'node', id, x: p[0], y: p[1], r: 22, text, tone, dashed })
const txt = (id: string, x: number, y: number, text: string, tone?: Tone, anchor?: 'start' | 'middle' | 'end', size?: number): El => ({ t: 'text', id, x, y, text, tone, anchor, size })
const cross = (id: string, x: number, y: number): El => ({ t: 'text', id, x, y, text: '✕', tone: 'red', size: 22 })

/* ---------- 1. slow or dead? ---------- */

export const slowOrDead: FlowDef = {
  h: 420,
  steps: [
    {
      caption: 'A monitor pings node N every second and expects an ack. The naive rule: no ack for T (say 3 s) means dead.',
      add: [
        { t: 'lane', id: 'M', x: 120, y: 8, len: 410, text: 'Monitor' },
        { t: 'lane', id: 'N', x: 440, y: 8, len: 410, text: 'Node N' },
        { t: 'msg', id: 'p1', y: 70, y2: 88, from: 'M', to: 'N', text: 'ping' },
        { t: 'msg', id: 'a1', y: 102, y2: 120, from: 'N', to: 'M', text: 'ack' },
      ],
    },
    {
      caption: 'N stalls: a GC pause, a swap storm, a stuck disk. The next ping arrives, but no ack ever leaves.',
      add: [
        { t: 'box', id: 'stall', x: 407, y: 140, w: 66, h: 182, tone: 'red', dashed: true, text: 'paused' },
        { t: 'msg', id: 'p2', y: 170, y2: 188, from: 'M', to: 'N', text: 'ping' },
      ],
    },
    {
      caption: 'Pings go out into silence while the monitor’s timer, started at the last ack, runs: 1 s, 2 s, 3 s.',
      add: [
        { t: 'msg', id: 'p3', y: 230, y2: 248, from: 'M', to: 'N', text: 'ping' },
        { t: 'msg', id: 'p4', y: 290, y2: 308, from: 'M', to: 'N', text: 'ping' },
        { t: 'line', id: 'timer', x1: 70, y1: 110, x2: 70, y2: 290, tone: 'red', arrow: true },
        txt('timer-t', 70, 316, '3 s', 'red'),
      ],
    },
    {
      caption: 'T expires. The monitor declares N dead and starts a failover.',
      add: [{ t: 'box', id: 'dead', x: 45, y: 340, w: 150, h: 34, tone: 'red', text: 'N is DEAD' }],
    },
    {
      caption: 'Fifty milliseconds later N wakes and acks. It was never dead, only slow. The failover is already running.',
      add: [{ t: 'msg', id: 'a2', y: 386, y2: 404, from: 'N', to: 'M', text: 'late ack', tone: 'red' }],
      set: { stall: { tone: 'grey' } },
    },
    {
      caption: 'Crash, stall, lost packets: the monitor sees the same thing, silence. A detector can only guess.',
      drop: ['M', 'N', 'p1', 'a1', 'p2', 'p3', 'p4', 'timer', 'timer-t', 'dead', 'a2', 'stall'],
      add: [
        { t: 'box', id: 'mon', x: 20, y: 150, w: 140, h: 100, tone: 'ink', label: 'monitor', text: 'sees only', sub: 'silence' },
        { t: 'box', id: 'c1', x: 310, y: 50, w: 240, h: 50, text: 'N crashed' },
        { t: 'box', id: 'c2', x: 310, y: 175, w: 240, h: 50, text: 'N stalled (GC)' },
        { t: 'box', id: 'c3', x: 310, y: 300, w: 240, h: 50, text: 'link dropped packets' },
        { t: 'line', id: 'l1', x1: 162, y1: 185, x2: 306, y2: 82, tone: 'red', dashed: true, arrow: true },
        { t: 'line', id: 'l2', x1: 162, y1: 200, x2: 306, y2: 200, tone: 'red', dashed: true, arrow: true },
        { t: 'line', id: 'l3', x1: 162, y1: 215, x2: 306, y2: 322, tone: 'red', dashed: true, arrow: true },
      ],
      stop: {
        title: 'Silence is ambiguous',
        edge: true,
        body: (
          <>
            A detector trades completeness (every dead node is eventually suspected) against accuracy (live nodes are not accused). A timeout means <em>unknown</em>, never <em>failed</em>.
          </>
        ),
      },
    },
  ],
}

/* ---------- 2. fixed timeout vs phi accrual ---------- */

const AX = { x1: 60, y1: 230, x2: 520, y2: 230 }

export const phiAccrual: FlowDef = {
  h: 285,
  steps: [
    {
      caption: 'Fixed T = 1.5 s: one late beat and a live node is accused. A false failover can do more harm than the slowness (GitHub, 2012).',
      add: [
        txt('lab1', 30, 34, 'T = 1.5 s: quick, jumpy', 'ink', 'start'),
        { t: 'line', id: 'ax1', x1: 30, y1: 100, x2: 530, y2: 100, tone: 'grey' },
        { t: 'path', id: 'tk1', d: 'M60,84 L60,116 M130,84 L130,116 M200,84 L200,116 M340,84 L340,116 M410,84 L410,116', tone: 'ink' },
        { t: 'line', id: 'mk1', x1: 305, y1: 70, x2: 305, y2: 126, tone: 'red', dashed: true },
        txt('dd1', 305, 148, 'declared dead', 'red'),
      ],
    },
    {
      caption: 'Fixed T = 10 s: calm, but a node that really died is noticed ten seconds late. One number cannot suit every network.',
      add: [
        txt('lab2', 30, 190, 'T = 10 s: calm, slow', 'ink', 'start'),
        { t: 'line', id: 'ax2', x1: 30, y1: 235, x2: 530, y2: 235, tone: 'grey' },
        { t: 'path', id: 'tk2', d: 'M60,219 L60,251 M130,219 L130,251 M200,219 L200,251', tone: 'ink' },
        cross('dies', 236, 235),
        { t: 'line', id: 'ln2', x1: 236, y1: 262, x2: 525, y2: 262, tone: 'red', arrow: true, text: '10 s of silence (not to scale)' },
      ],
    },
    {
      caption: 'Phi-accrual instead keeps a window of recent gaps between beats and learns what “normal” looks like on this link.',
      drop: ['lab1', 'ax1', 'tk1', 'mk1', 'dd1', 'lab2', 'ax2', 'tk2', 'dies', 'ln2'],
      add: [
        { t: 'line', id: 'axh', x1: 40, y1: 200, x2: 520, y2: 200, tone: 'grey' },
        ...[8, 30, 68, 100, 78, 42, 20, 8].map<El>((hh, k) => ({ t: 'box', id: `hb${k}`, x: 50 + k * 28, y: 200 - hh, w: 28, h: hh, tone: 'grey' })),
        txt('hx', 160, 226, 'gap between beats', 'grey'),
        txt('hl', 60, 40, 'recent gaps (window of 1000)', 'ink', 'start'),
      ],
    },
    {
      caption: 'Silence has now lasted longer than almost any recorded gap. phi = −log10 of the chance a beat is still coming: 1-in-1000 gives phi 3.',
      add: [
        { t: 'line', id: 'now', x1: 430, y1: 90, x2: 430, y2: 200, tone: 'red', dashed: true },
        txt('nowt', 430, 74, 'silence so far', 'red'),
        txt('nowp', 440, 160, 'P ≈ 0.1%\nphi ≈ 3', 'red', 'start'),
      ],
    },
    {
      caption: 'Plot phi against silence: it stays near 0 while beats are on time, then climbs. The app chooses its own threshold, here 8.',
      drop: ['axh', 'hb0', 'hb1', 'hb2', 'hb3', 'hb4', 'hb5', 'hb6', 'hb7', 'hx', 'hl', 'now', 'nowt', 'nowp'],
      add: [
        { t: 'line', id: 'ay', x1: 60, y1: 230, x2: 60, y2: 30, tone: 'grey', arrow: true },
        { ...AX, t: 'line', id: 'ax', tone: 'grey', arrow: true },
        txt('axl', 290, 262, 'silence since the last beat', 'grey'),
        txt('ayl', 72, 22, 'phi', 'grey', 'start'),
        { t: 'line', id: 'thr', x1: 60, y1: 86, x2: 520, y2: 86, tone: 'red', dashed: true },
        txt('thrl', 520, 74, 'threshold 8', 'red', 'end'),
        { t: 'path', id: 'akka', d: 'M60,229 C110,228 150,200 181,86', tone: 'ink', width: 3 },
      ],
    },
    {
      caption: 'Same threshold, different maths (curves are sketches). Akka assumes normal gaps; Cassandra assumes exponential ones.',
      add: [
        { t: 'path', id: 'cass', d: 'M60,229 L465,86', tone: 'ink', width: 3 },
        txt('akl', 196, 120, 'Akka ≈ 5.5 s', 'ink', 'start'),
        txt('cal', 520, 200, 'Cassandra ≈ 18× mean', 'ink', 'end'),
      ],
      stop: {
        title: 'Same phi, different distribution',
        edge: true,
        body: (
          <>
            Both default to threshold 8. Akka fits a normal curve (about 5.5 s of silence with its defaults). Cassandra uses phi = t / mean / ln 10, so 8 means silence of about 18× the mean gap.
          </>
        ),
      },
    },
  ],
}

/* ---------- 3. SWIM ---------- */

const P: Record<string, Pt> = { A: [80, 175], B: [480, 175], C: [280, 50], D: [280, 300], E: [421, 87], F: [421, 263], G: [139, 263], H: [139, 87] }
const ring = (): El[] => Object.entries(P).map(([k, p]) => node('n' + k, p, k))
const L = (id: string, a: string, b: string, o: Parameters<typeof link>[3] = {}) => link(id, P[a], P[b], o)
const note = (text: string, tone: Tone = 'ink') => txt('note', 10, 24, text, tone, 'start')

export const swim: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Every second, A pings the next member in its shuffled probe list (B). SWIM keeps each node’s load constant as the cluster grows.',
      add: [...ring(), L('ping', 'A', 'B', { text: 'ping' }), note('A probes B')],
    },
    {
      caption: 'No ack within 500 ms. Is B down, or is the path from A bad? A cannot tell yet.',
      set: { ping: { tone: 'red', dashed: true } },
      add: [txt('nack', 280, 205, 'no ack in 500 ms', 'red')],
    },
    {
      caption: 'So A asks three other members to ping B for it: an indirect probe, `ping-req`. It tests A’s path, not only B.',
      drop: ['nack'],
      set: { ping: { tone: 'grey' }, note: { text: 'A asks 3 members:\nping-req(B)' } },
      add: [L('ask1', 'A', 'C'), L('ask2', 'A', 'D'), L('ask3', 'A', 'E')],
    },
    {
      caption: 'C, D and E each ping B. A also retries over TCP in parallel, in case UDP is what is blocked.',
      set: { ask1: { tone: 'grey' }, ask2: { tone: 'grey' }, ask3: { tone: 'grey' }, note: { text: 'they ping B;\nA retries on TCP' } },
      add: [L('r1', 'C', 'B'), L('r2', 'D', 'B'), L('r3', 'E', 'B')],
    },
    {
      caption: 'Nobody gets an ack, so B is marked suspect, not dead. A gossips that by piggybacking it on the pings it sends anyway.',
      set: { r1: { tone: 'red', dashed: true }, r2: { tone: 'red', dashed: true }, r3: { tone: 'red', dashed: true }, nB: { tone: 'red', dashed: true }, note: { text: 'no acks:\nB is suspect', tone: 'red' } },
      add: [txt('stB', 520, 214, 'suspect\ninc 4', 'red'), L('g1', 'A', 'H', { tone: 'red' }), L('g2', 'A', 'G', { tone: 'red' })],
    },
    {
      caption: 'The rumour reaches B. B is alive, so it raises its own incarnation number to 5 and gossips Alive(5). That beats Suspect(4).',
      drop: ['ping', 'ask1', 'ask2', 'ask3', 'r1', 'r2', 'r3'],
      set: { nB: { tone: 'ink', dashed: false }, stB: { text: 'alive\ninc 5' }, g1: { tone: 'grey' }, g2: { tone: 'grey' }, note: { text: 'B refutes', tone: 'red' } },
      add: [L('f1', 'B', 'E', { tone: 'red' }), L('f2', 'B', 'F', { tone: 'red' })],
      stop: {
        title: 'Only B bumps B’s number',
        edge: true,
        body: (
          <>
            That is why Alive(5) safely overrides Suspect(4). A node that restarts and forgets its number can lose to stale “dead” gossip, so memberlist has a skip-ahead path for rejoining nodes.
          </>
        ),
      },
    },
    {
      caption: 'Had B truly crashed, nobody refutes. The suspicion timer ends B: 4 s at 8 nodes once others confirm, else 24 s. Gossip spreads in O(log N) rounds.',
      drop: ['f1', 'f2'],
      set: { nB: { tone: 'red' }, stB: { text: 'dead\ninc 4' }, note: { text: 'no refutation:\nB is dead', tone: 'red' } },
      add: [L('g3', 'H', 'C', { tone: 'red' }), L('g4', 'G', 'D', { tone: 'red' })],
    },
    {
      caption: 'Now A is the sick one, starved of CPU. It misses its own acks and starts accusing healthy nodes. Lifeguard makes it notice.',
      drop: ['g1', 'g2', 'g3', 'g4', 'stB'],
      set: { nB: { tone: 'ink' }, nA: { tone: 'red', dashed: true }, note: { text: 'A is slow;\nit accuses C, D, F', tone: 'red' } },
      add: [L('x1', 'A', 'C', { tone: 'red', dashed: true }), L('x2', 'A', 'D', { tone: 'red', dashed: true }), L('x3', 'A', 'F', { tone: 'red', dashed: true })],
      stop: {
        title: 'Slow observer',
        edge: true,
        body: (
          <>
            One sick observer looks like many dead targets. Lifeguard: a node that misses its own acks raises a health multiplier and backs off.
            <Code>{`c := memberlist.DefaultLANConfig()
c.ProbeInterval = time.Second
c.ProbeTimeout = 500*time.Millisecond
c.IndirectChecks = 3
c.SuspicionMult = 4
c.AwarenessMaxMultiplier = 8 // all equal the defaults`}</Code>
          </>
        ),
      },
    },
    {
      caption: 'Gossip is probabilistic, so about every 30 s each node swaps full state with one random peer over TCP. That heals missed rumours and partitions.',
      drop: ['x1', 'x2', 'x3'],
      set: { nA: { tone: 'ink', dashed: false }, note: { text: 'push/pull sync\nevery 30 s', tone: 'ink' } },
      add: [L('s1', 'G', 'F', { off: -6, text: 'full state' }), L('s2', 'F', 'G', { off: -6 })],
    },
  ],
}

/* ---------- 4a. gray failure ---------- */

export const gray: FlowDef = {
  h: 385,
  steps: [
    {
      caption: 'The monitor checks `/health`. It takes a tiny code path, and it answers 200.',
      add: [
        { t: 'lane', id: 'M', x: 100, y: 8, len: 370, text: 'Monitor' },
        { t: 'lane', id: 'N', x: 280, y: 8, len: 370, text: 'Node' },
        { t: 'lane', id: 'C', x: 460, y: 8, len: 370, text: 'Client' },
        { t: 'msg', id: 'h1', y: 66, y2: 82, from: 'M', to: 'N', text: 'GET /health' },
        { t: 'msg', id: 'h1r', y: 100, y2: 116, from: 'N', to: 'M', text: '200 OK' },
      ],
    },
    {
      caption: 'A real request needs the worker pool, which is stuck on a stalled disk. The client waits.',
      add: [
        { t: 'box', id: 'pool', x: 305, y: 185, w: 100, h: 46, tone: 'red', dashed: true, text: 'pool full' },
        { t: 'msg', id: 'o1', y: 150, y2: 166, from: 'C', to: 'N', text: 'GET /order' },
      ],
    },
    {
      caption: 'The monitor asks again and gets 200: “healthy”. The client’s request timed out. Observer and user disagree, a gray failure.',
      add: [
        { t: 'msg', id: 'h2', y: 215, y2: 231, from: 'M', to: 'N', text: 'GET /health', tone: 'red' },
        { t: 'msg', id: 'h2r', y: 246, y2: 262, from: 'N', to: 'M', text: '200 OK', tone: 'red' },
        { t: 'box', id: 'mbox', x: 50, y: 280, w: 100, h: 32, text: 'healthy' },
        txt('cto', 460, 255, 'timed out', 'red'),
      ],
    },
    {
      caption: 'Fix: probe the path users take. This probe is a real `/order` request, so the stuck pool shows up and the node is ejected.',
      add: [{ t: 'msg', id: 'pr', y: 334, y2: 350, from: 'M', to: 'N', text: 'GET /order', tone: 'red', lost: true }],
      set: { mbox: { tone: 'red', text: 'eject' } },
      stop: {
        title: 'Probe the real path',
        edge: true,
        body: (
          <>
            Gray failure: up for the health check, degraded for the app. Use deep checks, request success rates, several observers voting, outlier ejection (as in Envoy).
          </>
        ),
      },
    },
  ],
}

/* ---------- 4b. partitions vs a leader ---------- */

export const partitions: FlowDef = {
  h: 290,
  steps: [
    {
      caption: 'A complete 3|2 partition. The side with 3 of 5 keeps its leader. The minority campaigns but can never collect 3 votes.',
      add: [
        node('A', [70, 100], 'A'),
        node('B', [190, 100], 'B'),
        node('C', [130, 200], 'C'),
        node('D', [430, 100], 'D', 'red', true),
        node('E', [430, 200], 'E', 'red', true),
        txt('lead', 70, 58, 'leader', 'grey'),
        link('h1', [70, 100], [190, 100]),
        link('h2', [70, 100], [130, 200]),
        { t: 'path', id: 'cut', d: 'M310,30 L310,262', tone: 'red', dashed: true, width: 3 },
        txt('mj', 130, 258, '3 of 5: A keeps\nleading', 'ink'),
        txt('mn', 440, 258, '2 of 5: campaigns,\ncan’t win', 'red'),
      ],
    },
    {
      caption: 'Partial partition: A–C is cut but B still talks to both. Each node has a different idea of who is up.',
      drop: ['A', 'B', 'C', 'D', 'E', 'lead', 'h1', 'h2', 'cut', 'mj', 'mn'],
      add: [
        node('A2', [280, 60], 'A'),
        node('B2', [120, 210], 'B'),
        node('C2', [440, 210], 'C'),
        txt('lead2', 350, 64, 'leader', 'grey', 'start'),
        link('ab', [280, 60], [120, 210]),
        link('bc', [120, 210], [440, 210], { arrow: false }),
        link('ac', [280, 60], [440, 210], { tone: 'red', dashed: true, arrow: false }),
        cross('acx', 360, 135),
      ],
      stop: {
        title: 'Partitions are rarely clean',
        edge: true,
        body: <>A–B fine, B–C fine, A–C broken: the link is not transitive. A sees C down, B sees both up. Leader protocols assume everyone agrees.</>,
      },
    },
    {
      caption: 'C hears no leader, times out, bumps its term. B adopts it and rejects A’s stale heartbeats, so A steps down. Pre-Vote and CheckQuorum help, with edge cases.',
      set: { C2: { tone: 'red' }, A2: { tone: 'grey' }, lead2: { text: 'steps down', tone: 'red' } },
      add: [link('vote', [440, 210], [120, 210], { tone: 'red', text: 'vote? term 8', off: 12 })],
    },
    {
      caption: 'One-way failure: X can send but hears nothing. It times out, bumps its term, and its votes keep unseating a healthy leader.',
      drop: ['A2', 'B2', 'C2', 'lead2', 'ab', 'bc', 'ac', 'acx', 'vote'],
      add: [
        node('L', [280, 60], 'L'),
        node('F', [120, 210], 'F'),
        node('X', [440, 210], 'X', 'red', true),
        txt('leadl', 350, 64, 'leader', 'grey', 'start'),
        link('lf', [280, 60], [120, 210]),
        link('lx', [280, 60], [440, 210], { tone: 'grey', dashed: true, off: -7 }),
        cross('lxx', 364, 128),
        link('xl', [440, 210], [280, 60], { tone: 'red', off: -7 }),
        txt('xlt', 545, 150, 'vote? term+1', 'red', 'end'),
      ],
      stop: {
        title: 'Sends but cannot receive',
        edge: true,
        body: <>A NIC that dropped inbound but not outbound packets kept a node’s heartbeats flowing, so its hot spare never took over: 5 hours until a reboot.</>,
      },
    },
    {
      caption: 'The leader is reachable by clients but not by a quorum. It can commit nothing. With CheckQuorum it steps down instead of pretending.',
      drop: ['L', 'F', 'X', 'leadl', 'lf', 'lx', 'lxx', 'xl', 'xlt'],
      add: [
        { t: 'box', id: 'cl', x: 10, y: 92, w: 96, h: 44, text: 'clients' },
        node('L3', [280, 60], 'L', 'red', true),
        node('F3', [160, 210], 'F'),
        node('G3', [400, 210], 'G'),
        link('cw', [106, 114], [280, 60], { ra: 0, text: 'write' }),
        link('lf3', [280, 60], [160, 210], { tone: 'red', dashed: true }),
        link('lg3', [280, 60], [400, 210], { tone: 'red', dashed: true }),
        cross('x1', 218, 132),
        cross('x2', 342, 132),
      ],
    },
  ],
}

/* ---------- 5a. split brain & fencing ---------- */

export const splitBrain: FlowDef = {
  h: 300,
  steps: [
    {
      caption: 'Two nodes, one primary. The standby promotes itself when heartbeats stop.',
      add: [
        { t: 'box', id: 'P', x: 40, y: 40, w: 130, h: 64, label: 'primary', text: 'node P' },
        { t: 'box', id: 'S', x: 390, y: 40, w: 130, h: 64, label: 'standby', text: 'node S' },
        { t: 'line', id: 'hb', x1: 174, y1: 72, x2: 386, y2: 72, arrow: true, text: 'heartbeats' },
      ],
    },
    {
      caption: 'The link fails. Each side sees only silence: P thinks S died, and S thinks P died and promotes itself.',
      set: { hb: { tone: 'red', dashed: true }, S: { tone: 'red', label: 'promoted?' } },
      add: [cross('hbx', 280, 98), txt('pt', 105, 138, 'S is silent:\nkeep serving', 'ink'), txt('st', 455, 138, 'P is silent:\nI’m primary', 'red')],
    },
    {
      caption: 'Both accept writes: split brain. After the heal one history must be thrown away (one EC2 MongoDB case lost 2 hours of writes).',
      set: { P: { tone: 'red' } },
      add: [
        { t: 'box', id: 'c1', x: 40, y: 240, w: 130, h: 40, text: 'client 1' },
        { t: 'box', id: 'c2', x: 390, y: 240, w: 130, h: 40, text: 'client 2' },
        { t: 'line', id: 'w1', x1: 105, y1: 236, x2: 105, y2: 180, arrow: true, tone: 'red', text: 'x=1' },
        { t: 'line', id: 'w2', x1: 455, y1: 236, x2: 455, y2: 180, arrow: true, tone: 'red', text: 'x=2' },
      ],
      stop: {
        title: 'Two nodes have no majority',
        edge: true,
        body: <>Neither side can tell “peer died” from “link died”. Add a third voter (witness, odd count): only the side with a majority may lead.</>,
      },
    },
    {
      caption: 'A witness W breaks the tie. S and W hold 2 of 3 and may lead. P holds 1 of 3, so it must stop serving.',
      drop: ['c1', 'c2', 'w1', 'w2', 'pt', 'st', 'hbx', 'hb'],
      set: { P: { tone: 'grey', label: 'minority: stops' }, S: { tone: 'ink', label: 'leader' } },
      add: [
        { t: 'box', id: 'W', x: 215, y: 190, w: 130, h: 56, label: 'witness', text: 'node W' },
        { t: 'line', id: 'sw', x1: 390, y1: 104, x2: 330, y2: 186, arrow: true },
        { t: 'line', id: 'pw', x1: 170, y1: 104, x2: 232, y2: 186, tone: 'red', dashed: true },
        cross('pwx', 196, 146),
      ],
    },
    {
      caption: 'No partition this time. P freezes (GC, VM pause). The others elect N in term 2, and N writes to storage.',
      drop: ['P', 'S', 'W', 'sw', 'pw', 'pwx'],
      add: [
        { t: 'box', id: 'P2', x: 40, y: 30, w: 150, h: 64, tone: 'grey', dashed: true, label: 'frozen', text: 'P (term 1)' },
        { t: 'box', id: 'N', x: 370, y: 30, w: 150, h: 64, label: 'leader', text: 'N (term 2)' },
        { t: 'box', id: 'db', x: 190, y: 200, w: 180, h: 60, label: 'storage', text: 'seen term 2' },
        { t: 'line', id: 'nw', x1: 445, y1: 98, x2: 340, y2: 196, arrow: true, text: 'write t2' },
      ],
    },
    {
      caption: 'P wakes still believing it leads, and writes. Storage has seen term 2 and refuses term 1: a fencing token.',
      add: [
        { t: 'line', id: 'pw2', x1: 115, y1: 98, x2: 220, y2: 196, arrow: true, tone: 'red', text: 'write t1' },
        cross('pw2x', 178, 168),
      ],
      set: { P2: { tone: 'red', label: 'wakes', dashed: false } },
      stop: {
        title: 'A quorum is not fencing',
        edge: true,
        body: <>The old leader never learns it was replaced. Fence at the resource with epochs or tokens, or power it off (STONITH).</>,
      },
    },
  ],
}

/* ---------- 5b. STONITH ---------- */

export const stonith: FlowDef = {
  h: 200,
  steps: [
    {
      caption: 'A fenced pair: A active, B standby, heartbeating. Before B may promote itself, it must be sure A cannot write.',
      add: [
        { t: 'box', id: 'A', x: 20, y: 30, w: 140, h: 100, label: 'node A', text: 'active' },
        { t: 'box', id: 'B', x: 400, y: 30, w: 140, h: 100, label: 'node B', text: 'standby' },
        { t: 'line', id: 'hb', x1: 164, y1: 55, x2: 396, y2: 55, arrow: false, text: 'heartbeat' },
      ],
    },
    {
      caption: 'A really dies. B powers it off first (STONITH, “shoot the other node in the head”: IPMI, PDU or a cloud API), then promotes.',
      set: { hb: { tone: 'red', dashed: true, text: 'silence' }, A: { tone: 'grey', text: 'off' }, B: { text: 'primary now' } },
      add: [{ t: 'line', id: 'b2a', x1: 396, y1: 92, x2: 164, y2: 92, arrow: true, tone: 'red', text: 'power off' }],
    },
    {
      caption: 'Instead, a 90 s network blip: both sides see the other as dead and send power-off, but delivery is delayed, so both stay active (GitHub, Dec 2012).',
      set: { A: { tone: 'ink', text: 'alive' }, B: { text: 'alive' } },
      add: [{ t: 'line', id: 'a2b', x1: 164, y1: 122, x2: 396, y2: 122, arrow: true, tone: 'red', text: 'power off' }],
    },
    {
      caption: 'When the network recovers, both are shot at once. Some pairs lost both nodes; recovery took about 5 hours.',
      set: { A: { tone: 'grey', text: 'off' }, B: { tone: 'grey', text: 'off' } },
      stop: {
        title: 'Fencing can misfire',
        edge: true,
        body: <>The power channel can sit on the same failing network. Prefer fencing at the resource, or lease self-fencing: stop serving before your lease expires.</>,
      },
    },
  ],
}

/* ---------- 6. Kubernetes timings ---------- */

const T0 = 100
const S = 1.2 // px per second
const xs = (t: number) => T0 + t * S
const beats = [1, 2, 3, 4, 5, 6, 7].map((k) => `M${T0 - k * 10 * S},84 L${T0 - k * 10 * S},100`).join(' ')
const checks = Array.from({ length: 10 }, (_, k) => `M${xs(5 * (k + 1))},100 L${xs(5 * (k + 1))},110`).join(' ')

export const k8s: FlowDef = {
  h: 285,
  steps: [
    {
      caption: 'The kubelet renews a small Lease object every 10 s. That is the heartbeat; full node status is posted only on change or every 5 minutes.',
      add: [
        txt('kl', 10, 62, 'kubelet: Lease renewed every 10 s', 'ink', 'start'),
        { t: 'line', id: 'ax', x1: 10, y1: 100, x2: 545, y2: 100, tone: 'grey', arrow: true },
        { t: 'path', id: 'beats', d: beats, tone: 'ink' },
      ],
    },
    {
      caption: 'At t=0 the node loses the network. The beats stop.',
      add: [{ t: 'line', id: 'cut', x1: T0, y1: 76, x2: T0, y2: 200, tone: 'red', dashed: true }, txt('cutl', T0 + 8, 40, 't=0: network cut', 'red', 'start')],
    },
    {
      caption: 'The controller manager checks every 5 s. Each time it finds no fresh beat, and keeps waiting.',
      drop: ['cutl'],
      add: [{ t: 'path', id: 'checks', d: checks, tone: 'grey' }, txt('ckl', 108, 134, 'controller checks every 5 s', 'grey', 'start')],
    },
    {
      caption: 'After the 50 s grace period (40 s in older versions) the node goes `Ready=Unknown` and gets a NoExecute taint.',
      drop: ['ckl'],
      add: [
        { t: 'box', id: 'grace', x: T0, y: 150, w: 60, h: 30, tone: 'red', text: '50 s' },
        { t: 'line', id: 'mk', x1: xs(50), y1: 76, x2: xs(50), y2: 150, tone: 'red' },
        txt('mkl', xs(50) + 8, 20, 'Ready=Unknown\n+ NoExecute taint', 'red', 'start'),
        txt('t0', T0, 204, 't=0', 'grey'),
        txt('t50', xs(50), 204, '~50 s', 'grey'),
      ],
    },
    {
      caption: 'Pods tolerate that taint for 300 s by default. Nothing moves yet: the node may only be cut off, not dead.',
      add: [{ t: 'box', id: 'tol', x: xs(50), y: 150, w: 300 * S, h: 30, tone: 'ink', text: 'toleration: 300 s' }, txt('t350', xs(350), 204, '~350 s', 'grey')],
    },
    {
      caption: 'About 6 minutes in, the pods are evicted and rescheduled. Evictions are rate-limited, and pause when whole zones look unhealthy.',
      add: [{ t: 'line', id: 'ev', x1: xs(350), y1: 76, x2: xs(350), y2: 150, tone: 'red' }, txt('evl', 545, 60, 'evict pods', 'red', 'end')],
      stop: {
        title: 'Evictions are throttled',
        edge: true,
        body: (
          <>
            Default 0.1 nodes/s. Once 55% of a zone (at least 3 nodes) is not Ready it drops to 0.01/s, or to 0 in a zone of 50 nodes or fewer. If no node in any zone is Ready, it assumes the fault is its own link and evicts nothing.
          </>
        ),
      },
    },
    {
      caption: 'The cut-off node’s pods were never killed. Now two copies may run at once.',
      add: [
        { t: 'box', id: 'old', x: 10, y: 228, w: 260, h: 48, tone: 'red', dashed: true, text: 'old pod', sub: 'still running, cut off' },
        { t: 'box', id: 'new', x: 290, y: 228, w: 260, h: 48, text: 'new pod', sub: 'rescheduled elsewhere' },
      ],
      stop: {
        title: 'NotReady is not dead',
        edge: true,
        body: <>Singleton apps still need fencing. DaemonSet pods carry no toleration timeout, so they are never evicted.</>,
      },
    },
  ],
}
