import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import { composite, costs, findRow, ignored } from './stories'
import './indexes.css'

const toc = [
  { id: 'find', label: 'Finding a row' },
  { id: 'order', label: 'Column order' },
  { id: 'ignored', label: 'Ignored indexes' },
  { id: 'costs', label: 'The price' },
  { id: 'questions', label: 'Asked' },
]

export default function IndexesPage() {
  return (
    <>
      <TopicHero
        slug="indexes"
        title={
          <>
            Indexes & <span className="r">query plans</span>
          </>
        }
        lead="An index finds rows without reading the whole table, but every write pays for it."
        toc={toc}
      />

      <Section id="find" n="01" kicker="B-tree" title="How an index finds a row">
        <Story title="Find one email" frames={findRow} />
      </Section>

      <Section id="order" n="02" kicker="(a, b)" title="Column order matters">
        <Story title="Index on (country, age)" frames={composite} />
      </Section>

      <Section id="ignored" n="03" kicker="EXPLAIN" title="Why is my index ignored?">
        <Story title="The planner decides" frames={ignored} />
      </Section>

      <Section id="costs" n="04" kicker="Trade-offs" title="What an index costs">
        <Story title="Writes and paging" frames={costs} />
      </Section>

      <Section id="questions" n="05" kicker="Interview" title="Asked in real interviews">
        <TopQuestions
          from={[databases]}
          ids={[
            'databases-index-what-why',
            'databases-btree-internals',
            'databases-composite-index-leftmost-prefix',
            'databases-index-not-used',
            'databases-explain-analyze',
            'databases-index-types',
            'databases-index-downsides',
            'databases-keyset-pagination',
          ]}
        />
      </Section>
      <NextTopic slug="indexes" />
    </>
  )
}
