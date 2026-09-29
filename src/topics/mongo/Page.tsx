import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import { model, scale, schema, writes } from './stories'
import './mongo.css'

const toc = [
  { id: 'model', label: 'Rows or documents' },
  { id: 'schema', label: 'Schema' },
  { id: 'writes', label: 'Safe writes' },
  { id: 'scale', label: 'Scaling & choosing' },
  { id: 'asked', label: 'Asked' },
]

// [need, Postgres, MongoDB, which side wins: 1 = Postgres, 2 = MongoDB]
const choose: [string, string, string, 1 | 2][] = [
  ['Joins & reports', 'SQL joins', '$lookup', 1],
  ['Whole-object reads', 'JSONB', 'one document', 2],
  ['Rules in the DB', 'FK, CHECK', 'validation', 1],
  ['Write scale-out', 'Citus', 'built-in', 2],
]

export default function MongoPage() {
  return (
    <>
      <TopicHero
        slug="mongo-vs-postgres"
        title={
          <>
            Postgres vs <span className="r">MongoDB</span>
          </>
        }
        lead="Tables or documents: what each database is good at, and how to pick one."
        toc={toc}
      />

      <Section id="model" n="01" kicker="Data model" title="Rows or documents">
        <Story title="One order, two shapes" frames={model} />
      </Section>

      <Section id="schema" n="02" kicker="Schema" title="Strict, flexible, or both">
        <Story title="Adding a field" frames={schema} />
      </Section>

      <Section id="writes" n="03" kicker="Transactions" title="Safe writes and copies">
        <Story title="Three copies" frames={writes} />
      </Section>

      <Section id="scale" n="04" kicker="Scaling" title="Growing past one machine">
        <Story title="More servers" frames={scale} />
        <table className="mg-table">
          <thead>
            <tr>
              <th>Need</th>
              <th>Postgres</th>
              <th>MongoDB</th>
            </tr>
          </thead>
          <tbody>
            {choose.map(([need, p, m, win]) => (
              <tr key={need}>
                <th>{need}</th>
                <td className={win === 1 ? 'win' : undefined}>{p}</td>
                <td className={win === 2 ? 'win' : undefined}>{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[databases]}
          ids={[
            'databases-postgres-vs-mongodb',
            'databases-sql-vs-nosql',
            'databases-normalization-vs-denormalization',
            'databases-jsonb',
            'databases-consistency-without-transactions',
            'databases-sharding-basics',
            'databases-sharding-key',
            'databases-sharding-vs-replication',
          ]}
        />
      </Section>

      <NextTopic slug="mongo-vs-postgres" />
    </>
  )
}
