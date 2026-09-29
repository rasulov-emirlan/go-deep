import { describe, expect, it } from 'vitest'
import { analyze } from './quorum'

/** every way to pick k of n replicas */
function subsets(n: number, k: number): number[][] {
  const out: number[][] = []
  const go = (start: number, cur: number[]) => {
    if (cur.length === k) return void out.push(cur)
    for (let i = start; i < n; i++) go(i + 1, [...cur, i])
  }
  go(0, [])
  return out
}

describe('quorum overlap', () => {
  it('matches brute force: the smallest intersection of any write set and read set is max(0, W+R-N)', () => {
    for (const n of [3, 5])
      for (let w = 1; w <= n; w++)
        for (let r = 1; r <= n; r++) {
          let min = n
          for (const ws of subsets(n, w))
            for (const rs of subsets(n, r)) min = Math.min(min, ws.filter((x) => rs.includes(x)).length)
          expect(analyze(n, w, r).overlap, `N=${n} W=${w} R=${r}`).toBe(min)
        }
  })
  it('stale reads are possible exactly when W+R <= N', () => {
    expect(analyze(3, 1, 1).stale).toBe(true)
    expect(analyze(3, 2, 1).stale).toBe(true)
    expect(analyze(3, 2, 2).stale).toBe(false)
    expect(analyze(3, 3, 1).stale).toBe(false)
  })
  it('the worst-case placement really is disjoint when stale', () => {
    const q = analyze(3, 1, 2)
    expect(q.writeSet).toEqual([0])
    expect(q.readSet).toEqual([1, 2])
  })
  it('failure tolerance is N-W for writes and N-R for reads', () => {
    const q = analyze(3, 3, 1)
    expect(q.writeTolerates).toBe(0)
    expect(q.readTolerates).toBe(2)
  })
})
