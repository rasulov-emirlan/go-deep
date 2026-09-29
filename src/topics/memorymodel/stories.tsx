import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/*
 * One stage for the whole page: writer W on the left, reader R on the right,
 * a shared notebook in the middle and a signal box under it.
 */
const FLOOR = 340

const w = (bubble?: string, o: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'fairy-tale-messenger-showing', x: 120, y: FLOOR, h: 130, tag: 'W', bubble, ...o })
const r = (bubble?: string, o: Partial<Actor> = {}): Actor => ({ id: 'r', sprite: 'fairy-tale-messenger-reading', x: 680, y: FLOOR, h: 130, tag: 'R', bubble, ...o })

const big = (s: string) => <span className="mm-big">{s}</span>
const mono = (s: string) => <span className="mm-mono">{s}</span>

const note = (v: string, tone: Prop['tone'] = 'line', o: Partial<Prop> = {}): Prop => ({ id: 'note', x: 290, y: 60, w: 220, h: 100, label: 'notebook', text: big(v), tone, ...o })
const signal = (label: string, v: string, tone: Prop['tone'] = 'soft'): Prop => ({ id: 'sig', x: 300, y: 200, w: 200, h: 80, label, text: mono(v), tone })

/* ---------- 1. visibility: the write that never arrives ---------- */

const reg = (v: string): Prop => ({ id: 'reg', x: 560, y: 40, w: 180, h: 80, label: 'register', text: big(v), tone: 'red' })

