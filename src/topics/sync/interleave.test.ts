import { describe, expect, it } from 'vitest'
import { allOutcomes, canStep, finished, init, run, step } from './interleave'

describe('interleave', () => {
  it('sequential runs give 2', () => {
    expect(run(false, [0, 0, 0, 1, 1, 1]).n).toBe(2)
    expect(run(false, [1, 1, 1, 0, 0, 0]).n).toBe(2)
  })

  it('load, load, … loses an update', () => {
    const s = run(false, [0, 1, 0, 0, 1, 1])
    expect(finished(s)).toBe(true)
    expect(s.n).toBe(1)
    expect(s.log).toEqual(['G1 LOAD n → r=0', 'G2 LOAD n → r=0', 'G1 ADD r=1', 'G1 STORE r → n=1', 'G2 ADD r=1', 'G2 STORE r → n=1'])
  })

  it('18 of 20 unlocked interleavings lose an update', () => {
    const all = allOutcomes(false)
    expect(all).toHaveLength(20)
    expect(all.filter((o) => o.n === 1)).toHaveLength(18)
    expect(all.filter((o) => o.n === 2)).toHaveLength(2)
  })

  it('with a mutex every interleaving gives 2', () => {
    const all = allOutcomes(true)
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((o) => o.n === 2)).toBe(true)
  })

  it('a goroutine blocks on LOCK while the other holds it', () => {
    const s = step(init(true), 0)
    expect(s.holder).toBe(0)
    expect(canStep(s, 1)).toBe(false)
    expect(step(s, 1)).toBe(s)
    const t = run(true, [0, 0, 0, 0, 0])
    expect(t.holder).toBe(null)
    expect(canStep(t, 1)).toBe(true)
  })

  it('stepping a finished goroutine is a no-op', () => {
    const s = run(false, [0, 0, 0])
    expect(step(s, 0)).toBe(s)
  })
})
