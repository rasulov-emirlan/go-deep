/**
 * Offset-commit crash model. One partition of N messages, one consumer.
 * The consumer runs a plan of ops, crashes after `crashAfter` of them, and a
 * replacement resumes from the last committed offset and finishes cleanly.
 */
export type Mode = 'before' | 'after'
export type Op = { kind: 'commit'; to: number } | { kind: 'process'; msg: number }

/** The ops a consumer runs from offset `from`, committing once per batch. */
export function plan(mode: Mode, batch: number, n: number, from = 0): Op[] {
  const ops: Op[] = []
  for (let s = from; s < n; s += batch) {
    const end = Math.min(s + batch, n)
    const work: Op[] = []
    for (let m = s; m < end; m++) work.push({ kind: 'process', msg: m })
    const commit: Op = { kind: 'commit', to: end }
    if (mode === 'before') ops.push(commit, ...work)
    else ops.push(...work, commit)
  }
  return ops
}

export type Outcome = {
  run1: Op[] // full plan of the first consumer
  done: number // how many of run1 executed before the crash
  crashed: boolean
  resumeAt: number
  run2: Op[] // the replacement's plan (empty if no crash)
  applied: number[] // times each message's side effect took place
  skipped: number[] // times a replay was recognized and skipped
  verdict: 'exactly' | 'effectively' | 'lost' | 'dup' | 'lost+dup'
}

export function simulate(o: { mode: Mode; batch: number; n: number; crashAfter: number; idempotent: boolean }): Outcome {
  const run1 = plan(o.mode, o.batch, o.n)
  const done = Math.max(0, Math.min(o.crashAfter, run1.length))
  const crashed = done < run1.length
  const applied = new Array<number>(o.n).fill(0)
  const skipped = new Array<number>(o.n).fill(0)
  let committed = 0
  const exec = (op: Op) => {
    if (op.kind === 'commit') committed = op.to
    else if (o.idempotent && applied[op.msg] > 0) skipped[op.msg]++
    else applied[op.msg]++
  }
  run1.slice(0, done).forEach(exec)
  const resumeAt = committed
  const run2 = crashed ? plan(o.mode, o.batch, o.n, resumeAt) : []
  run2.forEach(exec)
  const lost = applied.some((c) => c === 0)
  const dup = applied.some((c) => c > 1)
  const verdict = lost && dup ? 'lost+dup' : lost ? 'lost' : dup ? 'dup' : skipped.some((c) => c > 0) ? 'effectively' : 'exactly'
  return { run1, done, crashed, resumeAt, run2, applied, skipped, verdict }
}

export const opLabel = (op: Op) => (op.kind === 'commit' ? `commit ${op.to}` : `m${op.msg}`)
