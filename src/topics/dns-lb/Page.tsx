import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import networking from '../../bank/cats/networking.json'
import { drainFlow, idleFlow, l4Flow, ndotsFlow, retryFlow, ttlFlow } from './flows'

const toc = [
  { id: 'dns', label: 'DNS caches' },
  { id: 'grpc', label: 'One connection' },
  { id: 'timeouts', label: 'Who closes first' },
]

export default function DnsLbPage() {
  return (
    <div className="dl">
      <TopicHero
        slug="dns-lb"
        title="DNS &amp; load balancers"
        lead="Caching, ndots, idle timeouts, and why gRPC defeats L4 balancing."
        toc={toc}
      />

      <Section id="dns" n="01" kicker="DNS · caches" title="DNS is a stack of caches">
        <p>A TTL only steers new lookups. Then Kubernetes turns each lookup into several.</p>
        <Flow title="TTL is not failover time" def={ttlFlow} />
        <Flow title="ndots:5 amplification" def={ndotsFlow} />
      </Section>

      <Section id="grpc" n="02" kicker="L4 · gRPC" title="One connection, all the load">
        <p>An L4 balancer decides once per connection. HTTP/2 makes one connection last.</p>
        <Flow title="gRPC behind an L4 balancer" def={l4Flow} />
      </Section>

      <Section id="timeouts" n="03" kicker="Timeouts · draining" title="Who closes first">
        <p>Most 502s are a race between two sides that both decide a connection is done.</p>
        <Flow title="ALB idle timeout vs target keep-alive" def={idleFlow} />
        <Flow title="Retry on a reused connection" def={retryFlow} />
        <Flow title="Graceful shutdown order" def={drainFlow} />
      </Section>

      <Section id="asked" n="04" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[networking]}
          ids={[
            'networking-dns',
            'networking-long-lived-tcp-connections',
            'networking-keep-alive',
            'networking-grpc-basics',
            'networking-http-status-codes',
            'networking-debug-requests-not-arriving',
            'networking-http-transport-config',
            'networking-nginx-reverse-proxy',
          ]}
        />
      </Section>
      <NextTopic slug="dns-lb" />
    </div>
  )
}
