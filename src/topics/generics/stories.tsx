import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

const mono = (t: string) => <span className="gn-mono">{t}</span>
const box = (id: string, x: number, y: number, w: number, text: string, o: Partial<Prop> = {}): Prop => ({ id, x, y, w, h: 60, text: mono(text), ...o })

/* ---------- 1. type parameters, constraints, inference ---------- */

const cook = (o: Partial<Actor> = {}): Actor => ({ id: 'cook', sprite: 'fairy-tale-witch-cooking', x: 400, y: 345, h: 130, tag: 'Sum[T]', ...o })
const sig = (t: string, o: Partial<Prop> = {}) => box('sig', 290, 40, 220, t, { tone: 'ink', ...o })
const left = (t: string, o: Partial<Prop> = {}) => box('l', 40, 130, 200, t, o)
const mid = (t: string, o: Partial<Prop> = {}) => box('m', 300, 130, 200, t, o)
const right = (t: string, o: Partial<Prop> = {}) => box('r', 560, 130, 200, t, o)

export const typeParams: Frame[] = [
  {
    caption: 'Without generics you write SumInts, SumFloats: the same loop, copied per type.',
    actors: [
      { id: 'c1', sprite: 'convict-working-hard', x: 150, y: 345, h: 120, tag: 'SumInts' },
      { id: 'c2', sprite: 'adventure-pushing-cart', x: 640, y: 345, h: 120, tag: 'SumFloats' },
    ],
    props: [left('[]int'), right('[]float64')],
  },
  {
    caption: 'A type parameter, T, is a placeholder type that each caller fills in.',
    actors: [cook({ bubble: 'T = ?' })],
    props: [sig('Sum[T Num]'), left('[]int'), right('[]float64')],
  },
  {
    caption: 'A constraint (here Num) is an interface listing the types T may be.',
    actors: [cook()],
    props: [sig('Sum[T Num]'), left('[]int'), right('[]float64'), mid('int | float64', { label: 'Num' })],
  },
  {
    caption: '`~int` also allows named types built on int, like `type Celsius int`.',
    actors: [cook({ hot: true })],
    props: [sig('Sum[T Num]'), left('[]Celsius', { tone: 'red' }), right('[]float64'), mid('~int | ~float64', { label: 'Num', tone: 'red' })],
    stop: {
      title: 'Forgot the tilde',
      body: (
        <>
          <p>Without <code>~</code>, only int itself matches.</p>
          <Code>{`type Celsius int
type Num interface{ int | float64 }

Sum([]Celsius{1, 2})
// Celsius does not satisfy Num
// (possibly missing ~ for int)`}</Code>
        </>
      ),
    },
  },
  {
    caption: '`any` allows every type but no operators. `comparable` allows ==; `cmp.Ordered` allows <.',
    actors: [cook({ dim: true })],
    props: [sig('Sum[T Num]', { hidden: true }), left('no ops', { label: 'any' }), mid('== works', { label: 'comparable' }), right('< works', { label: 'cmp.Ordered' })],
  },
  {
    caption: 'Type inference: call `Sum(temps)` and the compiler works out T from the arguments.',
    actors: [cook({ bubble: 'got it' })],
    props: [sig('Sum(temps)'), left('[]Celsius'), right('T = Celsius', { tone: 'red' })],
  },
  {
    caption: 'If T appears only in the result, it can’t be inferred. Name it.',
    actors: [cook({ tag: 'Zero[T]', bubble: 'T = ?', hot: true })],
    props: [sig('Zero()', { tone: 'red' }), right('Zero[int]()')],
    stop: {
      edge: true,
      title: 'Nothing to infer from',
      body: (
        <Code>{`func Zero[T any]() T {
    var z T
    return z
}
a := Zero()      // cannot infer T
b := Zero[int]() // ok`}</Code>
      ),
    },
  },
]

/* ---------- 2. generics vs interfaces ---------- */

