import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import gcQs from '../../bank/cats/memory-gc.json'
import { markSweep, stackHeap, whenGC, writeBarrier } from './stories'
import './gc.css'

const toc = [
  { id: 'escape', label: 'Stack or heap' },
  { id: 'mark', label: 'Mark & sweep' },
  { id: 'barrier', label: 'Write barrier' },
  { id: 'when', label: 'GOGC & GOMEMLIMIT' },
  { id: 'asked', label: 'Asked' },
]

export default function GcPage() {
  return (
    <>
      <TopicHero
        slug="gc"
        title={
          <>
            Garbage <span className="r">collection</span>
          </>
        }
        lead="Where Go puts your values, and how it finds and frees the ones nobody uses anymore."
        toc={toc}
      />

      <Section id="escape" n="01" kicker="Escape analysis" title="Stack or heap?">
        <Story title="Stack, heap, escape" frames={stackHeap} />
      </Section>

      <Section id="mark" n="02" kicker="Tri-color mark & sweep" title="Paint what’s reachable, free the rest">
        <Story title="Mark and sweep" frames={markSweep} />
      </Section>

      <Section id="barrier" n="03" kicker="Write barrier" title="Why marking needs a write barrier">
        <p className="prose">The GC marks while your program keeps changing pointers. That can hide a live object.</p>
        <Story title="The write barrier" frames={writeBarrier} />
      </Section>

      <Section id="when" n="04" kicker="GOGC · GOMEMLIMIT" title="When does the GC run?">
        <Story title="GOGC and GOMEMLIMIT" frames={whenGC} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[gcQs]}
          ids={[
            'memory-gc-how-gc-works',
            'memory-gc-stack-vs-heap',
            'memory-gc-escape-analysis',
            'memory-gc-reduce-gc-pressure',
            'memory-gc-leak-diagnosis',
            'memory-gc-oom-behavior',
          ]}
        />
      </Section>
      <NextTopic slug="gc" />
    </>
  )
}
