import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* One stage: the channel box in the middle, sender left, receiver right. */
const SEND = 'fairy-tale-messenger-red-letter'
const RECV = 'fairy-tale-messenger-reading'
const WAIT = 'dandy-umbrella'
const BOOM = 'science-experiment-mishap'

const chan = (label = 'chan', tone: Prop['tone'] = 'line', text?: string): Prop => ({ id: 'chan', x: 230, y: 130, w: 340, h: 120, tone, label, text })
const slot = (i: number, v = '', hot = false): Prop => ({ id: 's' + i, x: 290 + i * 130, y: 160, w: 90, h: 70, tone: hot ? 'red' : v ? 'ink' : 'line', text: v })
const val = (id: string, v: string, x: number, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y: 200, w: 44, h: 44, tone, text: v })

const g1 = (a: Partial<Actor> = {}): Actor => ({ id: 'g1', sprite: SEND, x: 110, y: 330, h: 130, tag: 'G1 send', ...a })
const g2 = (a: Partial<Actor> = {}): Actor => ({ id: 'g2', sprite: RECV, x: 690, y: 330, h: 130, tag: 'G2 recv', flip: true, ...a })
const waiting = (a: Partial<Actor> = {}) => g1({ sprite: WAIT, h: 100, hot: true, ...a })

export const handoff: Frame[] = [
  {
    caption: '`make(chan int)` has no buffer. A send must meet a receive, like a handshake.',
    actors: [g1(), g2({ dim: true })],
    props: [chan('chan', 'dashed', 'no buffer'), val('v', '7', 196)],
  },
  {
    caption: 'G1 sends 7. Nobody is receiving yet, so G1 waits.',
    actors: [waiting({ bubble: 'take it?' }), g2({ dim: true })],
    props: [chan('chan', 'dashed', 'no buffer'), val('v', '7', 196, 'red')],
  },
  {
    caption: 'G2 receives. It takes 7 straight from G1, and both carry on.',
    actors: [g1({ bubble: 'delivered' }), g2({ bubble: 'got 7' })],
    props: [chan('chan', 'dashed', 'no buffer'), val('v', '7', 560, 'red')],
    stop: {
      title: 'Send waits for receive',
      body: <p>An unbuffered send returns only after a receiver has the value. So it also syncs the two goroutines.</p>,
    },
  },
  {
    caption: '`make(chan int, 2)` is a mailbox: G1 drops 1 and 2 and keeps going.',
    actors: [g1({ bubble: 'no waiting' }), g2({ dim: true })],
    props: [chan('chan · cap 2'), slot(0, '1'), slot(1, '2')],
  },
  {
    caption: 'The third send finds the mailbox full, so G1 waits.',
    actors: [waiting({ bubble: 'full!' }), g2({ dim: true })],
    props: [chan('chan · cap 2'), slot(0, '1'), slot(1, '2'), val('v', '3', 196, 'red')],
  },
  {
    caption: 'G2 takes 1, the oldest value. A slot frees up and G1 moves on.',
    actors: [g1({ bubble: 'sent 3' }), g2({ bubble: 'got 1' })],
    props: [chan('chan · cap 2'), slot(0, '2'), slot(1, '3', true)],
    stop: {
      edge: true,
      title: 'cap 1 ≠ unbuffered',
      body: <p>A buffered send returns once the value is queued, not delivered. Buffer size tunes speed; it doesn’t fix bugs.</p>,
    },
  },
]

const nilBox = chan('nil', 'dashed', 'no channel')
const closed = (tone: Prop['tone'] = 'red') => chan('chan · closed', tone)

