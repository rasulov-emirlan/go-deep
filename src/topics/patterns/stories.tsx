import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ── 1. the context tree ─────────────────────────────────────────────── */

type Node = 'root' | 'db' | 'cache'
const nodeAt: Record<Node, { x: number; y: number; sprite: string; tag: string }> = {
  root: { x: 180, y: 270, sprite: 'fairy-tale-king', tag: 'request' },
  db: { x: 440, y: 150, sprite: 'fairy-tale-messenger-running', tag: 'db' },
  cache: { x: 440, y: 334, sprite: 'fairy-tale-messenger-running', tag: 'cache' },
}
type NodeState = { dead?: boolean; bubble?: string; tag?: string }
const tree = (s: Partial<Record<Node, NodeState>> = {}): Actor[] =>
  (Object.keys(nodeAt) as Node[]).map((id) => {
    const n = nodeAt[id]
    const st = s[id] ?? {}
    return { id, sprite: st.dead ? 'dandy-raining' : n.sprite, x: n.x, y: n.y, h: id === 'root' ? 115 : 92, tag: st.tag ?? n.tag, hot: st.dead, bubble: st.bubble }
  })
// root → trunk → db / cache
const edges = (dead: Partial<Record<'db' | 'cache' | 'trunk', boolean>> = {}): Prop[] => [
  { id: 'e-trunk', x: 238, y: 103, w: 2, h: 184, tone: dead.trunk ? 'red' : 'ink' },
  { id: 'e-db', x: 240, y: 103, w: 145, h: 2, tone: dead.db ? 'red' : 'ink' },
  { id: 'e-cache', x: 240, y: 285, w: 145, h: 2, tone: dead.cache ? 'red' : 'ink' },
]

