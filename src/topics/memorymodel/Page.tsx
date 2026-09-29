import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import syncQs from '../../bank/cats/sync.json'
import channelQs from '../../bank/cats/channels.json'
import toolingQs from '../../bank/cats/tooling-testing.json'
import { edges, simple, torn, unseen } from './stories'
import './memorymodel.css'

const toc = [
  { id: 'unseen', label: 'Unseen writes' },
  { id: 'edges', label: 'Happens-before' },
  { id: 'torn', label: 'Torn reads' },
  { id: 'simple', label: 'Don’t be clever' },
  { id: 'asked', label: 'Asked' },
]

export default function MemoryModelPage() {
  return (
    <>
      <TopicHero
        slug="memory-model"
        title={
          <>
            The Go <span className="r">memory model</span>
          </>
        }
        lead="When one goroutine is guaranteed to see what another wrote, and what breaks without that."
        toc={toc}
      />

      <Section id="unseen" n="01" kicker="Visibility" title="Your write may never arrive">
        <Story title="A flag and a notebook" frames={unseen} />
      </Section>

      <Section id="edges" n="02" kicker="Happens-before" title="Sync makes the only promise">
        <Story title="Six ways to hand over" frames={edges} />
      </Section>

      <Section id="torn" n="03" kicker="Data races" title="A race means no guarantees">
        <Story title="A torn string" frames={torn} />
      </Section>

      <Section id="simple" n="04" kicker="Don’t be clever" title="Use a channel or a mutex">
        <Story title="Boring and correct" frames={simple} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[syncQs, channelQs, toolingQs]}
          ids={[
            'sync-data-race',
            'sync-delay-cancel-race',
            'sync-atomics-vs-mutex',
            'sync-singleton-without-once',
            'sync-thread-safe-singleton',
            'sync-struct-fields-race',
            'tooling-testing-race-detector',
            'channels-what-and-kinds',
          ]}
        />
      </Section>
      <NextTopic slug="memory-model" />
    </>
  )
}
