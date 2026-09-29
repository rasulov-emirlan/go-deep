import { Section } from '../../components/Lab'
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
        lead="An interface value is a box holding a type and a value. Most trick questions start there."
        toc={toc}
      />

      <Section id="words" n="01" kicker="Type + value" title="A box of two words">
        <Story title="What r = f stores" frames={twoWords} />
      </Section>

      <Section id="nil" n="02" kicker="The #1 puzzle" title="A nil pointer in a box is not nil">
        <Story title="The nil that isn’t" frames={typedNil} />
        <BoxLab />
      </Section>

      <Section id="embed" n="03" kicker="Composition" title="Embedding is not inheritance">
        <Story title="Who answers d.Describe()?" frames={embedding} />
      </Section>

      <Section id="errors" n="04" kicker="errors package" title="Errors are values">
        <Story title="Wrap, then unwrap" frames={errorsAsValues} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[ifaceQs, errorQs]}
          ids={[
            'interfaces-what-is-interface',
            'interfaces-internals',
            'interfaces-empty-interface-any',
            'interfaces-nil-interface-comparison',
            'interfaces-typed-nil-error-handler',
            'interfaces-value-vs-pointer-in-interface',
            'interfaces-embedding-and-inheritance',
            'errors-wrapping',
          ]}
        />
      </Section>

      <NextTopic slug="interfaces" />
    </div>
  )
}
