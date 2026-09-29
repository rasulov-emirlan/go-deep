import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

const mono = (t: string) => <span className="df-mono">{t}</span>
const big = (t: string) => <span className="df-big">{t}</span>

/* ---------- 1. the defer stack ---------- */

const writer = (o: Partial<Actor> = {}): Actor => ({ id: 'fn', sprite: 'fairy-tale-messenger-red-letter', x: 140, y: 330, h: 140, tag: 'func f', ...o })
const card = (i: number, t: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'c' + i, x: 290, y: 250 - i * 66, w: 240, h: 56, tone, text: mono(t) })
const stackLabel: Prop = { id: 'sl', x: 290, y: 312, w: 240, h: 22, tone: 'none', label: 'defer stack' }
const out = (t: string): Prop => ({ id: 'out', x: 590, y: 150, w: 170, h: 90, tone: 'red', label: 'prints', text: big(t) })

export const deferStack: Frame[] = [
  {
    caption: '`defer f()` runs f later, when the surrounding function returns.',
    actors: [writer({ bubble: 'defer A()' })],
    props: [stackLabel, card(0, 'A()')],
  },
  {
    caption: 'Each defer goes on top of a stack. Nothing runs yet.',
    actors: [writer()],
    props: [stackLabel, card(0, 'A()'), card(1, 'B()'), card(2, 'C()')],
  },
  {
    caption: 'At return, the stack empties from the top: last in, first out.',
    actors: [writer({ bubble: 'return' })],
    props: [stackLabel, card(0, 'A()'), card(1, 'B()'), card(2, 'C()', 'red'), out('C B A')],
  },
  {
    caption: 'In a loop, `defer fmt.Println(i)` copies i at the defer line.',
    actors: [writer({ bubble: 'return' })],
    props: [stackLabel, card(0, 'Println(0)'), card(1, 'Println(1)'), card(2, 'Println(2)', 'red'), out('2 1 0')],
    stop: {
      title: 'Arguments are copied now',
      body: (
        <>
          <p>Only the call waits; a closure reads x when it runs.</p>
          <Code>{`x := 1
defer fmt.Println("arg", x)
defer func() {
    fmt.Println("closure", x)
}()
x = 2 // closure 2, then arg 1`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Defer waits for the function, not the loop turn. Every file stays open.',
    actors: [writer({ sprite: 'dandy-raining', bubble: '3 files open', hot: true })],
    props: [stackLabel, card(0, 'f1.Close()', 'red'), card(1, 'f2.Close()', 'red'), card(2, 'f3.Close()', 'red')],
  },
  {
    caption: 'Wrap each turn in a func. Its Close runs before the next file opens.',
    actors: [writer({ bubble: '1 file open' })],
    props: [stackLabel, card(0, 'f.Close()')],
    stop: {
      title: 'One func per file',
      body: (
        <>
          <p>The inner func returns each turn, so its defer runs each turn.</p>
          <Code>{`for _, p := range paths {
    func() {
        f, _ := os.Open(p)
        defer f.Close()
    }()
}`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 2. named results ---------- */

const fn = (o: Partial<Actor> = {}): Actor => ({ id: 'fn', sprite: 'misc-standing-v2', x: 130, y: 330, h: 130, tag: 'func', ...o })
const caller = (o: Partial<Actor> = {}): Actor => ({ id: 'caller', sprite: 'fairy-tale-king', x: 680, y: 330, h: 130, tag: 'caller', ...o })
const result = (label: string, v: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'res', x: 300, y: 80, w: 200, h: 100, tone, label, text: big(v) })
const ret = (t: string): Prop => ({ id: 'ret', x: 300, y: 230, w: 200, h: 48, tone: 'ink', text: mono(t) })

export const namedResults: Frame[] = [
  {
    caption: 'With a named result n, `return 21` first sets n = 21.',
    actors: [fn(), caller({ dim: true })],
    props: [result('named n', '21'), ret('return 21')],
  },
  {
    caption: 'Then the defers run. `n *= 2` still changes n, so the caller gets 42.',
    actors: [fn({ bubble: 'n *= 2' }), caller({ bubble: 'got 42' })],
    props: [result('named n', '42', 'red'), ret('return 21')],
  },
  {
    caption: 'Unnamed result? `return n` copies n out first. Defers change only the local.',
    actors: [fn({ bubble: 'n *= 2', dim: true }), caller({ bubble: 'got 21' })],
    props: [result('copied out', '21'), ret('return n')],
  },
  {
    caption: 'Real use: a deferred func wraps the named `err` on its way out.',
    actors: [fn({ bubble: 'wrap err' }), caller({ bubble: 'save: …' })],
    props: [result('named err', 'wrapped', 'red'), ret('return err')],
  },
  {
    caption: 'Puzzle: two defers, one named result. What does tt return?',
    actors: [fn({ bubble: 'a=5, a++' }), caller({ bubble: 'got 6', hot: true })],
    props: [result('named a', '6', 'red'), ret('return 3')],
    stop: {
      title: 'What does tt return?',
      body: (
        <>
          <p>6: return sets a = 3, then defers run last-first.</p>
          <Code>{`func tt() (a int) {
    defer func() { a++ }()
    defer func() { a = 5 }()
    return 3
}`}</Code>
        </>
      ),
    },
  },
]

/* ---------- 3. panic and recover ---------- */

const row = (i: number, name: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'r' + i, x: 90, y: 50 + i * 90, w: 210, h: 66, tone, text: mono(name) })
const side = (i: number, t: string, tone: Prop['tone'] = 'red'): Prop => ({ id: 's' + i, x: 340, y: 50 + i * 90, w: 170, h: 66, tone, label: 'defer', text: mono(t) })
const hero = (o: Partial<Actor> = {}): Actor => ({ id: 'g', sprite: 'science-experiment-mishap', x: 640, y: 330, h: 150, tag: 'goroutine', ...o })
const calls = (hot = -1, dim = -1) => [0, 1, 2].map((i) => row(i, ['main', 'serve', 'parse'][i], i === hot ? 'red' : i === dim ? 'dashed' : 'line'))

export const panicRecover: Frame[] = [
  {
    caption: 'main calls serve, serve calls parse. `panic` in parse starts unwinding back up.',
    actors: [hero({ bubble: 'panic!', hot: true })],
    props: calls(2),
  },
  {
    caption: 'Unwinding still runs every defer on the way, so the lock gets released.',
    actors: [hero({ bubble: 'unwinding', hot: true })],
    props: [...calls(2), side(2, 'Unlock()')],
  },
  {
    caption: 'serve’s deferred func calls `recover()`. It gets the panic value and unwinding stops.',
    actors: [hero({ sprite: 'superhero-standing', bubble: 'caught!' })],
    props: [...calls(1, 2), side(2, 'Unlock()', 'soft'), side(1, 'recover()')],
  },
  {
    caption: 'serve then returns normally to main. The program keeps running.',
    actors: [hero({ sprite: 'superhero-standing', bubble: 'all good' })],
    props: [...calls(0, 2), side(2, 'Unlock()', 'soft'), side(1, 'recover()', 'soft')],
  },
  {
    caption: '`recover` works only when the deferred func itself calls it.',
    actors: [hero({ sprite: 'dandy-raining', bubble: 'got nil', hot: true })],
    props: [...calls(1, 2), side(1, 'helper()')],
    stop: {
      edge: true,
      title: 'Call recover directly',
      body: (
        <>
          <p>If helper calls recover, it must be the deferred func itself.</p>
          <Code>{`defer helper()           // works
defer func() { helper() }() // nil`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Since Go 1.21, `panic(nil)` recovers as `*runtime.PanicNilError`, never nil.',
    actors: [hero({ sprite: 'superhero-standing', bubble: 'not nil' })],
    props: [...calls(1, 2), side(1, 'recover()')],
  },
]

/* ---------- 4. what recover can't save ---------- */

const main = (o: Partial<Actor> = {}): Actor => ({ id: 'main', sprite: 'fairy-tale-king', x: 120, y: 330, h: 140, tag: 'main', ...o })
const worker = (o: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'science-experiment-mishap', x: 680, y: 330, h: 140, tag: 'go func', ...o })
const badge = (id: string, x: number, t: string, tone: Prop['tone'] = 'red', label?: string): Prop => ({ id, x, y: 180, w: 170, h: 90, tone, label, text: mono(t) })

export const cantSave: Frame[] = [
  {
    caption: 'main defers a recover, then starts a goroutine that panics.',
    actors: [main({ bubble: 'recover()' }), worker({ bubble: 'panic!', hot: true })],
  },
  {
    caption: 'recover sees only its own goroutine. The panic kills the whole process.',
    actors: [main({ dim: true }), worker({ bubble: 'panic!', hot: true })],
    props: [badge('b1', 315, 'exit 2')],
    stop: {
      title: 'Recover in each goroutine',
      body: <p>main’s defers never run. Put a deferred recover inside every goroutine you start, often via a safeGo wrapper.</p>,
    },
  },
  {
    caption: 'Fatal errors skip recover entirely: concurrent map writes, deadlock, out of memory.',
    actors: [],
    props: [badge('b1', 60, 'map writes', 'red', 'fatal'), badge('b2', 315, 'deadlock', 'red', 'fatal'), badge('b3', 570, 'no memory', 'red', 'fatal')].map((b) => ({ ...b, y: 110 })),
    stop: {
      edge: true,
      title: 'Fatal error, not panic',
      body: <p>The runtime prints “fatal error:” and exits. No defer runs and recover can’t stop it.</p>,
    },
  },
  {
    caption: '`os.Exit` quits at once and skips every defer. `log.Fatal` calls it too.',
    actors: [main({ bubble: 'os.Exit(1)', hot: true })],
    props: [badge('b1', 315, 'defers', 'dashed', 'skipped')],
  },
  {
    caption: 'Rule: return an error for expected failures. Panic only for bugs.',
    actors: [main({ bubble: 'return err' }), worker({ sprite: 'superhero-standing', bubble: 'bugs only' })],
    props: [badge('b1', 225, 'error', 'line', 'expected'), badge('b3', 415, 'panic', 'red', 'bug')].map((b) => ({ ...b, w: 160 })),
  },
]
