import { useState, type ReactNode } from 'react'
import { Code } from './Code'
import { markDone } from '../lib/progress'

/** "Predict the output": tap the lines in the order you think they print. */
export function OrderPuzzle({ id, title, code, items, answer, explain }: { id: string; title: ReactNode; code: string; items: string[]; answer: string[]; explain: ReactNode }) {
  const [picked, setPicked] = useState<string[]>([])
  const complete = picked.length === answer.length
  const right = complete && picked.every((x, i) => x === answer[i])
  const tap = (x: string) => {
    if (complete) return
    const next = [...picked, x]
    setPicked(next)
    if (next.length === answer.length && next.every((v, i) => v === answer[i])) markDone('quiz:' + id)
  }
  const remaining = items.filter((x) => picked.filter((p) => p === x).length < answer.filter((a) => a === x).length)
  return (
    <div className="quiz">
      <div className="quiz-q">
        <span className="kicker">Predict the output · tap in order</span>
        <h4>{title}</h4>
        <Code light>{code}</Code>
        <div className="controls" style={{ marginBottom: '.6rem', minHeight: '2.1rem' }}>
          {remaining.map((x, i) => (
            <button key={x + i} className="btn ghost sm" onClick={() => tap(x)} style={{ textTransform: 'none' }}>
              {x}
            </button>
          ))}
          {!remaining.length && <span className="kicker" style={{ margin: 0 }}>all placed</span>}
        </div>
        <div className="controls" style={{ marginBottom: '.8rem' }}>
          <span className="kicker" style={{ margin: 0 }}>
            your output:
          </span>
          {picked.map((x, i) => (
            <code key={i} style={complete ? { borderColor: x === answer[i] ? '#0a0a0a' : '#e63946', color: x === answer[i] ? undefined : '#e63946' } : undefined}>
              {x}
            </code>
          ))}
          {picked.length > 0 && !complete && (
            <button className="btn ghost sm" onClick={() => setPicked(picked.slice(0, -1))}>
              undo
            </button>
          )}
        </div>
      </div>
      {complete && (
        <div className="quiz-exp">
          <span className={'kicker' + (right ? '' : ' red')}>{right ? 'Correct' : 'Real output (go1.26, verified): ' + answer.join(' ')}</span>
          {explain}
          <button className="btn ghost sm" style={{ marginTop: '.6rem' }} onClick={() => setPicked([])}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
