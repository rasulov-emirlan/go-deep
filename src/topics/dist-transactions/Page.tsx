import { Flow } from '../../components/Flow'
import { Section } from '../../components/Lab'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import messaging from '../../bank/cats/messaging.json'
import { cancelFirst, idempotency, inbox, kafkaEos, outbox, pollSkip, sagaChoreo, sagaIsolation, sagaOrch, twoPC } from './flows'

const toc = [
  { id: 'twopc', label: '2PC' },
  { id: 'saga', label: 'Sagas' },
  { id: 'saga-edges', label: 'Saga edge cases' },
  { id: 'outbox', label: 'Outbox & inbox' },
  { id: 'idempotency', label: 'Idempotency' },
]

export default function DistTransactionsPage() {
  return (
    <div className="dt">
      <TopicHero slug="dist-transactions" title="Sagas, 2PC &amp; outbox" lead="Keeping several services consistent without one shared transaction." toc={toc} />

      <Section id="twopc" n="01" kicker="Two-phase commit" title="2PC and the stuck participant">
        <p>Two-phase commit gives one atomic commit across several stores, but it has one bad moment. Go’s <code>database/sql</code> has no XA API for it.</p>
        <Flow title="Transfer across two shards" def={twoPC} />
      </Section>

      <Section id="saga" n="02" kicker="Sagas" title="Undo with new transactions">
        <p>A saga commits each step locally and, on failure, runs compensating transactions. Either a central orchestrator or the services themselves can drive it.</p>
        <Flow title="Orchestrated saga, ship fails" def={sagaOrch} />
        <Flow title="Choreographed saga" def={sagaChoreo} />
      </Section>

      <Section id="saga-edges" n="03" kicker="Saga edge cases" title="Late cancels and leaky isolation">
        <p>Undos are messages too, so they can be late, early or seen half-way through.</p>
        <Flow title="The cancel that arrives first" def={cancelFirst} />
        <Flow title="Saga isolation" def={sagaIsolation} />
      </Section>

      <Section id="outbox" n="04" kicker="Outbox · inbox" title="Publishing events without a dual write">
        <p>You cannot commit a DB row and publish to Kafka atomically. Store the event in the DB, publish it later, and make the consumer tolerate repeats.</p>
        <Flow title="Transactional outbox and relay" def={outbox} />
        <Flow title="Idempotent consumer with an inbox" def={inbox} />
        <Flow title="Polling relay and commit order" def={pollSkip} />
      </Section>

      <Section id="idempotency" n="05" kicker="Idempotency · exactly-once" title="Safe retries and what exactly-once covers">
        <p>A timeout means the outcome is unknown, so a retry is only safe if repeating the request does no harm.</p>
        <Flow title="Idempotency key on a payment" def={idempotency} />
        <Flow title="Kafka exactly-once: the box" def={kafkaEos} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, messaging, databases]}
          ids={[
            'architecture-two-phase-commit',
            'architecture-saga-pattern',
            'architecture-saga-booking-design',
            'messaging-transactional-outbox',
            'messaging-outbox-relay-concurrency',
            'messaging-idempotent-consumer-dedup',
            'messaging-delivery-guarantees-exactly-once',
            'architecture-idempotency-keys-payments',
            'architecture-payment-timeout-reconciliation',
            'databases-distributed-transactions-nosql',
          ]}
        />
      </Section>

      <NextTopic slug="dist-transactions" />
    </div>
  )
}
