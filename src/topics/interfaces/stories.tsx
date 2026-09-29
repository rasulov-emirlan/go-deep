import type { Actor, Frame, Prop } from '../../components/Story'
import { Code } from '../../components/Code'

/* ── shared: the interface "box" with two word slots ─────────────────────── */

const box = (label: string): Prop => ({ id: 'box', x: 220, y: 190, w: 340, h: 145, label })
const w1 = (label: string, text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'w1', x: 238, y: 222, w: 145, h: 95, label, text, tone })
const w2 = (text: string, tone: Prop['tone'] = 'line'): Prop => ({ id: 'w2', x: 397, y: 222, w: 145, h: 95, label: 'value', text, tone })
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
  label: 'itab',
  text: <span className="if-mono">Read → …</span>,
})

export const twoWords: Frame[] = [
  {
    caption: 'An interface value is a box of two words: a type and a value.',
    actors: [caller('empty box')],
    props: [box('var r io.Reader'), w1('type', 'nil', 'dashed'), w2('nil', 'dashed')],
  },
  {
    caption: '`r = f` fills both: word 1 names *os.File, word 2 points at f.',
    actors: [caller('r = f'), file()],
    props: [box('r = f'), w1('type', '*os.File'), w2('ptr'), arrow],
    stop: {
      title: 'No “implements” keyword',
      body: <p>If *os.File has a Read method, it fits io.Reader. The compiler checks this at the assignment.</p>,
    },
  },
  {
    caption: 'Word 1 really points to an itab, the type’s table of methods.',
    actors: [caller(), file()],
    props: [box('r = f'), w1('itab', 'ptr ↑', 'red'), w2('ptr'), arrow, itab('red')],
  },
  {
    caption: '`r.Read(p)` finds Read in that table and calls it on f.',
    actors: [caller('r.Read(p)', true), file()],
    props: [box('r = f'), w1('itab', 'ptr ↑'), w2('ptr', 'red'), arrow, itab()],
  },
  {
    caption: '`any` has no methods, so word 1 is just the type. 42 is copied in.',
    actors: [caller('any = 42'), file(true)],
    props: [
      box('a any = 42'),
      w1('type', 'int', 'red'),
      w2('ptr'),
      arrow,
      { id: 'heap', x: 640, y: 230, w: 110, h: 80, tone: 'soft', label: 'copy', text: <span className="if-big">42</span> },
    ],
  },
  {
    caption: 'A type assertion, `r.(*os.File)`, just checks word 1.',
    actors: [caller('r.(*os.File)?', true), file()],
    props: [box('r.(*os.File)'), w1('type', '*os.File', 'red'), w2('ptr'), arrow],
    stop: {
      edge: true,
      title: 'Pointer receivers',
      body: (
        <>
          <p>
            A method on <code>*T</code> is not on <code>T</code>, so only <code>&T{'{}'}</code> fits.
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
    caption: '`p` is a nil *MyErr pointer, so `p == nil` is true.',
    actors: [ptr('I’m nil'), judge('true', false)],
  },
  {
    caption: 'Put p in an `error`: word 1 records *MyErr; word 2 stays nil.',
    actors: [judge()],
    props: [box('err error = p'), w1('type', '*MyErr', 'red'), w2('nil', 'dashed')],
  },
  {
    caption: '`err == nil` needs both words nil, so here it is false.',
    actors: [judge('false!', true)],
    props: [box('err error = p'), w1('type', '*MyErr', 'red'), w2('nil', 'dashed')],
    stop: {
      title: 'The rule',
      body: (
        <>
          <p>Nil type and nil value, or it isn’t nil.</p>
          <Code>{`var p *MyErr
var err error = p
fmt.Println(p == nil)   // true
fmt.Println(err == nil) // false`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'The classic bug: returning a nil *MyErr as `error` looks like a failure.',
    actors: [judge('err != nil', true), { id: 'victim', sprite: 'convict-hard-times', x: 100, y: 335, h: 115, tag: 'caller', bubble: 'but it worked?!' }],
    props: [box('return e'), w1('type', '*MyErr', 'red'), w2('nil', 'dashed')],
    stop: {
      title: 'Where it hides',
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
    caption: 'Fix: write `return nil`, and declare the result as `error`, not *MyErr.',
    actors: [{ id: 'victim', sprite: 'superhero-standing', x: 100, y: 335, h: 115, tag: 'caller', bubble: 'ok' }, judge('true', false)],
    props: [box('return nil'), w1('type', 'nil', 'dashed'), w2('nil', 'dashed')],
  },
]

/* ── 3 · embedding ───────────────────────────────────────────────────────── */

const dogBox: Prop = { id: 'dog', x: 200, y: 150, w: 420, h: 195, label: 'Dog' }
const animalBox = (tone: Prop['tone'] = 'soft'): Prop => ({ id: 'animal', x: 400, y: 190, w: 200, h: 140, tone, label: 'embedded' })
const dog = (bubble?: string, hot?: boolean, dim?: boolean): Actor => ({ id: 'dog', sprite: 'misc-cool-one', x: 290, y: 330, h: 120, tag: 'Dog', bubble, hot, dim })
const animal = (bubble?: string, hot?: boolean): Actor => ({ id: 'an', sprite: 'misc-standing-left', x: 500, y: 320, h: 105, tag: 'Animal', bubble, hot })
const asker = (bubble?: string): Actor => ({ id: 'asker', sprite: 'fairy-tale-messenger-showing', x: 90, y: 335, h: 120, bubble })

export const embedding: Frame[] = [
  {
    caption: 'Dog embeds Animal, so Dog gets Animal’s methods, Name and Describe, for free.',
    actors: [asker(), dog(), animal()],
    props: [dogBox, animalBox()],
  },
  {
    caption: 'Dog adds its own Name, which hides Animal’s: `d.Name()` is "dog".',
    actors: [asker('d.Name()'), dog('"dog"', true), animal()],
    props: [dogBox, animalBox()],
  },
  {
    caption: 'Dog has no Describe, so `d.Describe()` runs Animal’s Describe on the inner Animal.',
    actors: [asker('d.Describe()'), dog(undefined, false, true), animal('Describe()', true)],
    props: [dogBox, animalBox('red')],
  },
  {
    caption: 'Describe calls `a.Name()`, which is Animal’s Name. Animal doesn’t know about Dog.',
    actors: [asker(), dog(undefined, false, true), animal('"I am animal"', true)],
    props: [dogBox, animalBox('red')],
    stop: {
      title: 'Not inheritance',
      body: (
        <>
          <p>There is no override: the inner Animal never calls back into Dog.</p>
          <Code>{`func (a Animal) Describe() string {
    return "I am " + a.Name()
}
d.Name()     // "dog"
d.Describe() // "I am animal"`}</Code>
        </>
      ),
    },
  },
  {
    caption: 'Want swappable behavior? Accept an interface: `describe(n Namer)` uses whatever you pass.',
    actors: [asker('describe(d)'), dog('I’m a Namer', true), animal()],
    props: [dogBox, animalBox()],
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
    caption: '`error` is just an interface. `ErrNotFound` is a shared error value callers can check.',
    actors: [repo('not found'), svc(), handler()],
    props: [inner('ErrNotFound', 20, 90)],
  },
  {
    caption: 'The service wraps it with `%w`: new message outside, original error inside.',
    actors: [repo(), svc('wrap it'), handler()],
    props: [env('"load user: %w"'), inner('ErrNotFound', 310, 90)],
  },
  {
    caption: 'At the handler, `err == ErrNotFound` is false: the wrapper isn’t the original.',
    actors: [repo(), svc(), handler('== ? false', true)],
    props: [{ ...env('"load user: %w"'), x: 520 }, inner('ErrNotFound', 540, 90)],
  },
  {
    caption: '`errors.Is` opens each wrapper until it finds ErrNotFound. Use it, not ==.',
    actors: [repo(), svc(), handler('errors.Is ✓')],
    props: [{ ...env('"load user: %w"'), x: 520 }, inner('ErrNotFound', 540, 90, 'red')],
    stop: {
      title: '%w vs %v',
      body: (
        <p>
          <code>%v</code> keeps only the text, so <code>errors.Is</code> can’t find the original. Use it when callers shouldn’t see inner errors.
        </p>
      ),
    },
  },
  {
    caption: '`errors.As` finds an error by type, like *fs.PathError, so you can read its fields.',
    actors: [repo(), svc(), handler('errors.As', true)],
    props: [{ ...env('"read config: %w"'), x: 520 }, inner('*fs.PathError', 540, 90, 'red')],
  },
]
