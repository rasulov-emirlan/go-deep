import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import schedQs from '../../bank/cats/goroutines-scheduler.json'
import { containerProcs, meetGMP, waiting, whyP } from './stories'

const toc = [
  { id: 'model', label: 'G · M · P' },
  { id: 'steal', label: 'Work stealing' },
  { id: 'wait', label: 'Network vs syscalls' },
  { id: 'procs', label: 'GOMAXPROCS' },
  { id: 'asked', label: 'Asked' },
]

export default function GmpPage() {
  return (
    <>
      <TopicHero
        slug="scheduler"
        title={
          <>
            The Go <span className="r">scheduler</span>
          </>
        }
        lead="How Go runs thousands of goroutines on a few threads, and what happens when one waits."
        toc={toc}
      />

      <Section id="model" n="01" kicker="G · M · P" title="Many goroutines, few threads">
        <Story title="Meet G, M and P" frames={meetGMP} />
      </Section>

      <Section id="steal" n="02" kicker="Run queues" title="Idle threads steal work">
        <Story title="A queue per P" frames={whyP} />
      </Section>

      <Section id="wait" n="03" kicker="Netpoller · syscalls" title="Waiting without wasting a thread">
        <Story title="Socket read vs file read" frames={waiting} />
      </Section>

      <Section id="procs" n="04" kicker="GOMAXPROCS" title="CPU limits in containers">
        <Story title="GOMAXPROCS in a pod" frames={containerProcs} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[schedQs]}
          ids={[
            'goroutines-scheduler-goroutine-vs-thread',
            'goroutines-scheduler-gmp-model',
            'goroutines-scheduler-gomaxprocs',
            'goroutines-scheduler-preemption',
            'goroutines-scheduler-run-queues-work-stealing',
            'goroutines-scheduler-netpoller',
            'goroutines-scheduler-syscalls-handoff',
            'goroutines-scheduler-gomaxprocs-kubernetes',
          ]}
        />
      </Section>
      <NextTopic slug="scheduler" />
    </>
  )
}
