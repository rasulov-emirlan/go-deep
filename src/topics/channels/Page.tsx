import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import channels from '../../bank/cats/channels.json'
import { deadlockLeak, handoff, nilClosed, selectStory } from './stories'
import './channels.css'

const toc = [
  { id: 'handoff', label: 'Handshake or mailbox' },
  { id: 'nil-closed', label: 'nil & closed' },
  { id: 'select', label: 'select' },
  { id: 'deadlock', label: 'Deadlock vs leak' },
  { id: 'asked', label: 'Asked' },
]

export default function ChannelsPage() {
  return (
    <>
      <TopicHero
        slug="channels"
        title={
          <>
            Channels & <span className="r">select</span>
          </>
        }
        lead="A channel passes values between goroutines and makes them wait for each other when needed."
        toc={toc}
      />

      <Section id="handoff" n="01" kicker="Unbuffered vs buffered" title="Handshake or mailbox">
        <p className="prose">Inside, a channel is a small queue behind a lock, plus lines of goroutines waiting to send or receive.</p>
        <Story title="Handshake, then mailbox" frames={handoff} />
      </Section>

      <Section id="nil-closed" n="02" kicker="The table everyone asks" title="nil and closed channels">
        <Story title="nil, closed, who closes" frames={nilClosed} />
        <table className="ch-table">
          <thead>
            <tr>
              <th />
              <th>nil</th>
              <th>closed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ch &lt;- v</td>
              <td>blocks forever</td>
              <td className="p">panic</td>
            </tr>
            <tr>
              <td>&lt;-ch</td>
              <td>blocks forever</td>
              <td>buffer, then 0, false</td>
            </tr>
            <tr>
              <td>close(ch)</td>
              <td className="p">panic</td>
              <td className="p">panic</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section id="select" n="03" kicker="select" title="Wait on many, run one">
        <Story title="select, default, timeout" frames={selectStory} />
      </Section>

      <Section id="deadlock" n="04" kicker="Stuck goroutines" title="Deadlock is loud, leaks are silent">
        <Story title="Deadlock vs leak" frames={deadlockLeak} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[channels]}
          ids={[
            'channels-what-and-kinds',
            'channels-buffered-vs-unbuffered',
            'channels-nil-closed-behavior',
            'channels-who-closes',
            'channels-select',
            'channels-non-blocking-select',
            'channels-select-closed-send-panic',
            'channels-deadlock',
          ]}
        />
      </Section>
      <NextTopic slug="channels" />
    </>
  )
}
