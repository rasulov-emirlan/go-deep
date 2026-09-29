import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import networking from '../../bank/cats/networking.json'
import { certFlow, mtuFlow, quicFlow, resumeFlow } from './flows'
import './tls-quic.css'

const toc = [
  { id: 'resume', label: 'Resumption & 0-RTT' },
  { id: 'certs', label: 'Certificates' },
  { id: 'path', label: 'MTU & QUIC' },
]

export default function Page() {
  return (
    <div className="tq">
      <TopicHero slug="tls-quic" title="TLS & QUIC edge cases" lead="0-RTT replay, broken chains, MTU black holes, and what QUIC changes." toc={toc} />

      <Section id="resume" n="01" kicker="Tickets · 0-RTT" title="Resumption, 0-RTT and replay">
        <p>The intro handshake is covered elsewhere. The interview starts when the connection is reused.</p>
        <Flow title="Ticket, resume, 0-RTT, replay" def={resumeFlow} />
      </Section>

      <Section id="certs" n="02" kicker="Chain · rotation" title="Certificates that break in production">
        <p>Two failures that pass every local test: a chain that only some clients can complete, and a rotation that needs a restart.</p>
        <Flow title="Missing intermediate, then rotation" def={certFlow} />
      </Section>

      <Section id="path" n="03" kicker="MTU · QUIC" title="Below TLS: packets and QUIC">
        <p>Some “TLS bugs” are packet-size bugs. QUIC changes which of these problems you have.</p>
        <Flow title="Small works, big hangs" def={mtuFlow} />
        <Flow title="Head-of-line blocking, migration, fallback" def={quicFlow} />
      </Section>

      <Section id="asked" n="04" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[networking]}
          ids={[
            'networking-https-tls',
            'networking-tls-handshake-asymmetric',
            'networking-http-versions',
            'networking-mtu',
            'networking-tcp-vs-udp',
            'networking-http-methods-idempotency',
            'networking-cdn-vs-reverse-proxy',
            'networking-http-transport-config',
          ]}
        />
      </Section>
      <NextTopic slug="tls-quic" />
    </div>
  )
}
