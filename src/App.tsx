import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { liveTopics, topics } from './topics/registry'
import Home from './Home'

const Bank = lazy(() => import('./bank/Page'))
const loading = <div className="wrap" style={{ padding: '4rem 1.25rem' }}><span className="kicker">Loading…</span></div>

function ScrollTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
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
            {liveTopics.map((t) => (
              <NavLink key={t.slug} to={'/' + t.slug}>
                {t.n} {t.title.split(' ')[0]}
              </NavLink>
            ))}
            <NavLink to="/interview">Q bank</NavLink>
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
          <Route path="/:slug" element={<TopicRoute />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="foot">
        <div className="wrap">
          <span>Go Deep · the runtime, interactively</span>
          <span>Verified against Go 1.26 source</span>
        </div>
      </footer>
    </>
  )
}
