import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import systemDesign from '../../bank/cats/system-design.json'
import { cacheStory, connPool, replicasShards, retryBreaker } from './stories'
import { StampedeLab } from './StampedeLab'
import './scaling.css'

const toc = [
  { id: 'cache', label: 'Caching' },
  { id: 'retries', label: 'Retries & breakers' },
  { id: 'pool', label: 'Connection pool' },
  { id: 'replicas', label: 'Replicas & shards' },
]

export default function ScalingPage() {
  return (
    <>
      <TopicHero
        slug="scaling"
        title={
          <>
            Scaling &amp; <span className="r">resilience</span>
          </>
        }
        lead="How a Go service survives traffic spikes and failing neighbours."
        toc={toc}
      />

      <Section id="cache" n="01" kicker="Caching" title="Keep hot data close">
        <Story title="Cache, then stampede" frames={cacheStory} />
        <StampedeLab />
      </Section>

      <Section id="retries" n="02" kicker="Failure handling" title="Retry gently, then stop">
        <Story title="Retries, then a breaker" frames={retryBreaker} />
      </Section>

      <Section id="pool" n="03" kicker="database/sql" title="Waiting for a connection">
        <Story title="Pool exhaustion" frames={connPool} />
      </Section>

      <Section id="replicas" n="04" kicker="Data scaling" title="Copy the data, then split it">
        <Story title="Replicas, shards, CAP" frames={replicasShards} />
      </Section>

      <Section id="interview" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, systemDesign, databases]}
          ids={[
            'system-design-scaling-growing-service',
            'architecture-caching-strategies',
            'architecture-cache-stampede',
            'architecture-circuit-breaker',
            'databases-connection-pooler',
            'databases-scaling',
            'databases-sharding-vs-replication',
            'architecture-cap-theorem',
          ]}
        />
      </Section>
      <NextTopic slug="scaling" />
    </>
  )
}
