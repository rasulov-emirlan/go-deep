import { Section } from '../../components/Lab'
import { Story } from '../../components/Story'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import genericsQ from '../../bank/cats/generics.json'
import interfacesQ from '../../bank/cats/interfaces.json'
import mapsQ from '../../bank/cats/maps.json'
import slicesQ from '../../bank/cats/slices.json'
import algorithmsQ from '../../bank/cats/algorithms.json'
import { ShapeLab } from './ShapeLab'
import { limits, shapes, typeParams, versus } from './stories'
import './generics.css'

const toc = [
  { id: 'params', label: 'Type parameters' },
  { id: 'versus', label: 'Generics vs interfaces' },
  { id: 'shapes', label: 'How Go compiles them' },
  { id: 'limits', label: 'Limits' },
  { id: 'asked', label: 'Asked' },
]

export default function GenericsPage() {
  return (
    <>
      <TopicHero
        slug="generics"
        title={
          <>
            Generics & <span className="r">GC shapes</span>
          </>
        }
        lead="Write one function for many types, and learn what Go really compiles for each."
        toc={toc}
      />

      <Section id="params" n="01" kicker="Type parameters" title="One function, many types">
        <Story title="Sum[T Num]" frames={typeParams} />
      </Section>

      <Section id="versus" n="02" kicker="any · interfaces" title="Generics or interfaces?">
        <Story title="any vs Stack[int]" frames={versus} />
      </Section>

      <Section id="shapes" n="03" kicker="GC-shape stenciling" title="One copy per shape">
        <Story title="What the compiler emits" frames={shapes} />
        <ShapeLab />
      </Section>

      <Section id="limits" n="04" kicker="Limits · Go 1.24 · 1.26" title="What generics can’t do">
        <Story title="Walls and new doors" frames={limits} />
      </Section>

      <Section id="asked" n="05" kicker="Interview prep" title="Asked in real interviews">
        <TopQuestions
          from={[genericsQ, interfacesQ, mapsQ, slicesQ, algorithmsQ]}
          ids={[
            'generics-generics-vs-any',
            'generics-map-function',
            'interfaces-empty-interface-any',
            'maps-key-types',
            'slices-unique-elements',
            'maps-group-by-key',
            'algorithms-zip-slices',
          ]}
        />
      </Section>

      <NextTopic slug="generics" />
    </>
  )
}
