import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import systemDesign from '../../bank/cats/system-design.json'
import { cacheAside, connPool, replicasShards, retryBreaker, stampede } from './stories'
import { StampedeLab } from './StampedeLab'
import './scaling.css'

const toc = [
  { id: 'cache', label: 'Cache-aside' },
  { id: 'stampede', label: 'Stampede' },
  { id: 'retries', label: 'Retries & breakers' },
  { id: 'pool', label: 'Connection pool' },
  { id: 'replicas', label: 'Replicas, shards, CAP' },
  { id: 'interview', label: 'Interview' },
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
        lead="What keeps a Go service standing when traffic spikes and dependencies fail: caches, retries, breakers, pools and replicas."
        toc={toc}
      />

      <Section id="cache" n="01" kicker="Caching" title="Cache-aside">
        <p className="prose">The app owns the cache: read through it, fill it on a miss, drop the key on a write.</p>
        <Story title="Read, fill, invalidate" frames={cacheAside} />
      </Section>

      <Section id="stampede" n="02" kicker="Thundering herd" title="When a hot key expires">
        <p className="prose">A cache also hides how much load it absorbs, until the moment it stops absorbing it.</p>
        <Story title="Cache stampede" frames={stampede} />
        <StampedeLab />
      </Section>

      <Section id="retries" n="03" kicker="Failure handling" title="Retries, backoff, breakers">
        <p className="prose">Retries help with blips and hurt during outages. Backoff, budgets and breakers make the difference.</p>
        <Story title="Retry storm → circuit breaker" frames={retryBreaker} />
      </Section>

      <Section id="pool" n="04" kicker="database/sql" title="The connection pool">
        <p className="prose">Most “the database is slow” incidents are really callers waiting for a pooled connection.</p>
        <Story title="Pool exhaustion" frames={connPool} />
      </Section>

      <Section id="replicas" n="05" kicker="Data scaling" title="Replicas, shards, CAP">
        <p className="prose">Replicas copy all the data to scale reads. Shards split it to scale writes.</p>
        <Story title="Scale reads, then writes" frames={replicasShards} />
      </Section>

      <Section id="interview" n="06" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, systemDesign, databases]}
          ids={[
            'architecture-caching-strategies',
            'architecture-cache-stampede',
            'architecture-cache-invalidation',
            'architecture-circuit-breaker',
            'databases-connection-pooler',
            'databases-replication-types',
            'databases-sharding-vs-replication',
            'architecture-cap-theorem',
          ]}
        />
      </Section>
      <NextTopic slug="scaling" />
    </>
  )
}
