import { Link, useLocation } from 'react-router-dom'
import lessons from './lessons.json'

const sections = lessons.sections as Record<string, string[]>
const links = lessons.links as Record<string, string[]>

/** Links a question to the topic sections that animate its answer. Other pages open in a new tab so a drill isn't lost. */
export function Lesson({ id }: { id: string }) {
  const { pathname } = useLocation()
  const anchors = links[id]
  if (!anchors) return null
  return (
    <div className="qlesson">
      <span className="kicker">Watch it</span>
      {anchors.map((a) => {
        const [slug, section] = a.split('#')
        const [topic, title] = sections[a]
        const here = pathname === '/' + slug
        return (
          <Link key={a} to={`/${slug}#${section}`} {...(here ? {} : { target: '_blank', rel: 'noopener' })}>
            {here ? '' : topic + ' · '}
            {title} {here ? '↑' : '↗'}
          </Link>
        )
      })}
    </div>
  )
}
