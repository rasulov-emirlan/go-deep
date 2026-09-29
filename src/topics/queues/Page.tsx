import { Link } from 'react-router-dom'
import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import messaging from '../../bank/cats/messaging.json'
import architecture from '../../bank/cats/architecture.json'
import { QueueLab } from './QueueLab'
import { chooseStory, logStory, pubsubStory, sqsStory } from './stories'
import './queues.css'

const toc = [
  { id: 'log', label: 'Log vs queue' },
  { id: 'sqs', label: 'SQS' },
  { id: 'pubsub', label: 'Pub/Sub' },
  { id: 'choose', label: 'How to choose' },
  { id: 'asked', label: 'Asked' },
]

// [row, Kafka, SQS, Pub/Sub]; `!` marks the strong cell
const compare: [string, string, string, string][] = [
  ['Replay', '!yes (offset)', 'no', 'seek, if kept'],
  ['Order', 'per partition', 'FIFO: per group', 'per key'],
  ['Fan‑out', '!one group each', 'no (add SNS)', '!one sub each'],
  ['Ops', 'run brokers', '!fully managed', '!fully managed'],
]

export default function QueuesPage() {
  return (
    <>
      <TopicHero
        slug="queues"
        title={
          <>
            Kafka vs SQS vs <span className="r">Pub/Sub</span>
          </>
        }
        lead="A log keeps messages so anyone can reread them; a queue deletes each one once it is done."
        toc={toc}
      />

      <Section id="log" n="01" kicker="Log vs queue" title="Keep it, or delete it">
        <p className="prose">
          Partitions and consumer groups are on the <Link to="/kafka">Kafka page</Link>.
        </p>
        <Story title="Two readers, three messages" frames={logStory} />
        <QueueLab />
      </Section>

      <Section id="sqs" n="02" kicker="Amazon SQS" title="SQS: hide it, then delete it">
        <Story title="Two workers, one queue" frames={sqsStory} />
      </Section>

      <Section id="pubsub" n="03" kicker="Google Pub/Sub" title="Pub/Sub: a copy per subscription">
        <Story title="One topic, two subscriptions" frames={pubsubStory} />
      </Section>

      <Section id="choose" n="04" kicker="Trade-offs" title="How to choose">
        <Story title="Which one?" frames={chooseStory} />
        <table className="queues-table">
          <thead>
            <tr>
              <th />
              <th>Kafka</th>
              <th>SQS</th>
              <th>Pub/Sub</th>
            </tr>
          </thead>
          <tbody>
            {compare.map(([row, ...cells]) => (
              <tr key={row}>
                <th>{row}</th>
                {cells.map((c, i) => (
                  <td key={i} className={c.startsWith('!') ? 'good' : undefined}>
                    {c.replace(/^!/, '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[messaging, architecture]}
          ids={[
            'messaging-message-brokers',
            'messaging-choosing-a-broker',
            'messaging-kafka-vs-rabbitmq',
            'messaging-pub-sub',
            'messaging-kafka-retention-unconsumed',
            'messaging-kafka-pull-model',
            'architecture-service-communication',
          ]}
        />
      </Section>

      <NextTopic slug="queues" />
    </>
  )
}
