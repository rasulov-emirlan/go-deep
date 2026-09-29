import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import { acid, mvcc, reads, writes } from './stories'
import './transactions.css'

const toc = [
  { id: 'acid', label: 'All or nothing' },
  { id: 'mvcc', label: 'Row versions' },
  { id: 'reads', label: 'What you see' },
  { id: 'writes', label: 'What you lose' },
  { id: 'asked', label: 'Asked' },
]

const levels: [string, string, string][] = [
  ['Read Committed', 'happens', 'happens'],
  ['Repeatable Read', 'error', 'happens'],
  ['Serializable', 'error', 'error'],
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
        lead="What PostgreSQL promises when two transactions change the same data at once."
        toc={toc}
      />

      <Section id="acid" n="01" kicker="ACID" title="All or nothing">
        <Story title="Alice pays Bob 30" frames={acid} />
      </Section>

      <Section id="mvcc" n="02" kicker="MVCC" title="Updates make new row versions">
        <Story title="One UPDATE" frames={mvcc} />
      </Section>

      <Section id="reads" n="03" kicker="Reads" title="What each level lets you see">
        <Story title="Read it twice" frames={reads} />
      </Section>

      <Section id="writes" n="04" kicker="Writes" title="How updates get lost">
        <Story title="Two writers" frames={writes} />
        <table className="tx-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Lost update</th>
              <th>Write skew</th>
            </tr>
          </thead>
          <tbody>
            {levels.map(([lv, ...cells]) => (
              <tr key={lv}>
                <th>{lv}</th>
                {cells.map((c, i) => (
                  <td key={i} className={c === 'happens' ? 'bad' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[databases]}
          ids={[
            'databases-isolation-levels',
            'databases-acid-transactions',
            'databases-mvcc',
            'databases-vacuum',
            'databases-lost-update',
            'databases-concurrent-writes-same-rows',
            'databases-atomic-withdraw',
          ]}
        />
      </Section>

      <NextTopic slug="transactions" />
    </>
  )
}
