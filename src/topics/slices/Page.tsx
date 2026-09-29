import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import slicesQ from '../../bank/cats/slices.json'
import basicsQ from '../../bank/cats/go-basics.json'
import { SliceLab } from './SliceLab'
import { appendStory, funcStory, header, stringsStory, subStory } from './stories'
import './slices.css'

const toc = [
  { id: 'header', label: 'The header' },
  { id: 'append', label: 'append' },
  { id: 'sub', label: 'Sub-slices' },
  { id: 'funcs', label: 'Functions' },
  { id: 'strings', label: 'Strings' },
  { id: 'lab', label: 'Playground' },
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
        lead="A slice is three words pointing into an array you share with everyone else; almost every slice puzzle follows from that."
        toc={toc}
      />

      <Section id="header" n="01" kicker="ptr · len · cap" title="Arrays are values, slices are views">
        <p className="prose">An array owns its elements. A slice is a small header that points into one.</p>
        <Story title="The slice header" frames={header} />
      </Section>

      <Section id="append" n="02" kicker="runtime.growslice" title="append: in place or a new array">
        <p className="prose">If there is spare capacity, append writes in place. If not, it copies everything into a bigger array.</p>
        <Story title="Two appends, one slot" frames={appendStory} />
      </Section>

      <Section id="sub" n="03" kicker="s[low:high:max]" title="Sub-slices share the parent">
        <p className="prose">A sub-slice keeps the parent’s spare capacity, so appending to it can overwrite the parent.</p>
        <Story title="Overwriting the parent" frames={subStory} />
      </Section>

      <Section id="funcs" n="04" kicker="Pass by value" title="Passing a slice to a function">
        <p className="prose">The function gets a copy of the header. It shares the elements, but not len or cap.</p>
        <Story title="grow(s)" frames={funcStory} />
      </Section>

      <Section id="strings" n="05" kicker="Bytes vs runes" title="Strings are read-only bytes">
        <p className="prose">A string is a pointer and a length with no cap, and you cannot write through it.</p>
        <Story title={'len("привет") == 12'} frames={stringsStory} />
      </Section>

      <Section id="lab" n="06" kicker="Try it" title="Slice playground">
        <p className="prose">Two headers, one array. Break them apart: append on b until it overwrites a, then fill a until it moves out.</p>
        <SliceLab />
      </Section>

      <Section id="asked" n="07" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[slicesQ, basicsQ]}
          ids={[
            'slices-what-is-slice',
            'slices-append-growth',
            'slices-append-shared-backing-two-appends',
            'slices-append-subslice-overwrites-parent',
            'slices-append-in-func-spare-capacity',
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
