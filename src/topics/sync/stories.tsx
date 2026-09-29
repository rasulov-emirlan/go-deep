import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ---------- 1. data race: n++ is three steps ---------- */

const counter = (v: string, hot = false): Prop => ({ id: 'n', x: 320, y: 170, w: 160, h: 80, tone: hot ? 'red' : 'line', label: 'shared n', text: <span className="sy-big">{v}</span> })
const g1 = (o: Partial<Actor> = {}): Actor => ({ id: 'g1', sprite: 'misc-standing-v2', x: 160, y: 330, h: 120, tag: 'G1', ...o })
const g2 = (o: Partial<Actor> = {}): Actor => ({ id: 'g2', sprite: 'dandy-standing', x: 640, y: 330, h: 120, tag: 'G2', ...o })
const code = (t: string): Prop => ({ id: 'code', x: 300, y: 280, w: 200, h: 44, tone: 'soft', text: <span className="sy-mono">{t}</span> })

export const lostUpdate: Frame[] = [
  {
    caption: 'Two goroutines each run n++ on the same variable. You expect n to end at 2.',
    actors: [g1({ bubble: 'n++' }), g2({ bubble: 'n++' })],
    props: [counter('n = 0'), code('n++')],
  },
  {
    caption: 'But n++ is three machine steps: load n into a register, add 1, store it back.',
    actors: [g1(), g2()],
    props: [counter('n = 0'), code('LOAD · ADD · STORE')],
  },
  {
    caption: 'G1 loads n. Its register now holds 0.',
    actors: [g1({ x: 240, bubble: 'I read 0', tag: 'G1 · r=0' }), g2()],
    props: [counter('n = 0'), code('LOAD · ADD · STORE')],
  },
  {
    caption: 'Before G1 writes anything back, G2 loads n too. It also sees 0.',
    actors: [g1({ x: 240, tag: 'G1 · r=0' }), g2({ x: 560, bubble: 'I read 0', tag: 'G2 · r=0', hot: true })],
    props: [counter('n = 0'), code('LOAD · ADD · STORE')],
  },
  {
    caption: 'G1 adds 1 and stores it: n is 1.',
    actors: [g1({ x: 240, bubble: 'wrote 1', tag: 'G1 · r=1' }), g2({ x: 560, tag: 'G2 · r=0' })],
    props: [counter('n = 1'), code('LOAD · ADD · STORE')],
  },
  {
    caption: 'G2 adds 1 to its stale 0 and stores 1 over it. One increment is lost.',
    actors: [g1({ x: 240, tag: 'G1 · r=1', dim: true }), g2({ x: 560, bubble: 'wrote 1', tag: 'G2 · r=1', hot: true })],
    props: [counter('n = 1', true), code('LOAD · ADD · STORE')],
    stop: {
      title: 'a data race',
      body: (
        <>
          <p>
            Two goroutines touch the same memory, at least one writes, and nothing orders them (no happens-before). The Go memory model says such a program may see any value, and a racy
            interface or slice can tear and crash.
          </p>
          <Code>{`for range 1000 {
    wg.Go(func() { n++ })
}
wg.Wait()
fmt.Println(n) // 989 on one run`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'go test -race records every access and reports two unordered ones where one is a write.',
    actors: [
      g1({ x: 240, tag: 'G1', dim: true }),
      g2({ x: 560, tag: 'G2', dim: true }),
      { id: 'det', sprite: 'science-lightbulb', x: 720, y: 330, h: 120, tag: '-race', hot: true, bubble: 'DATA RACE!' },
    ],
    props: [counter('n = 1', true), code('WARNING: DATA RACE')],
    stop: {
      edge: true,
      title: 'it only finds races that run',
      body: (
        <p>
          The detector is dynamic: a race on a path your tests never execute stays hidden. It costs roughly 5–10× memory and 2–20× CPU, so run it in CI tests, not usually in production.
        </p>
      ),
    },
  },
  {
    caption: 'Lock every access and the data race is gone. A race condition, a timing bug in your logic, can remain.',
    actors: [g1({ x: 200, bubble: 'balance ≥ 100?' }), g2({ x: 600, bubble: 'balance ≥ 100?' })],
    props: [{ ...counter('bal = 100'), label: 'locked inside' }, code('check, then withdraw')],
    stop: {
      title: 'data race ≠ race condition',
      body: (
        <>
          <p>Each call locks, so -race stays silent. Both goroutines can still pass the check and overdraw. Hold one lock across the check and the act.</p>
          <Code>{`if acc.Balance() >= 100 { // locks, unlocks
    acc.Withdraw(100)        // locks, unlocks
}`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 2. Mutex and RWMutex ---------- */

const room = (label = 'critical section', tone: Prop['tone'] = 'dashed'): Prop => ({ id: 'room', x: 470, y: 190, w: 300, h: 160, tone, label })
const lock = (text: string, tone: Prop['tone'] = 'ink'): Prop => ({ id: 'lock', x: 310, y: 120, w: 140, h: 44, tone, text: <span className="sy-mono">{text}</span> })
const gp = (id: string, sprite: string, x: number, o: Partial<Actor> = {}): Actor => ({ id, sprite, x, y: 340, h: 100, tag: id, ...o })

export const mutexStory: Frame[] = [
  {
    caption: 'G1 calls Lock on a free mutex: a single compare-and-swap flips state from 0 to locked.',
    actors: [gp('G1', 'fairy-tale-messenger-running', 560, { bubble: 'CAS 0→1' })],
    props: [room(), lock('locked')],
  },
  {
    caption: 'G2 finds it locked. On a multicore machine it first spins a few times, hoping G1 finishes soon.',
    actors: [gp('G1', 'convict-working-hard', 560), gp('G2', 'misc-standing-v2', 260, { bubble: 'spin…' })],
    props: [room(), lock('locked')],
    stop: {
      title: 'why spin first',
      body: (
        <p>
          Parking and waking a goroutine costs far more than a lock held for nanoseconds. Go spins at most 4 times, and only with GOMAXPROCS &gt; 1, another running P, and an empty local run queue.
        </p>
      ),
    },
  },
  {
    caption: 'Still locked, so G2 parks on the mutex’s semaphore. G3 arrives and parks behind it.',
    actors: [gp('G1', 'convict-working-hard', 560), gp('G2', 'dandy-umbrella', 250, { bubble: 'zzz', dim: true }), gp('G3', 'dandy-raining', 130, { dim: true })],
    props: [room(), lock('locked · 2 waiting')],
  },
  {
    caption: 'G1 unlocks and wakes G2. But G4, already running on a CPU, grabs the lock first.',
    actors: [
      gp('G1', 'superhero-standing', 700, { dim: true, y: 180, h: 80 }),
      gp('G4', 'fairy-tale-robin-hood', 560, { bubble: 'mine!', hot: true }),
      gp('G2', 'misc-standing-v2', 330, { bubble: 'but I waited', y: 340 }),
      gp('G3', 'dandy-raining', 130, { dim: true }),
    ],
    props: [room(), lock('locked')],
    stop: {
      title: 'normal mode',
      body: <p>A newcomer already on a CPU beats a woken sleeper that still needs to be scheduled. This barging keeps throughput high, but it is unfair.</p>,
    },
  },
  {
    caption: 'G2 has waited over 1 ms, so the mutex switches to starvation mode.',
    actors: [gp('G4', 'fairy-tale-robin-hood', 560), gp('G2', 'dandy-umbrella', 250, { bubble: 'waited > 1 ms', hot: true }), gp('G3', 'dandy-raining', 130, { dim: true })],
    props: [room(), lock('starving', 'red')],
  },
  {
    caption: 'In starvation mode Unlock hands the lock straight to the oldest waiter. Newcomers queue at the back.',
    actors: [
      gp('G4', 'superhero-standing', 700, { dim: true, y: 180, h: 80 }),
      gp('G2', 'convict-working-hard', 560, { bubble: 'handed to me', hot: true }),
      gp('G3', 'dandy-raining', 250, { dim: true }),
      gp('G5', 'misc-standing-left', 130, { bubble: 'back of line', dim: true }),
    ],
    props: [room(), lock('starving', 'red')],
    stop: {
      title: 'FIFO handoff',
      body: <p>The mutex leaves starvation mode when a waiter gets it after waiting under 1 ms, or when it is the last waiter. Starvation mode is fair but slower.</p>,
    },
  },
  {
    caption: 'RWMutex: any number of readers can hold RLock together.',
    actors: [gp('R1', 'fairy-tale-messenger-reading', 520, { tag: 'R1' }), gp('R2', 'fairy-tale-messenger-reading', 620), gp('R3', 'fairy-tale-messenger-reading', 720)],
    props: [room('readers inside'), lock('3 readers')],
  },
  {
    caption: 'A writer calls Lock. It waits for the readers already inside, and new RLock calls now wait behind it.',
    actors: [
      gp('R1', 'fairy-tale-messenger-reading', 520),
      gp('R2', 'fairy-tale-messenger-reading', 620),
      gp('R3', 'fairy-tale-messenger-reading', 720),
      gp('W', 'fairy-tale-armored-knight', 380, { bubble: 'my turn next', hot: true, h: 120 }),
      gp('R4', 'misc-standing-v2', 230, { bubble: 'blocked', dim: true }),
    ],
    props: [room('readers inside'), lock('writer waiting', 'red')],
    stop: {
      edge: true,
      title: 'recursive RLock deadlocks',
      body: (
        <p>
          A goroutine holding RLock that calls RLock again queues behind the waiting writer, and the writer waits for it. Go reports <code>all goroutines are asleep - deadlock!</code> if nothing
          else runs.
        </p>
      ),
    },
  },
  {
    caption: 'The last reader leaves, and the writer gets the room alone.',
    actors: [gp('W', 'fairy-tale-armored-knight', 600, { bubble: 'alone', h: 120 }), gp('R4', 'misc-standing-v2', 230, { bubble: 'next', dim: true })],
    props: [room('writer inside'), lock('write-locked')],
  },
]

/* ---------- 3. WaitGroup ---------- */

const wgBox = (v: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'wg', x: 310, y: 90, w: 180, h: 70, tone, label: 'wg counter', text: <span className="sy-big">{v}</span> })
const main = (o: Partial<Actor> = {}): Actor => ({ id: 'main', sprite: 'fairy-tale-king', x: 125, y: 340, h: 110, tag: 'main', ...o })
const wk = (i: number, o: Partial<Actor> = {}): Actor => ({ id: 'w' + i, sprite: 'convict-working-hard', x: 360 + i * 140, y: 340, h: 100, tag: 'worker ' + i, ...o })
const doneW = (i: number): Actor => wk(i, { sprite: 'superhero-standing', dim: true, bubble: 'Done()' })

export const waitGroup: Frame[] = [
  {
    caption: 'main calls wg.Add(3) before starting any worker.',
    actors: [main({ bubble: 'Add(3)' })],
    props: [wgBox('3')],
    stop: {
      title: 'Add before go',
      body: (
        <p>
          If each worker calls Add itself, Wait may run first, see 0 and return early. <code>go vet</code> flags <code>WaitGroup.Add called from inside new goroutine</code> since Go 1.25.
        </p>
      ),
    },
  },
  {
    caption: 'Three workers run. main calls Wait and parks until the counter hits zero.',
    actors: [main({ bubble: 'Wait()', sprite: 'dandy-umbrella', dim: true }), wk(0), wk(1), wk(2)],
    props: [wgBox('3')],
  },
  {
    caption: 'Each worker calls Done when it finishes, which is Add(-1).',
    actors: [main({ sprite: 'dandy-umbrella', dim: true }), doneW(0), doneW(1), wk(2)],
    props: [wgBox('1')],
  },
  {
    caption: 'The last Done brings the counter to 0 and wakes main.',
    actors: [main({ bubble: 'all done!', hot: true }), doneW(0), doneW(1), doneW(2)],
    props: [wgBox('0')],
    stop: {
      edge: true,
      title: 'one Done too many',
      body: (
        <p>
          Going below zero panics: <code>sync: negative WaitGroup counter</code>.
        </p>
      ),
    },
  },
  {
    caption: 'Bug: pass wg by value and each worker calls Done on its own copy. The real counter never moves.',
    actors: [
      main({ bubble: 'Wait()…', sprite: 'dandy-raining' }),
      wk(0, { sprite: 'superhero-standing', bubble: 'copy → 0', dim: true }),
      wk(1, { sprite: 'superhero-standing', bubble: 'copy → 0', dim: true }),
      wk(2, { sprite: 'superhero-standing', bubble: 'copy → 0', dim: true }),
    ],
    props: [wgBox('3', 'red')],
    stop: {
      edge: true,
      title: 'deadlock',
      body: (
        <>
          <p>When every worker exits, only main is left, blocked forever. Go crashes with a deadlock; in a server with other goroutines it just hangs. go vet: passes lock by value.</p>
          <Code>{`go func(wg sync.WaitGroup) { // a copy
    defer wg.Done()
}(wg)`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Go 1.25 added wg.Go(f): it does Add(1), starts f, and calls Done when f returns.',
    actors: [main({ bubble: 'wg.Go(f)' }), wk(0), wk(1), wk(2)],
    props: [wgBox('3')],
    stop: {
      title: 'the modern loop',
      body: <Code>{`for _, u := range urls {
    wg.Go(func() { fetch(u) })
}
wg.Wait()`}</Code>,
    },
  },
]

/* ---------- 4. atomics, Once, sync.Map, Pool ---------- */

const box = (id: string, x: number, label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id, x, y: 90, w: 200, h: 70, tone, label, text: <span className="sy-mono sy-down">{text}</span> })

export const toolbox: Frame[] = [
  {
    caption: 'atomic.Int64.Add does load, add and store as one indivisible CPU instruction. Nothing is lost.',
    actors: [g1({ x: 160, bubble: 'Add(1)' }), g2({ x: 640, bubble: 'Add(1)' })],
    props: [box('a', 300, 'atomic.Int64', 'n = 2')],
  },
  {
    caption: 'For anything else, loop: read the old value, compute, CompareAndSwap. If someone changed it, retry.',
    actors: [g1({ x: 160, bubble: 'CAS(5→7) ✗ retry', hot: true }), g2({ x: 640, bubble: 'CAS(5→6) ✓' })],
    props: [box('a', 300, 'max, via CAS loop', 'n = 6')],
    stop: {
      title: 'atomic or mutex?',
      body: (
        <p>
          Atomics protect one word. Once an invariant spans two fields, or you need check-then-act, use a mutex. Under heavy contention a CAS loop keeps retrying while a mutex parks waiters.
        </p>
      ),
    },
  },
  {
    caption: 'sync.Once: three goroutines call Do(init). One runs it; the others wait until it finishes.',
    actors: [
      { id: 'o1', sprite: 'fairy-tale-witch-cooking', x: 400, y: 340, h: 120, tag: 'G1 runs init', hot: true },
      { id: 'o2', sprite: 'misc-standing-v2', x: 160, y: 340, h: 100, tag: 'G2', bubble: 'waiting', dim: true },
      { id: 'o3', sprite: 'dandy-standing', x: 640, y: 340, h: 100, tag: 'G3', bubble: 'waiting', dim: true },
    ],
    props: [box('a', 300, 'sync.Once', 'Do(init)')],
    stop: {
      edge: true,
      title: 'a panic still counts',
      body: (
        <p>
          If f panics, Once treats it as done: later Do calls run nothing. Calling Do on the same Once inside f deadlocks. For values, use <code>sync.OnceValue</code> (Go 1.21).
        </p>
      ),
    },
  },
  {
    caption: 'sync.Map: since Go 1.24 it is a concurrent hash-trie, so readers never queue on one lock.',
    actors: [
      { id: 'm1', sprite: 'fairy-tale-messenger-reading', x: 160, y: 340, h: 100, tag: 'Load' },
      { id: 'm2', sprite: 'fairy-tale-messenger-reading', x: 400, y: 340, h: 100, tag: 'Load' },
      { id: 'm3', sprite: 'adventure-hiking', x: 640, y: 340, h: 100, tag: 'Store k7' },
    ],
    props: [box('a', 300, 'sync.Map', 'any → any')],
    stop: {
      title: 'when to use it',
      body: (
        <p>
          Two cases from the docs: keys written once and read many times, or goroutines working on disjoint keys. Otherwise a plain map with a Mutex is simpler, typed and often faster.
        </p>
      ),
    },
  },
  {
    caption: 'sync.Pool: Get a spare buffer, use it, Put it back, so hot paths allocate less.',
    actors: [
      { id: 'p1', sprite: 'adventure-pirate-lifting-goods', x: 180, y: 340, h: 120, tag: 'Get()' },
      { id: 'p2', sprite: 'fairy-tale-witch-broom', x: 640, y: 340, h: 110, tag: 'GC', dim: true },
    ],
    props: [box('a', 300, 'sync.Pool', '[buf] [buf] [buf]')],
  },
  {
    caption: 'Each GC moves pooled objects to a victim cache and frees the old victims. A cache, not storage.',
    actors: [
      { id: 'p1', sprite: 'adventure-pirate-lifting-goods', x: 180, y: 340, h: 120, tag: 'Get()', dim: true },
      { id: 'p2', sprite: 'fairy-tale-witch-broom', x: 560, y: 340, h: 110, tag: 'GC', hot: true, bubble: 'sweep!' },
    ],
    props: [box('a', 300, 'sync.Pool', '[ ] [ ] [ ]', 'dashed')],
    stop: {
      edge: true,
      title: 'Reset before Put',
      body: <p>Get may return any old object, or a new one from New. Reset buffers, and never pool things like connections that need a close.</p>,
    },
  },
]
