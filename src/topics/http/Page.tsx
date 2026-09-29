import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import networking from '../../bank/cats/networking.json'
import { RttLab } from './RttLab'
import { anatomy, keepAlive, urlToByte, versions } from './stories'
import './http.css'

const toc = [
  { id: 'url', label: 'URL to response' },
  { id: 'anatomy', label: 'Requests & retries' },
  { id: 'pool', label: 'Reusing connections' },
  { id: 'versions', label: 'HTTP/1.1, 2, 3' },
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
        lead="Every request waits for trips across the network; most of HTTP’s progress is about making fewer."
        toc={toc}
      />

      <Section id="url" n="01" kicker="DNS · TCP · TLS" title="From URL to response">
        <Story title="https://example.com, first visit" frames={urlToByte} />
        <RttLab />
      </Section>

      <Section id="anatomy" n="02" kicker="Methods · status codes" title="Which requests are safe to retry">
        <Story title="Requests, codes, retries" frames={anatomy} />
      </Section>

      <Section id="pool" n="03" kicker="http.Client" title="Reusing connections in Go">
        <Story title="The connection pool" frames={keepAlive} />
      </Section>

      <Section id="versions" n="04" kicker="HTTP/1.1 · 2 · 3" title="One slow thing blocks the rest">
        <Story title="From one lane to QUIC" frames={versions} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[networking]}
          ids={[
            'networking-url-to-response-flow',
            'networking-http-message-structure',
            'networking-http-status-codes',
            'networking-http-methods-idempotency',
            'networking-keep-alive',
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
