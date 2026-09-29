import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import slicesQ from '../../bank/cats/slices.json'
import basicsQ from '../../bank/cats/go-basics.json'
import { SliceLab } from './SliceLab'
import { appendStory, funcStory, header, stringsStory } from './stories'
import './slices.css'

const toc = [
  { id: 'header', label: 'Arrays vs slices' },
  { id: 'append', label: 'append' },
  { id: 'funcs', label: 'Functions' },
  { id: 'strings', label: 'Strings' },
  { id: 'asked', label: 'Asked' },
]

export default function SlicesPage() {
  return (
    <>
      <TopicHero
        slug="slices"
        title={
          <>
            Slices & <span className="r">strings</span>
          </>
        }
        lead="A slice is a small window onto an array, and other slices may share that array."
        toc={toc}
      />

      <Section id="header" n="01" kicker="Views" title="Arrays are values, slices are views">
        <Story title="arr and s" frames={header} />
      </Section>

      <Section id="append" n="02" kicker="append" title="append: in place or a new array">
        <Story title="Two appends, one slot" frames={appendStory} />
        <SliceLab />
      </Section>

      <Section id="funcs" n="03" kicker="Pass by value" title="Passing a slice to a function">
        <Story title="grow(s)" frames={funcStory} />
      </Section>

      <Section id="strings" n="04" kicker="Bytes vs letters" title="Strings are read-only bytes">
        <Story title={'len("привет") == 12'} frames={stringsStory} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[slicesQ, basicsQ]}
          ids={[
            'slices-what-is-slice',
            'slices-vs-arrays',
            'slices-append-growth',
            'slices-append-shared-backing-two-appends',
            'slices-pass-to-function',
            'slices-nil-vs-empty',
            'go-basics-string-length-runes',
            'go-basics-string-concatenation',
          ]}
        />
      </Section>

      <NextTopic slug="slices" />
    </>
  )
}