export const nilClosed: Frame[] = [
  {
    caption: '`var ch chan int` is nil. Send and receive on it block forever.',
    actors: [g1({ sprite: 'dandy-raining', bubble: 'forever…', hot: true }), g2({ sprite: 'dandy-raining', bubble: 'forever…', hot: true, flip: false })],
    props: [nilBox],
  },
  {
    caption: 'Closing a nil channel panics.',
    actors: [g1({ sprite: BOOM, bubble: 'panic!', hot: true }), g2({ dim: true })],
    props: [nilBox],
  },
  {
    caption: 'G1 closes a channel holding 1 and 2. Close means “no more values.”',
    actors: [g1({ bubble: 'I’m done', hot: true }), g2()],
    props: [closed(), slot(0, '1'), slot(1, '2')],
  },
  {
    caption: 'Receives still get 1, then 2. Closing never loses buffered values.',
    actors: [g1(), g2({ bubble: '1, then 2' })],
    props: [closed('line'), slot(0), slot(1)],
  },
  {
    caption: 'Once empty, every receive returns at once with 0 and ok = false.',
    actors: [g1(), g2({ bubble: '0, false', hot: true })],
    props: [closed('line'), slot(0), slot(1), val('v', '0', 560, 'red')],
    stop: {
      title: 'How range stops',
      body: (
        <>
          <p>Range ends here, and only comma-ok tells “closed” from a real 0.</p>
          <Code>{`for v := range ch {} // exits
v, ok := <-ch        // ok == false`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Only the sender closes, and only once. Sending or closing again panics.',
    actors: [g1({ sprite: BOOM, bubble: 'panic!', hot: true }), g2({ bubble: 'I never close' })],
    props: [closed(), slot(0), slot(1)],
  },
]

/* select: channel a on the left, b on the right, the selecting goroutine in the middle. */
const chA = (a: Partial<Prop> = {}): Prop => ({ id: 'a', x: 40, y: 150, w: 200, h: 90, tone: 'line', label: 'chan a', ...a })
const chB = (a: Partial<Prop> = {}): Prop => ({ id: 'b', x: 560, y: 150, w: 200, h: 90, tone: 'line', label: 'chan b', ...a })
const vA: Prop = { id: 'va', x: 118, y: 178, w: 44, h: 44, tone: 'ink', text: 'a1' }
const vB = (tone: Prop['tone'] = 'ink'): Prop => ({ id: 'vb', x: 638, y: 178, w: 44, h: 44, tone, text: 'b1' })
const sel = (a: Partial<Actor> = {}): Actor => ({ id: 'sel', sprite: 'fairy-tale-messenger-showing', x: 400, y: 330, h: 140, tag: 'G', ...a })

export const selectStory: Frame[] = [
  {
    caption: '`select` waits on several channels and runs one case that is ready.',
    actors: [sel({ bubble: 'a or b?' })],
    props: [chA(), chB()],
  },
  {
    caption: 'Both ready? select picks one at random, not the first in the code.',
    actors: [sel({ bubble: 'coin flip', hot: true })],
    props: [chA({ tone: 'red' }), chB({ tone: 'red' }), vA, vB()],
    stop: {
      title: 'Random on purpose',
      body: <p>So a busy channel can’t starve the others. Case order means nothing.</p>,
    },
  },
  {
    caption: 'Nothing ready: G sleeps until any one channel has a value.',
    actors: [sel({ sprite: WAIT, bubble: 'zzz' })],
    props: [chA(), chB()],
  },
  {
    caption: 'With `default`, select never waits: if nothing is ready, default runs now.',
    actors: [sel({ bubble: 'moving on' })],
    props: [chA(), chB(), { id: 'def', x: 320, y: 90, w: 160, h: 50, tone: 'red', text: 'default' }],
    stop: {
      edge: true,
      title: 'Closed beats default',
      body: <p>A closed channel counts as ready, so its case wins over default. If that case sends, it still panics.</p>,
    },
  },
  {
    caption: 'A timeout is just a case: `<-time.After(d)` fires once d has passed.',
    actors: [sel({ bubble: 'too slow', hot: true }), { id: 'clock', sprite: 'fairy-tale-king', x: 400, y: 110, h: 84, tag: 'timer' }],
    props: [chA(), chB()],
  },
]

/* deadlock vs leak */
const king = (a: Partial<Actor> = {}): Actor => ({ id: 'king', sprite: 'fairy-tale-king', x: 700, y: 330, h: 150, tag: 'runtime', flip: true, ...a })
const pipe = (tone: Prop['tone'] = 'dashed', label = 'chan'): Prop => ({ id: 'pipe', x: 300, y: 180, w: 200, h: 70, tone, label, text: tone === 'line' ? 'cap 1' : 'no buffer' })
const handler = (a: Partial<Actor> = {}): Actor => ({ id: 'h', sprite: RECV, x: 110, y: 330, h: 120, tag: 'handler', ...a })
const worker = (a: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'convict-working-hard', x: 600, y: 330, h: 110, tag: 'worker', ...a })

export const deadlockLeak: Frame[] = [
  {
    caption: 'main does `ch <- 1`, then `<-ch`. The send waits; the receive never runs.',
    actors: [{ id: 'main', sprite: WAIT, x: 180, y: 330, h: 110, tag: 'main', bubble: 'anyone?' }, king({ dim: true })],
    props: [pipe()],
  },
  {
    caption: 'Every goroutine is stuck, so Go stops: “all goroutines are asleep - deadlock!”',
    actors: [{ id: 'main', sprite: 'convict-chained', x: 180, y: 330, h: 110, tag: 'main', hot: true }, king({ bubble: 'deadlock!', hot: true })],
    props: [pipe('red')],
    stop: {
      title: 'Deadlock is fatal',
      body: <p>It is a fatal error, so recover can’t catch it. Go reports it only when every goroutine is stuck.</p>,
    },
  },
  {
    caption: 'A handler starts a worker and waits for its result, with a timeout.',
    actors: [handler({ bubble: '1s max' }), worker({ bubble: 'working…' })],
    props: [pipe()],
  },
  {
    caption: 'The handler times out and leaves. The worker’s send waits forever, and nothing reports it.',
    actors: [handler({ sprite: 'fairy-tale-messenger-running', x: 60, dim: true, bubble: 'gone' }), worker({ sprite: 'dandy-raining', bubble: 'anyone?', hot: true, tag: 'leaked' })],
    props: [pipe('red')],
  },
  {
    caption: 'Fix: `make(chan T, 1)`. The one send lands in the buffer and the worker exits.',
    actors: [handler({ dim: true }), worker({ sprite: 'superhero-standing', bubble: 'sent, bye' })],
    props: [pipe('line')],
  },
]
