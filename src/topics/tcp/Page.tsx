import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import networking from '../../bank/cats/networking.json'
import { acceptQueue, closing, deadPeer, nagle, timeWait } from './flows'

const toc = [
  { id: 'queues', label: 'Queues & TIME_WAIT' },
  { id: 'close', label: 'FIN vs RST' },
  { id: 'timing', label: 'Timing & silence' },
]

export default function TcpPage() {
  return (
    <div className="tcp">
      <TopicHero
        slug="tcp"
        title="TCP edge cases"
        lead="Silent accept-queue drops, TIME_WAIT, RST versus FIN, Nagle stalls, and peers that die quietly."
        toc={toc}
      />

      <Section id="queues" n="01" kicker="Connect · close" title="Queues, TIME_WAIT and port limits">
        <Flow title="A full accept queue" def={acceptQueue} />
        <Flow title="TIME_WAIT and ports" def={timeWait} />
      </Section>

      <Section id="close" n="02" kicker="FIN · RST · EPIPE" title="Close is not one thing">
        <Flow title="FIN, half-close, RST" def={closing} />
      </Section>

      <Section id="timing" n="03" kicker="Nagle · keepalive" title="Timers, stalls and silent peers">
        <Flow title="Nagle meets delayed ACK" def={nagle} />
        <Flow title="Dead and stuck peers" def={deadPeer} />
      </Section>

      <Section id="asked" n="04" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[networking]}
          ids={[
            'networking-keep-alive',
            'networking-long-lived-tcp-connections',
            'networking-tcp-acks',
            'networking-sockets',
            'networking-tcp-vs-udp',
            'networking-http-timeouts',
            'networking-http-transport-config',
            'networking-debug-requests-not-arriving',
          ]}
        />
      </Section>

      <NextTopic slug="tcp" />
    </div>
  )
}
