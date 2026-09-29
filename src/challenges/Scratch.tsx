import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadDraft, saveDraft } from '../lib/solved'
import { Result, ShareButton } from './Run'
import { useRunner } from './useRunner'
import './challenges.css'

const GoEditor = lazy(() => import('../components/GoEditor'))
const HELLO = `package main

import "fmt"

func main() {
	s := []int{1, 2, 3}
	t := append(s[:1], 9)
	fmt.Println(s, t)
}
`

/** A blank Go scratchpad that runs in the Go Playground. */
export default function Scratch() {
  const [code, setCode] = useState(() => loadDraft('scratch') ?? HELLO)
  const { out, busy, err, run } = useRunner()
  useEffect(() => {
    document.title = 'Go playground — Go Deep'
  }, [])
  const go = () => run(code, false)
  return (
    <div className="wrap solve">
      <div className="solve-head">
        <Link to="/challenges" className="kicker">
          ← Challenges
        </Link>
        <h1>Playground</h1>
        <span className="kicker">Try any Go snippet. It runs in the official Go Playground.</span>
      </div>
      <div className="solve-code wide">
        <Suspense fallback={<pre className="goeditor-loading">{code}</pre>}>
          <GoEditor
            value={code}
            onChange={(s) => {
              setCode(s)
              saveDraft('scratch', s)
            }}
            onRun={go}
            label="Go code"
          />
        </Suspense>
        <div className="solve-actions">
          <button className="btn" onClick={go} disabled={busy}>
            ▶ Run
          </button>
          <ShareButton code={() => code} />
        </div>
        <Result out={out} err={err} busy={busy} />
      </div>
    </div>
  )
}
