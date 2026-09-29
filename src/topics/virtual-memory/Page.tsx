import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import memoryGc from '../../bank/cats/memory-gc.json'
import devops from '../../bank/cats/devops.json'
import { cow, demand, goheap, limit, oom, rss, shootdown, worlds } from './flows'

const toc = [
  { id: 'translate', label: 'Translation' },
  { id: 'faults', label: 'Page faults' },
  { id: 'numbers', label: 'RSS & the OOM killer' },
  { id: 'go', label: 'Go on top' },
]

export default function VirtualMemoryPage() {
  return (
    <>
      <TopicHero
        slug="virtual-memory"
        title="Virtual memory"
        lead="Every address your program uses is fake. The kernel fills in real memory only when you touch it, which is why RSS isn’t what you allocated."
        toc={toc}
      />

      <Section id="translate" n="01" kicker="MMU · page tables · TLB" title="Every address is translated">
        <p>Programs that share raw RAM can trample each other. So the CPU translates each address through tables the kernel controls.</p>
        <Flow title="From raw RAM to a page walk" def={worlds} />
        <p>Changing a mapping is not free when several CPUs run your threads.</p>
        <Flow title="TLB shootdown" def={shootdown} />
      </Section>

      <Section id="faults" n="02" kicker="demand paging · fork" title="Memory is handed out on first touch">
        <p>Mapping is a promise. The real work happens in a page fault, the first time a page is used.</p>
        <Flow title="A page's first touch" def={demand} />
        <p>fork uses the same trick: share everything, copy a page only when someone writes it.</p>
        <Flow title="fork and copy-on-write" def={cow} />
      </Section>

      <Section id="numbers" n="03" kicker="RSS · overcommit · OOM" title="RSS, promises, and who gets killed">
        <p>Because memory is promised early and paid late, the numbers people watch mean different things.</p>
        <Flow title="VSZ, RSS and PSS" def={rss} />
        <p>The kernel can promise more than it has. When the bill comes due, something is killed.</p>
        <Flow title="Overcommit to OOM kill" def={oom} />
      </Section>

      <Section id="go" n="04" kicker="arenas · scavenger · GOMEMLIMIT" title="Go on top of the kernel's memory">
        <p>Go reserves big ranges, commits them in pieces, and gives memory back slowly. That explains most RSS surprises.</p>
        <Flow title="A heap arena's life" def={goheap} />
        <p>Inside a container the limit is a wall. GOMEMLIMIT is how Go learns about it.</p>
        <Flow title="Container limit and GOMEMLIMIT" def={limit} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[memoryGc, devops]}
          ids={[
            'memory-gc-lazy-allocation',
            'memory-gc-oom-behavior',
            'memory-gc-leak-diagnosis',
            'memory-gc-goroutine-stack',
            'memory-gc-stack-vs-heap',
            'memory-gc-arenas',
            'devops-fork',
            'devops-process-vs-thread',
          ]}
        />
      </Section>
      <NextTopic slug="virtual-memory" />
    </>
  )
}