const bin = (label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'bin', x: 310, y: 60, w: 180, h: 80, label, tone, text: <span className="gn-mono gn-down">{text}</span> })
const pusher = (o: Partial<Actor> = {}): Actor => ({ id: 'push', sprite: 'adventure-pirate-lifting-goods', x: 180, y: 340, h: 125, tag: 'Push(42)', ...o })

export const versus: Frame[] = [
  {
    caption: 'Before generics, shared code took `any`: an interface box that holds any value.',
    actors: [pusher()],
    props: [bin('[]any', '42', 'dashed')],
  },
  {
    caption: 'Getting a value out needs a type assertion. Wrong guess: panic at runtime.',
    actors: [pusher({ dim: true }), { id: 'pop', sprite: 'science-experiment-mishap', x: 610, y: 340, h: 125, tag: 'v.(string)', hot: true, bubble: 'panic!' }],
    props: [bin('[]any', '42', 'red')],
  },
  {
    caption: 'Generics keep the real type. `Stack[int]` takes only ints, checked at compile time.',
    actors: [pusher(), { id: 'pop', sprite: 'superhero-standing', x: 610, y: 340, h: 125, tag: 'Pop() int', bubble: 'typed!' }],
    props: [bin('Stack[int]', '42')],
  },
  {
    caption: 'Interfaces describe behaviour: File, Conn and Buffer each Write in their own way.',
    actors: [
      { id: 'push', sprite: 'fairy-tale-messenger-running', x: 170, y: 340, h: 115, tag: 'File' },
      { id: 'pop', sprite: 'adventure-pirate-boat', x: 410, y: 340, h: 115, tag: 'Conn' },
      { id: 'buf', sprite: 'science-welding', x: 640, y: 340, h: 115, tag: 'Buffer' },
    ],
    props: [bin('io.Writer', 'Write(p)', 'ink')],
  },
  {
    caption: 'Same code for every type? Generics. Different code per type? An interface.',
    actors: [{ id: 'buf', sprite: 'fairy-tale-witch-learning', x: 400, y: 340, h: 130, bubble: 'which one?' }],
    props: [box('g', 50, 90, 220, 'Set, Max', { label: 'generics' }), box('i', 530, 90, 220, 'io.Writer', { label: 'interface' })],
    stop: {
      title: 'Rule of thumb',
      body: <p>Containers and algorithms (Set, Max) want generics. Behaviour that differs per type (io.Writer) wants an interface.</p>,
    },
  },
]

/* ---------- 3. GC-shape stenciling ---------- */

const copyBox = (id: string, x: number, label: string, text: string, tone: Prop['tone'] = 'ink'): Prop => ({ id, x, y: 50, w: 210, h: 80, label, tone, text: <span className="gn-mono gn-down">{text}</span> })
const compiler = (o: Partial<Actor> = {}): Actor => ({ id: 'cc', sprite: 'science-welding', x: 400, y: 340, h: 125, tag: 'compiler', ...o })

