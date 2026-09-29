import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import messaging from '../../bank/cats/messaging.json'
import { QuorumLab } from './QuorumLab'
import { asyncFlow, counterFlow, crdtFlow, failoverFlow, handoffFlow, isrFlow, lagFlow, merkleFlow, repairFlow, syncFlow } from './flows'
import './replication.css'

const toc = [
  { id: 'leader', label: 'Single leader' },
  { id: 'quorum', label: 'Quorums' },
  { id: 'repair', label: 'Hints & repair' },
  { id: 'conflicts', label: 'Conflicts & CRDTs' },
  { id: 'kafka', label: 'Kafka ISR' },
]

export default function ReplicationPage() {
  return (
    <>
      <TopicHero
        slug="replication"
        title={
          <>
            Replication &amp; <span className="r">quorums</span>
          </>
        }
        lead="Copies of data drift apart. Leaders, quorums and merge rules decide what you lose when they do."
        toc={toc}
      />

      <Section id="leader" n="01" kicker="Single leader" title="Ack early or ack late">
        <p>One leader takes the writes and ships its log to followers. When it answers the client is the whole trade-off.</p>
        <Flow title="Async: fast, can lose" def={asyncFlow} />
        <Flow title="Sync: safe, can stall" def={syncFlow} />
        <Flow title="Failover and split-brain" def={failoverFlow} />
        <Flow title="Reading a lagging replica" def={lagFlow} />
      </Section>

      <Section id="quorum" n="02" kicker="Leaderless" title="Quorums: W + R > N">
        <p>No leader: write to N copies, wait for W acks, read from R. If W + R exceeds N the two sets must overlap.</p>
        <QuorumLab />
        <Flow title="Overlap without linearizability" def={counterFlow} />
      </Section>

      <Section id="repair" n="03" kicker="Hints & repair" title="How stale copies catch up">
        <p>Three mechanisms, from cheapest to slowest: repair on read, hints for absent nodes, background tree comparison.</p>
        <Flow title="Read repair" def={repairFlow} />
        <Flow title="Sloppy quorum and hinted handoff" def={handoffFlow} />
        <Flow title="Anti-entropy with Merkle trees" def={merkleFlow} />
      </Section>

      <Section id="conflicts" n="04" kicker="Conflicts & CRDTs" title="When two writers disagree">
        <p>Multi-leader and leaderless setups accept concurrent writes to one key. Something must merge them.</p>
        <Flow title="LWW, counters and sets" def={crdtFlow} />
      </Section>

      <Section id="kafka" n="05" kicker="Worked example" title="Kafka: leader plus ISR">
        <p>Kafka is single-leader with a moving in-sync set, not a majority quorum.</p>
        <Flow title="One partition, three replicas" def={isrFlow} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[databases, messaging, architecture]}
          ids={[
            'databases-replication-types',
            'databases-multi-master',
            'databases-masters-replicas-count',
            'databases-sharding-vs-replication',
            'messaging-kafka-replication-fault-tolerance',
            'architecture-cap-theorem',
            'architecture-eventual-consistency',
          ]}
        />
      </Section>
      <NextTopic slug="replication" />
    </>
  )
}
