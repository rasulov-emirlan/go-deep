import { Code } from '../../components/Code'
import type { El, FlowDef, LineEl, Tone } from '../../components/flow'
import { histogram, peak, retryTimes, type Policy } from './jitter'

/* ---------- small helpers ---------- */

type Pt = { x: number; y: number; r: number }

/** arrow between two circles, shortened to their rims; `off` slides it sideways so two opposite arrows don't overlap */
function edge(id: string, a: Pt, b: Pt, tone: Tone = 'grey', off = 0, dashed = false): LineEl {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy * off
  const py = ux * off
  return {
    t: 'line',
    id,
    x1: Math.round(a.x + ux * (a.r + 3) + px),
    y1: Math.round(a.y + uy * (a.r + 3) + py),
    x2: Math.round(b.x - ux * (b.r + 3) + px),
    y2: Math.round(b.y - uy * (b.r + 3) + py),
    arrow: true,
    tone,
    dashed,
  }
}

/** a row/grid of small squares as one path (n squares, `cols` per row) */
function cells(n: number, x: number, y: number, cols = 9, size = 11, gap = 3): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const cx = x + (i % cols) * (size + gap)
    const cy = y + Math.floor(i / cols) * (size + gap)
    d += `M${cx},${cy}h${size}v${size}h${-size}z`
  }
  return d
}

/** histogram as bars from a baseline */
function bars(bins: number[], x0: number, base: number, unit: number, w: number): string {
  let d = ''
  bins.forEach((v, i) => {
    if (v <= 0) return
    const h = Math.max(1.5, v * unit)
    d += `M${x0 + i * w},${base}v${-h}h${w - 1}v${h}z`
  })
  return d
}

const lane = (id: string, x: number, text: string, len: number, tone?: Tone): El => ({ t: 'lane', id, x, y: 8, len, text, tone })

/* ---------- 1. deadline budget across three hops ---------- */

// time runs down the page: y = 60 + t * 0.26  (1000 ms -> 320)
const ty = (t: number) => Math.round(60 + t * 0.26)
const LX = { edge: 70, a: 210, b: 350, db: 490 }

