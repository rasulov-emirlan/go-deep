import { Link } from 'react-router-dom'
import { challengeByBank } from '../challenges/index'
import { ShareButton } from '../challenges/Run'
import type { Question } from './types'

/** "Solve it" for questions that have a challenge, "Run it" for runnable snippets. */
export function QActions({ q }: { q: Question }) {
  const ch = challengeByBank[q.id]
  const runnable = !!q.code && /^package main\b/m.test(q.code) && /\bfunc main\(\)/.test(q.code)
  if (!ch && !runnable) return null
  return (
    <div className="qactions">
      {ch && (
        <Link className="btn sm" to={'/challenges/' + ch}>
          Solve it in the editor →
        </Link>
      )}
      {runnable && <ShareButton code={() => q.code!} />}
    </div>
  )
}
