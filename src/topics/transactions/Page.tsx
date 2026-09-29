import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import { IsoLab } from './IsoLab'
import { acid, locks, mvcc, reads, writes } from './stories'
import './transactions.css'

const toc = [
  { id: 'acid', label: 'ACID' },
  { id: 'mvcc', label: 'MVCC' },
  { id: 'reads', label: 'Read anomalies' },
  { id: 'writes', label: 'Write anomalies' },
  { id: 'locks', label: 'Locks' },
  { id: 'lab', label: 'Lab' },
  { id: 'asked', label: 'Asked' },
]

export default function TransactionsPage() {
  return (
    <>
      <TopicHero
        slug="transactions"
        title={
          <>
            Transactions &amp; <span className="r">isolation</span>
          </>
        }
        lead="What PostgreSQL promises when two transactions touch the same rows, and what it makes you retry."
        toc={toc}
      />

      <Section id="acid" n="01" kicker="ACID" title="One transfer, four promises">
        <p className="prose">A transaction is a group of statements that commits or vanishes as one.</p>
        <Story title="Moving 30 from Alice to Bob" frames={acid} />
      </Section>

      <Section id="mvcc" n="02" kicker="MVCC" title="Versions, not overwrites">
        <p className="prose">PostgreSQL keeps several versions of a row so readers and writers don’t wait for each other. Dead versions are the price.</p>
        <Story title="What an UPDATE really does" frames={mvcc} />
      </Section>

      <Section id="reads" n="03" kicker="Read anomalies" title="What you can see">
        <p className="prose">Default level: Read Committed. Repeatable Read gives the whole transaction one snapshot.</p>
        <Story title="Dirty, non-repeatable, phantom" frames={reads} />
      </Section>

      <Section id="writes" n="04" kicker="Write anomalies" title="What you can lose">
        <p className="prose">Snapshots don’t stop two transactions from each acting on stale reads. Higher levels turn the race into an error you retry.</p>
        <Story title="Lost update and write skew" frames={writes} />
      </Section>

      <Section id="locks" n="05" kicker="Row locks" title="Waiting on purpose">
        <p className="prose">In Read Committed you prevent races yourself: lock the row, or make the write atomic.</p>
        <Story title="FOR UPDATE, deadlocks, SKIP LOCKED" frames={locks} />
      </Section>

      <Section id="lab" n="06" kicker="Try it" title="Same race, three levels">
        <IsoLab />
      </Section>

      <Section id="asked" n="07" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[databases]}
          ids={[
            'databases-isolation-levels',
            'databases-acid-transactions',
            'databases-mvcc',
            'databases-lost-update',
            'databases-atomic-withdraw',
            'databases-deadlocks',
            'databases-vacuum',
            'databases-task-queue-skip-locked',
          ]}
        />
      </Section>

      <NextTopic slug="transactions" />
    </>
  )
}
