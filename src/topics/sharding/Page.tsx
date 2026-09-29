import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import systemDesign from '../../bank/cats/system-design.json'
import { RingLab } from './RingLab'
import { askFlow, hotFlow, indexFlow, modFlow, placeFlow, replicaFlow, reshardFlow, ringFlow, scatterFlow, slotFlow } from './flows'
import './sharding.css'

const toc = [
  { id: 'mod', label: 'hash mod N' },
  { id: 'ring', label: 'The ring' },
  { id: 'others', label: 'Other schemes' },
  { id: 'move', label: 'Moving data' },
  { id: 'cost', label: 'What it costs' },
]

export default function ShardingPage() {
  return (
    <>
      <TopicHero
        slug="sharding"
        title={
          <>
            Sharding &amp; consistent <span className="r">hashing</span>
          </>
        }
        lead="Spreading data over nodes without reshuffling everything when one changes."
        toc={toc}
      />

      <Section id="mod" n="01" kicker="The naive way" title="hash mod N reshuffles everything">
        <p>Shard = hash(key) mod N is the first idea. It works until N changes.</p>
        <Flow title="Add one shard" def={modFlow} />
      </Section>

      <Section id="ring" n="02" kicker="Consistent hashing" title="The ring, and why it needs vnodes">
        <p>Put nodes and keys on the same circle. Changing a node only moves the keys next to it.</p>
        <Flow title="Ring, vnodes, add, remove" def={ringFlow} />
        <Flow title="Replicas on a ring" def={replicaFlow} />
        <RingLab />
      </Section>

      <Section id="others" n="03" kicker="Alternatives" title="Rendezvous, jump, Maglev, fixed slots">
        <p>The ring is one answer. Each of these trades something: lookup cost, removal, or memory.</p>
        <Flow title="Three ways to pick a node" def={placeFlow} />
        <Flow title="Redis Cluster: 16384 fixed slots" def={slotFlow} />
      </Section>

      <Section id="move" n="04" kicker="Resharding" title="Moving data while it is live">
        <p>Changing the shard map is the easy part. Moving the data without downtime is the work.</p>
        <Flow title="Online resharding" def={reshardFlow} />
        <Flow title="Redis ASK and MOVED" def={askFlow} />
      </Section>

      <Section id="cost" n="05" kicker="Trade-offs" title="Hot keys and cross-shard work">
        <p>Good hashing balances keys, not traffic, and it cannot help a query that does not know the key.</p>
        <Flow title="A hot key" def={hotFlow} />
        <Flow title="Scatter-gather" def={scatterFlow} />
        <Flow title="Secondary indexes and joins" def={indexFlow} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[databases, systemDesign]}
          ids={[
            'databases-sharding-basics',
            'databases-sharding-vs-replication',
            'databases-sharding-key',
            'databases-sharding-problems',
            'databases-sharding-experience',
            'databases-partitioning',
            'databases-redis-cluster-scaling',
            'system-design-distributed-cache-challenges',
          ]}
        />
      </Section>
      <NextTopic slug="sharding" />
    </>
  )
}
