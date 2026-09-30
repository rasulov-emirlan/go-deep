import further from '../topics/further.json'
import lessons from '../bank/lessons.json'

export type FurtherItem = {
  url: string
  title: string
  by: string
  kind: 'interactive' | 'video' | 'article' | 'paper' | 'docs'
  lang: 'en' | 'ru'
  section?: string
  note: string
}

const all = further as Record<string, FurtherItem[]>
const sections = lessons.sections as Record<string, string[]>
const KIND = { interactive: 'Interactive', video: 'Video', article: 'Article', paper: 'Paper', docs: 'Docs' }

/** Hand-picked outside material for a topic: visual explainers, talks, deep dives. */
export function Further({ slug }: { slug: string }) {
  const items = all[slug]
  if (!items?.length) return null
  const en = items.filter((f) => f.lang === 'en')
  const ru = items.filter((f) => f.lang === 'ru')
  return (
    <div className="further">
      <span className="kicker">Go further</span>
      <h2>Watch &amp; read elsewhere</h2>
      <List slug={slug} items={en} />
      {ru.length > 0 && (
        <>
          <h3>На русском</h3>
          <List slug={slug} items={ru} />
        </>
      )}
    </div>
  )
}

function List({ slug, items }: { slug: string; items: FurtherItem[] }) {
  return (
    <ul>
      {items.map((f) => (
        <li key={f.url}>
          <span className="further-meta">
            {KIND[f.kind]}
            {f.section && (
              <>
                {' · '}
                <a href={'#' + f.section}>{sections[`${slug}#${f.section}`]?.[1]} ↑</a>
              </>
            )}
          </span>
          <a className="further-title" href={f.url} target="_blank" rel="noopener noreferrer">
            {f.title} ↗
          </a>
          <span className="further-by">{f.by}</span>
          <p>{f.note}</p>
        </li>
      ))}
    </ul>
  )
}
