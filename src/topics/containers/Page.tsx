import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import devops from '../../bank/cats/devops.json'
import memoryGc from '../../bank/cats/memory-gc.json'
import scheduler from '../../bank/cats/goroutines-scheduler.json'
import patterns from '../../bank/cats/concurrency-patterns.json'
import { costume, cpu, isolation, k8s, memory, pid1 } from './flows'

const toc = [
  { id: 'process', label: 'A process in a costume' },
  { id: 'limits', label: 'Memory & CPU limits' },
  { id: 'pid1', label: 'PID 1' },
  { id: 'k8s', label: 'Requests & limits' },
]

export default function ContainersPage() {
  return (
    <>
      <TopicHero
        slug="containers"
        title="Containers under the hood"
        lead="A container is one ordinary process with a limited view and limited resources. That explains OOM kills and lost SIGTERMs."
        toc={toc}
      />

      <Section id="process" n="01" kicker="Namespaces · cgroups" title="A container is a process in a costume">
        <p>The kernel has no “container” object. Namespaces restrict what a process sees; cgroups restrict what it uses.</p>
        <Flow title="What `docker run` really does" def={costume} />
        <Flow title="Shared kernel, gVisor, VM" def={isolation} />
      </Section>

      <Section id="limits" n="02" kicker="cgroups" title="When a limit is hit: who dies">
        <p>Memory and CPU limits fail differently: memory ends in a kill, CPU in a freeze.</p>
        <Flow title="A memory limit, cache included" def={memory} />
        <Flow title="A CPU limit is a 100 ms clock" def={cpu} />
      </Section>

      <Section id="pid1" n="03" kicker="PID 1 · signals" title="PID 1 is not a normal process">
        <p>In its own PID namespace your app is PID 1, and the kernel treats init specially: signals, orphans, exit.</p>
        <Flow title="Where SIGTERM goes" def={pid1} />
      </Section>

      <Section id="k8s" n="04" kicker="Requests · limits · QoS" title="Kubernetes: what requests and limits do">
        <p>The same two kernel mechanisms, driven by pod specs, plus scheduling and eviction on top.</p>
        <Flow title="Requests, limits, QoS, eviction" def={k8s} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[devops, memoryGc, scheduler, patterns]}
          ids={[
            'devops-virtualization-vs-containers',
            'memory-gc-oom-behavior',
            'goroutines-scheduler-gomaxprocs-kubernetes',
            'concurrency-patterns-graceful-shutdown',
            'devops-sidecar-container',
            'devops-k8s-readiness-liveness',
            'devops-kubernetes-objects',
            'devops-docker-multistage-go',
          ]}
        />
      </Section>
      <NextTopic slug="containers" />
    </>
  )
}
