import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import devops from '../../bank/cats/devops.json'
import networking from '../../bank/cats/networking.json'
import { gray, k8s, partitions, phiAccrual, slowOrDead, splitBrain, stonith, swim } from './flows'

const toc = [
  { id: 'silence', label: 'Slow or dead?' },
  { id: 'swim', label: 'SWIM gossip' },
  { id: 'partial', label: 'Gray & partial failures' },
  { id: 'split', label: 'Split brain & fencing' },
  { id: 'k8s', label: 'Kubernetes timings' },
]

export default function Page() {
  return (
    <div className="fd">
      <TopicHero slug="failure-detection" title="Failure detection &amp; partitions" lead="Slow or dead? Heartbeats, gossip, gray failures and split brain." toc={toc} />

      <Section id="silence" n="01" kicker="Timeouts · phi-accrual" title="A timeout is only a guess">
        <p>A dead node, a slow node and a lost packet all look the same from outside. TCP will not tell you either: an idle connection to a dead peer can stay “open” for hours (Linux TCP keepalive is off unless the program enables it, then starts at 7200 s; Go’s dialer enables it at 15 s), so heartbeats live in the application.</p>
        <Flow title="Slow or dead?" def={slowOrDead} />
        <Flow title="Fixed timeout vs phi-accrual" def={phiAccrual} />
      </Section>

      <Section id="swim" n="02" kicker="SWIM · memberlist" title="Gossip on a ring of nodes">
        <p>SWIM separates finding failures from telling everyone. Defaults below are hashicorp/memberlist’s LAN config, which Serf and Consul build on. The ring is only a way to draw it: any member can ping any other.</p>
        <Flow title="One SWIM round" def={swim} />
      </Section>

      <Section id="partial" n="03" kicker="Gray failure · partial partitions" title="Half-broken is worse than broken">
        <p>A study of several Microsoft datacenters counted 5.2 failing devices and 40.8 failing links per day on average (as reported by Bailis &amp; Kingsbury). Most trouble is partial, one-way or gray, not a clean cut.</p>
        <Flow title="Gray failure: up, but useless" def={gray} />
        <Flow title="Partitions vs a leader" def={partitions} />
      </Section>

      <Section id="split" n="04" kicker="Quorum · fencing · STONITH" title="Two leaders at once">
        <p>False suspicion plus a still-running old primary gives split brain. Majorities help, but only fencing stops a primary that does not know it was replaced.</p>
        <Flow title="Split brain and fencing" def={splitBrain} />
        <Flow title="STONITH, and how it misfires" def={stonith} />
      </Section>

      <Section id="k8s" n="05" kicker="Node lifecycle" title="How long until my pod moves?">
        <p>Kubernetes is a failure detector with real numbers (defaults from the source at time of writing).</p>
        <Flow title="Node goes silent" def={k8s} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, devops, networking]}
          ids={[
            'architecture-cap-theorem',
            'architecture-service-discovery',
            'architecture-fault-tolerance-patterns',
            'devops-k8s-readiness-liveness',
            'devops-behavioral-failure-handling',
            'networking-long-lived-tcp-connections',
            'networking-websocket-basics',
            'networking-http-timeouts',
          ]}
        />
      </Section>
      <NextTopic slug="failure-detection" />
    </div>
  )
}
