import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ---------- 1. data race: n++ is three steps ---------- */

const counter = (v: string, hot = false): Prop => ({ id: 'n', x: 320, y: 170, w: 160, h: 80, tone: hot ? 'red' : 'line', label: 'shared n', text: <span className="sy-big">{v}</span> })
const g1 = (o: Partial<Actor> = {}): Actor => ({ id: 'g1', sprite: 'misc-standing-v2', x: 160, y: 330, h: 120, tag: 'G1', ...o })
const g2 = (o: Partial<Actor> = {}): Actor => ({ id: 'g2', sprite: 'dandy-standing', x: 640, y: 330, h: 120, tag: 'G2', ...o })
const code = (t: string): Prop => ({ id: 'code', x: 300, y: 280, w: 200, h: 44, tone: 'soft', text: <span className="sy-mono">{t}</span> })
const steps = code('read · add · write')

export const lostUpdate: Frame[] = [
  {
    caption: 'Two goroutines each run `n++` on a shared n. You expect 2.',
    actors: [g1({ bubble: 'n++' }), g2({ bubble: 'n++' })],
    props: [counter('n = 0'), code('n++')],
  },
  {
    caption: 'But `n++` is three steps: read n, add 1, write it back.',
    actors: [g1(), g2()],
    props: [counter('n = 0'), steps],
  },
  {
    caption: 'G1 reads 0. Before it writes, G2 reads 0 too.',
    actors: [g1({ x: 240, bubble: 'I read 0' }), g2({ x: 560, bubble: 'I read 0', hot: true })],
    props: [counter('n = 0'), steps],
  },
  {
    caption: 'Both add 1 and write 1. One update is lost.',
    actors: [g1({ x: 240, bubble: 'wrote 1' }), g2({ x: 560, bubble: 'wrote 1', hot: true })],
    props: [counter('n = 1', true), steps],
    stop: {
      title: 'A data race',
      body: <p>Two goroutines touch the same memory, one writes, and nothing orders them. Go promises nothing about the result.</p>,
    },
  },
  {
    caption: '`go test -race` catches it, but only on code your tests actually run.',
    actors: [g1({ x: 240, dim: true }), g2({ x: 560, dim: true }), { id: 'det', sprite: 'science-lightbulb', x: 720, y: 330, h: 120, tag: '-race', hot: true, bubble: 'DATA RACE!' }],
    props: [counter('n = 1', true), code('WARNING: DATA RACE')],
  },
  {
    caption: 'Lock each access and the data race is gone. A race condition can remain.',
    actors: [g1({ x: 200, bubble: 'bal ≥ 100?' }), g2({ x: 600, bubble: 'bal ≥ 100?' })],
    props: [{ ...counter('bal = 100'), label: 'locked' }, code('check, then withdraw')],
    stop: {
      title: 'Data race ≠ race condition',
      body: (
        <>
          <p>Both can pass the check, then both withdraw. Hold one lock across check and act.</p>
          <Code>{`if acc.Balance() >= 100 {
    acc.Withdraw(100) // both get here
}`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 2. Mutex and RWMutex ---------- */

const room = (label = 'locked area', tone: Prop['tone'] = 'dashed'): Prop => ({ id: 'room', x: 470, y: 190, w: 300, h: 160, tone, label })
const lock = (text: string, tone: Prop['tone'] = 'ink'): Prop => ({ id: 'lock', x: 310, y: 120, w: 140, h: 44, tone, text: <span className="sy-mono">{text}</span> })
const gp = (id: string, sprite: string, x: number, o: Partial<Actor> = {}): Actor => ({ id, sprite, x, y: 340, h: 100, tag: id, ...o })
const reader = (id: string, x: number): Actor => gp(id, 'fairy-tale-messenger-reading', x)

export const mutexStory: Frame[] = [
  {
    caption: 'A mutex lets one goroutine in at a time. G1 calls Lock and enters.',
    actors: [gp('G1', 'convict-working-hard', 670, { bubble: 'Lock()' })],
    props: [room(), lock('locked')],
  },
  {
    caption: 'G2 calls Lock too, and waits until G1 calls Unlock.',
    actors: [gp('G1', 'convict-working-hard', 670), gp('G2', 'dandy-umbrella', 250, { bubble: 'waiting' })],
    props: [room(), lock('locked')],
  },
  {
    caption: 'If a waiter waits over 1 ms, the mutex switches to starvation mode.',
    actors: [gp('G1', 'convict-working-hard', 670), gp('G2', 'dandy-umbrella', 250, { bubble: '> 1 ms', hot: true }), gp('G3', 'dandy-raining', 120, { dim: true })],
    props: [room(), lock('starving', 'red')],
    stop: {
      title: 'Fast, then fair',
      body: <p>Normally a newcomer already running can grab the lock first: fast, but unfair. In starvation mode, Unlock hands the lock to waiters in arrival order.</p>,
    },
  },
  {
    caption: 'RWMutex: many readers can hold RLock at the same time.',
    actors: [reader('R1', 520), reader('R2', 620), reader('R3', 720)],
    props: [room('readers'), lock('3 readers')],
  },
  {
    caption: 'A writer’s Lock waits for readers to leave. New readers queue behind it.',
    actors: [reader('R1', 560), reader('R2', 680), gp('W', 'fairy-tale-armored-knight', 380, { bubble: 'my turn', hot: true, h: 120 }), gp('R4', 'misc-standing-v2', 230, { bubble: 'blocked', dim: true })],
    props: [room('readers'), lock('writer waiting', 'red')],
    stop: {
      edge: true,
      title: 'Nested RLock deadlocks',
      body: <p>A reader that calls RLock again queues behind the waiting writer. The writer waits for that reader, so neither moves.</p>,
    },
  },
]

/* ---------- 3. WaitGroup ---------- */

const wgBox = (v: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'wg', x: 310, y: 90, w: 180, h: 70, tone, label: 'wg counter', text: <span className="sy-big">{v}</span> })
const main = (o: Partial<Actor> = {}): Actor => ({ id: 'main', sprite: 'fairy-tale-king', x: 125, y: 340, h: 110, tag: 'main', ...o })
const wk = (i: number, o: Partial<Actor> = {}): Actor => ({ id: 'w' + i, sprite: 'convict-working-hard', x: 360 + i * 140, y: 340, h: 100, tag: 'W' + (i + 1), ...o })
const doneW = (i: number): Actor => wk(i, { sprite: 'superhero-standing', dim: true, bubble: 'Done()' })
const asleep = { sprite: 'dandy-umbrella', dim: true }

export const waitGroup: Frame[] = [
  {
    caption: 'main calls `wg.Add(3)` before starting the workers, never inside them.',
    actors: [main({ bubble: 'Add(3)' })],
    props: [wgBox('3')],
  },
  {
    caption: 'main calls `wg.Wait()` and sleeps until the counter reaches 0.',
    actors: [main({ ...asleep, bubble: 'Wait()' }), wk(0), wk(1), wk(2)],
    props: [wgBox('3')],
  },
  {
    caption: 'Each worker calls `Done()` when finished. The last one wakes main.',
    actors: [main({ bubble: 'all done!', hot: true }), doneW(0), doneW(1), doneW(2)],
    props: [wgBox('0')],
  },
  {
    caption: 'Bug: pass wg by value, and each Done hits a copy. main waits forever.',
    actors: [main({ sprite: 'dandy-raining', bubble: 'Wait()…', hot: true }), wk(0, { sprite: 'superhero-standing', bubble: 'copy', dim: true }), wk(1, { sprite: 'superhero-standing', bubble: 'copy', dim: true }), wk(2, { sprite: 'superhero-standing', bubble: 'copy', dim: true })],
    props: [wgBox('3', 'red')],
    stop: {
      edge: true,
      title: 'Pass a pointer',
      body: (
        <>
          <p>Each goroutine gets its own copy, so the real counter never reaches 0.</p>
          <Code>{`go func(wg sync.WaitGroup) { // copy!
    defer wg.Done()
}(wg)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Since Go 1.25, `wg.Go(f)` does Add, go and Done for you.',
    actors: [main({ bubble: 'wg.Go(f)' }), wk(0), wk(1), wk(2)],
    props: [wgBox('3')],
  },
]

/* ---------- 4. atomics, Once, sync.Map, Pool ---------- */

const box = (label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'a', x: 300, y: 90, w: 200, h: 70, tone, label, text: <span className="sy-mono sy-down">{text}</span> })

export const toolbox: Frame[] = [
  {
    caption: '`atomic.Int64` does read, add and write as one step. Nothing is lost.',
    actors: [g1({ bubble: 'Add(1)' }), g2({ bubble: 'Add(1)' })],
    props: [box('atomic.Int64', 'n = 2')],
  },
  {
    caption: 'Atomics guard one value. For two fields, or check-then-act, use a mutex.',
    actors: [g1({ bubble: 'x and y?', hot: true }), g2()],
    props: [box('two fields', 'x, y', 'red')],
  },
  {
    caption: '`sync.Once`: many goroutines call Do(f). f runs once; the others wait.',
    actors: [
      { id: 'o1', sprite: 'fairy-tale-witch-cooking', x: 400, y: 340, h: 120, tag: 'G1 runs f', hot: true },
      { id: 'o2', sprite: 'misc-standing-v2', x: 160, y: 340, h: 100, tag: 'G2', bubble: 'waiting', dim: true },
      { id: 'o3', sprite: 'dandy-standing', x: 640, y: 340, h: 100, tag: 'G3', bubble: 'waiting', dim: true },
    ],
    props: [box('sync.Once', 'Do(f)')],
  },
  {
    caption: '`sync.Map` is a map many goroutines can use safely, tuned for reads.',
    actors: [
      { id: 'm1', sprite: 'fairy-tale-messenger-reading', x: 160, y: 340, h: 100, tag: 'Load' },
      { id: 'm2', sprite: 'fairy-tale-messenger-reading', x: 400, y: 340, h: 100, tag: 'Load' },
      { id: 'm3', sprite: 'adventure-hiking', x: 640, y: 340, h: 100, tag: 'Store' },
    ],
    props: [box('sync.Map', 'any → any')],
    stop: {
      title: 'When to use it',
      body: <p>Keys written once and read often, or goroutines on separate keys. Otherwise a map plus a Mutex is simpler and often faster.</p>,
    },
  },
  {
    caption: '`sync.Pool` keeps spare objects to reuse, so hot code allocates less.',
    actors: [
      { id: 'p1', sprite: 'adventure-pirate-lifting-goods', x: 180, y: 340, h: 120, tag: 'Get()' },
      { id: 'p2', sprite: 'fairy-tale-witch-broom', x: 640, y: 340, h: 110, tag: 'GC', dim: true },
    ],
    props: [box('sync.Pool', '[buf] [buf]')],
  },
  {
    caption: 'Garbage collection can drop pooled objects. Pool is a cache, not storage.',
    actors: [
      { id: 'p1', sprite: 'adventure-pirate-lifting-goods', x: 180, y: 340, h: 120, tag: 'Get()', dim: true },
      { id: 'p2', sprite: 'fairy-tale-witch-broom', x: 560, y: 340, h: 110, tag: 'GC', hot: true, bubble: 'sweep!' },
    ],
    props: [box('sync.Pool', '[ ] [ ]', 'dashed')],
  },
]
