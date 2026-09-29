import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Md } from '../bank/Md'
import { Code } from '../components/Code'
import { bundle } from '../lib/playground'
import { loadDraft, markSolved, saveDraft, useSolved } from '../lib/solved'
import { challenges, harness } from './data'
import { Result, ShareButton } from './Run'
import { useRunner } from './useRunner'
import { allQuestions } from '../bank/data'
import './challenges.css'

const GoEditor = lazy(() => import('../components/GoEditor'))
const LEVEL = ['', 'Easy', 'Medium', 'Hard']

export default function Solve() {
  const { id } = useParams()
  const i = challenges.findIndex((c) => c.id === id)
  const c = challenges[i]
  const solved = useSolved()
  const [code, setCode] = useState(() => (c ? (loadDraft(c.id) ?? c.starter) : ''))
  const [gen, setGen] = useState(0)
  const [show, setShow] = useState<'' | 'hint' | 'solution' | 'checks'>('')
  const { out, busy, err, run, clear } = useRunner()
  const q = useMemo(() => allQuestions.find((x) => x.id === c?.bank), [c])

  useEffect(() => {
    if (c) document.title = `${c.title} — Go Deep`
  }, [c])
  if (!c)
    return (
      <div className="wrap" style={{ padding: '4rem 1.25rem' }}>
        <h1>No such challenge.</h1>
        <Link to="/challenges">← All challenges</Link>
      </div>
    )
  const next = challenges[(i + 1) % challenges.length]
  const test = async () => {
    const o = await run(bundle(code, { 'check.go': c.check, 'harness.go': harness }), true)
    if (o?.kind === 'pass') markSolved(c.id)
  }
  const edit = (s: string) => {
    setCode(s)
    saveDraft(c.id, s === c.starter ? null : s)
  }

  return (
    <div className="wrap solve">
      <div className="solve-head">
        <Link to="/challenges" className="kicker">
          ← Challenges
        </Link>
        <h1>
          {c.title} {solved[c.id] && <span className="solved-mark">✓ solved</span>}
        </h1>
        <span className="kicker">
          <span className={'lvl l' + c.level}>{LEVEL[c.level]}</span>
          {q && ` · asked in ${q.n} interview${q.n > 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="solve-grid">
        <div className="solve-prompt prose">
          <Md text={c.prompt} />
          <div className="solve-more">
            {c.hint && (
              <button className={'btn ghost sm' + (show === 'hint' ? ' on' : '')} onClick={() => setShow(show === 'hint' ? '' : 'hint')}>
                Hint
              </button>
            )}
            <button className={'btn ghost sm' + (show === 'checks' ? ' on' : '')} onClick={() => setShow(show === 'checks' ? '' : 'checks')}>
              See the checks
            </button>
            <button className={'btn ghost sm' + (show === 'solution' ? ' on' : '')} onClick={() => setShow(show === 'solution' ? '' : 'solution')}>
              Solution
            </button>
          </div>
          {show === 'hint' && <p className="solve-hint">{c.hint}</p>}
          {show === 'checks' && <Code light>{c.check}</Code>}
          {show === 'solution' && <Code light>{c.solution}</Code>}
        </div>
        <div className="solve-code">
          <Suspense fallback={<pre className="goeditor-loading">{code}</pre>}>
            <GoEditor key={gen} value={code} onChange={edit} onRun={test} label={`Your solution to ${c.title}`} />
          </Suspense>
          <div className="solve-actions">
            <button className="btn" onClick={test} disabled={busy}>
              ▶ Run tests
            </button>
            <ShareButton code={() => bundle(code, { 'check.go': c.check, 'harness.go': harness })} />
            <button
              className="btn ghost"
              onClick={() => {
                if (code !== c.starter && !confirm('Throw away your code and start over?')) return
                edit(c.starter)
                setGen(gen + 1)
                clear()
              }}
            >
              Reset
            </button>
          </div>
          <p className="solve-note">Runs in the official Go Playground sandbox (Go’s latest release). Ctrl/⌘ + Enter runs the tests.</p>
          <Result out={out} err={err} busy={busy} />
          {out?.kind === 'pass' && (
            <Link to={'/challenges/' + next.id} className="btn">
              Next: {next.title} →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
