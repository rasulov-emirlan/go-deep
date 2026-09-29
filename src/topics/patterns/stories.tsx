import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ── 1. the context tree ─────────────────────────────────────────────── */

type Node = 'root' | 'db' | 'cache' | 'query'
const nodeAt: Record<Node, { x: number; y: number; sprite: string; tag: string }> = {
  root: { x: 110, y: 262, sprite: 'fairy-tale-king', tag: 'request' },
  db: { x: 400, y: 148, sprite: 'fairy-tale-messenger-running', tag: 'db · 2s' },
  cache: { x: 400, y: 332, sprite: 'fairy-tale-messenger-running', tag: 'cache' },
  query: { x: 640, y: 148, sprite: 'misc-standing-v2', tag: 'query' },
}
type NodeState = { dead?: boolean; bubble?: string; tag?: string; hot?: boolean }
const tree = (s: Partial<Record<Node, NodeState>> = {}): Actor[] =>
  (Object.keys(nodeAt) as Node[]).map((id) => {
    const n = nodeAt[id]
    const st = s[id] ?? {}
    return {
      id,
      sprite: st.dead ? 'dandy-raining' : n.sprite,
      x: n.x,
      y: n.y,
      h: id === 'root' ? 115 : 92,
      tag: st.tag ?? (st.dead ? n.tag + ' · done' : n.tag),
      hot: st.hot ?? st.dead,
      bubble: st.bubble,
    }
  })
// elbow connectors: root → trunk → db / cache, db → query
const edges = (dead: Partial<Record<'db' | 'cache' | 'query' | 'trunk', boolean>> = {}): Prop[] => [
  { id: 'e-root', x: 160, y: 204, w: 80, h: 2, tone: dead.trunk ? 'red' : 'ink' },
  { id: 'e-trunk', x: 238, y: 101, w: 2, h: 186, tone: dead.trunk ? 'red' : 'ink' },
  { id: 'e-db', x: 240, y: 101, w: 105, h: 2, tone: dead.db ? 'red' : 'ink' },
  { id: 'e-cache', x: 240, y: 285, w: 105, h: 2, tone: dead.cache ? 'red' : 'ink' },
  { id: 'e-query', x: 455, y: 101, w: 135, h: 2, tone: dead.query ? 'red' : 'ink' },
]

