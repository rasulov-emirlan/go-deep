import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import databases from '../../bank/cats/databases.json'
import { IndexLab } from './IndexLab'
import { anatomy, composite, costs, ignored, seqVsBtree } from './stories'
import './indexes.css'

const toc = [
  { id: 'seq', label: 'Seq Scan vs B-tree' },
  { id: 'btree', label: 'Inside the B+tree' },
  { id: 'composite', label: 'Composite indexes' },
  { id: 'ignored', label: 'Ignored indexes' },
  { id: 'costs', label: 'Costs & kinds' },
  { id: 'questions', label: 'Real questions' },
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
        lead="An index trades write cost for a few page reads instead of all of them, and the planner decides whether to use it."
        toc={toc}
      />

      <Section id="seq" n="01" kicker="Pages, not rows" title="Seq Scan vs B-tree">
        <p className="prose">Postgres reads 8 KiB pages. Speed is measured in pages touched, shown here on a real PG18 table of 1M users.</p>
        <Story title="Find one email" frames={seqVsBtree} />
      </Section>

      <Section id="btree" n="02" kicker="B+tree" title="Descend once, then walk the leaves">
        <p className="prose">One path down finds the start. Linked leaves give you ranges and order for free.</p>
        <Story title="Range, heap, index-only, split" frames={anatomy} />
        <IndexLab />
      </Section>

      <Section id="composite" n="03" kicker="(a, b)" title="Composite: the leftmost prefix">
        <p className="prose">A multi-column index is sorted by its first column, then the next. Column order decides which queries can seek.</p>
        <Story title="Index on (country, age)" frames={composite} />
      </Section>

      <Section id="ignored" n="04" kicker="EXPLAIN" title="Why is my index ignored?">
        <p className="prose">The planner compares estimated costs. Usually it is right, and when it isn’t, EXPLAIN ANALYZE shows why.</p>
        <Story title="The planner decides" frames={ignored} />
      </Section>

      <Section id="costs" n="05" kicker="Trade-offs" title="Every index has a price">
        <p className="prose">Indexes slow writes and take space. Fetching data in bad patterns can undo all of their gains.</p>
        <Story title="Writes, kinds, N+1, pagination" frames={costs} />
      </Section>

      <Section id="questions" n="06" kicker="Interview" title="Asked in real interviews">
        <TopQuestions
          from={[databases]}
          ids={[
            'databases-btree-internals',
            'databases-explain-analyze',
            'databases-index-not-used',
            'databases-composite-index-leftmost-prefix',
            'databases-index-range-equality-order-by',
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