export const shapes: Frame[] = [
  {
    caption: 'Monomorphization, the C++ way: a compiled copy per type. Fast, but bigger binaries.',
    actors: [{ id: 'cc', sprite: 'superhero-lifting-1TB', x: 400, y: 340, h: 130, tag: 'C++', bubble: 'big binary' }],
    props: [copyBox('a', 45, 'copy 1', 'Sum·int'), copyBox('b', 295, 'copy 2', 'Sum·int64'), copyBox('c', 545, 'copy 3', 'Sum·Celsius')],
  },
  {
    caption: 'Boxing, the Java way: one copy, every value behind a pointer. Smaller, slower.',
    actors: [{ id: 'cc', sprite: 'adventure-pirate-lifting-goods', x: 400, y: 340, h: 130, tag: 'Java', bubble: 'box, box…' }],
    props: [copyBox('b', 295, 'one copy', 'Sum·Object')],
  },
  {
    caption: 'Go mixes both: one copy per GC shape, roughly the value’s underlying type.',
    actors: [compiler({ tag: 'Go' })],
    props: [copyBox('a', 45, 'shape int', 'int, Celsius'), copyBox('b', 295, 'shape int64', 'int64')],
  },
  {
    caption: 'All pointer types share one shape, so `*User` and `*Order` share one copy.',
    actors: [compiler({ tag: 'Go', bubble: 'same shape' })],
    props: [copyBox('a', 45, 'shape int', 'int, Celsius'), copyBox('b', 295, 'shape int64', 'int64'), copyBox('c', 545, 'shape pointer', '*User, *Order', 'red')],
  },
  {
    caption: 'A dictionary, a hidden extra argument, tells the shared copy the real type.',
    actors: [compiler({ x: 250, tag: 'Go', dim: true }), { id: 'dict', sprite: 'fairy-tale-messenger-red-letter', x: 580, y: 340, h: 125, tag: 'dictionary', bubble: 'T = *User' }],
    props: [copyBox('c', 545, 'shape pointer', '*User, *Order')],
  },
  {
    caption: 'Method calls on T look up the dictionary, so Go often can’t inline them.',
    actors: [compiler({ x: 250, tag: 'Go', sprite: 'science-experiment-mishap', bubble: 'slower', hot: true }), { id: 'dict', sprite: 'fairy-tale-messenger-red-letter', x: 580, y: 340, h: 125, tag: 'dictionary' }],
    props: [copyBox('c', 545, 'shape pointer', 'x.Add(i)', 'red')],
    stop: {
      title: 'Pointers can be slower',
      body: <p>On an 8-core box, a tight loop calling a method through T ran ~4× slower than a direct call, ~7× when T was an interface. Profile before you rewrite anything.</p>,
    },
  },
]

/* ---------- 4. limits + recent changes ---------- */

const wall = (o: Partial<Actor> = {}): Actor => ({ id: 'w', sprite: 'convict-chained', x: 400, y: 340, h: 130, ...o })

export const limits: Frame[] = [
  {
    caption: 'A method can’t add its own type parameters. Use a plain function instead.',
    actors: [wall({ bubble: 'not allowed', hot: true, tag: 'method' })],
    props: [box('a', 60, 70, 260, 'b.Map[R]()', { tone: 'red', label: 'method' }), box('b', 480, 70, 260, 'Map(b, f)', { label: 'function' })],
    stop: {
      edge: true,
      title: 'No generic methods',
      body: (
        <Code>{`func (b Box[T]) Map[R any](
    f func(T) R) Box[R]
// syntax error: method must
// have no type parameters
func Map[T, R any](b Box[T],
    f func(T) R) Box[R] // ok`}</Code>
      ),
    },
  },
  {
    caption: 'No type switch on a T value. Convert first: `switch any(v).(type)`.',
    actors: [wall({ sprite: 'fairy-tale-witch-learning', tag: 'Kind[T]' })],
    props: [box('a', 60, 70, 260, 'v.(type)', { tone: 'red', label: 'error' }), box('b', 480, 70, 260, 'any(v).(type)', { label: 'ok' })],
  },
  {
    caption: 'No specialization: you can’t give `Sum[int]` its own, faster body.',
    actors: [wall({ sprite: 'convict-hard-times', tag: 'Sum[int]' })],
    props: [box('a', 60, 70, 260, 'Sum[T]', { tone: 'ink', label: 'one body' }), box('b', 480, 70, 260, 'no override', { tone: 'dashed', label: 'Sum[int]' })],
  },
  {
    caption: 'Newer: Go 1.24 adds generic type aliases; Go 1.26 lets constraints mention themselves.',
    actors: [wall({ sprite: 'science-lightbulb', tag: 'new' })],
    props: [box('a', 60, 70, 260, 'generic alias', { label: 'Go 1.24' }), box('b', 480, 70, 260, 'Adder[A Adder[A]]', { tone: 'red', label: 'Go 1.26' })],
    stop: {
      title: 'Go 1.26: self-reference',
      body: (
        <>
          <p>Go 1.25 rejects this as an invalid recursive type.</p>
          <Code>{`type Adder[A Adder[A]] interface {
    Add(A) A
}
func Sum[A Adder[A]](x, y A) A {
    return x.Add(y)
}`}</Code>
        </>
      ),
    },
  },
]
