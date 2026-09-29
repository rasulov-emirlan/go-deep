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
  { id: 'memory', label: 'Memory leaks' },
  { id: 'metrics', label: 'Metrics & p99' },
  { id: 'traces', label: 'Traces' },
  { id: 'interview', label: 'Asked in interviews' },
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
        lead="Profiles show where one program spends CPU and memory; metrics and traces show where a system hurts."
        toc={toc}
      />

      <Section id="cpu" n="01" kicker="pprof · CPU" title="Where does the CPU go?">
        <Story title="Samples → flame graph" frames={cpuProfile} />
        <div className="profiling-lab">
          <FlameLab />
        </div>
      </Section>

      <Section id="memory" n="02" kicker="heap · goroutines" title="Finding a memory leak">
        <Story title="Hunting a leak" frames={memory} />
      </Section>

      <Section id="metrics" n="03" kicker="Prometheus" title="What to measure">
        <Story title="Why p99, not the average" frames={metrics} />
      </Section>

      <Section id="traces" n="04" kicker="OpenTelemetry" title="Follow one request">
        <Story title="Following a trace" frames={traces} />
      </Section>

      <Section id="interview" n="05" kicker="Interview prep" title="Asked in real interviews">
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
