import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import devops from '../../bank/cats/devops.json'
import goroutines from '../../bank/cats/goroutines-scheduler.json'
import patterns from '../../bank/cats/concurrency-patterns.json'
import { clone, eevdf, futex, gomax, lifecycle, load, switchCost, throttle } from './flows'

const toc = [
  { id: 'tasks', label: 'Tasks, zombies, PID 1' },
  { id: 'sched', label: 'Switching & picking' },
  { id: 'futex', label: 'futex' },
  { id: 'limits', label: 'CPU limits' },
]

export default function Page() {
  return (
    <>
      <TopicHero
        slug="os-scheduling"
        title="Threads &amp; CPU scheduling"
        lead="Threads and processes are one kernel object. Locks skip the kernel until contended, and a CPU limit is a time budget, not a core count."
        toc={toc}
      />

      <Section id="tasks" n="01" kicker="clone · fork · signals" title="A thread is a task that shares more">
        <p>The kernel schedules one kind of object. What makes it a thread or a process is what it shares with its parent.</p>
        <Flow title="clone() flags" def={clone} />
        <p>A process also has a life cycle: it dies, and someone has to collect the body.</p>
        <Flow title="Zombies, orphans, PID 1" def={lifecycle} />
      </Section>

      <Section id="sched" n="02" kicker="context switch · EEVDF" title="What a switch costs and who runs next">
        <p>More runnable tasks than CPUs means switching. The switch itself is cheap; what follows it is not.</p>
        <Flow title="One context switch" def={switchCost} />
        <p>Each CPU then picks the next task from its own queue by weight and deadline.</p>
        <Flow title="Who runs next" def={eevdf} />
        <Flow title="Load average and top" def={load} />
      </Section>

      <Section id="futex" n="03" kicker="futex" title="A lock enters the kernel only when contended">
        <p>The kernel never stores a lock. It only gives threads a place to sleep, and only when the fast path fails.</p>
        <Flow title="Lock, contend, sleep, wake" def={futex} />
      </Section>

      <Section id="limits" n="04" kicker="cgroups · GOMAXPROCS" title="A CPU limit is a time budget">
        <p>Read the timeline left to right. The container may spend 200 ms of CPU per 100 ms, in parallel or not.</p>
        <Flow title="Quota throttling" def={throttle} />
        <Flow title="Go's container-aware GOMAXPROCS" def={gomax} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[devops, goroutines, patterns]}
          ids={[
            'devops-process-vs-thread',
            'devops-context-switch',
            'devops-fork',
            'devops-top-and-load-average',
            'devops-cooperative-vs-preemptive-multitasking',
            'goroutines-scheduler-gomaxprocs-kubernetes',
            'goroutines-scheduler-switch-cost',
            'concurrency-patterns-graceful-shutdown',
          ]}
        />
      </Section>
      <NextTopic slug="os-scheduling" />
    </>
  )
}
