import { describe, expect, it } from 'vitest'
import { create, runUntil, step, runqput, spawnOn, type Op } from './sched'

const work = (n = 2): Op[] => [{ k: 'cpu', n }]

describe('scheduler model', () => {
  it('runnext puzzle: with GOMAXPROCS=1 the LAST spawned goroutine runs first', () => {
    const s = create({ gomaxprocs: 1, main: [{ k: 'spawn', count: 5, script: work(1), label: 'g' }, { k: 'wait' }] })
    runUntil(s)
    const order = s.order.slice(1).map((id) => s.gs[id].label)
    expect(order).toEqual(['g4', 'g0', 'g1', 'g2', 'g3'])
  })

  it('newproc kicks the old runnext to the local queue tail', () => {
    const s = create({ gomaxprocs: 1, main: [{ k: 'wait' }] })
    const a = spawnOn(s, 0, work())
    const b = spawnOn(s, 0, work())
    expect(s.ps[0].runnext).toBe(b.id)
    expect(s.ps[0].runq).toEqual([a.id])
  })

  it('full local queue overflows half to the global queue (runqputslow)', () => {
    const s = create({ gomaxprocs: 1, runqCap: 8, main: [{ k: 'wait' }] })
    const p = s.ps[0]
    const ids = Array.from({ length: 9 }, () => spawnOn(s, 0, work()).id)
    s.ps[0].runq = []
    s.global = []
    s.ps[0].runnext = null
    for (const id of ids) runqput(s, p, id, false)
    expect(p.runq.length).toBe(4)
    expect(s.global).toEqual([ids[0], ids[1], ids[2], ids[3], ids[8]])
  })

  it('idle Ps steal work and all goroutines finish across Ps', () => {
    const s = create({ gomaxprocs: 4, main: [{ k: 'spawn', count: 12, script: work(4) }, { k: 'wait' }] })
    runUntil(s)
    expect(s.gs.every((g) => g.state === 'dead')).toBe(true)
    const usedPs = new Set(s.gs.flatMap((g) => g.ranOn))
    expect(usedPs.size).toBe(4)
    expect(s.stats.steals).toBeGreaterThan(0)
  })

  it('a long syscall gets its P handed off to another M', () => {
    const s = create({
      gomaxprocs: 1,
      main: [{ k: 'spawn', count: 1, script: [{ k: 'syscall', n: 8 }], label: 'reader' }, { k: 'spawn', count: 3, script: work(3) }, { k: 'wait' }],
    })
    runUntil(s)
    expect(s.stats.handoffs).toBeGreaterThan(0)
    expect(s.stats.threads).toBeGreaterThan(1)
    expect(s.gs.every((g) => g.state === 'dead')).toBe(true)
  })

  it('tight loop starves main on GOMAXPROCS=1 without async preemption', () => {
    const cfg = (asyncPreempt: boolean) =>
      create({ gomaxprocs: 1, asyncPreempt, main: [{ k: 'spawn', count: 1, script: [{ k: 'loop' }], label: 'hog' }, { k: 'sleep', n: 1 }, { k: 'cpu', n: 1 }] })
    const old = runUntil(cfg(false), 200)
    expect(old.gs[0].state).not.toBe('dead')
    expect(old.stats.ignoredPreempts).toBeGreaterThan(0)
    const now = runUntil(cfg(true), 200)
    expect(now.gs[0].state).toBe('dead')
    expect(now.stats.preemptions).toBeGreaterThan(0)
  })

  it('network waits do not consume threads', () => {
    const s = create({ gomaxprocs: 2, main: [{ k: 'spawn', count: 6, script: [{ k: 'net', n: 6 }, { k: 'cpu', n: 1 }] }, { k: 'wait' }] })
    runUntil(s)
    expect(s.gs.every((g) => g.state === 'dead')).toBe(true)
    expect(s.stats.threads).toBeLessThanOrEqual(2)
  })

  it('is deterministic', () => {
    const mk = () => runUntil(create({ gomaxprocs: 3, main: [{ k: 'spawn', count: 9, script: work(3) }, { k: 'wait' }] }))
    expect(mk().log).toEqual(mk().log)
  })

  it('step never leaves a P running a dead G', () => {
    const s = create({ gomaxprocs: 2, main: [{ k: 'spawn', count: 5, script: [{ k: 'cpu', n: 1 }, { k: 'yield' }, { k: 'cpu', n: 1 }] }, { k: 'wait' }] })
    for (let i = 0; i < 100; i++) {
      step(s)
      for (const p of s.ps) if (p.cur !== null) expect(s.gs[p.cur].state).not.toBe('dead')
    }
  })
})

describe('verified go1.26 puzzle P2 (300 goroutines, real 256-slot ring)', () => {
  it('matches overflow + %61 fairness order', () => {
    const s = create({ gomaxprocs: 1, runqCap: 256, main: [{ k: 'spawn', count: 300, script: [{ k: 'cpu', n: 1 }], label: 'g' }, { k: 'wait' }] })
    runUntil(s, 5000)
    const got = s.order.slice(1).map((id) => Number(s.gs[id].label.slice(1)))
    const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
    const want = [299, ...r(128, 186), 0, ...r(187, 246), 1, ...r(247, 255), ...r(257, 298), ...r(2, 127), 256]
    expect(got).toEqual(want)
  })
})
