/**
 * Deterministic cache-stampede model. A hot key has just expired at t = 0.
 * `n` requests arrive evenly over `windowMs`, spread round-robin across `pods`.
 * The DB runs at most `dbConns` queries at once (FIFO queue), each taking `queryMs`.
 * The first query to finish refills the cache; later arrivals are hits.
 */
export type Mode = 'none' | 'singleflight' | 'swr'
export type Outcome = 'db' | 'wait' | 'hit' | 'stale'
export type Params = { n: number; pods: number; mode: Mode; windowMs?: number; queryMs?: number; dbConns?: number; hitMs?: number }
export type Result = { dbQueries: number; peakQueue: number; p50: number; p99: number; max: number; outcomes: Outcome[]; latencies: number[] }

export function simulate({ n, pods, mode, windowMs = 100, queryMs = 50, dbConns = 20, hitMs = 1 }: Params): Result {
  const free: number[] = Array(dbConns).fill(0) // when each DB slot frees up
  const starts: number[] = []
  const asked: number[] = []
  const runQuery = (t: number) => {
    asked.push(t)
    let k = 0
    for (let j = 1; j < free.length; j++) if (free[j] < free[k]) k = j
    const start = Math.max(t, free[k])
    free[k] = start + queryMs
    starts.push(start)
    return free[k]
  }
  let filledAt = Infinity // shared cache refilled
  const leaderDone = new Map<number, number>() // pod -> its in-flight query's finish time
  const outcomes: Outcome[] = []
  const latencies: number[] = []
  for (let i = 0; i < n; i++) {
    const t = (i * windowMs) / n
    const pod = i % pods
    if (t >= filledAt) {
      outcomes.push('hit')
      latencies.push(hitMs)
      continue
    }
    if (mode === 'none') {
      const done = runQuery(t)
      filledAt = Math.min(filledAt, done)
      outcomes.push('db')
      latencies.push(done - t)
      continue
    }
    const inflight = leaderDone.get(pod)
    const own = inflight === undefined
    const done = own ? runQuery(t) : inflight
    if (own) {
      leaderDone.set(pod, done)
      filledAt = Math.min(filledAt, done)
    }
    if (mode === 'swr') {
      outcomes.push('stale')
      latencies.push(hitMs)
    } else {
      outcomes.push(own ? 'db' : 'wait')
      latencies.push(done - t)
    }
  }
  // peak number of queries waiting for a free DB slot (arrivals and starts are both FIFO-ordered)
  let peakQueue = 0
  for (let i = 0, started = 0; i < asked.length; i++) {
    while (started < starts.length && starts[started] <= asked[i]) started++
    peakQueue = Math.max(peakQueue, i + 1 - started)
  }
  const sorted = [...latencies].sort((a, b) => a - b)
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0)
  return { dbQueries: starts.length, peakQueue, p50: pct(0.5), p99: pct(0.99), max: sorted[sorted.length - 1] ?? 0, outcomes, latencies }
}
