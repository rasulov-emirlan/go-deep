import { Link } from 'react-router-dom'
import { groups, topics } from './topics/registry'
import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    document.title = 'Go Deep — Go interview prep, in pictures'
  }, [])
  return (
    <>
      <div className="hero">
        <div className="wrap hero-home">
          <img className="hero-gopher" src="/gophers/superhero-flying.webp" alt="" />
          <span className="kicker">// go interview prep, in pictures</span>
          <h1>
            Don’t memorize Go.
            <br />
            <span className="r">Watch</span> it work.
          </h1>
          <p>
            Short picture stories about Go and backend basics. Each one pauses on the part interviewers ask about.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <Link to="/interview" className="bank-cta">
            <span className="kicker red">New · question bank</span>
            <b>Interview drill →</b>
            <span>Hundreds of real interview questions with answers. Flashcards bring back the ones you missed.</span>
          </Link>
          <Link to="/challenges" className="bank-cta">
            <span className="kicker red">New · write code</span>
            <b>Coding challenges →</b>
            <span>Coding tasks from real interviews. Write Go in the browser and run the checks in the Go Playground.</span>
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <span className="kicker red">Curriculum</span>
          <h2>Topics</h2>
          {groups.map((g) => (
            <div key={g} className="tgroup">
              <span className="kicker">{g}</span>
              <div className="tgrid">
                {topics
                  .filter((t) => t.group === g)
                  .map((t) => {
                    const live = !!t.page
                    const inner = (
                      <>
                        <span className="kicker">
                          {t.n} · {t.kicker}
                        </span>
                        {t.gopher && <img className="tcard-gopher" src={`/gophers/${t.gopher}.webp`} alt="" />}
                        <h3>{t.title}</h3>
                        <p>{t.blurb}</p>
                        <span className="go">{live ? 'Start →' : 'Coming soon'}</span>
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
          ))}
        </div>
      </section>
      <section className="section">
        <div className="wrap prose">
          <span className="kicker red">How each topic works</span>
          <h2>Story → try it → real questions</h2>
          <ol>
            <li>
              <b>Stories</b>: gophers act it out, one sentence per step. Press Next, or Autoplay. It pauses on the tricky parts.
            </li>
            <li>
              <b>Try it</b>: at most one small toy per topic, where clicking beats reading.
            </li>
            <li>
              <b>Real questions</b>: asked in real interviews, with answers. Mark what you knew; it feeds the <Link to="/interview">drill</Link>.
            </li>
          </ol>
        </div>
      </section>
    </>
  )
}