export const contextTree: Frame[] = [
  {
    caption: 'Each call below a request gets a child context, derived from its parent.',
    actors: tree(),
    props: edges(),
  },
  {
    caption: (
      <>
        Every goroutine watches <code>ctx.Done()</code>, a channel that closes on cancel.
      </>
    ),
    actors: tree({ db: { bubble: '<-ctx.Done()' }, cache: { bubble: '<-ctx.Done()' } }),
    props: edges(),
    stop: {
      title: 'Why a channel?',
      body: (
        <>
          <p>A closed channel wakes every reader at once, so one close tells everyone.</p>
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
    caption: 'The cache call cancels its own context. Only that branch stops.',
    actors: tree({ cache: { dead: true, bubble: 'cancel()' }, root: { bubble: 'still fine' } }),
    props: edges({ cache: true }),
    stop: {
      title: 'Always defer cancel()',
      body: (
        <p>
          Cancel flows down, never up to the parent. Call <code>defer cancel()</code> even on success, or the child stays hooked to its parent.
        </p>
      ),
    },
  },
  {
    caption: (
      <>
        db had a 2 s timeout. Time’s up: <code>Err()</code> returns <code>DeadlineExceeded</code>.
      </>
    ),
    actors: tree({ cache: { dead: true }, db: { dead: true, bubble: 'deadline!', tag: 'db 2s' } }),
    props: edges({ cache: true, db: true }),
  },
  {
    caption: 'Next request: the client hangs up, and everything under the root stops at once.',
    actors: tree({ root: { dead: true, bubble: 'client left' }, db: { dead: true }, cache: { dead: true } }),
    props: edges({ trunk: true, cache: true, db: true }),
  },
]

/* ── 2. worker pool ──────────────────────────────────────────────────── */

const worker = (i: number, s: Partial<Actor> = {}): Actor => ({ id: 'w' + i, sprite: 'convict-working-hard', x: 360 + i * 130, y: 330, h: 110, tag: 'w' + (i + 1), ...s })
const jobsBox = (text: string, closed = false): Prop => ({ id: 'jobs', x: 10, y: 250, w: 230, h: 80, tone: closed ? 'red' : 'dashed', label: closed ? 'closed' : 'jobs', text })
const resBox = (text: string, closed = false): Prop => ({ id: 'res', x: 630, y: 250, w: 160, h: 80, tone: closed ? 'red' : 'dashed', label: closed ? 'closed' : 'results', text })
const closer = (bubble: string): Actor => ({ id: 'closer', sprite: 'fairy-tale-messenger-reading', x: 125, y: 330, h: 100, tag: 'helper', bubble })

export const workerPool: Frame[] = [
  {
    caption: (
      <>
        main puts 5 jobs on one channel. Each worker loops: <code>for j := range jobs</code>.
      </>
    ),
    actors: [worker(0), worker(1)],
    props: [jobsBox('1 2 3 4 5'), resBox('')],
  },
  {
    caption: 'Each job goes to exactly one worker: whoever receives it first.',
    actors: [worker(0, { bubble: 'job 1' }), worker(1, { bubble: 'job 2' })],
    props: [jobsBox('3 4 5'), resBox('')],
  },
  {
    caption: 'A worker sends its result, then loops back for the next job.',
    actors: [worker(0, { bubble: 'job 3' }), worker(1, { bubble: 'job 4' })],
    props: [jobsBox('5'), resBox('1 2')],
  },
  {
    caption: (
      <>
        main calls <code>close(jobs)</code>. Workers drain what’s left, then their loops end.
      </>
    ),
    actors: [worker(0, { dim: true }), worker(1, { bubble: 'job 5' })],
    props: [jobsBox('', true), resBox('1 2 3 4')],
  },
  {
    caption: 'A helper goroutine waits for all workers, then closes results. main’s loop ends.',
    actors: [worker(0, { dim: true }), worker(1, { dim: true }), closer('wg.Wait()')],
    props: [resBox('1 2 3 4 5', true)],
    stop: {
      title: 'The classic deadlock',
      body: (
        <>
          <p>
            Call <code>wg.Wait()</code> in main before reading results, and workers block forever on send.
          </p>
          <Code>{`go func() {
    wg.Wait()
    close(results)
}()
for r := range results { … }`}</Code>
        </>
      ),
    },
  },
]

/* ── 3. fan-out, semaphore, errgroup ─────────────────────────────────── */

const F = ['a', 'b', 'c'] as const
const fetcher = (i: number, x: number, s: Partial<Actor> = {}): Actor => ({ id: 'f' + i, sprite: 'fairy-tale-messenger-running', x, y: 330, h: 110, tag: F[i], ...s })
const sem: Prop = { id: 'box', x: 250, y: 170, w: 300, h: 170, tone: 'line', label: 'cap 2' }
const group = (red = false, label = 'errgroup', w = 480): Prop => ({ id: 'box', x: 160, y: 120, w, h: 220, tone: red ? 'red' : 'line', label })

export const fanOut: Frame[] = [
  {
    caption: 'Fan-out: one goroutine per URL. Fan-in: all send results into one channel.',
    actors: [fetcher(0, 200, { bubble: 'out <- a' }), fetcher(1, 400), fetcher(2, 600, { bubble: 'out <- c' })],
    props: [{ id: 'out', x: 270, y: 130, w: 260, h: 60, tone: 'dashed', label: 'out', text: 'a c' }],
  },
  {
    caption: 'With 10,000 URLs, cap how many run at once with a semaphore.',
    actors: [fetcher(0, 330, { hot: true }), fetcher(1, 470, { hot: true }), fetcher(2, 690, { bubble: 'waiting' })],
    props: [sem],
    stop: {
      title: 'A buffered channel semaphore',
      body: (
        <>
          <p>Sending takes a slot; it blocks while both slots are taken.</p>
          <Code>{`sem := make(chan struct{}, 2)
sem <- struct{}{}        // take
defer func() { <-sem }() // give back`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'a finishes and gives its slot back, so c gets in.',
    actors: [fetcher(0, 120, { dim: true, tag: 'a done' }), fetcher(1, 470, { hot: true }), fetcher(2, 330, { hot: true })],
    props: [sem],
  },
  {
    caption: (
      <>
        errgroup: <code>g.Go</code> starts each task, <code>g.Wait()</code> waits and returns an error.
      </>
    ),
    actors: [fetcher(0, 250), fetcher(1, 400), fetcher(2, 550)],
    props: [group()],
  },
  {
    caption: 'b fails: the group cancels its context; a and c see it and stop.',
    actors: [fetcher(0, 250, { bubble: 'Done()' }), fetcher(1, 400, { sprite: 'dandy-raining', hot: true, tag: 'b 404', bubble: 'error!' }), fetcher(2, 550, { bubble: 'Done()' })],
    props: [group(true, 'canceled')],
    stop: {
      title: 'Why not a WaitGroup?',
      body: <p>A WaitGroup only counts: no error, no cancel. errgroup returns the first error and cancels the rest.</p>,
    },
  },
  {
    caption: (
      <>
        <code>g.SetLimit(2)</code> caps how many run at once: a semaphore built in.
      </>
    ),
    actors: [fetcher(0, 260, { hot: true }), fetcher(1, 460, { hot: true }), fetcher(2, 710, { bubble: 'g.Go blocks' })],
    props: [group(false, 'SetLimit(2)', 420)],
  },
]

/* ── 4. graceful shutdown ────────────────────────────────────────────── */

const server = (label = 'server'): Prop => ({ id: 'srv', x: 210, y: 130, w: 420, h: 210, tone: 'line', label })
const door = (closed = false): Prop => ({ id: 'door', x: 200, y: 210, w: 20, h: 130, tone: closed ? 'red' : 'soft' })
const h = (i: number, s: Partial<Actor> = {}): Actor => ({ id: 'h' + i, sprite: 'science-welding', x: 340 + i * 160, y: 330, h: 110, tag: 'req ' + (i + 1), ...s })
const kube = (s: Partial<Actor> = {}): Actor => ({ id: 'kube', sprite: 'fairy-tale-messenger-red-letter', x: 720, y: 330, h: 120, tag: 'k8s', ...s })

export const gracefulShutdown: Frame[] = [
  {
    caption: 'The server is busy with two requests when a deploy starts.',
    actors: [h(0), h(1)],
    props: [server(), door()],
  },
  {
    caption: 'Kubernetes sends SIGTERM, meaning “please stop”. The app’s context gets canceled.',
    actors: [h(0), h(1), kube({ bubble: 'SIGTERM', hot: true })],
    props: [server(), door()],
  },
  {
    caption: (
      <>
        <code>srv.Shutdown(ctx)</code> stops accepting: new requests are refused.
      </>
    ),
    actors: [h(0), h(1), kube(), { id: 'new', sprite: 'misc-standing-left', x: 105, y: 330, h: 105, tag: 'new', hot: true, bubble: 'refused' }],
    props: [server('draining'), door(true)],
    stop: {
      title: 'Don’t exit too early',
      body: (
        <p>
          <code>ListenAndServe</code> returns <code>ErrServerClosed</code> the moment Shutdown starts. Wait for <code>Shutdown</code> itself to return, or in-flight requests die.
        </p>
      ),
    },
  },
  {
    caption: 'Running requests may finish, up to the deadline you gave Shutdown.',
    actors: [h(0, { dim: true, bubble: '200 OK' }), h(1, { bubble: 'almost…' }), kube()],
    props: [server('draining'), door(true)],
  },
  {
    caption: 'Close the DB and exit, well before Kubernetes gives up and kills the process.',
    actors: [h(0, { dim: true }), h(1, { dim: true }), kube({ bubble: 'exit 0' })],
    props: [server('stopped'), door(true)],
  },
]
