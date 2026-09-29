/**
 * Toy model behind the jitter picture: N clients all fail at t=0 and every retry also fails (worst case),
 * so what we get is WHEN the retries would arrive under each backoff policy. Seeded, so the picture is stable.
 */
export type Policy = 'fixed' | 'expo' | 'full' | 'equal' | 'decorrelated'

export type Opts = { clients: number; retries: number; base: number; cap: number; seed: number }

export const DEFAULTS: Opts = { clients: 100, retries: 5, base: 100, cap: 1600, seed: 7 }

/** small deterministic PRNG (mulberry32), returns [0,1) */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** arrival time (ms) of every retry from every client */
export function retryTimes(policy: Policy, o: Opts = DEFAULTS): number[] {
  const rand = rng(o.seed)
  const out: number[] = []
  for (let c = 0; c < o.clients; c++) {
    let t = 0
    let prev = o.base
    for (let n = 0; n < o.retries; n++) {
      const temp = Math.min(o.cap, o.base * 2 ** n)
      let wait: number
      switch (policy) {
        case 'fixed':
          wait = o.base
          break
        case 'expo':
          wait = temp
          break
        case 'full':
          wait = rand() * temp
          break
        case 'equal':
          wait = temp / 2 + rand() * (temp / 2)
          break
        case 'decorrelated':
          wait = Math.min(o.cap, o.base + rand() * (prev * 3 - o.base))
          prev = wait
          break
      }
      t += wait
      out.push(t)
    }
  }
  return out
}

/** retries per bucket, for buckets of `bucket` ms from 0 to `horizon` */
export function histogram(times: number[], bucket: number, horizon: number): number[] {
  const bins = new Array<number>(Math.ceil(horizon / bucket)).fill(0)
  for (const t of times) {
    const i = Math.floor(t / bucket)
    if (i < bins.length) bins[i]++
  }
  return bins
}

export const peak = (bins: number[]) => Math.max(0, ...bins)
