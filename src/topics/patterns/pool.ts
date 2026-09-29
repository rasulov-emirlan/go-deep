/**
 * Deterministic worker-pool simulator.
 *
 * Jobs are taken from a shared queue in order by the first free worker (what a
 * `for j := range jobs` loop over one channel does). In `io` mode a job only
 * waits (network, disk), so every worker runs at full speed. In `cpu` mode all
 * running jobs share `cores` CPUs equally (processor sharing): with more
 * workers than cores each one slows down.
 */
export type Mode = 'io' | 'cpu'
export type Seg = { job: number; worker: number; start: number; end: number }
export type Run = { segs: Seg[]; total: number }

export const JOBS = [3, 1, 2, 4, 1, 2, 3, 1, 2, 1, 3, 2]
export const CORES = 4
const EPS = 1e-9

export function simulate(jobs: number[], workers: number, mode: Mode, cores = CORES): Run {
  const w = Math.max(1, Math.floor(workers))
  const segs: Seg[] = []
  let next = 0
  let now = 0
  // running[worker] = { job, left (work units), start }
  const running: ({ job: number; left: number; start: number } | null)[] = Array(w).fill(null)
  const fill = () => {
    for (let k = 0; k < w && next < jobs.length; k++) if (!running[k]) running[k] = { job: next, left: jobs[next++], start: now }
  }
  fill()
  while (running.some(Boolean)) {
    const active = running.filter(Boolean).length
    const speed = mode === 'cpu' ? Math.min(1, cores / active) : 1
    const dt = Math.min(...running.filter((r) => r !== null).map((r) => r.left / speed))
    now += dt
    for (let k = 0; k < w; k++) {
      const r = running[k]
      if (!r) continue
      r.left -= dt * speed
      if (r.left <= EPS) {
        segs.push({ job: r.job, worker: k, start: r.start, end: now })
        running[k] = null
      }
    }
    fill()
  }
  segs.sort((a, b) => a.job - b.job)
  return { segs, total: Math.round(now * 1000) / 1000 }
}

/** Nothing can beat this: all work spread perfectly, or the longest single job. */
export function lowerBound(jobs: number[], workers: number, mode: Mode, cores = CORES): number {
  const par = mode === 'cpu' ? Math.min(workers, cores) : workers
  return Math.max(jobs.reduce((s, d) => s + d, 0) / par, Math.max(...jobs))
}
