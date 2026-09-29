import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ── shared: the interface "box" with two word slots ─────────────────────── */

const box = (label: string): Prop => ({ id: 'box', x: 220, y: 190, w: 340, h: 145, label })
const w1 = (label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'w1', x: 238, y: 222, w: 145, h: 95, label, text, tone })
const w2 = (text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'w2', x: 397, y: 222, w: 145, h: 95, label: 'data', text, tone })
const arrow: Prop = { id: 'arrow', x: 565, y: 245, w: 60, h: 50, tone: 'none', text: <span className="if-big">→</span> }

/* ── 1 · two words ───────────────────────────────────────────────────────── */

const caller = (bubble?: string, hot?: boolean): Actor => ({ id: 'caller', sprite: 'misc-standing-v2', x: 110, y: 335, h: 120, tag: 'caller', bubble, hot })
const file = (hidden = false): Actor => ({ id: 'file', sprite: 'fairy-tale-messenger-reading', x: 700, y: 335, h: 120, tag: '*os.File', hidden })
const itab = (tone: Prop['tone'] = 'soft'): Prop => ({
  id: 'itab',
  x: 220,
  y: 70,
  w: 340,
  h: 100,
  tone,
  label: 'itab (Reader, *os.File)',
  text: <span className="if-mono">fun[0] → Read</span>,
})

export const twoWords: Frame[] = [
  {
    caption: 'An interface value is a box of two words: which type is inside, and where the value lives.',
    actors: [caller('empty box')],
    props: [box('var r io.Reader'), w1('itab', 'nil', 'dashed'), w2('nil', 'dashed')],
  },
  {
    caption: 'r = f fills both words: word 1 names *os.File, word 2 points at the file.',
    actors: [caller('r = f'), file()],
    props: [box('r = f'), w1('itab', '*os.File'), w2('ptr'), arrow],
  },
  {
    caption: 'Word 1 of a non-empty interface points to an itab: the (interface, type) pair plus a method table.',
    actors: [caller(), file()],
    props: [box('r = f'), w1('itab', 'ptr ↑', 'red'), w2('ptr'), arrow, itab('red')],
    stop: {
      title: 'no "implements" keyword',
      body: (
        <p>
          Satisfaction is structural: if <code>*os.File</code> has a <code>Read</code> method, it fits. The compiler checks at the assignment and usually builds the itab then; dynamic conversions
          build it at run time and cache it.
        </p>
      ),
    },
  },
  {
    caption: 'r.Read(p) loads fun[0] from the itab and calls it with word 2 as the receiver.',
    actors: [caller('r.Read(p)', true), file()],
    props: [box('r = f'), w1('itab', 'ptr ↑'), w2('ptr', 'red'), arrow, itab()],
  },
  {
    caption: 'any has no methods, so word 1 is just the type. A non-pointer value is copied in.',
    actors: [caller('any = 42'), file(true)],
    props: [
      box('a any = 42'),
      w1('type', 'int', 'red'),
      w2('ptr'),
      arrow,
      { id: 'heap', x: 640, y: 230, w: 110, h: 80, tone: 'soft', label: 'copy', text: <span className="if-big">42</span> },
    ],
    stop: {
      title: 'eface vs iface',
      body: (
        <p>
          Interfaces with methods are an <b>iface</b>: (itab, data). <code>any</code> is an <b>eface</b>: (type, data). Storing a value copies it, often onto the heap — a hidden allocation in hot
          paths.
        </p>
      ),
    },
  },
  {
    caption: 'A type assertion or type switch just compares word 1 with the type you ask for.',
    actors: [caller('r.(*os.File)?', true), file()],
    props: [box('r.(*os.File)'), w1('itab', '*os.File', 'red'), w2('ptr'), arrow],
    stop: {
      edge: true,
      title: 'pointer receivers',
      body: (
        <>
          <p>
            A method on <code>*T</code> is not in <code>T</code>’s method set, so a plain <code>T</code> can’t go in the box.
          </p>
          <Code>{`func (*T) Error() string { … }

var e error = T{}  // compile error
var e error = &T{} // ok`}</Code>
        </>
      ),
    },
  },
]

/* ── 2 · typed nil ───────────────────────────────────────────────────────── */

const judge = (bubble?: string, hot?: boolean): Actor => ({ id: 'judge', sprite: 'fairy-tale-king', x: 690, y: 335, h: 135, tag: '== nil ?', bubble, hot })
const ptr = (bubble?: string): Actor => ({ id: 'p', sprite: 'dandy-umbrella', x: 390, y: 335, h: 120, tag: 'p *MyErr', bubble })

