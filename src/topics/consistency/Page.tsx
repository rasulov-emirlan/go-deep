import { Flow } from '../../components/Flow'
import { Section } from '../../components/Lab'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import { capScene, causal, commitModes, ladder, linVsSeq, nemesis, pacelc, quorum, raftSplit, replicaLag, serVsStrict } from './flows'

const toc = [
  { id: 'models', label: 'What each model allows' },
  { id: 'lag', label: 'Replica lag' },
  { id: 'cap', label: 'CAP & PACELC' },
  { id: 'quorum', label: 'Quorums & testing' },
]

export default function ConsistencyPage() {
  return (
    <>
      <TopicHero
        slug="consistency"
        title={
          <>
            Consistency models, <span className="r">CAP</span> &amp; PACELC
          </>
        }
        lead="“Consistent” means a set of histories a system may show. CAP and PACELC say when you must give some up."
        toc={toc}
      />

      <Section id="models" n="01" kicker="Linearizable · serializable · sequential" title="What each model allows">
        <p>A consistency model is the set of histories a system is allowed to show. Stronger models allow fewer.</p>
        <Flow title="The ladder of models" def={ladder} />
        <Flow title="Linearizable vs sequential" def={linVsSeq} />
        <Flow title="Serializable vs strict serializable" def={serVsStrict} />
      </Section>

      <Section id="lag" n="02" kicker="Replicas · sessions" title="Replica lag and time going backwards">
        <p>Each replica may be fine alone. Behind a load balancer, a client can still see its own past.</p>
        <Flow title="Reads that go backwards" def={replicaLag} />
        <Flow title="When does COMMIT return?" def={commitModes} />
        <Flow title="Causal order" def={causal} />
      </Section>

      <Section id="cap" n="03" kicker="CAP · PACELC" title="What CAP and PACELC really say">
        <p>CAP is a statement about one moment: the network is partitioned. PACELC adds the rest of the time.</p>
        <Flow title="The CAP argument" def={capScene} />
        <Flow title="A Raft cluster, split 3 | 2" def={raftSplit} />
        <Flow title="Latency or consistency, no partition" def={pacelc} />
      </Section>

      <Section id="quorum" n="04" kicker="Quorums · Jepsen" title="Quorums fall short, and how to test">
        <p>Overlapping quorums look strong. A checker finds where they are not.</p>
        <Flow title="R + W > N, still stale" def={quorum} />
        <Flow title="Testing with a nemesis" def={nemesis} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, databases]}
          ids={[
            'architecture-cap-theorem',
            'architecture-eventual-consistency',
            'databases-replication-types',
            'databases-multi-master',
            'databases-consistency-without-transactions',
            'databases-isolation-levels',
            'databases-distributed-transactions-nosql',
          ]}
        />
      </Section>
      <NextTopic slug="consistency" />
    </>
  )
}
