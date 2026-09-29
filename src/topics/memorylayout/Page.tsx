import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import memoryQ from '../../bank/cats/memory-gc.json'
import basicsQ from '../../bank/cats/go-basics.json'
import interfacesQ from '../../bank/cats/interfaces.json'
import syncQ from '../../bank/cats/sync.json'
import slicesQ from '../../bank/cats/slices.json'
import { LayoutLab } from './LayoutLab'
import { fixStory, orderStory, sharingStory, zeroStory } from './stories'
import './memorylayout.css'

const toc = [
  { id: 'order', label: 'Field order' },
  { id: 'zero', label: 'Zero-size fields' },
  { id: 'sharing', label: 'False sharing' },
  { id: 'fix', label: 'The fix' },
  { id: 'asked', label: 'Asked' },
]

export default function MemoryLayoutPage() {
  return (
    <>
      <TopicHero
        slug="memory-layout"
        title={
          <>
            Padding & <span className="r">false sharing</span>
          </>
        }
        lead="How Go lays out struct fields in memory, and why that can cost bytes and speed."
        toc={toc}
      />

      <Section id="order" n="01" kicker="Alignment" title="Field order changes the size">
        <Story title="type Bad struct" frames={orderStory} />
        <LayoutLab />
      </Section>

      <Section id="zero" n="02" kicker="Zero-size" title="Fields that take no bytes">
        <Story title="struct{} and [0]func()" frames={zeroStory} />
      </Section>

      <Section id="sharing" n="03" kicker="Cache lines" title="Two counters, one cache line">
        <Story title="A++ and B++" frames={sharingStory} />
      </Section>

      <Section id="fix" n="04" kicker="Padding" title="Give each counter its own line">
        <Story title="Pad or shard" frames={fixStory} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[memoryQ, basicsQ, interfacesQ, syncQ, slicesQ]}
          ids={[
            'memory-gc-struct-alignment',
            'go-basics-struct-field-order-size',
            'go-basics-sizeof-types',
            'interfaces-empty-struct-vs-empty-interface',
            'sync-struct-fields-race',
            'sync-atomics-vs-mutex',
            'slices-thread-safety',
          ]}
        />
      </Section>

      <NextTopic slug="memory-layout" />
    </>
  )
}
