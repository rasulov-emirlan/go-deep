import { useState, type ReactNode } from 'react'
import { Code } from './Code'
import { markDone, useProgress } from '../lib/progress'

export type QuizItem = {
  id: string
  q: ReactNode
  code?: string
  options: ReactNode[]
  answer: number
  explain: ReactNode
}

const L = 'ABCDEFGH'

export function Quiz({ item, n }: { item: QuizItem; n: number }) {
  const [pick, setPick] = useState<number | null>(null)
  const { isDone } = useProgress()
  const done = isDone('quiz:' + item.id)
  const answered = pick !== null
  const choose = (i: number) => {
    if (answered) return
    setPick(i)
    if (i === item.answer) markDone('quiz:' + item.id)
  }
  return (
    <div className="quiz" id={'q-' + item.id}>
      <div className="quiz-q">
        <span className="kicker">
          Puzzle {String(n).padStart(2, '0')}
          {done && !answered ? ' · solved before' : ''}
        </span>
        <h4>{item.q}</h4>
        {item.code && <Code light>{item.code}</Code>}
      </div>
      <div className="quiz-opts">
        {item.options.map((o, i) => {
          const cls = answered ? (i === item.answer ? 'right' : i === pick ? 'wrong' : '') : ''
          return (
            <button key={i} className={'quiz-opt ' + cls} disabled={answered} onClick={() => choose(i)}>
              <span className="l">{L[i]}</span>
              <span>{o}</span>
            </button>
          )
        })}
      </div>
      {answered && (
        <div className="quiz-exp">
          <span className={'kicker' + (pick === item.answer ? '' : ' red')}>{pick === item.answer ? 'Correct' : 'Not quite — answer ' + L[item.answer]}</span>
          {item.explain}
          <button className="btn ghost sm" style={{ marginTop: '.6rem' }} onClick={() => setPick(null)}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export function QuizList({ items }: { items: QuizItem[] }) {
  return (
    <div>
      {items.map((it, i) => (
        <Quiz key={it.id} item={it} n={i + 1} />
      ))}
    </div>
  )
}
