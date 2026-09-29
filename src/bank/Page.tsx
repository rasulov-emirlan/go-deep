import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Code } from '../components/Code'
import { buildSession, exportDeck, importDeck, isDue, mastered, record, resetDeck, useDeck, type Deck, type Grade } from '../lib/srs'
import { Lesson } from './Lesson'
import { Md } from './Md'
import { QActions } from './QActions'
import { allQuestions } from './data'
import { categories, kindLabel, type Kind, type Question } from './types'
import './bank.css'

const all = allQuestions
const catBy = Object.fromEntries(categories.map((c) => [c.slug, c]))
const groups = [...new Set(categories.map((c) => c.group))]
const companies = new Set(all.flatMap((q) => q.asked)).size
/** interview write-ups the bank was built from */
const NOTES = 96

type Status = 'new' | 'due' | 'learning' | 'mastered'
function status(deck: Deck, id: string, now: number): Status {
  const c = deck[id]
  if (!c) return 'new'
  if (isDue(c, now)) return 'due'
  return mastered(c) ? 'mastered' : 'learning'
}

export default function BankPage() {
  const [params, setParams] = useSearchParams()
  const cats = useMemo(() => (params.get('cat') ?? '').split(',').filter((c) => catBy[c]), [params])
  const mode = params.get('mode') === 'browse' ? 'browse' : 'drill'
  const [kind, setKind] = useState<Kind | ''>('')
  const deck = useDeck()
  const [now, setNow] = useState(() => Date.now())
  const refresh = useCallback(() => setNow(Date.now()), [])

  useEffect(() => {
    document.title = 'Interview questions — Go Deep'
  }, [])

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const toggleCat = (slug: string) => set('cat', (cats.includes(slug) ? cats.filter((c) => c !== slug) : [...cats, slug]).join(','))

  const pool = all.filter((q) => (!cats.length || cats.includes(q.cat)) && (!kind || q.kind === kind))
  const count = (qs: Question[], s: Status) => qs.filter((q) => status(deck, q.id, now) === s).length
  const seen = all.filter((q) => deck[q.id]).length

  return (
    <div className="bank">
      <section className="hero">
        <div className="wrap">
          <span className="kicker">// question bank</span>
          <h1>
            Interview <span className="r">drill</span>.
          </h1>
          <p className="lede">
            {all.length} questions from {NOTES} real Go backend interviews at {companies} companies, deduplicated and answered. Drill them with spaced repetition. Progress stays in this browser.
          </p>
          <div className="bank-stats">
            <Stat n={count(all, 'mastered')} label="mastered" />
            <Stat n={count(all, 'learning')} label="learning" />
            <Stat n={count(all, 'due')} label="due now" red />
            <Stat n={all.length - seen} label="new" />
          </div>
        </div>
      </section>

      <section className="wrap bank-filters">
        {groups.map((g) => (
          <div key={g} className="bank-group">
            <span className="kicker">{g}</span>
            <div className="bank-chips">
              {categories
                .filter((c) => c.group === g)
                .map((c) => {
                  const qs = all.filter((q) => q.cat === c.slug)
                  if (!qs.length) return null
                  const m = qs.filter((q) => mastered(deck[q.id])).length
                  return (
                    <button key={c.slug} className={'bank-chip' + (cats.includes(c.slug) ? ' on' : '')} onClick={() => toggleCat(c.slug)} aria-pressed={cats.includes(c.slug)}>
                      {c.title} <span className="n">{qs.length}</span>
                      <span className="bar" style={{ width: `${(m / qs.length) * 100}%` }} />
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
        <div className="bank-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind | '')} aria-label="Question type">
            <option value="">All types</option>
            {(Object.keys(kindLabel) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabel[k]}
              </option>
            ))}
          </select>
          {cats.length > 0 && (
            <button className="btn ghost sm" onClick={() => set('cat', '')}>
              Clear topics
            </button>
          )}
          <span className="bank-pool">
            {pool.length} in selection · {count(pool, 'due')} due · {count(pool, 'new')} new
          </span>
          <div className="bank-tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'drill'} className={mode === 'drill' ? 'on' : ''} onClick={() => set('mode', '')}>
              Drill
            </button>
            <button role="tab" aria-selected={mode === 'browse'} className={mode === 'browse' ? 'on' : ''} onClick={() => set('mode', 'browse')}>
              Browse
            </button>
          </div>
        </div>
      </section>

      <section className="wrap bank-body">
        {mode === 'drill' ? <Drill key={cats.join() + kind} pool={pool} deck={deck} now={now} onDone={refresh} /> : <Browse pool={pool} deck={deck} now={now} />}
      </section>

      <section className="wrap bank-tools">
        <ProgressTools />
      </section>
    </div>
  )
}

function Stat({ n, label, red }: { n: number; label: string; red?: boolean }) {
  return (
    <div className={'bank-stat' + (red && n ? ' red' : '')}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  )
}

const checked = (q: Question) =>
  q.kind === 'output' ? 'output checked with go run' : q.kind === 'sql' || q.cat === 'databases' ? 'ran against PostgreSQL 18' : 'solution compiled and run'

function Meta({ q }: { q: Question }) {
  const c = catBy[q.cat]
  return (
    <div className="qmeta">
      <span className="kicker">
        {c?.title} · {kindLabel[q.kind]}
      </span>
      {q.n > 1 && <span className={'lvl' + (q.n >= 4 ? ' hot' : '')}>asked ×{q.n}</span>}
      {q.level === 3 && <span className="lvl hard">senior</span>}
    </div>
  )
}

function Drill({ pool, deck, now, onDone }: { pool: Question[]; deck: Deck; now: number; onDone: () => void }) {
  const [size, setSize] = useState(10)
  const [queue, setQueue] = useState<Question[] | null>(null)
  const [pos, setPos] = useState(0)
  const [shown, setShown] = useState(false)
  const [tally, setTally] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0 })
  const [again, setAgain] = useState<Set<string>>(new Set())

  const upcoming = buildSession(pool, deck, now, size, (q) => q.n * 10 - q.level)
  const q = queue?.[pos]

  const start = () => {
    setQueue(upcoming)
    setPos(0)
    setShown(false)
    setTally({ 1: 0, 2: 0, 3: 0 })
    setAgain(new Set())
  }
  const rate = (g: Grade) => {
    if (!queue || !q) return
    record(q.id, g)
    setTally((t) => ({ ...t, [g]: t[g] + 1 }))
    // a miss comes back once at the end of this session
    if (g === 1 && !again.has(q.id)) {
      setQueue([...queue, q])
      setAgain(new Set(again).add(q.id))
    }
    setPos(pos + 1)
    setShown(false)
  }

  const over = !!queue && pos >= queue.length
  useEffect(() => {
    if (over) onDone()
  }, [over, onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || (e.target as HTMLElement).closest('input, textarea, select')) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setShown(true)
      } else if (shown && ['1', '2', '3'].includes(e.key)) rate(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue || !q) {
    const finished = queue && queue.length > 0
    return (
      <div className="drill-start">
        {finished && (
          <div className="drill-done">
            <span className="kicker red">Session done</span>
            <p>
              <b>{tally[3]}</b> knew · <b>{tally[2]}</b> shaky · <b>{tally[1]}</b> missed. Missed cards come back first next time; known ones wait 1, 3, 7, then 21 days.
            </p>
          </div>
        )}
        {upcoming.length ? (
          <>
            <p>
              Next session: <b>{upcoming.filter((x) => deck[x.id]).length}</b> due for review, <b>{upcoming.filter((x) => !deck[x.id]).length}</b> new (most-asked first).
            </p>
            <div className="bank-row">
              <label className="kicker">
                Cards{' '}
                <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                  {[5, 10, 20, 40].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button className="btn" onClick={start}>
                {finished ? 'Another round →' : 'Start drill →'}
              </button>
            </div>
          </>
        ) : (
          <p>Nothing due in this selection. Come back later, pick more topics, or browse.</p>
        )}
      </div>
    )
  }

  return (
    <article className="qcard" aria-live="polite">
      <div className="qprog">
        <span className="kicker">
          {pos + 1} / {queue.length}
        </span>
        <span className="qbar" style={{ width: `${(pos / queue.length) * 100}%` }} />
      </div>
      <Meta q={q} />
      <div className="qtext">
        <Md text={q.q} />
      </div>
      {q.code && <Code>{q.code}</Code>}
      <QActions q={q} />
      {!shown ? (
        <button className="btn" onClick={() => setShown(true)}>
          Show answer <span className="key">space</span>
        </button>
      ) : (
        <>
          <div className="qans">
            <span className="kicker red">Answer{q.verified ? ' · ' + checked(q) : ''}</span>
            <Md text={q.a} />
            <Lesson id={q.id} />
          </div>
          <div className="qgrade">
            <span className="kicker">How did you do?</span>
            <button className="btn ghost" onClick={() => rate(1)}>
              ✗ Didn’t know <span className="key">1</span>
            </button>
            <button className="btn ghost" onClick={() => rate(2)}>
              ~ Shaky <span className="key">2</span>
            </button>
            <button className="btn" onClick={() => rate(3)}>
              ✓ Knew it <span className="key">3</span>
            </button>
          </div>
        </>
      )}
      {q.asked.length > 0 && <p className="qasked">Asked at {q.asked.join(', ')}</p>}
    </article>
  )
}

const label: Record<Status, string> = { new: 'new', due: 'due', learning: 'learning', mastered: 'mastered' }

function Browse({ pool, deck, now }: { pool: Question[]; deck: Deck; now: number }) {
  const [text, setText] = useState('')
  const needle = text.trim().toLowerCase()
  const hits = needle ? pool.filter((q) => (q.q + ' ' + (q.code ?? '') + ' ' + q.a).toLowerCase().includes(needle)) : pool
  return (
    <div>
      <input className="bank-search" placeholder="Search questions and answers…" value={text} onChange={(e) => setText(e.target.value)} />
      {categories.map((c) => {
        const qs = hits.filter((q) => q.cat === c.slug).sort((a, b) => b.n - a.n)
        if (!qs.length) return null
        return (
          <div key={c.slug} className="browse-cat">
            <h3>
              {c.title} <span className="n">{qs.length}</span>
            </h3>
            {qs.map((q) => {
              const s = status(deck, q.id, now)
              return (
                <details key={q.id} className={'bq ' + s}>
                  <summary>
                    <span className={'dot ' + s} title={label[s]} />
                    <span className="bq-q">{q.q.split('\n')[0]}</span>
                    {q.kind !== 'theory' && <span className="lvl">{kindLabel[q.kind]}</span>}
                    {q.n > 1 && <span className={'lvl' + (q.n >= 4 ? ' hot' : '')}>×{q.n}</span>}
                  </summary>
                  <div className="bq-body">
                    {q.q.includes('\n') && <Md text={q.q.split('\n').slice(1).join('\n')} />}
                    {q.code && <Code>{q.code}</Code>}
                    <QActions q={q} />
                    <div className="qans">
                      <span className="kicker red">Answer{q.verified ? ' · ' + checked(q) : ''}</span>
                      <Md text={q.a} />
                      <Lesson id={q.id} />
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
                      <span className="kicker">{label[s]}</span>
                    </div>
                    {q.asked.length > 0 && <p className="qasked">Asked at {q.asked.join(', ')}</p>}
                  </div>
                </details>
              )
            })}
          </div>
        )
      })}
      {!hits.length && <p>No matches.</p>}
    </div>
  )
}

function ProgressTools() {
  const [msg, setMsg] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportDeck())
      setMsg('Progress copied. Paste it into Import on another device.')
    } catch {
      setMsg('Clipboard blocked by the browser.')
    }
  }
  const load = () => {
    const s = prompt('Paste exported progress JSON')
    if (!s) return
    try {
      importDeck(s)
      setMsg('Imported.')
    } catch {
      setMsg('That is not exported progress.')
    }
  }
  const reset = () => {
    if (confirm('Forget all drill progress in this browser?')) {
      resetDeck()
      setMsg('Progress reset.')
    }
  }
  return (
    <div className="bank-row">
      <span className="kicker">Progress</span>
      <button className="btn ghost sm" onClick={copy}>
        Export
      </button>
      <button className="btn ghost sm" onClick={load}>
        Import
      </button>
      <button className="btn ghost sm" onClick={reset}>
        Reset
      </button>
      {msg && <span className="bank-pool">{msg}</span>}
    </div>
  )
}
