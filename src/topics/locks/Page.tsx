import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import concurrency from '../../bank/cats/concurrency-patterns.json'
import messaging from '../../bank/cats/messaging.json'
import architecture from '../../bank/cats/architecture.json'
import { etcdLock, fencing, kinds, leader, redlock, ttlLie } from './flows'

const toc = [
  { id: 'ttl', label: 'The TTL lie' },
  { id: 'fencing', label: 'Fencing tokens' },
  { id: 'leases', label: 'Leases & leaders' },
  { id: 'kinds', label: 'Which lock' },
  { id: 'redlock', label: 'Redlock debate' },
]

export default function LocksPage() {
  return (
    <>
      <TopicHero
        slug="locks"
        title="Locks, leases &amp; fencing"
        lead="A lock with a timeout can have two owners. The storage, not the lock, has to say no to the stale one."
        toc={toc}
      />

      <Section id="ttl" n="01" kicker="Naive lock" title="A lock with a timeout can have two owners">
        <p>The timeout is a guess about how long the holder will run. The lock service can only watch a clock.</p>
        <Flow title="Lock with TTL, and a frozen holder" def={ttlLie} />
      </Section>

      <Section id="fencing" n="02" kicker="Fencing tokens" title="Make the storage say no">
        <p>Do not try to make the pause impossible. Make its late write harmless.</p>
        <Flow title="A stale token is rejected" def={fencing} />
      </Section>

      <Section id="leases" n="03" kicker="Leases · sessions" title="Leases: proving you are still alive">
        <p>A lease is a lock the holder must keep renewing. etcd and ZooKeeper tie locks to one; leader election reuses the idea.</p>
        <Flow title="etcd lock queue and lease expiry" def={etcdLock} />
        <Flow title="Leader election with a lease" def={leader} />
      </Section>

      <Section id="kinds" n="04" kicker="Efficiency vs correctness" title="Which lock do you need">
        <p>The right tool depends on what a double holder costs, not on how fancy the lock is.</p>
        <Flow title="Choosing by the cost of a double holder" def={kinds} />
      </Section>

      <Section id="redlock" n="05" kicker="Redlock" title="The Redlock debate">
        <p>Two engineers disagreed in public in 2016. Here are both arguments, paraphrased.</p>
        <Flow title="Redlock, and the two arguments" def={redlock} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[databases, concurrency, messaging, architecture]}
          ids={[
            'databases-redis-use-cases',
            'databases-consistency-without-transactions',
            'concurrency-patterns-stuck-pending-task',
            'messaging-outbox-relay-concurrency',
            'databases-locks-types',
            'architecture-cache-stampede',
            'messaging-idempotent-consumer-dedup',
            'architecture-idempotency-keys-payments',
          ]}
        />
      </Section>

      <NextTopic slug="locks" />
    </>
  )
}
