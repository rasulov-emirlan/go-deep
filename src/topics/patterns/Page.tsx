import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import context from '../../bank/cats/context.json'
import patterns from '../../bank/cats/concurrency-patterns.json'
import { contextTree, fanOut, gracefulShutdown, workerPool } from './stories'

const toc = [
  { id: 'context', label: 'Cancel with context' },
  { id: 'pool', label: 'Worker pool' },
  { id: 'fan', label: 'Limit and errgroup' },
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
        lead="Stop goroutines together, cap how many run, and shut down without dropping requests."
        toc={toc}
      />

      <Section id="context" n="01" kicker="context" title="Cancel flows down">
        <Story title="The context tree" frames={contextTree} />
      </Section>

      <Section id="pool" n="02" kicker="jobs → workers → results" title="Worker pool">
        <p className="prose">A fixed set of goroutines share one jobs channel; the tricky part is closing things.</p>
        <Story title="5 jobs, 2 workers" frames={workerPool} />
      </Section>

      <Section id="fan" n="03" kicker="semaphore · errgroup" title="Run many, but not too many">
        <p className="prose">A semaphore limits how many goroutines run at once; a pool keeps a fixed few alive.</p>
        <Story title="Fan-out, then cap it" frames={fanOut} />
      </Section>

      <Section id="shutdown" n="04" kicker="SIGTERM → drain → exit" title="Graceful shutdown">
        <Story title="http.Server.Shutdown" frames={gracefulShutdown} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[context, patterns]}
          ids={[
            'context-context-basics',
            'concurrency-patterns-semaphore-vs-worker-pool',
            'concurrency-patterns-semaphore',
            'concurrency-patterns-url-checker',
            'concurrency-patterns-fan-in',
            'concurrency-patterns-errgroup',
            'concurrency-patterns-graceful-shutdown',
          ]}
        />
      </Section>
      <NextTopic slug="patterns" />
    </>
  )
}
