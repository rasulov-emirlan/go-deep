import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* One stage for stories 1–3: the hchan box in the middle, senders left, receivers right. */
const SEND = 'fairy-tale-messenger-red-letter'
const RECV = 'fairy-tale-messenger-reading'
const PARK = 'dandy-umbrella'
const BOOM = 'science-experiment-mishap'

const hchan = (label = 'hchan', tone: Prop['tone'] = 'line'): Prop => ({ id: 'hchan', x: 230, y: 70, w: 340, h: 280, tone, label })
const lock = (held = false): Prop => ({ id: 'lock', x: 476, y: 78, w: 86, h: 30, tone: held ? 'red' : 'line', text: held ? 'locked' : 'lock' })
const slotX = (i: number) => 262 + i * 80
const slots = (n: number, hot = -1): Prop[] =>
  Array.from({ length: 3 }, (_, i) => ({ id: 's' + i, x: slotX(i), y: 122, w: 68, h: 68, tone: i === hot ? 'red' : 'line', label: i === 0 ? 'buf' : undefined, hidden: i >= n }))
const noBuf: Prop = { id: 's0', x: 262, y: 122, w: 228, h: 68, tone: 'dashed', text: 'no buffer' }
const sendq = (hot = false): Prop => ({ id: 'sendq', x: 240, y: 214, w: 155, h: 128, tone: hot ? 'red' : 'dashed', label: 'sendq' })
const recvq = (hot = false): Prop => ({ id: 'recvq', x: 405, y: 214, w: 155, h: 128, tone: hot ? 'red' : 'dashed', label: 'recvq' })
const box = (hot = false) => [hchan(), sendq(hot), recvq(hot)]

const val = (id: string, v: string, x: number, y: number, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y, w: 44, h: 44, tone, text: v })
const inSlot = (id: string, v: string, i: number, tone: Prop['tone'] = 'ink') => val(id, v, slotX(i) + 12, 134, tone)
const inHandS = (id: string, v: string) => val(id, v, 150, 170)
const inHandR = (id: string, v: string, tone: Prop['tone'] = 'ink') => val(id, v, 606, 170, tone)
const inSendq = (id: string, v: string) => val(id, v, 342, 226)

const g1 = (a: Partial<Actor> = {}): Actor => ({ id: 'g1', sprite: SEND, x: 110, y: 326, h: 130, tag: 'G1 send', ...a })
const g2 = (a: Partial<Actor> = {}): Actor => ({ id: 'g2', sprite: RECV, x: 690, y: 326, h: 130, tag: 'G2 recv', flip: true, ...a })
const parkedS = (a: Partial<Actor> = {}) => g1({ sprite: PARK, x: 285, y: 322, h: 76, tag: 'G1', ...a })
const parkedR = (a: Partial<Actor> = {}) => g2({ sprite: PARK, x: 455, y: 322, h: 76, tag: 'G2', flip: false, ...a })

export const anatomy: Frame[] = [
  {
    caption: (
      <>
        <code>make(chan int, 3)</code> allocates an <code>hchan</code> on the heap: a 3-slot ring, two wait queues and a lock.
      </>
    ),
    actors: [g1(), g2()],
    props: [...box(), lock(), ...slots(3)],
  },
  {
    caption: (
      <>
        G1 sends 1 and 2: each lands at <code>sendx</code>, which then advances around the ring.
      </>
    ),
    actors: [g1({ bubble: 'no waiting' }), g2()],
    props: [...box(), lock(true), ...slots(3, 1), inSlot('v1', '1', 0), inSlot('v2', '2', 1, 'red')],
  },
  {
    caption: (
      <>
        G2 receives at <code>recvx</code>, the oldest slot, so a channel is a FIFO queue.
      </>
    ),
    actors: [g1(), g2({ bubble: 'got 1' })],
    props: [...box(), lock(true), ...slots(3), inHandR('v1', '1', 'red'), inSlot('v2', '2', 1)],
    stop: {
      title: 'a mutex and a queue',
      body: (
        <p>
          Channels aren’t lock-free: every send, receive and close takes <code>hchan.lock</code>. A buffered value is copied twice, in and out. <code>ch</code> itself is just a pointer to the hchan, so
          passing it around shares one channel.
        </p>
      ),
    },
  },
  {
    caption: 'G2 receives again and gets 2; the buffer is empty now.',
    actors: [g1(), g2({ bubble: 'got 2' })],
    props: [...box(), lock(), ...slots(3), inHandR('v2', '2')],
  },
  {
    caption: (
      <>
        G2 receives a third time; there is nothing to take, so it parks in <code>recvq</code>.
      </>
    ),
    actors: [g1(), parkedR({ bubble: 'wake me', hot: true })],
    props: [hchan(), sendq(), recvq(true), lock(), ...slots(3)],
  },
  {
    caption: 'A parked goroutine holds no thread; the M goes off to run other goroutines until a sender arrives.',
    actors: [g1(), parkedR({ bubble: 'zzz' })],
    props: [...box(), lock(), ...slots(3)],
    stop: {
      title: 'what is a sudog?',
      body: (
        <p>
          It is G2’s ticket in the queue: which G it is, plus a pointer to where the value should land (a slot on G2’s own stack). <code>gopark</code> takes G2 off its M. A sender later calls{' '}
          <code>goready</code>, which puts G2 in the sender’s <code>runnext</code> slot.
        </p>
      ),
    },
  },
]

