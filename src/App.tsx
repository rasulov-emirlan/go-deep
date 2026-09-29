import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { topics } from './topics/registry'
import Home from './Home'

const Bank = lazy(() => import('./bank/Page'))
const Challenges = lazy(() => import('./challenges/List'))
const Solve = lazy(() => import('./challenges/Solve'))
const Scratch = lazy(() => import('./challenges/Scratch'))
const loading = <div className="wrap" style={{ padding: '4rem 1.25rem' }}><span className="kicker">Loading…</span></div>

function ScrollTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) return window.scrollTo(0, 0)
    // topic pages load lazily, so the section may not exist yet
    const find = () => document.getElementById(decodeURIComponent(hash.slice(1)))
    if (find()) return find()!.scrollIntoView()
    const obs = new MutationObserver(() => {
      if (!find()) return
      obs.disconnect()
      find()!.scrollIntoView()
    })
    obs.observe(document.body, { childList: true, subtree: true })
    const stop = setTimeout(() => obs.disconnect(), 5000)
    return () => {
      obs.disconnect()
      clearTimeout(stop)
    }
  }, [pathname, hash])
  return null
}

function TopicRoute() {
  const { slug } = useParams()
  const t = topics.find((x) => x.slug === slug)
  useEffect(() => {
    document.title = t ? `${t.title} — Go Deep` : 'Go Deep'
  }, [t])
  if (!t?.page) return <NotFound />
  const Page = t.page
  return (
    <Suspense fallback={loading}>
      <Page />
    </Suspense>
  )
}

function NotFound() {
  return (
    <div className="wrap" style={{ padding: '5rem 1.25rem' }}>
      <span className="kicker red">404</span>
      <h1>Not here (yet).</h1>
      <p>
        <Link to="/">← All topics</Link>
      </p>
    </div>
  )
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand">
            <span className="mark" />
            go deep
          </Link>
          <nav className="topnav">
            <NavLink to="/" end>
              Topics
            </NavLink>
            <NavLink to="/interview">Q bank</NavLink>
            <NavLink to="/challenges">Code</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/interview"
            element={
              <Suspense fallback={loading}>
                <Bank />
              </Suspense>
            }
          />
          <Route
            path="/challenges"
            element={
              <Suspense fallback={loading}>
                <Challenges />
              </Suspense>
            }
          />
          <Route
            path="/challenges/:id"
            element={
              <Suspense fallback={loading}>
                <Solve />
              </Suspense>
            }
          />
          <Route
            path="/playground"
            element={
              <Suspense fallback={loading}>
                <Scratch />
              </Suspense>
            }
          />
          <Route path="/:slug" element={<TopicRoute />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="foot">
        <div className="wrap">
          <span>Go Deep · Go interview prep, in pictures</span>
          <span>Checked on Go 1.26 · code runs in the Go Playground</span>
        </div>
      </footer>
    </>
  )
}
