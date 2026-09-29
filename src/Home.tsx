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
        <div className="wrap hero-home">
          <img className="hero-gopher" src="/gophers/superhero-flying.webp" alt="" />
          <span className="kicker">// senior go, from the runtime up</span>
          <h1>
            Don’t memorize the runtime.
            <br />
            <span className="r">Watch</span> it work.
          </h1>
          <p>
            Illustrated, step-by-step tours of the Go runtime. They stop at every important moment to explain what just happened and why. Each tour runs a small, tested model of the Go 1.26
            source, and every puzzle answer was checked on a real toolchain.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <Link to="/interview" className="bank-cta">
            <span className="kicker red">New · question bank</span>
            <b>Interview drill →</b>
            <span>Hundreds of real Go interview questions, deduplicated and answered, with spaced-repetition flashcards.</span>
          </Link>
        </div>
      </section>
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
                  {t.gopher && <img className="tcard-gopher" src={`/gophers/${t.gopher}.webp`} alt="" />}
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
          <h2>Story → guided tour → puzzles → interview</h2>
          <ol>
            <li>
              <b>Stories</b> — a few gophers, one change per step, one sentence of explanation. Step with Next, or press Autoplay.
            </li>
            <li>
              <b>Guided tours</b> — a tested model of the runtime plays by itself and <em>stops at every important moment</em> (a goroutine sent to the global queue, a tombstone left behind, an object
              the GC almost lost) to explain why. Press <b>OK, next</b> to continue.
            </li>
            <li>
              <b>Puzzles</b> — predict-the-output and multiple choice, with the reasoning behind each answer.
            </li>
            <li>
              <b>Interview questions</b> — tagged core / senior / staff. Mark the ones you know; progress stays in this browser.
            </li>
            <li>
              <b>Sandbox</b> — the full free-play dashboards, collapsed at the bottom of each topic.
            </li>
          </ol>
        </div>
      </section>
    </>
  )
}