export const unseen: Frame[] = [
  {
    caption: 'Gopher W writes "hi" in a shared notebook, then sets a done flag.',
    actors: [w('msg = "hi"'), r()],
    props: [note('"hi"'), signal('done flag', 'false')],
  },
  {
    caption: 'Gopher R loops until done is true, then reads the notebook.',
    actors: [w('done = true'), r('for !done {}')],
    props: [note('"hi"'), signal('done flag', 'true')],
  },
  {
    caption: 'The compiler may copy done into a register, a CPU’s private scratch slot.',
    actors: [w(undefined, { dim: true }), r('for !done {}')],
    props: [note('"hi"'), signal('done flag', 'true'), reg('false')],
  },
  {
    caption: 'R keeps checking its stale copy and spins forever. The write never arrives.',
    actors: [w(undefined, { dim: true }), r('still false…', { hot: true })],
    props: [note('"hi"'), signal('done flag', 'true'), reg('false')],
    stop: {
      title: 'No sync, no promise',
      body: <p>The Go memory model lets this loop spin forever. Go 1.26 happens to re-read done each pass, so it ends today; don’t rely on it.</p>,
    },
  },
  {
    caption: 'Worse: CPU or compiler may reorder writes. R sees done, but no "hi".',
    actors: [w(undefined, { dim: true }), r('empty?!', { hot: true })],
    props: [note('""', 'red'), signal('done flag', 'true')],
  },
  {
    caption: 'This is real: in Go 1.26 a racy counter loop compiles away entirely.',
    actors: [w('n++ forever'), r('n is 0', { hot: true })],
    props: [note('0', 'red', { label: 'counter n' }), signal('sync', 'none', 'dashed')],
    stop: {
      title: 'Go 1.26 prints 0',
      body: (
        <>
          <p>No sync means nobody may legally look, so the compiler deleted the writes.</p>
          <Code>{`var n int
go func() {
    for { n++ } // no sync
}()
time.Sleep(time.Second)
fmt.Println(n) // 0`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 2. happens-before edges ---------- */

export const edges: Frame[] = [
  {
    caption: '"Happens-before" is a promise: if A happens before B, B sees A’s writes.',
    actors: [w('A: write "hi"'), r('B: read')],
    props: [note('"hi"'), signal('edge', 'A→B')],
  },
  {
    caption: 'Channel: a send happens before its receive finishes. R then sees "hi".',
    actors: [w('ch <- 1'), r('<-ch')],
    props: [note('"hi"'), signal('channel', 'send→recv')],
  },
  {
    caption: 'Closing a channel counts too: a receive that sees the close sees "hi".',
    actors: [w('close(ch)'), r('<-ch')],
    props: [note('"hi"'), signal('channel', 'close→recv')],
  },
  {
    caption: 'Mutex: what W wrote before Unlock, R sees after its next Lock.',
    actors: [w('mu.Unlock()'), r('mu.Lock()')],
    props: [note('"hi"'), signal('sync.Mutex', 'Unlock→Lock')],
  },
  {
    caption: 'WaitGroup: writes made before Done are visible once Wait returns.',
    actors: [w('wg.Done()'), r('wg.Wait()')],
    props: [note('"hi"'), signal('sync.WaitGroup', 'Done→Wait')],
  },
  {
    caption: '`once.Do(f)`: every caller returns after f finished, and sees its writes.',
    actors: [w('once.Do(f)'), r('once.Do(f)')],
    props: [note('"hi"'), signal('sync.Once', 'f→return')],
  },
  {
    caption: 'Atomics: since Go 1.19 they are sequentially consistent, one order all agree on.',
    actors: [w('Store(true)'), r('Load() → true')],
    props: [note('"hi"'), signal('sync/atomic', 'Store→Load', 'ink')],
    stop: {
      title: 'Fix the done flag',
      body: (
        <>
          <p>An atomic Store seen by a Load is an edge, so R sees "hi".</p>
          <Code>{`var done atomic.Bool
// W:
msg = "hi"; done.Store(true)
// R:
for !done.Load() {}
print(msg) // always "hi"`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 3. a race means no guarantees: torn reads ---------- */

const ptr = (v: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'ptr', x: 200, y: 60, w: 190, h: 100, label: 'pointer', text: big(v), tone })
const len = (v: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'len', x: 410, y: 60, w: 190, h: 100, label: 'length', text: big(v), tone })

export const torn: Frame[] = [
  {
    caption: 'A data race: two goroutines use one variable, one writes, no happens-before.',
    actors: [w('s = "hello"'), r('print(s)')],
    props: [ptr('→ "hi"'), len('2')],
  },
  {
    caption: 'A string is two machine words: a pointer to the bytes and a length.',
    actors: [w(undefined, { dim: true }), r(undefined, { dim: true })],
    props: [ptr('→ "hi"'), len('2')],
  },
  {
    caption: 'W writes s = "hello" one word at a time. Pointer done, length not yet.',
    actors: [w('s = "hello"'), r(undefined, { dim: true })],
    props: [ptr('→ "hello"', 'red'), len('2')],
  },
  {
    caption: 'R reads right now: new pointer, old length. It gets "he", a torn read.',
    actors: [w(undefined, { dim: true }), r('"he"?!', { hot: true })],
    props: [ptr('→ "hello"', 'red'), len('2', 'red')],
    stop: {
      title: 'Real on Go 1.26',
      body: <p>Our racy loop read a length-15 string pointing at "hi", and an interface that ran one type’s method on another type’s data.</p>,
    },
  },
  {
    caption: 'Interfaces and slices tear too. A torn pointer can crash or corrupt memory.',
    actors: [w(undefined, { dim: true }), { id: 'boom', sprite: 'science-experiment-mishap', x: 680, y: FLOOR, h: 130, tag: 'panic', hot: true, bubble: 'SIGSEGV' }],
    props: [{ ...ptr('type+data', 'red'), label: 'interface' }, { ...len('ptr+len+cap', 'red'), label: 'slice' }],
    stop: {
      edge: true,
      title: 'No benign data races',
      body: <p>The memory model says multiword races can cause arbitrary memory corruption. A racy program is simply wrong.</p>,
    },
  },
]

/* ---------- 4. don't be clever ---------- */

export const simple: Frame[] = [
  {
    caption: 'Tricks like a plain bool flag fail silently. The Go docs say: don’t be clever.',
    actors: [w('done = true'), r('for !done {}', { hot: true })],
    props: [note('"hi"'), signal('clever', 'plain bool', 'red')],
  },
  {
    caption: 'Channel: send the notebook to R, then W never touches it again.',
    actors: [w('ch <- note'), r('mine now')],
    props: [note('"hi"', 'line', { x: 440 }), signal('channel', 'hand over')],
  },
  {
    caption: 'Mutex: both lock before they touch the notebook. Boring, and correct.',
    actors: [w('mu.Lock()'), r('mu.Lock()')],
    props: [note('"hi"'), signal('sync.Mutex', 'take turns', 'ink')],
  },
  {
    caption: '`go test -race` reports data races, but only in code your tests run.',
    actors: [w(undefined, { dim: true }), { id: 'det', sprite: 'science-lightbulb', x: 680, y: FLOOR, h: 130, tag: '-race', hot: true, bubble: 'DATA RACE!' }],
    props: [note('"hi"'), signal('go test', '-race', 'ink')],
    stop: {
      title: 'It only sees runs',
      body: <p>The detector checks the code paths that actually ran at the same time. Run it in CI and in load tests.</p>,
    },
  },
]
