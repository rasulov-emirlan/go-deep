import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import channels from '../../bank/cats/channels.json'
import { ChanLab } from './ChanLab'
import { anatomy, deadlockLeak, handoff, nilClosed, selectStory } from './stories'
import './channels.css'

const toc = [
  { id: 'hchan', label: 'hchan' },
  { id: 'handoff', label: 'Handoff vs buffer' },
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
        lead="A channel is a locked queue with two waiting rooms; everything else, from panics to deadlocks, follows from that."
        toc={toc}
      />

      <Section id="hchan" n="01" kicker="runtime/chan.go" title="A lock, a ring, two queues">
        <p className="prose">Every channel is one heap struct. Senders arrive from the left and receivers from the right.</p>
        <Story title="hchan anatomy" frames={anatomy} />
      </Section>

      <Section id="handoff" n="02" kicker="Unbuffered vs buffered" title="Handshake or mailbox">
        <p className="prose">An unbuffered channel is a meeting point. A buffered one lets the sender leave the value and walk away, until the buffer is full.</p>
        <Story title="Handoff, then buffer" frames={handoff} />
      </Section>

      <Section id="nil-closed" n="03" kicker="The table everyone asks" title="nil and closed channels">
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
        <ChanLab />
      </Section>

      <Section id="select" n="04" kicker="select" title="Wait on many, run one">
        <p className="prose">
          <code>select</code> is how a goroutine waits for whichever channel is ready first, with an optional timeout or way out.
        </p>
        <Story title="select, default, nil, timeout" frames={selectStory} />
      </Section>

      <Section id="deadlock" n="05" kicker="Failure modes" title="Deadlock is loud, leaks are silent">
        <Story title="Deadlock vs goroutine leak" frames={deadlockLeak} />
      </Section>

      <Section id="asked" n="06" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[channels]}
          ids={[
            'channels-hchan-internals',
            'channels-buffered-vs-unbuffered',
            'channels-nil-closed-behavior',
            'channels-who-closes',
            'channels-select',
            'channels-select-closed-send-panic',
            'channels-non-blocking-select',
            'channels-deadlock',
          ]}
        />
      </Section>
      <NextTopic slug="channels" />
    </>
  )
}
