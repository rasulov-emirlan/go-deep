import { describe, expect, it } from 'vitest'
import { problems, resolve, type FlowDef } from './flow'

const def: FlowDef = {
  h: 200,
  steps: [
    { caption: 'a', add: [{ t: 'lane', id: 'A', x: 100, y: 10, len: 190, text: 'A' }, { t: 'lane', id: 'B', x: 400, y: 10, len: 190, text: 'B' }] },
    { caption: 'b', add: [{ t: 'msg', id: 'm1', from: 'A', to: 'B', y: 80, text: 'hi' }] },
    { caption: 'c', set: { m1: { tone: 'red' } }, drop: ['B'] },
  ],
}

describe('flow resolve', () => {
  it('folds diffs into full steps', () => {
    const r = resolve(def)
    expect(r.map((s) => s.els.length)).toEqual([2, 3, 2])
    expect(r[2].els.find((s) => s.el.id === 'm1')!.el).toMatchObject({ tone: 'red' })
    expect(r[2].els.find((s) => s.el.id === 'm1')!.born).toBe(1)
  })
  it('rejects bad ids', () => {
    expect(() => resolve({ h: 10, steps: [{ caption: '', set: { x: {} } }] })).toThrow()
    expect(() => resolve({ h: 10, steps: [{ caption: '', add: [{ t: 'text', id: 'a', x: 1, y: 1, text: 'x' }, { t: 'text', id: 'a', x: 1, y: 1, text: 'x' }] }] })).toThrow()
  })
  it('flags overlaps and overflow but allows containment', () => {
    const r = resolve({
      h: 100,
      steps: [
        {
          caption: '',
          add: [
            { t: 'box', id: 'b', x: 10, y: 10, w: 200, h: 80 },
            { t: 'text', id: 'in', x: 110, y: 50, text: 'inside' },
            { t: 'text', id: 'out', x: 540, y: 50, text: 'way too wide for the edge' },
            { t: 'text', id: 'hit', x: 205, y: 50, text: 'crosses the border' },
          ],
        },
      ],
    })
    const p = problems(r[0], 100)
    expect(p.some((s) => s.includes('out sticks'))).toBe(true)
    expect(p.some((s) => s.includes('hit'))).toBe(true)
    expect(p.some((s) => / in$| in /.test(s))).toBe(false)
  })
})
