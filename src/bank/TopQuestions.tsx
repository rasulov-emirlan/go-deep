import { Link } from 'react-router-dom'
import { Code } from '../components/Code'
import { record, useDeck } from '../lib/srs'
import { Md } from './Md'
import { QActions } from './QActions'
import { kindLabel, type Question } from './types'
import './bank.css'

/**
 * The most-asked real interview questions for a topic, answers folded.
 * Pass the category files you imported (`import q from '../../bank/cats/channels.json'`)
 * and optionally `ids` to hand-pick (in that order).
 */
export function TopQuestions({ from, ids, max = 6 }: { from: unknown[][]; ids?: string[]; max?: number }) {
  const pool = (from as Question[][]).flat()
  const picked = ids ? ids.map((id) => pool.find((q) => q.id === id)).filter((q): q is Question => !!q) : [...pool].sort((a, b) => b.n - a.n).slice(0, max)
  const deck = useDeck()
  const cats = [...new Set(pool.map((q) => q.cat))]
  return (
    <div className="topq">
      {picked.map((q) => (
        <details key={q.id} className="bq">
          <summary>
            <span className={'dot ' + (deck[q.id] ? (deck[q.id].box >= 4 ? 'mastered' : 'learning') : 'new')} />
            <span className="bq-q">{q.q.split('\n')[0]}</span>
            {q.kind !== 'theory' && <span className="lvl">{kindLabel[q.kind]}</span>}
            {q.n > 1 && <span className={'lvl' + (q.n >= 4 ? ' hot' : '')}>asked ×{q.n}</span>}
          </summary>
          <div className="bq-body">
            {q.q.includes('\n') && <Md text={q.q.split('\n').slice(1).join('\n')} />}
            {q.code && <Code>{q.code}</Code>}
            <QActions q={q} />
            <div className="qans">
              <span className="kicker red">Answer</span>
              <Md text={q.a} />
            </div>
            <div className="qgrade">
              <button className="btn ghost sm" onClick={() => record(q.id, 1)}>
                ✗ Didn’t know
              </button>
              <button className="btn ghost sm" onClick={() => record(q.id, 2)}>
                ~ Shaky
              </button>
              <button className="btn sm" onClick={() => record(q.id, 3)}>
                ✓ Knew it
              </button>
            </div>
          </div>
        </details>
      ))}
      <p className="bank-link">
        <Link to={`/interview?cat=${cats.join(',')}`}>Drill all {pool.length} questions on this →</Link>
      </p>
    </div>
  )
}