export const handoff: Frame[] = [
  {
    caption: (
      <>
        Unbuffered <code>make(chan int)</code> has no buffer at all, so every send needs a receiver.
      </>
    ),
    actors: [g1(), g2({ dim: true })],
    props: [...box(), noBuf, inHandS('v7', '7')],
  },
  {
    caption: 'G1 sends 7, finds nobody in recvq, and parks in sendq still holding its value.',
    actors: [parkedS({ bubble: 'take it?', hot: true }), g2({ dim: true })],
    props: [hchan(), sendq(true), recvq(), noBuf, inSendq('v7', '7')],
  },
  {
    caption: 'G2 receives, finds G1 waiting, copies 7 straight from G1, and wakes it.',
    actors: [g1({ bubble: 'delivered' }), g2({ bubble: 'got 7' })],
    props: [...box(), noBuf, inHandR('v7', '7', 'red')],
    stop: {
      title: 'a rendezvous',
      body: (
        <p>
          The send completes only once a receiver has the value. It is also a sync point: whatever G1 wrote before sending, G2 can see after receiving, and the receive happens before G1’s send
          returns.
        </p>
      ),
    },
  },
  {
    caption: 'Other order: G2 parks first, then G1 writes 8 directly into G2’s stack and skips the buffer.',
    actors: [g1(), parkedR({ bubble: 'got 8', hot: true })],
    props: [hchan(), sendq(), recvq(true), noBuf, val('v8', '8', 508, 226, 'red')],
    stop: {
      edge: true,
      title: 'buffered channels do it too',
      body: <p>A receiver can only be parked while the buffer is empty. So even on a buffered channel, a sender who finds one hands the value over directly: one copy instead of two.</p>,
    },
  },
  {
    caption: (
      <>
        Buffered <code>make(chan int, 2)</code>: G1 sends 1 and 2 and keeps going, with no receiver in sight.
      </>
    ),
    actors: [g1({ bubble: 'no waiting' }), g2({ dim: true })],
    props: [...box(), ...slots(2), inSlot('v1', '1', 0), inSlot('v2', '2', 1)],
  },
  {
    caption: 'The third send finds the buffer full, so G1 parks in sendq holding 3.',
    actors: [parkedS({ bubble: 'full!', hot: true }), g2({ dim: true })],
    props: [hchan(), sendq(true), recvq(), ...slots(2), inSlot('v1', '1', 0), inSlot('v2', '2', 1), inSendq('v3', '3')],
  },
  {
    caption: 'G2 takes 1 from the head; the runtime moves G1’s 3 into the freed slot and wakes G1.',
    actors: [g1(), g2({ bubble: 'got 1' })],
    props: [...box(), ...slots(2, 0), inHandR('v1', '1'), inSlot('v2', '2', 1), inSlot('v3', '3', 0, 'red')],
    stop: {
      title: 'FIFO survives',
      body: <p>Receivers always get the oldest value, so the parked sender’s value goes to the tail (the ring wraps to slot 0) rather than straight to G2. The order stays 1, 2, 3.</p>,
    },
  },
  {
    caption: 'So cap 1 is not unbuffered: the first send returns before anyone has received.',
    actors: [g1({ bubble: 'queued, not delivered' }), g2({ dim: true })],
    props: [...box(), ...slots(1), inSlot('v4', '4', 0, 'red')],
    stop: {
      edge: true,
      title: 'cap 1 ≠ unbuffered',
      body: <p>Unbuffered means a handshake: the sender knows the value arrived. Buffered means a mailbox: the sender only knows it was queued. Buffer size is a throughput knob, not a correctness fix.</p>,
    },
  },
]

