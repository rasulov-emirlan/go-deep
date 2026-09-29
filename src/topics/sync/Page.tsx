import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import syncQs from '../../bank/cats/sync.json'
import { RaceLab } from './RaceLab'
import { lostUpdate, mutexStory, toolbox, waitGroup } from './stories'
import './sync.css'

const toc = [
  { id: 'race', label: 'Data races' },
  { id: 'mutex', label: 'Mutex' },
  { id: 'wg', label: 'WaitGroup' },
  { id: 'tools', label: 'Atomics & co' },
  { id: 'asked', label: 'Asked' },
]

export default function SyncPage() {
  return (
    <>
      <TopicHero
        slug="sync"
        title={
          <>
            sync & <span className="r">data races</span>
          </>
        }
        lead="Why n++ loses updates, and which tool from sync or sync/atomic fixes each kind of sharing."
        toc={toc}
      />

      <Section id="race" n="01" kicker="Data races" title="n++ is three steps">
        <p className="prose">Two goroutines, one counter, no lock. Watch an increment vanish.</p>
        <Story title="The lost update" frames={lostUpdate} />
        <RaceLab />
      </Section>

      <Section id="mutex" n="02" kicker="sync.Mutex · RWMutex" title="One at a time, fairly">
        <p className="prose">A mutex is one CAS when free. Contention is where the interesting parts are.</p>
        <Story title="Inside Lock and Unlock" frames={mutexStory} />
      </Section>

      <Section id="wg" n="03" kicker="sync.WaitGroup" title="A counter main can wait on">
        <Story title="Add, Done, Wait" frames={waitGroup} />
      </Section>

      <Section id="tools" n="04" kicker="sync/atomic · Once · Map · Pool" title="The rest of the toolbox">
        <Story title="Pick the right tool" frames={toolbox} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[syncQs]}
          ids={[
            'sync-primitives-overview',
            'sync-data-race',
            'sync-race-condition-vs-data-race',
            'sync-mutex-internals',
            'sync-rwmutex-writer-starvation',
            'sync-waitgroup-by-value-puzzle',
            'sync-atomics-vs-mutex',
            'sync-map-when-to-use',
          ]}
        />
      </Section>
      <NextTopic slug="sync" />
    </>
  )
}
