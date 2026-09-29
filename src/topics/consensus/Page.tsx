import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import messaging from '../../bank/cats/messaging.json'
import { election, figure8, membership, prevote, quorum, reads, replication } from './flows'

const toc = [
  { id: 'majority', label: 'Why a majority' },
  { id: 'election', label: 'Leader election' },
  { id: 'log', label: 'Log & commit rule' },
  { id: 'reads', label: 'Reads & membership' },
]

export default function Page() {
  return (
    <div>
      <TopicHero slug="consensus" title="Consensus &amp; Raft" lead="How a cluster elects a leader, replicates one log and stays correct when nodes crash or the network splits." toc={toc} />

      <Section id="majority" n="01" kicker="Quorums" title="Why a majority decides">
        <p>Two obvious designs fail. A quorum is the cheapest fix that survives both failure modes.</p>
        <Flow title="Primary/replica, wait-for-all, majority" def={quorum} />
      </Section>

      <Section id="election" n="02" kicker="Terms · votes" title="One leader per term">
        <p>Raft picks a leader with votes and a logical clock called a term. Timing only affects how fast a leader appears, never whether two can be elected in one term.</p>
        <Flow title="Election with randomized timers" def={election} />
        <Flow title="Pre-Vote: a partitioned server can’t disturb the leader" def={prevote} />
      </Section>

      <Section id="log" n="03" kicker="AppendEntries · Figure 8" title="Replicating, repairing and committing the log">
        <p>The leader&rsquo;s log wins. Followers are repaired to match it, and an entry counts as committed only under a stricter rule than &ldquo;a majority has it&rdquo;.</p>
        <Flow title="AppendEntries and divergence repair" def={replication} />
        <Flow title="Figure 8: a majority isn’t enough" def={figure8} />
      </Section>

      <Section id="reads" n="04" kicker="Reads · membership" title="Fresh reads and changing the cluster">
        <p>Reading from the leader is not automatically safe, and neither is swapping servers in one step.</p>
        <Flow title="Stale leader, ReadIndex, lease reads" def={reads} />
        <Flow title="Joint consensus and single-server changes" def={membership} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, databases, messaging]}
          ids={[
            'architecture-cap-theorem',
            'architecture-two-phase-commit',
            'databases-multi-master',
            'databases-replication-types',
            'messaging-kafka-replication-fault-tolerance',
            'architecture-service-discovery',
            'architecture-idempotency',
            'architecture-eventual-consistency',
          ]}
        />
      </Section>
      <NextTopic slug="consensus" />
    </div>
  )
}