export const typedNil: Frame[] = [
  {
    caption: 'p is a nil *MyErr. p == nil is true: a nil pointer is one zero word.',
    actors: [ptr('I’m nil'), judge('true', false)],
  },
  {
    caption: 'Store p in an error and word 1 records *MyErr, even though word 2 is still nil.',
    actors: [judge()],
    props: [box('err error = p'), w1('itab', '*MyErr', 'red'), w2('nil', 'dashed')],
  },
  {
    caption: 'err == nil is true only when both words are nil. Word 1 isn’t, so it’s false.',
    actors: [judge('false!', true)],
    props: [box('err error = p'), w1('itab', '*MyErr', 'red'), w2('nil', 'dashed')],
    stop: {
      title: 'the rule',
      body: (
        <>
          <p>An interface is nil only when its type and its value are both nil.</p>
          <Code>{`var p *MyErr
var err error = p
fmt.Println(p == nil, err == nil) // true false`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'The classic bug: a function returns a nil *MyErr as error, so the caller sees a failure.',
    actors: [judge('err != nil', true), { id: 'victim', sprite: 'convict-hard-times', x: 100, y: 335, h: 115, tag: 'caller', bubble: 'but it worked?!' }],
    props: [box('return e'), w1('itab', '*MyErr', 'red'), w2('nil', 'dashed')],
    stop: {
      title: 'where it hides',
      body: (
        <Code>{`func save() error {
    var e *MyErr
    if bad { e = &MyErr{} }
    return e // never nil!
}`}</Code>
      ),
    },
  },
  {
    caption: 'Fix: return a literal nil, and declare results as error, never *MyErr. Both words stay nil.',
    actors: [{ id: 'victim', sprite: 'superhero-standing', x: 100, y: 335, h: 115, tag: 'caller', bubble: 'ok' }, judge('true', false)],
    props: [box('return nil'), w1('itab', 'nil', 'dashed'), w2('nil', 'dashed')],
  },
  {
    caption: 'a == b compares word 1, then the values. If the type isn’t comparable, it panics.',
    actors: [judge('a == b? panic', true)],
    props: [box('a, b any'), w1('type', '[]int'), w2('ptr')],
    stop: {
      edge: true,
      title: 'a run-time check',
      body: (
        <p>
          <code>==</code> on interfaces always compiles. With <code>[]int</code>, <code>map</code> or <code>func</code> inside, it panics at run time — and so does using such an <code>any</code> as a map
          key.
        </p>
      ),
    },
  },
]

/* ── 3 · embedding ───────────────────────────────────────────────────────── */

const dogBox: Prop = { id: 'dog', x: 200, y: 150, w: 420, h: 195, label: 'Dog' }
const animalBox = (tone: Prop['tone'] = 'soft'): Prop => ({ id: 'animal', x: 400, y: 190, w: 200, h: 140, tone, label: 'embedded' })
const dog = (bubble?: string, hot?: boolean, dim?: boolean): Actor => ({ id: 'dog', sprite: 'misc-cool-one', x: 290, y: 330, h: 120, tag: 'Dog.Name', bubble, hot, dim })
const animal = (bubble?: string, hot?: boolean): Actor => ({ id: 'an', sprite: 'misc-standing-left', x: 500, y: 320, h: 105, tag: 'Animal', bubble, hot })
const asker = (bubble?: string): Actor => ({ id: 'asker', sprite: 'fairy-tale-messenger-showing', x: 90, y: 335, h: 120, bubble })

export const embedding: Frame[] = [
  {
    caption: 'Dog embeds Animal. Animal’s methods are promoted, so Dog gets Name and Describe for free.',
    actors: [asker(), dog(), animal()],
    props: [dogBox, animalBox()],
  },
  {
    caption: 'Dog defines its own Name, which shadows the promoted one: d.Name() returns "dog".',
    actors: [asker('d.Name()'), dog('"dog"', true), animal()],
    props: [dogBox, animalBox()],
  },
  {
    caption: 'Dog has no Describe, so d.Describe() really means d.Animal.Describe(). The receiver is the inner Animal.',
    actors: [asker('d.Describe()'), dog(undefined, false, true), animal('Describe()', true)],
    props: [dogBox, animalBox('red')],
  },
  {
    caption: 'Inside Describe, a.Name() calls Animal.Name. Animal has no idea it lives inside a Dog.',
    actors: [asker(), dog(undefined, false, true), animal('"I am animal"', true)],
    props: [dogBox, animalBox('red')],
    stop: {
      title: 'no virtual methods on structs',
      body: (
        <>
          <p>A call on a concrete type is fixed at compile time, and there is no pointer back to the outer struct. The “override” is never called.</p>
          <Code>{`d.Name()     // "dog"
d.Describe() // "I am animal"`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Want overridable behavior? Accept an interface: describe(n Namer) calls whatever Name you pass in.',
    actors: [asker('describe(d)'), dog('I’m a Namer', true), animal()],
    props: [dogBox, animalBox()],
    stop: {
      edge: true,
      title: 'a Dog is not an Animal',
      body: (
        <p>
          You can’t pass a <code>Dog</code> where an <code>Animal</code> is expected; pass <code>d.Animal</code>. But promoted methods do count, so <code>Dog</code> satisfies interfaces through them.
        </p>
      ),
    },
  },
]

/* ── 4 · errors as values ────────────────────────────────────────────────── */

const repo = (bubble?: string): Actor => ({ id: 'repo', sprite: 'adventure-pirate-lifting-goods', x: 95, y: 335, h: 120, tag: 'repo', bubble })
const svc = (bubble?: string): Actor => ({ id: 'svc', sprite: 'misc-standing-v2', x: 400, y: 335, h: 110, tag: 'service', bubble })
const handler = (bubble?: string, hot?: boolean): Actor => ({ id: 'h', sprite: 'science-lightbulb', x: 700, y: 335, h: 120, tag: 'handler', bubble, hot })
const env = (label: string): Prop => ({ id: 'env', x: 290, y: 40, w: 250, h: 120, tone: 'dashed', label })
const inner = (text: string, x: number, y: number, tone: Prop['tone'] = 'ink'): Prop => ({ id: 'inner', x, y, w: 210, h: 50, tone, text })

export const errorsAsValues: Frame[] = [
  {
    caption: 'Errors are plain values. A sentinel is a package-level var that callers can compare against.',
    actors: [repo('not found'), svc(), handler()],
    props: [inner('ErrNotFound', 20, 90)],
  },
  {
    caption: 'The service adds context with %w. The original error stays inside, like a letter in an envelope.',
    actors: [repo(), svc('wrap it'), handler()],
    props: [env('"load user 42: %w"'), inner('ErrNotFound', 310, 90)],
  },
  {
    caption: 'At the handler, err == ErrNotFound is false: the envelope is not the letter.',
    actors: [repo(), svc(), handler('== ? false', true)],
    props: [{ ...env('"load user 42: %w"'), x: 520 }, inner('ErrNotFound', 540, 90)],
  },
  {
    caption: 'errors.Is unwraps the chain layer by layer until it finds the sentinel. Use Is, not ==.',
    actors: [repo(), svc(), handler('errors.Is ✓')],
    props: [{ ...env('"load user 42: %w"'), x: 520 }, inner('ErrNotFound', 540, 90, 'red')],
    stop: {
      title: '%w vs %v',
      body: (
        <p>
          <code>%v</code> copies the message but drops the chain, so <code>errors.Is</code> returns false. Use it on purpose at API boundaries to hide details like DB errors.
        </p>
      ),
    },
  },
  {
    caption: 'Custom error types carry data. errors.As finds the first *fs.PathError in the chain and fills your variable.',
    actors: [repo(), svc(), handler('errors.As', true)],
    props: [{ ...env('"read config: %w"'), x: 520 }, inner('*fs.PathError', 540, 90, 'red')],
    stop: {
      title: 'Is vs As',
      body: (
        <>
          <p>Is asks “is this exact value in the chain?”. As asks “is there one of this type?” and hands it to you.</p>
          <Code>{`var pe *fs.PathError
if errors.As(err, &pe) {
    log.Print(pe.Path)
}`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Define interfaces where they are used: the service declares the one method it needs, repo returns a struct.',
    actors: [repo(), svc(), handler()],
    props: [
      { id: 'iface', x: 290, y: 60, w: 250, h: 100, tone: 'red', label: 'service: interface', text: <span className="if-mono">Get(id)</span> },
      { id: 'impl', x: 20, y: 60, w: 200, h: 100, tone: 'soft', label: 'postgres', text: <span className="if-mono">*Store</span> },
    ],
    stop: {
      title: 'accept interfaces, return structs',
      body: <p>A small consumer-side interface is easy to fake in tests and avoids import cycles. Constructors return concrete types, so adding a method breaks nobody.</p>,
    },
  },
]