export const deadlineFlow: FlowDef = {
  h: 372,
  steps: [
    {
      caption: 'The edge sets one deadline for the whole request: 1000 ms from now. Each call below carries what is left, not a fresh timer.',
      add: [
        lane('edge', LX.edge, 'Edge', 350),
        lane('a', LX.a, 'Svc A', 350),
        lane('b', LX.b, 'Svc B', 350),
        lane('db', LX.db, 'DB', 350),
        { t: 'line', id: 'dl', x1: 20, y1: ty(1000), x2: 540, y2: ty(1000), tone: 'red', dashed: true },
        { t: 'text', id: 'dlt', x: 100, y: ty(1000) - 6, text: 'deadline: 1000 ms', anchor: 'start', size: 13, tone: 'red' },
        { t: 'text', id: 'k0', x: 30, y: ty(0) + 4, text: '0', size: 13, tone: 'grey' },
        { t: 'msg', id: 'm1', from: 'edge', to: 'a', y: ty(0), y2: ty(30), text: '≈1000ms left' },
      ],
    },
    {
      caption: 'A does 300 ms of its own work. Only about 700 ms is left to hand on.',
      add: [
        { t: 'box', id: 'wa', x: LX.a - 8, y: ty(30), w: 16, h: ty(300) - ty(30), tone: 'soft' },
        { t: 'text', id: 'twa', x: LX.a + 16, y: ty(150) + 4, text: 'A works 300ms', size: 13, anchor: 'start', tone: 'grey' },
      ],
    },
    {
      caption: 'A calls B with the remainder, not a fresh 1 s. gRPC sends it as a relative `grpc-timeout` header, because clocks are not synced.',
      add: [
        { t: 'text', id: 'k300', x: 30, y: ty(300) + 4, text: '300', size: 13, tone: 'grey' },
        { t: 'msg', id: 'm2', from: 'a', to: 'b', y: ty(300), y2: ty(330), text: '≈690ms left' },
      ],
    },
    {
      caption: 'B works 200 ms, then asks the DB with about 470 ms left. Nested deadlines only shrink.',
      add: [
        { t: 'box', id: 'wb', x: LX.b - 8, y: ty(330), w: 16, h: ty(530) - ty(330), tone: 'soft' },
        { t: 'text', id: 'k500', x: 30, y: ty(530) + 4, text: '530', size: 13, tone: 'grey' },
        { t: 'msg', id: 'm3', from: 'b', to: 'db', y: ty(530), y2: ty(560), text: '≈470ms left' },
      ],
    },
    {
      caption: 'The DB is slow. At 1000 ms the deadline fires and the edge returns an error to the user.',
      add: [
        { t: 'box', id: 'wd', x: LX.db - 8, y: ty(560), w: 16, h: ty(1000) - ty(560), tone: 'red' },
        { t: 'text', id: 'giveup', x: LX.edge, y: ty(1000) + 22, text: 'gives up', size: 13, tone: 'red' },
      ],
      set: { m3: { tone: 'red' } },
    },
    {
      caption: 'Now suppose A had passed `context.Background()` to B. B and the DB never learn of the deadline and keep working for nobody.',
      add: [{ t: 'text', id: 'zombie', x: 425, y: ty(1000) + 32, text: 'zombie work', size: 13, tone: 'red' }],
      set: {
        wb: { h: ty(1085) - ty(330), tone: 'red' },
        wd: { h: ty(1085) - ty(560), tone: 'red' },
      },
      stop: {
        title: 'Background() drops it',
        edge: true,
        body: 'Under overload, zombie work is most of the load. In gRPC-Go the deadline travels only if you pass the handler’s ctx (or a child) to outgoing calls.',
      },
    },
    {
      caption: 'With the ctx passed on, every hop stops at the same absolute moment. B and the DB cancel, and their slots free up.',
      drop: ['zombie'],
      add: [{ t: 'text', id: 'cancel', x: 425, y: ty(1000) + 32, text: '✕ cancelled', size: 13, tone: 'grey' }],
      set: {
        wb: { h: ty(1000) - ty(330), tone: 'grey' },
        wd: { h: ty(1000) - ty(560), tone: 'grey' },
      },
    },
    {
      caption: 'A child timeout can only shorten the parent’s deadline: asking B for 5 s still gets the 690 ms left. Leave headroom for your own work.',
      set: { m2: { text: '5s → 690ms', tone: 'red' } },
      stop: {
        title: 'The earlier deadline wins',
        body: (
          <>
            <p>Verified: a 5 s child under a 200 ms parent kept the parent’s deadline.</p>
            <Code>{`
ctx, cancel := context.WithTimeout(
    parent, 5*time.Second)
defer cancel()
// ctx.Deadline() == parent's
`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 2. retry amplification ---------- */

const BX = [20, 160, 300, 440]
const grid = (n: number) => cells(n, 20, 190)

export const amplifyFlow: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Healthy: one user request makes one call per layer, so the DB sees one call.',
      add: [
        { t: 'box', id: 'l1', x: BX[0], y: 30, w: 100, h: 56, text: 'API' },
        { t: 'box', id: 'l2', x: BX[1], y: 30, w: 100, h: 56, text: 'Service' },
        { t: 'box', id: 'l3', x: BX[2], y: 30, w: 100, h: 56, text: 'Repo' },
        { t: 'box', id: 'l4', x: BX[3], y: 30, w: 100, h: 56, text: 'DB' },
        { t: 'line', id: 'e1', x1: 122, y1: 58, x2: 158, y2: 58, arrow: true, text: '×1' },
        { t: 'line', id: 'e2', x1: 262, y1: 58, x2: 298, y2: 58, arrow: true, text: '×1' },
        { t: 'line', id: 'e3', x1: 402, y1: 58, x2: 438, y2: 58, arrow: true, text: '×1' },
        { t: 'text', id: 'a1', x: 70, y: 112, text: '1 attempt', size: 13, tone: 'grey' },
        { t: 'text', id: 'a2', x: 210, y: 112, text: '1 attempt', size: 13, tone: 'grey' },
        { t: 'text', id: 'a3', x: 350, y: 112, text: '1 attempt', size: 13, tone: 'grey' },
        { t: 'text', id: 'load', x: 20, y: 168, text: 'calls reaching the DB', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'path', id: 'g', d: grid(1), fill: true, width: 1.5 },
        { t: 'text', id: 'big', x: 540, y: 250, text: '1×', size: 34, anchor: 'end' },
      ],
    },
    {
      caption: 'The DB slows. The Repo layer times out and makes 3 attempts (1 try + 2 retries). The DB now sees 3.',
      set: {
        l4: { tone: 'red' },
        e3: { text: '×3', tone: 'red' },
        a3: { text: '3 attempts', tone: 'red' },
        g: { d: grid(3) },
        big: { text: '3×', tone: 'red' },
      },
    },
    {
      caption: 'The Service layer retries too. Each of its 3 attempts makes the Repo do 3, so the DB sees 9.',
      set: {
        e2: { text: '×3', tone: 'red' },
        e3: { text: '×9', tone: 'red' },
        a2: { text: '3 attempts', tone: 'red' },
        g: { d: grid(9) },
        big: { text: '9×', tone: 'red' },
      },
    },
    {
      caption: 'The API layer retries as well: 3 × 3 × 3 = 27 calls land on a DB that was already struggling.',
      set: {
        e1: { text: '×3', tone: 'red' },
        e2: { text: '×9', tone: 'red' },
        e3: { text: '×27', tone: 'red' },
        a1: { text: '3 attempts', tone: 'red' },
        g: { d: grid(27) },
        big: { text: '27×', tone: 'red' },
      },
      stop: {
        title: 'Attempts multiply',
        edge: true,
        body: (
          <>
            <p>Load at the bottom = attempts^layers. “Retry 3 times” is usually 4 attempts, and 4³ = 64.</p>
            <p>Count every layer: SDK, sidecar, client library, app. Say “attempts”, not “retries”.</p>
          </>
        ),
      },
    },
    {
      caption: 'Fix one: retry in a single layer, usually the top. Lower layers make one attempt and fail fast. Load is 3, not 27.',
      set: {
        l4: { tone: 'ink' },
        e1: { text: '×3', tone: 'ink' },
        e2: { text: '×3', tone: 'ink' },
        e3: { text: '×3', tone: 'ink' },
        a1: { text: '3 attempts', tone: 'ink' },
        a2: { text: '1 attempt', tone: 'grey' },
        a3: { text: '1 attempt', tone: 'grey' },
        g: { d: grid(3) },
        big: { text: '3×', tone: 'ink' },
      },
    },
    {
      caption: 'Fix two: a retry budget lets retries run only while they stay under a share of requests, say 10%. Worst case ≈ 1.1×. gRPC uses a token bucket.',
      set: {
        a1: { text: '≤10% retries', tone: 'ink' },
        e1: { text: '≤1.1×' },
        e2: { text: '≤1.1×' },
        e3: { text: '≤1.1×' },
        g: { d: grid(1) },
        big: { text: '≈1.1×' },
      },
    },
    {
      caption: 'Fix three: the client throttles itself. The more the backend rejects, the more requests it drops locally, with no coordination.',
      set: {
        a1: { text: 'drops locally', tone: 'red' },
        big: { text: '→ 1×' },
      },
      stop: {
        title: 'Adaptive throttling',
        body: (
          <>
            <p>The SRE book’s client-side rule, over a recent window:</p>
            <Code>{`
p = max(0, (requests - K*accepts)
           / (requests + 1))
// K = 2; lower K sheds sooner
`}</Code>
          </>
        ),
      },
    },
  ],
}

/* ---------- 3. backoff and jitter ---------- */

const JB = 40 // bucket ms
const JH = 3200 // horizon ms
const JW = 6 // px per bucket
const JX = 40
const JBASE = 215
const hist = (p: Policy) => bars(histogram(retryTimes(p), JB, JH), JX, JBASE, 1.25, JW)
const pk = (p: Policy) => peak(histogram(retryTimes(p), JB, JH))

const policyRows: [Policy, string][] = [
  ['fixed', 'fixed 100ms'],
  ['expo', 'expo, no jitter'],
  ['full', 'full jitter'],
  ['equal', 'equal jitter'],
  ['decorrelated', 'decorrelated'],
]

export const jitterFlow: FlowDef = {
  h: 270,
  steps: [
    {
      caption: 'A hiccup fails 100 clients at the same instant. Bars count retry arrivals per 40 ms; every retry is assumed to fail again.',
      add: [
        { t: 'line', id: 'ax', x1: JX, y1: JBASE, x2: 530, y2: JBASE, tone: 'grey' },
        { t: 'text', id: 'x0', x: JX, y: JBASE + 18, text: '0', size: 13, tone: 'grey' },
        { t: 'text', id: 'x1', x: JX + 25 * JW, y: JBASE + 18, text: '1s', size: 13, tone: 'grey' },
        { t: 'text', id: 'x2', x: JX + 50 * JW, y: JBASE + 18, text: '2s', size: 13, tone: 'grey' },
        { t: 'text', id: 'x3', x: JX + 75 * JW, y: JBASE + 18, text: '3s', size: 13, tone: 'grey' },
        { t: 'text', id: 'yl', x: 20, y: 22, text: 'retries per 40 ms', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'path', id: 'h', d: `M${JX},${JBASE}v${-125}h${JW - 1}v125z`, tone: 'red', fill: true, width: 1 },
        { t: 'text', id: 'note', x: 60, y: 82, text: '100 fail together', size: 13, anchor: 'start', tone: 'red' },
      ],
    },
    {
      caption: 'Fixed sleep of 100 ms: the herd stays a herd. All 100 come back together, five times, in pulses.',
      drop: ['note'],
      set: { h: { d: hist('fixed') } },
      add: [{ t: 'text', id: 'pk', x: 530, y: 60, text: 'peak 100', size: 15, anchor: 'end', tone: 'red' }],
    },
    {
      caption: 'Exponential backoff (100, 200, 400… capped at 1.6 s) makes the pulses rarer. But everyone still arrives on the same beat.',
      set: { h: { d: hist('expo') }, pk: { text: 'peak 100' } },
    },
    {
      caption: 'Full jitter picks a random wait between 0 and the backoff cap for that attempt. The pulses smear into a low, wide stream.',
      set: { h: { d: hist('full'), tone: 'ink' }, pk: { text: `peak ${pk('full')}`, tone: 'ink' } },
    },
    {
      caption: 'Peak retries in any 40 ms bucket, from this toy model (100 clients, seeded). The ordering matters here, not the exact numbers.',
      drop: ['h', 'ax', 'x0', 'x1', 'x2', 'x3', 'yl', 'pk'],
      add: policyRows.flatMap(([p, label], i): El[] => [
        { t: 'text', id: 'l' + p, x: 20, y: 36 + i * 44, text: label, size: 14, anchor: 'start' },
        { t: 'box', id: 'b' + p, x: 190, y: 20 + i * 44, w: Math.max(4, pk(p) * 2.6), h: 26, tone: pk(p) >= 100 ? 'red' : 'grey' },
        { t: 'text', id: 'n' + p, x: 190 + Math.max(4, pk(p) * 2.6) + 8, y: 36 + i * 44, text: String(pk(p)), size: 14, anchor: 'start', tone: pk(p) >= 100 ? 'red' : 'ink' },
      ]),
      stop: {
        title: 'Lower waits, fewer calls?',
        edge: true,
        body: (
          <>
            <p>Jitter shortens some waits but breaks the alignment. Fewer retries collide, so fewer get rejected and re-sent.</p>
            <p>In a toy server serving one call per tick (base 2, cap 100), 100 clients made 5,050 calls without jitter and 528 with full jitter.</p>
          </>
        ),
      },
    },
    {
      caption: 'The three flavours. Sleep with `select` on `ctx.Done()`, never `time.Sleep`, and give up when the sleep exceeds the budget left.',
      drop: policyRows.flatMap(([p]) => ['l' + p, 'b' + p, 'n' + p]),
      add: [
        { t: 'text', id: 'f0', x: 20, y: 40, text: 'temp = min(cap, base·2^n)', anchor: 'start', size: 15 },
        { t: 'text', id: 'f1', x: 20, y: 90, text: 'full:  rand(0, temp)', anchor: 'start', size: 15, tone: 'red' },
        { t: 'text', id: 'f2', x: 20, y: 130, text: 'equal: temp/2 + rand(0, temp/2)', anchor: 'start', size: 15 },
        { t: 'text', id: 'f3', x: 20, y: 170, text: 'decorrelated:', anchor: 'start', size: 15 },
        { t: 'text', id: 'f4', x: 40, y: 198, text: 'min(cap, rand(base, prev·3))', anchor: 'start', size: 15 },
        { t: 'text', id: 'f5', x: 20, y: 246, text: 'prev = the last sleep. Full and decorrelated do best in the toy.', anchor: 'start', size: 13, tone: 'grey', mono: false },
      ],
    },
  ],
}

/* ---------- 4. circuit breaker ---------- */

const C: Pt = { x: 100, y: 120, r: 44 }
const O: Pt = { x: 460, y: 120, r: 44 }
const HO: Pt = { x: 280, y: 290, r: 46 }

const bnode = (id: string, p: Pt, text: string, tone: Tone): El => ({ t: 'node', id, x: p.x, y: p.y, r: p.r, text, tone })

const strip = (): El[] => {
  // 20 calls, 8 failed (40%), never more than 2 in a row
  const f = '00100101001001010010'.split('').map((c) => c === '1')
  // 1 = fail
  return f.map((bad, i) => ({ t: 'box', id: 'c' + i, x: 40 + i * 24, y: 70, w: 22, h: 26, text: bad ? '✗' : '✓', tone: bad ? 'red' : 'grey' }) as El)
}

export const breakerFlow: FlowDef = {
  h: 385,
  steps: [
    {
      caption: 'CLOSED: calls pass through and the breaker keeps count. This walk-through follows sony/gobreaker’s defaults.',
      add: [
        bnode('c', C, 'CLOSED', 'red'),
        bnode('o', O, 'OPEN', 'grey'),
        bnode('h', HO, 'HALF\nOPEN', 'grey'),
        { t: 'text', id: 'nc', x: C.x, y: C.y + 64, text: 'calls pass', size: 13, tone: 'grey' },
        { t: 'text', id: 'no', x: O.x, y: O.y + 64, text: 'calls fail fast', size: 13, tone: 'grey' },
        { t: 'text', id: 'cnt', x: 20, y: 24, text: 'fails in a row: 0', anchor: 'start', size: 14 },
      ],
    },
    {
      caption: 'It counts consecutive failures. Any non-nil error counts unless `IsSuccessful` says otherwise, even `context.Canceled`. One success resets it.',
      set: { cnt: { text: 'fails in a row: 5' } },
    },
    {
      caption: 'The 6th failure in a row trips it. Calls now fail at once with `ErrOpenState`: no goroutine waits out a 2 s timeout. Do not retry that error.',
      add: [edge('eco', C, O, 'red'), { t: 'text', id: 'lco', x: 280, y: 100, text: '6th failure in a row', size: 14, tone: 'red' }, { t: 'text', id: 'cd', x: O.x, y: 50, text: 'cooldown 60 s', size: 13, tone: 'red' }],
      set: { c: { tone: 'grey' }, o: { tone: 'red' }, cnt: { text: 'fails in a row: 6' }, no: { tone: 'red' } },
      stop: {
        title: 'Late results ignored',
        edge: true,
        body: 'A slow call that started before the trip can finish after it. gobreaker tags counts with a generation, so that stale result is dropped instead of corrupting the new state.',
      },
    },
    {
      caption: 'After the 60 s timeout it goes HALF-OPEN and lets `MaxRequests` probes through. The default is 1.',
      add: [edge('eoh', O, HO, 'red', 10), { t: 'text', id: 'loh', x: 400, y: 232, text: 'after 60 s', anchor: 'start', size: 14, tone: 'red' }, { t: 'text', id: 'nh', x: HO.x, y: HO.y + 66, text: 'MaxRequests = 1', size: 13, tone: 'red' }],
      set: { o: { tone: 'grey' }, h: { tone: 'red' }, eco: { tone: 'grey' }, no: { tone: 'grey' }, lco: { tone: 'grey' }, cd: { tone: 'grey' } },
      stop: {
        title: 'The second caller?',
        edge: true,
        body: 'While the probe is in flight, other callers get `ErrTooManyRequests` at once. They do not queue. The breaker closes after MaxRequests consecutive successes.',
      },
    },
    {
      caption: 'The probe succeeds: back to CLOSED with counts reset.',
      add: [edge('ehc', HO, C, 'red', 10), { t: 'text', id: 'lhc', x: 170, y: 222, text: 'probe ok', anchor: 'end', size: 14, tone: 'red' }],
      set: { h: { tone: 'grey' }, c: { tone: 'red' }, eoh: { tone: 'grey' }, loh: { tone: 'grey' }, nh: { tone: 'grey' }, cnt: { text: 'fails in a row: 0' } },
    },
    {
      caption: 'Or the probe fails: straight back to OPEN, and the 60 s cooldown restarts. With MaxRequests 1, one unlucky probe costs a minute.',
      add: [edge('eho', HO, O, 'red', 10), { t: 'text', id: 'lho', x: 340, y: 172, text: 'probe fails', anchor: 'end', size: 14, tone: 'red' }],
      set: { c: { tone: 'grey' }, o: { tone: 'red' }, ehc: { tone: 'grey' }, lhc: { tone: 'grey' }, no: { tone: 'red' } },
    },
    {
      caption: 'A steady 40% error rate never makes 6 in a row, so the consecutive rule stays CLOSED. A rate-based breaker looks at the mix instead.',
      drop: ['c', 'o', 'h', 'nc', 'no', 'cnt', 'eco', 'lco', 'cd', 'eoh', 'loh', 'nh', 'ehc', 'lhc', 'eho', 'lho'],
      add: [
        ...strip(),
        { t: 'text', id: 'sl', x: 40, y: 56, text: 'last 20 calls: 8 failed, max 2 in a row', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'box', id: 'gb', x: 20, y: 130, w: 250, h: 110, label: 'gobreaker default', text: 'more than 5 in a row', sub: 'never trips here', tone: 'grey' },
        { t: 'box', id: 'rj', x: 290, y: 130, w: 250, h: 110, label: 'resilience4j default', text: '≥50% of last 100', sub: 'and ≥100 calls seen', tone: 'ink' },
        { t: 'text', id: 'tail', x: 280, y: 280, text: '40% is under 50%: no trip either.', size: 14 },
        { t: 'text', id: 'tail2', x: 280, y: 306, text: 'But the rate is a knob you can set.', size: 14, tone: 'red' },
      ],
      stop: {
        title: 'Consecutive vs rate',
        edge: true,
        body: 'Consecutive trips fast when a dependency is hard down but is blind to partial failure. Rate needs volume: with minimumNumberOfCalls 100, a quiet service never trips.',
      },
    },
  ],
}

/* ---------- 5. queues, shedding, bulkheads ---------- */

const QR = 410 // queue head (server side) x; 1 px = 1 queued request
const slotRow = (prefix: string, y: number, full: number, tone: Tone): El[] =>
  Array.from({ length: 10 }, (_, i): El => ({ t: 'box', id: prefix + i, x: 160 + i * 25, y, w: 21, h: 26, tone: i < full ? tone : 'grey', dashed: i >= full }))

export const overloadFlow: FlowDef = {
  h: 330,
  steps: [
    {
      caption: 'Arrivals 120/s, capacity 100/s. The queue grows by 20 a second, and each new request waits queue length ÷ 100/s.',
      add: [
        { t: 'text', id: 'in', x: 20, y: 50, text: '120/s in', anchor: 'start', size: 15 },
        { t: 'box', id: 'q', x: QR - 100, y: 70, w: 100, h: 40, tone: 'grey' },
        { t: 'text', id: 'qt', x: QR - 50, y: 130, text: '100 queued', size: 13, tone: 'grey' },
        { t: 'box', id: 'srv', x: 420, y: 60, w: 120, h: 60, text: 'Server', sub: '100/s' },
        { t: 'line', id: 'mk', x1: QR - 100, y1: 58, x2: QR - 100, y2: 122, tone: 'red', dashed: true },
        { t: 'text', id: 'mkt', x: QR - 100, y: 158, text: '1 s wait = client timeout', size: 13, tone: 'red' },
      ],
    },
    {
      caption: 'At 200 queued a new request waits 2 s, but its client gave up at 1 s. The server now works for people who left.',
      set: { q: { x: QR - 200, w: 200, tone: 'red' }, qt: { x: QR - 100, text: '200 queued: 2 s wait', tone: 'red' } },
      stop: {
        title: 'Why latency explodes',
        edge: true,
        body: 'Little’s law: requests in the system = arrival rate × wait. Above 100% utilisation nothing drains the queue, so wait grows without bound and goodput falls toward zero.',
      },
    },
    {
      caption: 'Bound the queue at 20: worst wait is 0.2 s, and overflow gets a fast 503. Rejecting is cheaper than answering nobody.',
      set: { q: { x: QR - 20, w: 20, tone: 'grey' }, qt: { x: 330, text: '≤20 queued', tone: 'grey' }, mkt: { x: 200 } },
      add: [{ t: 'line', id: 'rej', x1: 150, y1: 88, x2: 40, y2: 88, arrow: true, tone: 'red', text: '503 now' }],
      stop: {
        title: 'Reject, don’t wait',
        body: (
          <Code>{`
select {
case q <- req:
default:
    http.Error(w, "busy", 503)
}
`}</Code>
        ),
      },
    },
    {
      caption: 'A fixed limit goes stale. Adaptive limits creep up while latency is healthy and cut back hard on timeouts (AIMD, borrowed from TCP).',
      add: [
        { t: 'line', id: 'ya', x1: 60, y1: 300, x2: 60, y2: 190, tone: 'grey', arrow: true },
        { t: 'line', id: 'xa', x1: 60, y1: 300, x2: 520, y2: 300, tone: 'grey', arrow: true },
        { t: 'text', id: 'yt', x: 70, y: 186, text: 'in-flight limit', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'path', id: 'saw', d: 'M60,280 L140,240 L190,262 L270,222 L320,246 L410,206 L460,230 L520,212', tone: 'red', width: 2.5 },
        { t: 'text', id: 'xt', x: 520, y: 320, text: 'time →', size: 13, anchor: 'end', tone: 'grey' },
      ],
    },
    {
      caption: 'Under overload, shed the least important work first, at the front door and cheaply. Tell clients “overloaded, do not retry” (`429`, `Retry-After`).',
      drop: ['ya', 'xa', 'yt', 'saw', 'xt'],
      add: [
        { t: 'msg', id: 'pc', x1: 60, x2: 470, y: 216, text: 'critical' },
        { t: 'msg', id: 'pi', x1: 60, x2: 470, y: 256, text: 'interactive' },
        { t: 'msg', id: 'pb', x1: 60, x2: 470, y: 296, text: 'batch shed first', lost: true, tone: 'red' },
      ],
    },
    {
      caption: 'Bulkhead: each dependency gets its own limit, a semaphore or pool. Slow search fills its 10 slots and stops there.',
      drop: ['in', 'q', 'qt', 'srv', 'mk', 'mkt', 'rej', 'pc', 'pi', 'pb'],
      add: [
        { t: 'box', id: 'app', x: 20, y: 30, w: 100, h: 250, text: 'Handlers' },
        { t: 'text', id: 'sr', x: 160, y: 56, text: 'search: 10 of 10 slots', size: 14, anchor: 'start', tone: 'red' },
        ...slotRow('s', 70, 10, 'red'),
        { t: 'text', id: 'pr', x: 160, y: 176, text: 'payments: 3 of 10 slots', size: 14, anchor: 'start' },
        ...slotRow('p', 190, 3, 'ink'),
        { t: 'text', id: 'fx', x: 160, y: 250, text: 'search calls fail fast; payments unaffected', size: 13, anchor: 'start', mono: false, tone: 'red' },
      ],
    },
  ],
}

/* ---------- 6. hedged requests ---------- */

export const hedgeFlow: FlowDef = {
  h: 340,
  steps: [
    {
      caption: 'Fan-out amplifies the tail. If each of 100 servers is slow 1% of the time, 63% of requests hit at least one slow server.',
      add: [
        { t: 'path', id: 'sq', d: cells(100, 60, 30, 10, 14, 4), width: 1.5, tone: 'grey' },
        { t: 'path', id: 'slow', d: cells(1, 60 + 4 * 18, 30 + 3 * 18, 10, 14, 4), fill: true, tone: 'red', width: 2 },
        { t: 'text', id: 'p63', x: 400, y: 100, text: '1 − 0.99¹⁰⁰', size: 17, anchor: 'start' },
        { t: 'text', id: 'p63b', x: 400, y: 150, text: '= 63%', size: 30, anchor: 'start', tone: 'red' },
      ],
    },
    {
      caption: 'One read, one replica. R1 is having a slow moment and the client waits.',
      drop: ['sq', 'slow', 'p63', 'p63b'],
      add: [
        lane('cl', 70, 'Client', 320),
        lane('r1', 190, 'R1', 320),
        lane('r2', 430, 'R2', 320),
        { t: 'msg', id: 'q1', from: 'cl', to: 'r1', y: 70, y2: 82, text: 'read k' },
        { t: 'box', id: 'slw', x: 182, y: 82, w: 16, h: 190, tone: 'grey' },
      ],
    },
    {
      caption: 'Once the wait passes about the p95 latency, send the same read to a second replica. That costs about 5% extra requests.',
      add: [
        { t: 'line', id: 'p95', x1: 20, y1: 150, x2: 540, y2: 150, dashed: true, tone: 'grey' },
        { t: 'text', id: 'p95t', x: 20, y: 143, text: 'p95', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'msg', id: 'q2', from: 'cl', to: 'r2', y: 150, y2: 162, text: 'hedge', tone: 'red' },
      ],
    },
    {
      caption: 'R2 answers first. The client takes that reply and cancels the loser, or the wasted work piles up.',
      add: [
        { t: 'msg', id: 'a2', from: 'r2', to: 'cl', y: 200, y2: 212, text: 'value', tone: 'red' },
        { t: 'msg', id: 'x1', from: 'cl', to: 'r1', y: 240, y2: 250, text: 'cancel', tone: 'red', dashed: true },
      ],
    },
    {
      caption: 'The Tail at Scale paper reports a BigTable test where hedging after 10 ms cut the 99.9th percentile from 1,800 ms to 74 ms for about 2% extra requests.',
      drop: ['cl', 'r1', 'r2', 'q1', 'slw', 'p95', 'p95t', 'q2', 'a2', 'x1'],
      add: [
        { t: 'box', id: 'hb1', x: 40, y: 70, w: 210, h: 90, label: 'p99.9 no hedge', text: '1,800 ms', tone: 'grey' },
        { t: 'box', id: 'hb2', x: 300, y: 70, w: 210, h: 90, label: 'hedge at 10 ms', text: '74 ms', sub: '≈2% extra load', tone: 'red' },
        { t: 'text', id: 'src', x: 280, y: 200, text: 'reported, not measured here', size: 13, tone: 'grey', mono: false },
      ],
    },
    {
      caption: 'Hedge only idempotent reads, at about p95 or later (p50 doubles the load), and count hedges against the retry budget.',
      drop: ['hb1', 'hb2', 'src'],
      add: [
        { t: 'box', id: 'r1b', x: 30, y: 40, w: 500, h: 46, text: 'idempotent reads only' },
        { t: 'box', id: 'r2b', x: 30, y: 100, w: 500, h: 46, text: 'delay ≈ p95, never p50' },
        { t: 'box', id: 'r3b', x: 30, y: 160, w: 500, h: 46, text: 'budgeted, and cancel the loser' },
        { t: 'box', id: 'r4b', x: 30, y: 220, w: 500, h: 46, text: 'off when the backend is saturated', tone: 'red' },
      ],
      stop: {
        title: 'When hedging hurts',
        edge: true,
        body: 'If the slowness is shared (an overloaded backend, one bottleneck), a hedge adds load to the problem instead of dodging it.',
      },
    },
  ],
}

/* ---------- 7. metastable failure ---------- */

const ML: Pt = { x: 280, y: 90, r: 46 }
const MT: Pt = { x: 450, y: 250, r: 46 }
const MR: Pt = { x: 110, y: 250, r: 46 }

export const metastableFlow: FlowDef = {
  h: 400,
  steps: [
    {
      caption: 'A healthy service: demand 70 req/s, capacity 100. Requests finish inside their timeouts, so nothing feeds back.',
      add: [
        bnode('ml', ML, 'Load', 'ink'),
        bnode('mt', MT, 'Time-\nouts', 'grey'),
        bnode('mr', MR, 'Retries', 'grey'),
        { t: 'text', id: 'ld', x: 280, y: 160, text: '70/s of 100/s', size: 14 },
      ],
    },
    {
      caption: 'A trigger hits: a deploy, a cache flush, a 5 s blip. Requests slow down and start to time out.',
      add: [
        { t: 'box', id: 'trg', x: 20, y: 20, w: 120, h: 44, text: 'trigger', tone: 'red' },
        { t: 'line', id: 'et', x1: 140, y1: 50, x2: 236, y2: 78, arrow: true, tone: 'red' },
        edge('e1', ML, MT, 'red'),
      ],
      set: { mt: { tone: 'red' } },
    },
    {
      caption: 'Every timeout becomes a retry. 70/s of demand turns into up to 210/s (3 attempts each) against 100/s of capacity.',
      add: [edge('e2', MT, MR, 'red'), edge('e3', MR, ML, 'red')],
      set: { mr: { tone: 'red' }, ml: { tone: 'red' }, ld: { text: 'up to 210/s of 100/s', tone: 'red' } },
    },
    {
      caption: 'The trigger is over. The loop is not: overload causes timeouts, timeouts cause retries, retries cause overload. Goodput stays near zero.',
      add: [
        { t: 'path', id: 'gp', d: 'M40,350 L120,350 L150,380 L520,380', tone: 'red', width: 2.5 },
        { t: 'text', id: 'gpt', x: 40, y: 340, text: 'goodput', size: 13, anchor: 'start', tone: 'grey' },
        { t: 'text', id: 'gpx', x: 150, y: 368, text: 'trigger gone', size: 13, anchor: 'start', tone: 'grey' },
      ],
      set: { trg: { tone: 'grey' }, et: { tone: 'grey', dashed: true } },
      stop: {
        title: 'Why no recovery?',
        edge: true,
        body: 'The system sits in a bad state that sustains itself. Removing the trigger is not enough; load has to drop below normal so the queues and retries can drain.',
      },
    },
    {
      caption: 'Break the loop. Shed load, cap retries with a budget, open breakers, and bring caches back slowly.',
      drop: ['gp', 'gpt', 'gpx'],
      add: [
        { t: 'text', id: 'cut', x: 190, y: 190, text: '✕', size: 34, tone: 'red' },
        { t: 'text', id: 'cutt', x: 280, y: 322, text: 'shed · budget · breaker', size: 15, tone: 'red' },
      ],
      set: { e3: { tone: 'grey', dashed: true }, mr: { tone: 'grey' }, ld: { text: 'load below normal', tone: 'ink' }, ml: { tone: 'ink' } },
    },
    {
      caption: 'Retries are not the only sustaining loop. Any work that keeps the system busy after the trigger ends can hold it down.',
      drop: ['ml', 'mt', 'mr', 'ld', 'trg', 'et', 'e1', 'e2', 'e3', 'cut', 'cutt'],
      add: [
        { t: 'box', id: 'k1', x: 20, y: 40, w: 520, h: 76, label: 'cache misses', text: 'DB slows → more misses → DB slows', tone: 'ink' },
        { t: 'box', id: 'k2', x: 20, y: 136, w: 520, h: 76, label: 'dead work', text: 'queues full of requests nobody awaits', tone: 'ink' },
        { t: 'box', id: 'k3', x: 20, y: 232, w: 520, h: 76, label: 'prevention', text: 'jitter · singleflight · slow-start', sub: 'and load-test past the edge', tone: 'red' },
      ],
    },
  ],
}
