import { describe, expect, it } from 'vitest'
import { scenarios, runAll, type Barrier } from './tricolor'

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
