import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import sync from '../../bank/cats/sync.json'
import memoryGc from '../../bank/cats/memory-gc.json'
import goroutines from '../../bank/cats/goroutines-scheduler.json'
import { branch, chase, counter, goModel, ladder, lines, mesi, numa, storeBuffer } from './flows'

const toc = [
  { id: 'wall', label: 'The memory wall' },
  { id: 'misses', label: 'Avoidable misses' },
  { id: 'sharing', label: 'Sharing is expensive' },
  { id: 'order', label: 'Ordering, NUMA, vCPUs' },
]

export default function CpuCachesPage() {
  return (
    <>
      <TopicHero
        slug="cpu-caches"
        title="CPU caches &amp; memory ordering"
        lead="Memory is slow, so every core hides it in private caches. Sharing, ordering and sockets are the price."
        toc={toc}
      />

      <Section id="wall" n="01" kicker="Latency · cache lines" title="The memory wall">
        <p>Each step down the ladder is several times slower. Data moves in 64-byte lines, and a line can only live in certain slots.</p>
        <Flow title="Latency ladder, drawn to scale" def={ladder} />
        <Flow title="One miss loads a whole line" def={lines} />
      </Section>

      <Section id="misses" n="02" kicker="Prefetch · branches" title="Misses you can avoid">
        <p>Hardware hides latency only when it can see what is coming. Dependent loads and unpredictable branches take that away.</p>
        <Flow title="Slice walk vs pointer chase" def={chase} />
        <Flow title="A branch the CPU can’t guess" def={branch} />
      </Section>

      <Section id="sharing" n="03" kicker="MESI · atomics" title="Sharing is expensive">
        <p>Every core caches privately, so a protocol keeps one value per line. A write costs a conversation. Padding basics live in the memory-layout topic; here is the machinery.</p>
        <Flow title="MESI between two cores" def={mesi} />
        <Flow title="One shared atomic, and how it scales" def={counter} />
      </Section>

      <Section id="order" n="04" kicker="Store buffer · NUMA" title="Ordering, NUMA and vCPUs">
        <p>Other cores see your writes late, and not always in your order. Memory also has a location, and a vCPU is not a core.</p>
        <Flow title="The store buffer" def={storeBuffer} />
        <Flow title="x86, ARM, and what Go promises" def={goModel} />
        <Flow title="Sockets, first touch, and vCPUs" def={numa} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[sync, memoryGc, goroutines]}
          ids={[
            'sync-atomics-vs-mutex',
            'sync-data-race',
            'sync-unsynchronized-counter',
            'sync-struct-fields-race',
            'sync-mutex-internals',
            'sync-pool',
            'memory-gc-struct-alignment',
            'goroutines-scheduler-gomaxprocs',
            'goroutines-scheduler-gomaxprocs-1-threads',
          ]}
        />
      </Section>
      <NextTopic slug="cpu-caches" />
    </>
  )
}
