import { Section } from '../../components/Lab'
import { Code } from '../../components/Code'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import ifaceQs from '../../bank/cats/interfaces.json'
import errorQs from '../../bank/cats/errors.json'
import { BoxLab } from './BoxLab'
import { embedding, errorsAsValues, twoWords, typedNil } from './stories'
import './interfaces.css'

const toc = [
  { id: 'words', label: 'Two words' },
  { id: 'nil', label: 'Typed nil' },
  { id: 'embed', label: 'Embedding' },
  { id: 'errors', label: 'Errors' },
  { id: 'asked', label: 'Asked' },
]

export default function InterfacesPage() {
  return (
    <div className="if-page">
      <TopicHero
        slug="interfaces"
        title={
          <>
            Interfaces & <span className="r">nil</span>
          </>
        }
        lead="An interface value is two words, and almost every trick question is about what sits in them."
        toc={toc}
      />

      <Section id="words" n="01" kicker="runtime/iface.go" title="A box of two words">
        <p className="prose">No vtable on the struct, no “implements”. The box carries its own method table.</p>
        <Story title="What r = f stores" frames={twoWords} />
      </Section>

      <Section id="nil" n="02" kicker="The #1 puzzle" title="Typed nil is not nil">
        <p className="prose">A nil pointer inside an interface still has a type. That makes the interface non-nil.</p>
        <Story title="The nil that isn’t" frames={typedNil} />
        <BoxLab />
      </Section>

      <Section id="embed" n="03" kicker="Composition" title="Embedding is not inheritance">
        <Code>{`type Animal struct{}
func (Animal) Name() string { return "animal" }
func (a Animal) Describe() string {
    return "I am " + a.Name()
}

type Dog struct{ Animal }
func (Dog) Name() string { return "dog" }`}</Code>
        <Story title="Who answers d.Describe()?" frames={embedding} />
      </Section>

      <Section id="errors" n="04" kicker="errors package" title="Errors are values">
        <p className="prose">
          <code>error</code> is a one-method interface. Wrapping builds a chain; <code>errors.Is</code> and <code>errors.As</code> walk it.
        </p>
        <Story title="Wrap, then unwrap" frames={errorsAsValues} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[ifaceQs, errorQs]}
          ids={[
            'interfaces-nil-interface-comparison',
            'interfaces-typed-nil-error-handler',
            'interfaces-internals',
            'interfaces-value-vs-pointer-in-interface',
            'interfaces-embedding-and-inheritance',
            'interfaces-where-to-define',
            'errors-wrapping',
            'errors-custom-errors',
          ]}
        />
      </Section>

      <NextTopic slug="interfaces" />
    </div>
  )
}
