import { Link } from 'react-router-dom'
import { topics } from './topics/registry'
import { useProgress } from './lib/progress'
import { useEffect } from 'react'

export default function Home() {
  const { countPrefix } = useProgress()
  useEffect(() => {
    document.title = 'Go Deep — the Go runtime, interactively'
  }, [])
  return (
    <>
      <div className="hero">
        <div className="wrap">
          <span className="kicker">// senior go, from the runtime up</span>
          <h1>
            Don’t memorize the runtime.
            <br />
            <span className="r">Watch</span> it work.
          </h1>
          <p>
            Step through the scheduler, probe a Swiss table byte by byte, and break the garbage collector by switching its write barrier off. Every lab is a small, tested model of the Go 1.26
            source, and every puzzle output was run on a real toolchain.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <span className="kicker red">Curriculum</span>
          <h2>Topics</h2>
          <div className="tgrid">
            {topics.map((t) => {
              const live = !!t.page
              const done = countPrefix(`quiz:${t.slug}.`) + countPrefix(`iv:${t.slug}:`)
              const inner = (
                <>
                  <span className="kicker">
                    {t.n} · {t.kicker}
                  </span>
                  <h3>{t.title}</h3>
                  <p>{t.blurb}</p>
                  <span className="go">{live ? (done ? `${done} solved →` : 'Start →') : 'Coming soon'}</span>
                </>
              )
              return live ? (
                <Link key={t.slug} to={'/' + t.slug} className="tcard">
                  {inner}
                </Link>
              ) : (
                <div key={t.slug} className="tcard soon">
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap prose">
          <span className="kicker red">How each topic works</span>
          <h2>Model → lab → puzzles → interview</h2>
          <ol>
            <li>
              <b>Mental model</b> — the few structs and rules that explain everything else, with pointers into the runtime source.
            </li>
            <li>
              <b>Labs</b> — deterministic simulations you can step, rewind and poke. Red outlines show what just changed; the log says why.
            </li>
            <li>
              <b>Puzzles</b> — predict-the-output and multiple choice, with the reasoning behind each answer.
            </li>
            <li>
              <b>Interview questions</b> — tagged core / senior / staff. Mark the ones you know; progress stays in this browser.
            </li>
          </ol>
        </div>
      </section>
    </>
  )
}
