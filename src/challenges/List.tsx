import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { categories } from '../bank/types'
import { allQuestions } from '../bank/data'
import { useSolved } from '../lib/solved'
import { challenges } from './data'
import './challenges.css'

const LEVEL = ['', 'Easy', 'Medium', 'Hard']
const groups = [...new Set(categories.map((c) => c.group))].filter((g) => challenges.some((c) => categories.find((x) => x.slug === c.cat)?.group === g))

export default function List() {
  const solved = useSolved()
  const [params, setParams] = useSearchParams()
  const group = params.get('g') ?? ''
  const [level, setLevel] = useState(0)
  useEffect(() => {
    document.title = 'Coding challenges — Go Deep'
  }, [])
  const shown = challenges.filter((c) => (!group || categories.find((x) => x.slug === c.cat)?.group === group) && (!level || c.level === level))
  const done = challenges.filter((c) => solved[c.id]).length
  return (
    <>
      <div className="hero">
        <div className="wrap">
          <span className="kicker">// write it, run it</span>
          <h1>
            Coding <span className="r">challenges</span>
          </h1>
          <p>Coding tasks from real Go interviews. Write the function, run the checks in the Go Playground, see what fails.</p>
          <p className="ch-stats">
            <b>{done}</b> of {challenges.length} solved · <Link to="/playground">Blank playground →</Link>
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <div className="ch-filters">
            <div className="seg" role="group" aria-label="Area">
              {['', ...groups].map((g) => (
                <button key={g} className={g === group ? 'on' : ''} aria-pressed={g === group} onClick={() => setParams(g ? { g } : {})}>
                  {g || 'All'}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Level">
              {[0, 1, 2, 3].map((l) => (
                <button key={l} className={l === level ? 'on' : ''} aria-pressed={l === level} onClick={() => setLevel(l)}>
                  {l ? LEVEL[l] : 'Any level'}
                </button>
              ))}
            </div>
          </div>
          <ol className="ch-list">
            {shown.map((c) => {
              const n = allQuestions.find((q) => q.id === c.bank)?.n ?? 0
              return (
                <li key={c.id}>
                  <Link to={'/challenges/' + c.id} className={solved[c.id] ? 'done' : ''}>
                    <span className="ch-check">{solved[c.id] ? '✓' : ''}</span>
                    <span className="ch-title">{c.title}</span>
                    <span className="ch-meta">
                      {categories.find((x) => x.slug === c.cat)?.title}
                      {n > 1 && ` · asked ${n}×`}
                    </span>
                    <span className={'lvl l' + c.level}>{LEVEL[c.level]}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
          {!shown.length && <p>No challenges here yet.</p>}
        </div>
      </section>
    </>
  )
}
