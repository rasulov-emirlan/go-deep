import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import goBasics from '../../bank/cats/go-basics.json'
import scheduler from '../../bank/cats/goroutines-scheduler.json'
import { cantSave, deferStack, namedResults, panicRecover } from './stories'
import './defer.css'

const toc = [
  { id: 'stack', label: 'Last in, first out' },
  { id: 'results', label: 'Changing the result' },
  { id: 'panic', label: 'Panic and recover' },
  { id: 'fatal', label: 'What can’t be saved' },
  { id: 'asked', label: 'Asked' },
]

export default function DeferPage() {
  return (
    <>
      <TopicHero
        slug="defer"
        title={
          <>
            defer, panic &amp; <span className="r">recover</span>
          </>
        }
        lead="When deferred calls run, what they see, and what recover can and can’t stop."
        toc={toc}
      />

      <Section id="stack" n="01" kicker="defer" title="Last in, first out">
        <Story title="A stack of calls" frames={deferStack} />
      </Section>

      <Section id="results" n="02" kicker="Named results" title="A defer can change the result">
        <Story title="return, then defers" frames={namedResults} />
      </Section>

      <Section id="panic" n="03" kicker="panic · recover" title="Panic unwinds, recover catches">
        <Story title="A panic in parse" frames={panicRecover} />
      </Section>

      <Section id="fatal" n="04" kicker="Crashes" title="What recover can’t save">
        <Story title="Three ways to crash" frames={cantSave} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[goBasics, scheduler]}
          ids={[
            'go-basics-defer-basics',
            'go-basics-panic-recover',
            'go-basics-panic-in-goroutine',
            'go-basics-defer-argument-evaluation',
            'go-basics-defer-named-result-and-args',
            'go-basics-defer-named-results',
            'goroutines-scheduler-recover-in-goroutine-output',
            'go-basics-defer-overhead',
          ]}
        />
      </Section>

      <NextTopic slug="defer" />
    </>
  )
}
