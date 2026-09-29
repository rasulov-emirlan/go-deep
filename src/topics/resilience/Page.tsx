import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import concurrency from '../../bank/cats/concurrency-patterns.json'
import context from '../../bank/cats/context.json'
import networking from '../../bank/cats/networking.json'
import { AmplifyLab } from './AmplifyLab'
import { amplifyFlow, breakerFlow, deadlineFlow, hedgeFlow, jitterFlow, metastableFlow, overloadFlow } from './flows'
import './resilience.css'

const toc = [
  { id: 'deadlines', label: 'Deadlines' },
  { id: 'retries', label: 'Retries' },
  { id: 'breaker', label: 'Circuit breaker' },
  { id: 'overload', label: 'Overload' },
  { id: 'meta', label: 'Metastable' },
]

export default function ResiliencePage() {
  return (
    <>
      <TopicHero
        slug="resilience"
        title={
          <>
            Timeouts, retries &amp; <span className="r">breakers</span>
          </>
        }
        lead="Deadlines, backoff, breakers and load shedding that stop one slow dependency from taking everything down."
        toc={toc}
      />

      <Section id="deadlines" n="01" kicker="Deadlines" title="One budget, passed down">
        <p>Go clients and servers have no timeouts by default. Set a deadline once, at the edge, and hand the remainder to every call below.</p>
        <Flow title="A deadline across three hops" def={deadlineFlow} />
      </Section>

      <Section id="retries" n="02" kicker="Retries" title="Helpful, then lethal">
        <p>A retry rescues a blip and kills a struggling service. The arithmetic is exact, so do it.</p>
        <Flow title="Retries multiply per layer" def={amplifyFlow} />
        <AmplifyLab />
        <Flow title="Backoff needs jitter" def={jitterFlow} />
      </Section>

      <Section id="breaker" n="03" kicker="Circuit breaker" title="Fail fast, then probe">
        <p>A breaker stops calling a dependency that keeps failing. Libraries disagree on what “keeps failing” means, so know yours.</p>
        <Flow title="Breaker states" def={breakerFlow} />
      </Section>

      <Section id="overload" n="04" kicker="Overload" title="Queues, shedding, hedging">
        <p>When demand exceeds capacity, decide what to refuse. Then deal with the slow tail without adding load.</p>
        <Flow title="Bounded queues, shedding, bulkheads" def={overloadFlow} />
        <Flow title="Hedged requests" def={hedgeFlow} />
      </Section>

      <Section id="meta" n="05" kicker="Metastable failure" title="It stays broken after the trigger">
        <p>Retries and cold caches can hold a system down long after the original cause has gone.</p>
        <Flow title="A self-sustaining outage" def={metastableFlow} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[concurrency, architecture, networking, context]}
          ids={[
            'concurrency-patterns-timeouts-retries-backoff',
            'architecture-circuit-breaker',
            'networking-http-timeouts',
            'context-timeout-wrapper',
            'architecture-payment-timeout-reconciliation',
            'architecture-cache-stampede',
            'concurrency-patterns-semaphore',
            'concurrency-patterns-rate-limiter-external-api',
            'architecture-idempotency',
          ]}
        />
      </Section>
      <NextTopic slug="resilience" />
    </>
  )
}