const nilBox: Prop = { id: 'hchan', x: 230, y: 70, w: 340, h: 280, tone: 'dashed', text: 'nil · no hchan' }

export const nilClosed: Frame[] = [
  {
    caption: (
      <>
        <code>var ch chan int</code> is a nil channel: there is no hchan behind it.
      </>
    ),
    actors: [g1(), g2()],
    props: [nilBox],
  },
  {
    caption: 'Sending or receiving on a nil channel blocks forever, because nothing can ever wake it.',
    actors: [g1({ sprite: 'dandy-raining', bubble: 'forever…', hot: true }), g2({ sprite: 'dandy-raining', bubble: 'forever…', hot: true, flip: false })],
    props: [nilBox],
  },
  {
    caption: (
      <>
        <code>close(ch)</code> on a nil channel panics.
      </>
    ),
    actors: [g1({ sprite: BOOM, bubble: 'panic!', hot: true }), g2({ dim: true })],
    props: [nilBox],
    stop: {
      title: 'block, not panic?',
      body: (
        <p>
          Blocking makes nil useful: in a <code>select</code>, a nil channel is a case that never fires. Closing nothing is always a bug, so that one panics.
        </p>
      ),
    },
  },
  {
    caption: 'A real channel holds 1 and 2; the sender closes it to say that no more values are coming.',
    actors: [g1({ bubble: 'I’m done', hot: true }), g2()],
    props: [hchan('hchan · closed = 1', 'red'), sendq(), recvq(), ...slots(3), inSlot('v1', '1', 0), inSlot('v2', '2', 1)],
  },
  {
    caption: 'Receives still drain the buffer: (1, true), then (2, true). Nothing is lost.',
    actors: [g1(), g2({ bubble: '1, 2 · ok' })],
    props: [hchan('hchan · closed = 1'), sendq(), recvq(), ...slots(3), inHandR('v1', '1'), val('v2', '2', 652, 170)],
  },
  {
    caption: 'Once it is empty, every receive returns immediately with the zero value and ok = false.',
    actors: [g1(), g2({ bubble: '0, false', hot: true })],
    props: [hchan('hchan · closed = 1'), sendq(), recvq(), ...slots(3), inHandR('v0', '0', 'red')],
    stop: {
      title: 'how range stops',
      body: (
        <>
          <p>
            <code>for v := range ch</code> exits exactly here, so range over a channel nobody closes waits forever. Only the comma-ok form tells “closed” from a real zero.
          </p>
          <Code>{`v, ok := <-ch // ok == false: closed and drained`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Sending on a closed channel panics, and so does closing it a second time.',
    actors: [g1({ sprite: BOOM, bubble: 'panic!', hot: true }), g2()],
    props: [hchan('hchan · closed = 1', 'red'), sendq(), recvq(), ...slots(3)],
  },
  {
    caption: 'close also wakes every parked goroutine: receivers get (0, false), and senders panic.',
    actors: [
      { id: 'pr', sprite: PARK, x: 455, y: 322, h: 76, tag: 'G3', bubble: '0, false' },
      { id: 'ps', sprite: BOOM, x: 300, y: 322, h: 76, tag: 'G4', bubble: 'panic!', hot: true },
      g1({ dim: true }),
      g2({ dim: true }),
    ],
    props: [hchan('hchan · closed = 1', 'red'), sendq(true), recvq(true), ...slots(3)],
  },
  {
    caption: 'Rule: the sender closes, exactly once, when it is done. Receivers never close.',
    actors: [g1({ bubble: 'I close', hot: true }), g2({ bubble: 'I just range' })],
    props: [hchan('hchan'), sendq(), recvq(), ...slots(3)],
    stop: {
      edge: true,
      title: 'many senders?',
      body: (
        <p>
          A receiver can’t know whether a send is still on its way, so closing from its side risks a panic. With N senders, wait for all of them with a <code>WaitGroup</code> and then close once.
          To stop senders early, close a separate <code>done</code> channel or cancel a context.
        </p>
      ),
    },
  },
]

/* select: channel a on the left, b on the right, the selecting goroutine in the middle. */
const chA = (a: Partial<Prop> = {}): Prop => ({ id: 'a', x: 40, y: 150, w: 200, h: 90, tone: 'line', label: 'chan a', ...a })
const chB = (a: Partial<Prop> = {}): Prop => ({ id: 'b', x: 560, y: 150, w: 200, h: 90, tone: 'line', label: 'chan b', ...a })
const vA = (tone: Prop['tone'] = 'ink'): Prop => val('va', 'a1', 118, 178, tone)
const vB = (tone: Prop['tone'] = 'ink'): Prop => val('vb', 'b1', 638, 178, tone)
const sel = (a: Partial<Actor> = {}): Actor => ({ id: 'sel', sprite: 'fairy-tale-messenger-showing', x: 400, y: 326, h: 140, tag: 'G · select', ...a })
const sudog = (id: string, x: number, hidden = false): Prop => ({ id, x, y: 258, w: 120, h: 34, tone: 'red', text: 'sudog', hidden })

export const selectStory: Frame[] = [
  {
    caption: (
      <>
        <code>select</code> waits on several channel operations at once and runs exactly one case.
      </>
    ),
    actors: [sel({ bubble: 'a or b?' })],
    props: [chA(), chB()],
  },
  {
    caption: 'Both a and b are ready, so select picks one at random, not the first one in the source.',
    actors: [sel({ bubble: 'coin flip', hot: true })],
    props: [chA({ tone: 'red' }), chB({ tone: 'red' }), vA(), vB()],
    stop: {
      title: 'random on purpose',
      body: <p>If the first ready case always won, a busy channel could starve the others. The runtime shuffles the poll order on every select, so case order means nothing. If you need priority, nest two selects.</p>,
    },
  },
  {
    caption: 'Nothing is ready and there is no default: G parks on every channel at once, one sudog per case.',
    actors: [sel({ sprite: PARK, bubble: 'zzz' })],
    props: [chA(), chB(), sudog('qa', 80), sudog('qb', 600)],
  },
  {
    caption: 'b gets a value: G wakes, runs case b, and removes its sudog from a.',
    actors: [sel({ bubble: 'case b', hot: true })],
    props: [chA(), chB({ tone: 'red' }), vB('red'), sudog('qa', 80, true), sudog('qb', 600, true)],
  },
  {
    caption: (
      <>
        With <code>default</code>, select never blocks: if nothing is ready, default runs right away.
      </>
    ),
    actors: [sel({ bubble: 'moving on' })],
    props: [chA(), chB(), { id: 'def', x: 320, y: 90, w: 160, h: 50, tone: 'red', text: 'default' }],
    stop: {
      edge: true,
      title: 'default won’t save you',
      body: (
        <>
          <p>The classic non-blocking send drops the value when the buffer is full. But a closed channel counts as ready: receiving from it wins, and sending to it still panics, even with default.</p>
          <Code>{`select {
case ch <- v:
default: // full: drop it
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Set a channel variable to nil and its case is switched off; select skips it from then on.',
    actors: [sel({ bubble: 'only b now' })],
    props: [chA({ tone: 'dashed', label: 'a = nil' }), chB(), vB()],
    stop: {
      title: 'merge until both close',
      body: (
        <Code>{`for a != nil || b != nil {
    select {
    case v, ok := <-a:
        if !ok { a = nil; continue }
        sum += v
    case v, ok := <-b:
        if !ok { b = nil; continue }
        sum += v
    }
}`}</Code>
      ),
    },
  },
  {
    caption: (
      <>
        A timeout is just another case: <code>&lt;-time.After(d)</code> becomes ready once d has passed.
      </>
    ),
    actors: [sel({ bubble: 'too slow', hot: true }), { id: 'clock', sprite: 'fairy-tale-king', x: 400, y: 110, h: 84, tag: 'time.After' }],
    props: [chA(), chB()],
    stop: {
      title: 'Go 1.23+ timers',
      body: (
        <p>
          Timers are now garbage-collected even if they never fire, so <code>time.After</code> in a loop no longer piles up memory (with <code>go 1.23</code> or later in go.mod). The timer channel is
          unbuffered now: <code>cap</code> reports 0. For cancellation, a <code>ctx.Done()</code> case is usually the better choice.
        </p>
      ),
    },
  },
]

/* deadlock vs leak */
const king = (a: Partial<Actor> = {}): Actor => ({ id: 'king', sprite: 'fairy-tale-king', x: 700, y: 326, h: 150, tag: 'runtime', flip: true, ...a })
const leakQ: Prop = { id: 'q', x: 160, y: 200, w: 400, h: 140, tone: 'dashed', label: 'sendq of chans nobody reads' }
const leaker = (i: number, a: Partial<Actor> = {}): Actor => ({ id: 'w' + i, sprite: 'dandy-raining', x: 230 + i * 120, y: 322, h: 100, tag: 'worker ' + (i + 1), ...a })

export const deadlockLeak: Frame[] = [
  {
    caption: (
      <>
        main runs <code>ch &lt;- 1</code> and then <code>&lt;-ch</code>: the send parks main, so the receive never runs.
      </>
    ),
    actors: [{ id: 'main', sprite: PARK, x: 300, y: 322, h: 100, tag: 'main · chan send', bubble: 'anyone?' }, king({ dim: true })],
    props: [{ ...leakQ, label: 'sendq', w: 260 }],
  },
  {
    caption: (
      <>
        Every goroutine is asleep, so the runtime stops the program: <code>all goroutines are asleep - deadlock!</code>
      </>
    ),
    actors: [{ id: 'main', sprite: 'convict-chained', x: 300, y: 322, h: 100, tag: 'main', hot: true }, king({ bubble: 'deadlock!', hot: true })],
    props: [{ ...leakQ, label: 'sendq', w: 260, tone: 'red' }],
    stop: {
      title: 'fatal, and easy to hide',
      body: (
        <p>
          It is a <code>fatal error</code>, not a panic, so <code>recover</code> can’t catch it. The check fires only when no goroutine can ever run again. One goroutine sleeping in a timer loop is
          enough to hide it, and then main just hangs.
        </p>
      ),
    },
  },
  {
    caption: 'A real server: a handler starts a worker and waits on its unbuffered result channel, with a timeout.',
    actors: [{ id: 'h', sprite: 'fairy-tale-messenger-reading', x: 110, y: 326, h: 120, tag: 'handler', bubble: '1s max' }, leaker(0, { sprite: 'convict-working-hard', bubble: 'working…' }), king({ dim: true })],
    props: [leakQ],
  },
  {
    caption: (
      <>
        The timeout wins and the handler returns; later the worker’s <code>ch &lt;- res</code> blocks forever.
      </>
    ),
    actors: [{ id: 'h', sprite: 'fairy-tale-messenger-running', x: 60, y: 326, h: 120, tag: 'handler', bubble: 'gone', dim: true }, leaker(0, { bubble: 'anyone?', hot: true }), king({ dim: true })],
    props: [leakQ],
  },
  {
    caption: 'The rest of the program is alive, so nothing is reported: each slow request leaks one goroutine and its stack.',
    actors: [leaker(0), leaker(1), leaker(2, { hot: true }), king({ bubble: 'all fine?' })],
    props: [{ ...leakQ, tone: 'red' }],
    stop: {
      title: 'deadlock ≠ leak',
      body: <p>The runtime only detects the whole program being stuck. A leak is a few goroutines stuck while everything else runs, and nothing reports it for you.</p>,
    },
  },
  {
    caption: (
      <>
        Fix: make the channel <code>make(chan T, 1)</code> so the one send never blocks, or also select on <code>ctx.Done()</code>.
      </>
    ),
    actors: [{ id: 'h', sprite: 'fairy-tale-messenger-reading', x: 110, y: 326, h: 120, tag: 'handler' }, leaker(0, { sprite: 'superhero-standing', bubble: 'sent, bye', tag: 'worker' }), king()],
    props: [{ ...leakQ, label: 'buf · cap 1', w: 260 }],
    stop: {
      edge: true,
      title: 'finding leaks',
      body: (
        <>
          <p>
            Watch <code>runtime.NumGoroutine()</code> and the goroutine profile in pprof, and run <code>goleak</code> in tests. Go 1.26 adds an experimental <code>goroutineleak</code> profile
            (<code>GOEXPERIMENT=goroutineleakprofile</code>) that finds goroutines blocked on channels no running goroutine can reach.
          </p>
        </>
      ),
    },
  },
]
