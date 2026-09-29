import { describe, expect, it } from 'vitest'
import { create, done, step, type EventKind } from '../../sim/sched'
import { tours } from './GuidedSched'
import { why } from './explain'

describe('guided scheduler tours', () => {
  for (const t of tours)
    it(`${t.id}: every advertised stop happens and has a why-card`, () => {
      const reached = new Set<EventKind>()
      for (const a of t.asyncToggle ? [false, true] : [true]) {
        const s = create({ ...t.cfg, asyncPreempt: a })
        while (!done(s) && s.tick <= 60) step(s)
        s.events.forEach((e) => reached.add(e.kind))
      }
      for (const k of t.stops) {
        expect(reached.has(k), `${t.id} never reaches ${k}`).toBe(true)
        expect(why[k], `no why-card for ${k}`).toBeTruthy()
      }
    })
})
