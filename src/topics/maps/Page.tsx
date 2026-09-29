import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import mapsQ from '../../bank/cats/maps.json'
import { danger, growth, lookup, order } from './stories'

const toc = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'grow', label: 'Growth' },
  { id: 'order', label: 'Order' },
  { id: 'danger', label: 'Panics' },
  { id: 'asked', label: 'Asked' },
]

export default function MapsPage() {
  return (
    <>
      <TopicHero
        slug="maps"
        title={
          <>
            Maps & <span className="r">Swiss</span> tables
          </>
        }
        lead="A map hashes each key to find its slot fast, and most map gotchas follow from that."
        toc={toc}
      />

      <Section id="lookup" n="01" kicker="Hash table" title="How a map finds a key">
        <Story title="Looking up eve" frames={lookup} />
      </Section>

      <Section id="grow" n="02" kicker="Growth" title="When a map fills up">
        <Story title="Double and move" frames={growth} />
      </Section>

      <Section id="order" n="03" kicker="range" title="Map order is random">
        <Story title="Two loops, two orders" frames={order} />
      </Section>

      <Section id="danger" n="04" kicker="Panics" title="Nil maps and shared maps">
        <Story title="Crashes to avoid" frames={danger} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[mapsQ]}
          ids={[
            'maps-internals',
            'maps-complexity',
            'maps-collisions',
            'maps-concurrent-access',
            'maps-nil-map',
            'maps-iteration-order',
            'maps-value-not-addressable',
            'maps-delete-memory',
          ]}
        />
      </Section>

      <NextTopic slug="maps" />
    </>
  )
}