export const contextTree: Frame[] = [
  {
    caption: 'A request gets a root ctx; each call below derives a child with WithCancel or WithTimeout.',
    actors: tree(),
    props: edges(),
  },
  {
    caption: (
      <>
        Every goroutine selects on its <code>ctx.Done()</code>: a channel that is closed on cancel.
      </>
    ),
    actors: tree({ db: { bubble: '<-ctx.Done()' }, cache: { bubble: '<-ctx.Done()' }, query: { bubble: '<-ctx.Done()' } }),
    props: edges(),
    stop: {
      title: 'why a channel?',
      body: (
        <>
          <p>A closed channel is readable by any number of goroutines at once, so one close is a broadcast. Then <code>Err()</code> says why.</p>
          <Code>{`select {
case <-ctx.Done():
    return ctx.Err()
case r := <-work:
    return r
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: (
      <>
        The cache call ends and calls its <code>cancel()</code>: only that branch closes, the parent keeps going.
      </>
    ),
    actors: tree({ cache: { dead: true, bubble: 'cancel()' }, root: { bubble: 'still fine' } }),
    props: edges({ cache: true }),
    stop: {
      title: 'down, never up',
      body: (
        <p>
          Cancelling a child never touches its parent or siblings. Always <code>defer cancel()</code>, even on success: it stops the timer and unhooks the child from the parent. <code>go vet</code>{' '}
          flags a discarded cancel.
        </p>
      ),
    },
  },
  {
    caption: 'The query asks for a 1-hour timeout under the 2-second db context.',
    actors: tree({ cache: { dead: true }, query: { bubble: '1h, please', tag: 'query · 1h?' } }),
    props: edges({ cache: true }),
    stop: {
      edge: true,
      title: 'a child can’t outlive its parent',
      body: (
        <p>
          <code>WithTimeout(parent, time.Hour)</code> keeps the parent’s earlier deadline: <code>ctx.Deadline()</code> returns the 2 s one. Timeouts only ever shrink going down.
        </p>
      ),
    },
  },
  {
    caption: (
      <>
        2 s pass: db and its query close together, and <code>Err()</code> is <code>DeadlineExceeded</code>.
      </>
    ),
    actors: tree({ cache: { dead: true }, db: { dead: true, bubble: 'deadline!' }, query: { dead: true } }),
    props: edges({ cache: true, db: true, query: true }),
  },
  {
    caption: (
      <>
        Next request: the client hangs up, the root is canceled, and every <code>Done()</code> below closes at once.
      </>
    ),
    actors: tree({ root: { dead: true, bubble: 'client left', tag: 'Canceled' }, db: { dead: true }, cache: { dead: true }, query: { dead: true } }),
    props: edges({ trunk: true, cache: true, db: true, query: true }),
    stop: {
      edge: true,
      title: 'work that must outlive the request',
      body: (
        <p>
          <code>context.WithoutCancel(ctx)</code> (Go 1.21) keeps the values but drops cancellation, e.g. for an audit write after the response. <code>WithCancelCause</code> +{' '}
          <code>context.Cause</code> tell you <em>why</em> it was canceled.
        </p>
      ),
    },
  },
  {
    caption: (
      <>
        <code>WithValue</code> hangs request-scoped data, like a trace ID, on the tree for everything below.
      </>
    ),
    actors: tree({ root: { bubble: 'trace=ab12' }, query: { bubble: 'ab12?' } }),
    props: edges(),
    stop: {
      title: 'what belongs in Value',
      body: (
        <>
          <p>Request IDs, trace spans, the authenticated user. Not DB handles, config or optional parameters: those belong in signatures.</p>
          <Code>{`// unexported: no collisions
type traceKey struct{}
ctx = context.WithValue(ctx,
    traceKey{}, "ab12")`}</Code>
        </>
      ),
    },
  },
]

/* ── 2. worker pool ──────────────────────────────────────────────────── */

const WX = [330, 440, 550]
const worker = (i: number, s: { bubble?: string; dim?: boolean; hot?: boolean; tag?: string } = {}): Actor => ({
  id: 'w' + i,
  sprite: 'convict-working-hard',
  x: WX[i],
  y: 330,
  h: 110,
  tag: 'w' + (i + 1),
  ...s,
})
type Where = { at: 'q'; slot: number } | { at: 'w'; w: number } | { at: 'r'; slot: number }
const job = (n: number, where: Where): Prop => {
  if (where.at === 'q') return { id: 'j' + n, x: 24 + where.slot * 42, y: 276, w: 36, h: 36, tone: 'line', text: String(n) }
  if (where.at === 'w') return { id: 'j' + n, x: WX[where.w] - 18, y: 174, w: 36, h: 36, tone: 'red', text: String(n) }
  return { id: 'j' + n, x: 632 + (where.slot % 3) * 48, y: 256 + Math.floor(where.slot / 3) * 40, w: 36, h: 36, tone: 'ink', text: n + '²' }
}
const jobsBox = (closed = false): Prop => ({ id: 'jobs', x: 10, y: 240, w: 230, h: 92, tone: closed ? 'red' : 'dashed', label: closed ? 'jobs · closed' : 'jobs' })
const resBox = (closed = false): Prop => ({ id: 'res', x: 620, y: 222, w: 170, h: 110, tone: closed ? 'red' : 'dashed', label: closed ? 'closed' : 'results' })

export const workerPool: Frame[] = [
  {
    caption: (
      <>
        main sends jobs into one channel; three workers each run <code>for j := range jobs</code>.
      </>
    ),
    actors: [worker(0), worker(1, { bubble: 'range jobs' }), worker(2)],
    props: [jobsBox(), resBox(), ...[1, 2, 3, 4, 5].map((n) => job(n, { at: 'q', slot: n - 1 }))],
  },
  {
    caption: 'Each job goes to exactly one worker: whoever receives first gets it.',
    actors: [worker(0), worker(1), worker(2)],
    props: [jobsBox(), resBox(), job(1, { at: 'w', w: 0 }), job(2, { at: 'w', w: 1 }), job(3, { at: 'w', w: 2 }), job(4, { at: 'q', slot: 3 }), job(5, { at: 'q', slot: 4 })],
  },
  {
    caption: 'Workers send results and loop back for more, so fast workers take more jobs.',
    actors: [worker(0), worker(1), worker(2, { hot: true, tag: 'w3 · slow' })],
    props: [jobsBox(), resBox(), job(1, { at: 'r', slot: 0 }), job(2, { at: 'r', slot: 1 }), job(3, { at: 'w', w: 2 }), job(4, { at: 'w', w: 0 }), job(5, { at: 'w', w: 1 })],
  },
  {
    caption: (
      <>
        main calls <code>close(jobs)</code>: once the channel is empty, each range loop ends and its worker exits.
      </>
    ),
    actors: [worker(0, { dim: true, bubble: 'bye' }), worker(1, { dim: true }), worker(2)],
    props: [jobsBox(true), resBox(), job(1, { at: 'r', slot: 0 }), job(2, { at: 'r', slot: 1 }), job(4, { at: 'r', slot: 2 }), job(5, { at: 'r', slot: 3 }), job(3, { at: 'w', w: 2 })],
    stop: {
      title: 'only the sender closes',
      body: (
        <p>
          <code>close</code> means “no more values”; receivers still drain what is buffered first. Sending on a closed channel panics, so whoever sends is whoever closes.
        </p>
      ),
    },
  },
  {
    caption: (
      <>
        A separate goroutine waits for all workers, then closes results: <code>wg.Wait(); close(results)</code>.
      </>
    ),
    actors: [
      worker(0, { dim: true }),
      worker(1, { dim: true }),
      worker(2, { dim: true }),
      { id: 'closer', sprite: 'fairy-tale-messenger-reading', x: 125, y: 330, h: 100, tag: 'closer', bubble: 'wg.Wait()' },
    ],
    props: [resBox(), ...[1, 2, 4, 5, 3].map((n, i) => job(n, { at: 'r', slot: i }))],
    stop: {
      edge: true,
      title: 'the classic deadlock',
      body: (
        <>
          <p>Call <code>wg.Wait()</code> in main before reading results and workers block forever on their send: <code>fatal error: all goroutines are asleep - deadlock!</code></p>
          <Code>{`go func() {
    wg.Wait()
    close(results)
}()
for r := range results { … }`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'results is closed, so main’s range over it ends: every job done, no goroutine leaked.',
    actors: [worker(0, { dim: true }), worker(1, { dim: true }), worker(2, { dim: true }), { id: 'closer', sprite: 'fairy-tale-messenger-reading', x: 125, y: 330, h: 100, tag: 'closer', bubble: 'close(results)' }],
    props: [resBox(true), ...[1, 2, 4, 5, 3].map((n, i) => job(n, { at: 'r', slot: i }))],
    stop: {
      title: 'how many workers?',
      body: (
        <p>
          CPU-bound: about <code>GOMAXPROCS</code>; more workers just take turns on the same cores. I/O-bound: whatever the downstream allows (DB pool, API limit). Try it in the lab below.
        </p>
      ),
    },
  },
]

/* ── 3. fan-out, fan-in, semaphore, errgroup ─────────────────────────── */

const F = ['a', 'b', 'c'] as const
const fetcher = (i: number, x: number, y: number, s: Partial<Actor> = {}): Actor => ({ id: 'f' + i, sprite: 'fairy-tale-messenger-running', x, y, h: 110, tag: F[i], ...s })
const tok = (n: string, slot: number): Prop => ({ id: 't' + n, x: 310 + slot * 64, y: 294, w: 44, h: 36, tone: 'ink', text: n })

export const fanOut: Frame[] = [
  {
    caption: 'Fan-out: start one goroutine per input, here one per URL.',
    actors: [fetcher(0, 200, 240), fetcher(1, 400, 240), fetcher(2, 600, 240)],
  },
  {
    caption: 'Fan-in: all of them send into one out channel, and the reader just ranges over it.',
    actors: [fetcher(0, 200, 240, { dim: true }), fetcher(1, 400, 240, { dim: true }), fetcher(2, 600, 240, { bubble: 'out <- c' })],
    props: [{ id: 'out', x: 270, y: 256, w: 260, h: 84, tone: 'dashed', label: 'out chan' }, tok('a', 0), tok('b', 1), tok('c', 2)],
    stop: {
      title: 'who closes out?',
      body: (
        <>
          <p>No single sender can: none knows it is the last. Same trick as the pool.</p>
          <Code>{`for _, c := range ins {
    wg.Go(func() {
        for v := range c {
            out <- v
        }
    })
}
go func() {
    wg.Wait()
    close(out)
}()`}</Code>
        </>
      ),
    },
  },
  {
    caption: '10,000 URLs means 10,000 requests at once. A semaphore caps it: a buffered channel of size 2.',
    actors: [fetcher(0, 330, 330, { hot: true }), fetcher(1, 470, 330, { hot: true }), fetcher(2, 670, 330, { bubble: 'full, waiting' })],
    props: [{ id: 'sem', x: 250, y: 170, w: 300, h: 170, tone: 'line', label: 'sem · cap 2' }],
    stop: {
      title: 'send to take, receive to give back',
      body: (
        <Code>{`sem := make(chan struct{}, 2)
// blocks while 2 are inside:
sem <- struct{}{}
// frees the slot:
defer func() { <-sem }()`}</Code>
      ),
    },
  },
  {
    caption: 'a finishes and receives from sem, freeing a slot; c goes in.',
    actors: [fetcher(0, 120, 330, { dim: true, tag: 'a · done' }), fetcher(1, 470, 330, { hot: true }), fetcher(2, 330, 330, { hot: true })],
    props: [{ id: 'sem', x: 250, y: 170, w: 300, h: 170, tone: 'line', label: 'sem · cap 2' }],
    stop: {
      title: 'semaphore vs worker pool',
      body: (
        <p>Semaphore: one goroutine per task, but only N run at a time. Pool: exactly N long-lived goroutines pull tasks. Both cap load; a pool also caps goroutine count and memory.</p>
      ),
    },
  },
  {
    caption: (
      <>
        errgroup: <code>g.Go</code> runs each task; <code>g.Wait()</code> waits for all and returns an error.
      </>
    ),
    actors: [fetcher(0, 250, 330), fetcher(1, 400, 330), fetcher(2, 550, 330)],
    props: [{ id: 'eg', x: 160, y: 104, w: 480, h: 236, tone: 'line', label: 'errgroup.WithContext(ctx)' }],
  },
  {
    caption: 'b fails: the group cancels its ctx, a and c see Done() and stop, and Wait returns b’s error.',
    actors: [fetcher(0, 250, 330, { bubble: 'Done()' }), fetcher(1, 400, 330, { sprite: 'dandy-raining', hot: true, tag: 'b · 404', bubble: 'error!' }), fetcher(2, 550, 330, { bubble: 'Done()' })],
    props: [{ id: 'eg', x: 160, y: 104, w: 480, h: 236, tone: 'red', label: 'errgroup · ctx canceled' }],
    stop: {
      title: 'why not a WaitGroup?',
      body: (
        <p>
          A WaitGroup only counts: no error, no cancel. errgroup keeps only the <em>first</em> error; collect the rest yourself and <code>errors.Join</code> them if you need all.
        </p>
      ),
    },
  },
  {
    caption: (
      <>
        <code>g.SetLimit(2)</code>: <code>g.Go</code> blocks while two tasks run, so it’s a semaphore built in.
      </>
    ),
    actors: [fetcher(0, 280, 330, { hot: true }), fetcher(1, 480, 330, { hot: true }), fetcher(2, 700, 330, { bubble: 'g.Go blocks' })],
    props: [{ id: 'eg', x: 160, y: 104, w: 480, h: 236, tone: 'line', label: 'errgroup · SetLimit(2)' }],
    stop: {
      edge: true,
      title: 'cancel doesn’t stop g.Go',
      body: (
        <p>
          After the first error, queued <code>g.Go</code> calls still start their tasks; each just sees a canceled ctx. Tasks must check <code>ctx</code>. <code>TryGo</code> returns false instead of
          blocking.
        </p>
      ),
    },
  },
]

/* ── 4. token bucket ─────────────────────────────────────────────────── */

const bucket = (red = false, label = 'burst 3'): Prop => ({ id: 'bucket', x: 330, y: 196, w: 150, h: 144, tone: red ? 'red' : 'line', label })
const tokens = (n: number): Prop[] => [0, 1, 2].map((i) => ({ id: 'tk' + i, x: 347 + i * 42, y: 290, w: 32, h: 32, tone: 'ink', hidden: i >= n }))
const tap = (hot = false): Prop => ({ id: 'tap', x: 315, y: 150, w: 180, h: 34, tone: hot ? 'red' : 'soft', text: '+1 / 100 ms' })
const api: Actor = { id: 'api', sprite: 'friends-docker', x: 720, y: 330, h: 70, tag: 'API', z: 3 }
const req = (i: number, x: number, s: Partial<Actor> = {}): Actor => ({ id: 'r' + i, sprite: i % 2 ? 'misc-standing-v2' : 'misc-standing-left', x, y: 330, h: 105, tag: 'r' + i, ...s })
const passed = (i: number) => req(i, 560 + (i - 1) * 26, { dim: true, tag: undefined })

export const tokenBucket: Frame[] = [
  {
    caption: (
      <>
        <code>rate.NewLimiter(10, 3)</code>: a bucket of 3 tokens, refilled at 10 per second. It starts full.
      </>
    ),
    actors: [req(1, 265), req(2, 195), req(3, 125), req(4, 55), api],
    props: [bucket(), tap(), ...tokens(3)],
    stop: {
      title: 'rate limit ≠ concurrency limit',
      body: <p>A semaphore caps how many are in flight. A token bucket caps how many start per second. Calling a paid API often needs both.</p>,
    },
  },
  {
    caption: 'A burst of three requests each take a token and go straight through.',
    actors: [passed(1), passed(2), passed(3), req(4, 265), api],
    props: [bucket(), tap(), ...tokens(0)],
  },
  {
    caption: (
      <>
        Request 4 finds it empty: <code>Allow()</code> says no (send a 429), <code>Wait(ctx)</code> blocks.
      </>
    ),
    actors: [passed(1), passed(2), passed(3), req(4, 265, { hot: true, bubble: 'Wait(ctx)…' }), api],
    props: [bucket(true, 'empty'), tap(), ...tokens(0)],
  },
  {
    caption: '100 ms later one token drips in and request 4 goes; from here on, 10 per second.',
    actors: [passed(1), passed(2), passed(3), passed(4), api],
    props: [bucket(), tap(true), ...tokens(0)],
    stop: {
      title: 'burst vs rate',
      body: (
        <p>
          <code>r</code> is the long-run average; <code>b</code> is how many may go back to back after a quiet spell. A 100 rps plan shared by 4 pods is 25 rps each, or one shared limiter (e.g. Redis).
        </p>
      ),
    },
  },
  {
    caption: 'Request 5 calls Wait with only 10 ms left on its ctx, but the next token is 100 ms away.',
    actors: [passed(1), passed(2), passed(3), passed(4), req(5, 265, { hot: true, bubble: 'error, now' }), api],
    props: [bucket(true, 'empty'), tap(), ...tokens(0)],
    stop: {
      edge: true,
      title: 'Wait fails fast',
      body: (
        <p>
          If the token can’t arrive before the ctx deadline, <code>Wait</code> returns at once instead of sleeping: <code>rate: Wait(n=1) would exceed context deadline</code>.
        </p>
      ),
    },
  },
]

/* ── 5. graceful shutdown ────────────────────────────────────────────── */

const server = (label = 'http.Server :8080'): Prop => ({ id: 'srv', x: 210, y: 130, w: 420, h: 210, tone: 'line', label })
const door = (closed = false): Prop => ({ id: 'door', x: 200, y: 210, w: 20, h: 130, tone: closed ? 'red' : 'soft' })
const idle = (gone = false): Prop => ({ id: 'idle', x: 470, y: 140, w: 150, h: 34, tone: 'dashed', text: 'idle conn', hidden: gone })
const h = (i: number, s: Partial<Actor> = {}): Actor => ({ id: 'h' + i, sprite: 'science-welding', x: 300 + i * 120, y: 330, h: 110, tag: 'req ' + (i + 1), ...s })
const kube = (s: Partial<Actor> = {}): Actor => ({ id: 'kube', sprite: 'fairy-tale-messenger-red-letter', x: 720, y: 330, h: 120, tag: 'kubelet', ...s })

export const gracefulShutdown: Frame[] = [
  {
    caption: 'The server is handling three requests when a deploy starts.',
    actors: [h(0), h(1), h(2)],
    props: [server(), door(), idle()],
  },
  {
    caption: (
      <>
        Kubernetes sends SIGTERM; <code>signal.NotifyContext</code> turns it into a canceled ctx.
      </>
    ),
    actors: [h(0), h(1), h(2), kube({ bubble: 'SIGTERM', hot: true })],
    props: [server(), door(), idle()],
    stop: {
      title: 'the wiring',
      body: (
        <Code>{`ctx, stop := signal.NotifyContext(
    ctx, syscall.SIGTERM)
defer stop()
<-ctx.Done() // now shut down`}</Code>
      ),
    },
  },
  {
    caption: (
      <>
        <code>srv.Shutdown(ctx)</code> first closes the listener, so new connections are refused.
      </>
    ),
    actors: [h(0), h(1), h(2), kube(), { id: 'new', sprite: 'misc-standing-left', x: 105, y: 330, h: 105, tag: 'new req', hot: true, bubble: 'refused' }],
    props: [server('Shutdown(ctx)'), door(true), idle()],
    stop: {
      edge: true,
      title: 'don’t exit when ListenAndServe returns',
      body: (
        <p>
          It returns <code>http.ErrServerClosed</code> the moment Shutdown starts, not when draining ends. Exit there and in-flight requests die; wait for <code>Shutdown</code> to return.
        </p>
      ),
    },
  },
  {
    caption: 'Idle keep-alive connections are closed now; active requests run to completion.',
    actors: [h(0, { dim: true, bubble: '200 OK' }), h(1), h(2), kube()],
    props: [server('Shutdown(ctx) · draining'), door(true), idle(true)],
  },
  {
    caption: 'The ctx is the drain deadline: if request 3 still runs at 10 s, Shutdown returns ctx.Err().',
    actors: [h(0, { dim: true }), h(1, { dim: true }), h(2, { hot: true, bubble: 'still going' }), kube()],
    props: [server('Shutdown(ctx) · 10 s'), door(true), idle(true)],
    stop: {
      title: 'then what?',
      body: (
        <p>
          <code>srv.Close()</code> cuts what’s left. Keep the whole drain under Kubernetes’ <code>terminationGracePeriodSeconds</code> (30 s by default); after it comes SIGKILL.
        </p>
      ),
    },
  },
  {
    caption: 'Then stop background workers, flush producers, close the DB pool, and exit 0 before SIGKILL.',
    actors: [h(0, { dim: true }), h(1, { dim: true }), h(2, { dim: true }), kube({ bubble: 'exit 0' })],
    props: [server('stopped'), door(true), idle(true)],
    stop: {
      edge: true,
      title: 'the load balancer is late',
      body: (
        <p>
          Endpoint removal is asynchronous, so requests can still arrive after SIGTERM. Fail readiness first or add a short preStop sleep. Hijacked connections (WebSockets) aren’t tracked: use{' '}
          <code>RegisterOnShutdown</code>.
        </p>
      ),
    },
  },
]
