import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import messaging from '../../bank/cats/messaging.json'
import { CrashLab } from './CrashLab'
import { commitStory, groupStory, outboxStory, partitionsStory } from './stories'
import './kafka.css'

const toc = [
  { id: 'log', label: 'Partitions' },
  { id: 'groups', label: 'Consumer groups' },
  { id: 'commit', label: 'Lost or twice' },
  { id: 'outbox', label: 'Outbox' },
]

export default function KafkaPage() {
  return (
    <>
      <TopicHero
        slug="kafka"
        title={
          <>
            Kafka & delivery <span className="r">guarantees</span>
          </>
        }
        lead="Kafka keeps messages in logs; readers remember how far they got."
        toc={toc}
      />

      <Section id="log" n="01" kicker="Partitions" title="The key picks the partition">
        <Story title="One topic, three logs" frames={partitionsStory} />
      </Section>

      <Section id="groups" n="02" kicker="Consumer groups" title="One reader per partition">
        <Story title="Sharing the partitions" frames={groupStory} />
      </Section>

      <Section id="commit" n="03" kicker="Offset commits" title="Lost or processed twice">
        <p className="prose">Same crash, two commit orders: one loses a message, the other repeats it.</p>
        <Story title="Where the bookmark goes" frames={commitStory} />
        <CrashLab />
      </Section>

      <Section id="outbox" n="04" kicker="Outbox" title="Save and publish together">
        <Story title="The outbox" frames={outboxStory} />
      </Section>

      <Section id="interview" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[messaging]}
          ids={[
            'messaging-kafka-core-entities',
            'messaging-kafka-partitioning',
            'messaging-kafka-consumers-vs-partitions',
            'messaging-kafka-consumer-lag',
            'messaging-delivery-guarantees-exactly-once',
            'messaging-idempotent-consumer-dedup',
            'messaging-transactional-outbox',
            'messaging-outbox-relay-concurrency',
          ]}
        />
      </Section>
      <NextTopic slug="kafka" />
    </>
  )
}
