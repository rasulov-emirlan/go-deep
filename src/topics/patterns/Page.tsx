import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import context from '../../bank/cats/context.json'
import patterns from '../../bank/cats/concurrency-patterns.json'
import { contextTree, fanOut, gracefulShutdown, tokenBucket, workerPool } from './stories'
import { PoolLab } from './PoolLab'
import './patterns.css'

const toc = [
  { id: 'context', label: 'Context tree' },
  { id: 'pool', label: 'Worker pool' },
  { id: 'fan', label: 'Fan-out · errgroup' },
  { id: 'rate', label: 'Rate limiting' },
  { id: 'shutdown', label: 'Graceful shutdown' },
  { id: 'asked', label: 'Asked in interviews' },
]

export default function PatternsPage() {
  return (
    <>
      <TopicHero
        slug="patterns"
        title={
          <>
            Context & concurrency <span className="r">patterns</span>
          </>
        }
        lead="Cancel a tree of goroutines, cap how many run and how fast they call out, then shut down without dropping a request."
        toc={toc}
      />

      <Section id="context" n="01" kicker="context" title="Cancellation flows down a tree">
        <p className="prose">Every derived context is a child of another. Cancel a node and its whole subtree stops.</p>
        <Story title="The context tree" frames={contextTree} />
      </Section>

      <Section id="pool" n="02" kicker="jobs → workers → results" title="Worker pool">
        <p className="prose">A fixed number of goroutines drain one jobs channel. The tricky part is closing things in the right order.</p>
        <Story title="5 jobs · 3 workers" frames={workerPool} />
        <div className="pt-lab">
          <PoolLab />
        </div>
      </Section>

      <Section id="fan" n="03" kicker="fan-out · fan-in · errgroup" title="Spread out, merge back, cap it">
        <p className="prose">One goroutine per task is easy. Bounding them and stopping on the first error is what interviewers check.</p>
        <Story title="Fan-out → errgroup" frames={fanOut} />
      </Section>

      <Section id="rate" n="04" kicker="golang.org/x/time/rate" title="Token bucket">
        <p className="prose">A semaphore limits how many at once. A token bucket limits how many per second.</p>
        <Story title="x/time/rate" frames={tokenBucket} />
      </Section>

      <Section id="shutdown" n="05" kicker="SIGTERM → drain → exit" title="Graceful shutdown">
        <p className="prose">Stop taking new work, finish what’s in flight within a deadline, then exit.</p>
        <Story title="http.Server.Shutdown" frames={gracefulShutdown} />
      </Section>

      <Section id="asked" n="06" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[context, patterns]}
          ids={[
            'context-context-basics',
            'context-with-value',
            'concurrency-patterns-semaphore-vs-worker-pool',
            'concurrency-patterns-worker-count-sizing',
            'concurrency-patterns-fan-in',
            'concurrency-patterns-errgroup',
            'concurrency-patterns-rate-limiter-external-api',
            'concurrency-patterns-graceful-shutdown',
          ]}
        />
      </Section>
      <NextTopic slug="patterns" />
    </>
  )
}
