import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import messaging from '../../bank/cats/messaging.json'
import { CrashLab } from './CrashLab'
import { commitStory, durabilityStory, groupStory, outboxStory, partitionsStory } from './stories'
import './kafka.css'

const toc = [
  { id: 'log', label: 'Partitions' },
  { id: 'groups', label: 'Consumer groups' },
  { id: 'commit', label: 'Commit timing' },
  { id: 'outbox', label: 'Outbox' },
  { id: 'durability', label: 'Durability' },
  { id: 'interview', label: 'Interview' },
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
        lead="Kafka is a set of append-only logs, and ordering, lag, lost messages and duplicates all come down to who holds which offset."
        toc={toc}
      />

      <Section id="log" n="01" kicker="Topics, partitions, keys" title="Order lives in a partition">
        <p className="prose">The key picks the partition. Everything about ordering follows from that.</p>
        <Story title="One topic, three logs" frames={partitionsStory} />
      </Section>

      <Section id="groups" n="02" kicker="Consumer groups" title="One partition, one consumer">
        <p className="prose">A consumer group shares the partitions of a topic between its members.</p>
        <Story title="Scaling a group" frames={groupStory} />
      </Section>

      <Section id="commit" n="03" kicker="Offset commits" title="Commit before or after?">
        <p className="prose">Same crash, two commit orders: one loses a message, the other processes it twice.</p>
        <Story title="Where the bookmark goes" frames={commitStory} />
        <CrashLab />
      </Section>

      <Section id="outbox" n="04" kicker="Dual write" title="Two writes, one transaction">
        <p className="prose">Saving to the database and publishing to Kafka can’t be atomic, unless the event is also a database row.</p>
        <Story title="The transactional outbox" frames={outboxStory} />
      </Section>

      <Section id="durability" n="05" kicker="Replication" title="Don’t lose an acked write">
        <p className="prose">An ack is only as safe as the number of brokers holding a copy.</p>
        <Story title="acks, ISR, min.insync" frames={durabilityStory} />
      </Section>

      <Section id="interview" n="06" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[messaging]}
          ids={[
            'messaging-kafka-partitioning',
            'messaging-kafka-consumers-vs-partitions',
            'messaging-kafka-consumer-lag',
            'messaging-delivery-guarantees-exactly-once',
            'messaging-idempotent-consumer-dedup',
            'messaging-transactional-outbox',
            'messaging-kafka-replication-fault-tolerance',
            'messaging-kafka-retention-unconsumed',
          ]}
        />
      </Section>
      <NextTopic slug="kafka" />
    </>
  )
}
