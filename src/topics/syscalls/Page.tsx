import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import devops from '../../bank/cats/devops.json'
import goroutines from '../../bank/cats/goroutines-scheduler.json'
import { addressSpace, cost, crossing, door, handoff } from './flows'
import { gatekeeper } from './stories'

const toc = [
  { id: 'wall', label: 'Why the wall' },
  { id: 'door', label: 'One syscall' },
  { id: 'cost', label: 'What it costs' },
  { id: 'go', label: 'Go and syscalls' },
]

export default function SyscallsPage() {
  return (
    <>
      <TopicHero
        slug="syscalls"
        title="Syscalls &amp; kernel mode"
        lead="Why the kernel is walled off, what crossing the wall physically does, and how Go copes with slow crossings."
        toc={toc}
      />

      <Section id="wall" n="01" kicker="Privilege · memory map" title="Why user and kernel are split">
        <p>Without a wall, one buggy program can take down the machine. The fix is in hardware, and the kernel still lives inside every address space.</p>
        <Story title="The gatekeeper" frames={gatekeeper} />
        <Flow title="Two processes, one kernel" def={addressSpace} />
      </Section>

      <Section id="door" n="02" kicker="syscall · sysret" title="What one syscall physically does">
        <p>A syscall is one CPU instruction that jumps to an address the kernel chose at boot. Everything else is bookkeeping around that jump.</p>
        <Flow title="User to kernel and back" def={crossing} />
        <p>Because every call passes this one door, it is also where sandboxes hook in.</p>
        <Flow title="Filtering the door" def={door} />
      </Section>

      <Section id="cost" n="03" kicker="Cost · vDSO · batching" title="What a crossing costs">
        <p>The switch is cheap; entry work, cache misses and the handler are not. Numbers below are measured on one VM.</p>
        <Flow title="From function call to strace" def={cost} />
      </Section>

      <Section id="go" n="04" kicker="entersyscall · sysmon" title="How Go leaves the P behind">
        <p>A thread stuck in the kernel still holds a P. The runtime must decide when to take it back so other goroutines can run.</p>
        <Flow title="A blocking syscall and the P handoff" def={handoff} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[devops, goroutines]}
          ids={[
            'devops-syscalls',
            'devops-context-switch',
            'goroutines-scheduler-syscalls-handoff',
            'goroutines-scheduler-preemption',
            'goroutines-scheduler-netpoller',
            'devops-epoll',
            'goroutines-scheduler-max-goroutines',
            'goroutines-scheduler-gomaxprocs-1-threads',
          ]}
        />
      </Section>
      <NextTopic slug="syscalls" />
    </>
  )
}
