/**
 * Dynamo-style quorum arithmetic for N replicas: a write waits for W acks, a read waits for R replies.
 * Worst case: the write landed on the FIRST w replicas, the read asks the LAST r replicas.
 */
export type Quorum = {
  n: number
  w: number
  r: number
  /** replicas that hold the newest acked write (worst-case placement) */
  writeSet: number[]
  /** replicas the read asks (worst-case placement) */
  readSet: number[]
  /** replicas in both sets: at least this many, always */
  overlap: number
  /** true when some read set can miss every acked write */
  stale: boolean
  /** replicas that may be down while writes / reads still succeed */
  writeTolerates: number
  readTolerates: number
}

export function analyze(n: number, w: number, r: number): Quorum {
  const writeSet = Array.from({ length: w }, (_, i) => i)
  const readSet = Array.from({ length: r }, (_, i) => n - r + i)
  const overlap = Math.max(0, w + r - n)
  return { n, w, r, writeSet, readSet, overlap, stale: w + r <= n, writeTolerates: n - w, readTolerates: n - r }
}
