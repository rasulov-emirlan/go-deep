import { describe, expect, it } from 'vitest'
import { build, index, layout, ms, PROFILE, TARGET, top, verdict } from './flame'

const root = build(PROFILE)
const idx = index(root)

describe('flame profile', () => {
  it('totals 1000 samples = 10 s of CPU', () => {
    expect(root.cum).toBe(1000)
    expect(ms(root.cum)).toBe('10.00s')
    expect(ms(60)).toBe('600ms')
  })
  it('cum = flat + children cum', () => {
    for (const n of idx.values()) expect(n.cum).toBe(n.flat + n.children.reduce((s, c) => s + c.cum, 0))
    const mc = idx.get(TARGET)!
    expect(mc.flat).toBe(60)
    expect(mc.cum).toBe(310)
  })
  it('lays children inside their parent, widths proportional to cum', () => {
    const rects = layout(root)
    expect(rects[0]).toMatchObject({ id: 'root', x: 0, w: 1 })
    const byId = new Map(rects.map((r) => [r.id, r]))
    for (const r of rects) {
      const p = idx.get(r.id)!.parent
      if (!p) continue
      const pr = byId.get(p)!
      expect(r.x).toBeGreaterThanOrEqual(pr.x - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(pr.x + pr.w + 1e-9)
      expect(r.w).toBeCloseTo(r.cum / 1000)
    }
  })
  it('zoom: focus fills the width, ancestors stay, siblings vanish', () => {
    const rects = layout(root, TARGET)
    const f = rects.find((r) => r.id === TARGET)!
    expect(f).toMatchObject({ x: 0, w: 1 })
    expect(rects.filter((r) => r.depth < f.depth).every((r) => r.w === 1 && TARGET.startsWith(r.id))).toBe(true)
    expect(rects.some((r) => r.name.includes('json'))).toBe(false)
    expect(rects.find((r) => r.name === 'regexp/syntax.Parse')!.w).toBeCloseTo(110 / 310)
  })
  it('top sums flat across stacks: mallocgc appears 3 times', () => {
    const t = top(root, 5)
    expect(t[0]).toEqual({ name: 'json.(*encodeState).reflectValue', flat: 160, cum: 220 })
    expect(t[1]).toEqual({ name: 'runtime.mallocgc', flat: 150, cum: 150 })
    expect(t.map((x) => x.name)).toContain('regexp/syntax.Parse')
  })
  it('verdicts', () => {
    expect(verdict(root, TARGET).kind).toBe('yes')
    expect(verdict(root, TARGET + ';regexp/syntax.Parse').kind).toBe('close')
    expect(verdict(root, 'root;runtime.gcBgMarkWorker').kind).toBe('no')
    expect(verdict(root, 'root;net/http.(*conn).serve;api.handleOrders').text).toMatch(/callees/)
    expect(verdict(root, 'nope').kind).toBe('no')
  })
})
