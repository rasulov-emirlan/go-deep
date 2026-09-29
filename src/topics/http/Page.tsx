import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import networking from '../../bank/cats/networking.json'
import { RttLab } from './RttLab'
import { anatomy, grpc, keepAlive, urlToByte, versions } from './stories'
import './http.css'

const toc = [
  { id: 'url', label: 'URL → first byte' },
  { id: 'anatomy', label: 'Methods & status' },
  { id: 'pool', label: 'Keep-alive in Go' },
  { id: 'versions', label: 'HTTP/1.1 → 2 → 3' },
  { id: 'grpc', label: 'gRPC' },
  { id: 'asked', label: 'Asked' },
]

export default function HttpPage() {
  return (
    <div className="ht">
      <TopicHero
        slug="http"
        title={
          <>
            HTTP, TLS & <span className="r">gRPC</span>
          </>
        }
        lead="Every request pays in round trips; the whole stack from TLS 1.3 to QUIC to keep-alive exists to pay fewer."
        toc={toc}
      />

      <Section id="url" n="01" kicker="DNS · TCP · TLS" title="URL → first byte">
        <p className="prose">Before the first byte of a response, the client pays round trips. Count them.</p>
        <Story title="https://example.com, cold start" frames={urlToByte} />
        <RttLab />
      </Section>

      <Section id="anatomy" n="02" kicker="Methods · status codes" title="What a request promises">
        <p className="prose">HTTP is text with rules. The rules that matter are which methods are safe to retry.</p>
        <Story title="Anatomy and idempotency" frames={anatomy} />
      </Section>

      <Section id="pool" n="03" kicker="http.Transport" title="Keep-alive, the Go way">
        <p className="prose">The Transport pools connections so later requests skip the handshakes. Three small mistakes silently turn that off.</p>
        <Story title="The connection pool" frames={keepAlive} />
      </Section>

      <Section id="versions" n="04" kicker="HTTP/1.1 · HTTP/2 · HTTP/3" title="Head-of-line blocking, three times">
        <p className="prose">Same methods and status codes in all three versions. Only the wire changes, each time to stop one slow thing from blocking the rest.</p>
        <Story title="From one lane to QUIC" frames={versions} />
      </Section>

      <Section id="grpc" n="05" kicker="HTTP/2 + protobuf" title="gRPC">
        <p className="prose">gRPC is a typed contract, generated code and HTTP/2 streams. The interview traps are trailers, deadlines and load balancing.</p>
        <Story title="A gRPC call" frames={grpc} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[networking]}
          ids={[
            'networking-url-to-response-flow',
            'networking-https-tls',
            'networking-http-methods-idempotency',
            'networking-keep-alive',
            'networking-http-transport-config',
            'networking-http-timeouts',
            'networking-http-versions',
            'networking-rest-vs-rpc-grpc',
          ]}
        />
      </Section>
      <NextTopic slug="http" />
    </div>
  )
}
