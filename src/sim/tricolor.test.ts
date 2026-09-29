import { describe, expect, it } from 'vitest'
import { scenarios, runAll, start, stepOne, paintTown, type Barrier, type Scenario } from './tricolor'

const all: Barrier[] = ['none', 'dijkstra', 'yuasa', 'hybrid']

describe('tri-color scenarios', () => {
  for (const sc of scenarios)
    for (const b of all)
      it(`${sc.id} with ${b} barrier ${sc.needs.includes(b) ? 'is safe' : 'loses a live object'}`, () => {
        const s = runAll(sc, b)
        expect(s.dangling.length === 0).toBe(sc.needs.includes(b))
      })

  it('only the hybrid barrier survives every scenario', () => {
    for (const b of all) expect(scenarios.every((sc) => runAll(sc, b).dangling.length === 0)).toBe(b === 'hybrid')
  })

  it('true garbage is still collected', () => {
    const s = runAll(scenarios[0], 'hybrid')
    expect(s.objs.find((x) => x.id === 'D')!.freed).toBe(true)
  })
})

describe('typed events and the plain run', () => {
  const kinds = (sc: Scenario, b: Barrier) => {
    const s = start(sc, b)
    while (!s.done) stepOne(sc, s)
    return { s, k: s.events.map((e) => e.kind) }
  }

  it('stepOne splits drain into one scan per call and ends like runAll', () => {
    for (const sc of scenarios)
      for (const b of all) {
        const { s } = kinds(sc, b)
        const r = runAll(sc, b)
        expect(s.dangling).toEqual(r.dangling)
        expect(s.objs.map((x) => [x.id, x.color, !!x.freed])).toEqual(r.objs.map((x) => [x.id, x.color, !!x.freed]))
      }
  })

  it('plain run: allocate-black, garbage cycle freed, everything reachable survives', () => {
    const { s, k } = kinds(paintTown, 'none')
    expect(k).toContain('alloc-black')
    expect(s.objs.find((x) => x.id === 'N')!.color).toBe('black')
    expect(s.objs.filter((x) => x.freed).map((x) => x.id).sort()).toEqual(['E', 'F'])
    expect(k).toContain('sweep-cycle')
    expect(k.at(-1)).toBe('safe')
    expect(k.filter((x) => x === 'scan-black')).toHaveLength(4) // A B C D, N is never scanned
    expect(k.indexOf('mark-done')).toBeLessThan(k.indexOf('sweep-free'))
  })

  it('barrier events name the half that fired', () => {
    expect(kinds(scenarios[0], 'dijkstra').k).toContain('barrier-insertion')
    expect(kinds(scenarios[0], 'yuasa').k).toContain('barrier-deletion')
    expect(kinds(scenarios[0], 'yuasa').k).toContain('black-to-white')
    expect(kinds(scenarios[0], 'none').k.at(-1)).toBe('lost')
    expect(kinds(scenarios[0], 'hybrid').k).toContain('insert-skipped')
    expect(kinds(scenarios[1], 'none').k).toContain('stack-write')
    expect(kinds(scenarios[2], 'hybrid').k).toContain('barrier-insertion')
    expect(kinds(scenarios[2], 'hybrid').k).not.toContain('insert-skipped')
  })
})
