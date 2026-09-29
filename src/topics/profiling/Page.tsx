import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import tooling from '../../bank/cats/tooling-testing.json'
import devops from '../../bank/cats/devops.json'
import { FlameLab } from './FlameLab'
import { cpuProfile, memory, metrics, traces } from './stories'
import './profiling.css'

const toc = [
  { id: 'cpu', label: 'CPU & flame graphs' },
  { id: 'memory', label: 'Heap & leaks' },
  { id: 'metrics', label: 'Metrics & p99' },
  { id: 'traces', label: 'Traces' },
  { id: 'interview', label: 'Interview' },
]

export default function ProfilingPage() {
  return (
    <>
      <TopicHero
        slug="profiling"
        title={
          <>
            Profiling & <span className="r">observability</span>
          </>
        }
        lead="Profiles tell you where one process spends CPU and memory; metrics, logs and traces tell you where a system hurts."
        toc={toc}
      />

      <Section id="cpu" n="01" kicker="pprof · CPU" title="Sample stacks, stack the samples">
        <p className="prose">The CPU profiler doesn’t time functions. It photographs the call stack 100 times a second and counts.</p>
        <Story title="From SIGPROF to flame graph" frames={cpuProfile} />
        <div className="profiling-lab">
          <FlameLab />
        </div>
      </Section>

      <Section id="memory" n="02" kicker="heap · goroutine · block · trace" title="Memory, leaks and waiting">
        <p className="prose">One import gives you six profiles. Knowing which one answers your question is the interview.</p>
        <Story title="Hunting a leak" frames={memory} />
      </Section>

      <Section id="metrics" n="03" kicker="Prometheus" title="RED, USE and the tail">
        <p className="prose">Metrics are the alarm. Pick few, pick well, and alert on percentiles.</p>
        <Story title="Why p99, not the mean" frames={metrics} />
      </Section>

      <Section id="traces" n="04" kicker="OpenTelemetry" title="One request, many services">
        <p className="prose">A trace is a tree of spans sharing one id, passed from service to service in a header.</p>
        <Story title="Following traceparent" frames={traces} />
      </Section>

      <Section id="interview" n="05" kicker="Asked in real interviews" title="Questions you will be asked">
        <TopQuestions
          from={[tooling, devops]}
          ids={[
            'tooling-testing-profiling-pprof',
            'tooling-testing-profiling-in-production',
            'devops-latency-regression-investigation',
            'devops-observability-overview',
            'devops-service-metrics-red-use',
            'devops-prometheus-metric-types',
            'devops-distributed-tracing',
            'devops-monitoring-and-logging',
          ]}
        />
      </Section>
      <NextTopic slug="profiling" />
    </>
  )
}
