import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import architecture from '../../bank/cats/architecture.json'
import databases from '../../bank/cats/databases.json'
import messaging from '../../bank/cats/messaging.json'
import systemDesign from '../../bank/cats/system-design.json'
import { hlc, lamport, leapSecond, lww, truetime, twoClocks, uncertainty, vector } from './flows'

const toc = [
  { id: 'two', label: 'Wall vs monotonic' },
  { id: 'skew', label: 'Timestamps fail' },
  { id: 'logical', label: 'Lamport & vector' },
  { id: 'hybrid', label: 'Hybrid clocks' },
  { id: 'truetime', label: 'TrueTime' },
]

export default function ClocksPage() {
  return (
    <div className="ck">
      <TopicHero slug="clocks" title="Clocks &amp; ordering" lead="Why timestamps can’t order events across machines, and what to use instead." toc={toc} />

      <Section id="two" n="01" kicker="Wall vs monotonic" title="Every machine has two clocks">
        <p>The wall clock says what time it is and can jump. The monotonic clock only measures durations. Go’s time.Time carries both.</p>
        <Flow title="One time.Time, two readings" def={twoClocks} />
        <Flow title="Leap seconds and NTP" def={leapSecond} />
      </Section>

      <Section id="skew" n="02" kicker="Naive: order by timestamp" title="Timestamps can’t order events">
        <p>Simplest design: stamp every write with the local clock and keep the highest. It converges, but only as correctly as the clocks.</p>
        <Flow title="Last-write-wins with skewed clocks" def={lww} />
      </Section>

      <Section id="logical" n="03" kicker="No physical time" title="Logical clocks track cause and effect">
        <p>Count events instead of seconds. Lamport clocks give one order; vector clocks also detect concurrent writes.</p>
        <Flow title="Lamport clocks" def={lamport} />
        <Flow title="Vector clocks" def={vector} />
      </Section>

      <Section id="hybrid" n="04" kicker="HLC · CockroachDB" title="Hybrid clocks stay close to real time">
        <p>Keep logical ordering but stay near wall time, so timestamps still mean something to humans and to snapshots.</p>
        <Flow title="Hybrid logical clock" def={hlc} />
        <Flow title="Reads and uncertainty" def={uncertainty} />
      </Section>

      <Section id="truetime" n="05" kicker="Spanner" title="TrueTime: wait out the uncertainty">
        <p>Spanner does not hide clock error. It measures it, then waits it out before acknowledging a commit.</p>
        <Flow title="Commit wait" def={truetime} />
      </Section>

      <Section id="asked" n="06" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[architecture, databases, messaging, systemDesign]}
          ids={[
            'architecture-eventual-consistency',
            'databases-multi-master',
            'messaging-document-stream-processor',
            'databases-concurrent-writes-same-rows',
            'system-design-cross-region-data-verification',
            'databases-sql-row-order-uuid',
            'system-design-bank-transfers',
            'system-design-airline-tickets',
          ]}
        />
      </Section>
      <NextTopic slug="clocks" />
    </div>
  )
}
