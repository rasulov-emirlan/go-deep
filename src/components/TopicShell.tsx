import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { liveTopics } from '../topics/registry'
import { Further } from './Further'
import { Rate } from './Rate'

export function TopicHero({ slug, title, lead, toc }: { slug: string; title: ReactNode; lead: ReactNode; toc: { id: string; label: string }[] }) {
  const t = liveTopics.find((x) => x.slug === slug)!
  return (
    <div className="hero">
      <div className="wrap">
        <span className="kicker">
          {t.n} — {t.kicker}
        </span>
        <h1>{title}</h1>
        <p>{lead}</p>
        <nav className="toc">
          {toc.map((x, i) => (
            <a key={x.id} href={'#' + x.id}>
              {String(i + 1).padStart(2, '0')} {x.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function NextTopic({ slug }: { slug: string }) {
  const i = liveTopics.findIndex((x) => x.slug === slug)
  const next = liveTopics[(i + 1) % liveTopics.length]
  return (
    <section className="section">
      <div className="wrap">
        <Further slug={slug} />
        <Rate topic={slug} />
        <span className="kicker">Next up</span>
        <h2>
          <Link to={'/' + next.slug} style={{ textDecoration: 'none' }}>
            {next.n} {next.title} →
          </Link>
        </h2>
        <p style={{ color: 'var(--g500)', maxWidth: '40rem' }}>{next.blurb}</p>
      </div>
    </section>
  )
}

