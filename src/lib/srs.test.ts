import { describe, expect, it } from 'vitest'
import { buildSession, grade, MAX_BOX, type Deck } from './srs'

const DAY = 86_400_000

describe('leitner grading', () => {
  it('knew it climbs one box and waits longer each time', () => {
    let c = grade(undefined, 3, 0)
    expect([c.box, c.due]).toEqual([2, DAY])
    c = grade(c, 3, 0)
    expect([c.box, c.due]).toEqual([3, 3 * DAY])
  })
  it('caps at the top box', () => {
    let c = grade(undefined, 3, 0)
    for (let i = 0; i < 10; i++) c = grade(c, 3, 0)
    expect(c.box).toBe(MAX_BOX)
  })
  it("didn't know drops to box 1, due now", () => {
    const c = grade({ box: 4, due: 0, reps: 4, last: 3 }, 1, 100)
    expect([c.box, c.due, c.reps]).toEqual([1, 100, 5])
  })
  it('shaky keeps the box but comes back within a day', () => {
    const c = grade({ box: 4, due: 0, reps: 4, last: 3 }, 2, 0)
    expect([c.box, c.due]).toEqual([4, DAY])
  })
})

describe('session', () => {
  const items = [
    { id: 'a', n: 1 },
    { id: 'b', n: 5 },
    { id: 'c', n: 3 },
    { id: 'd', n: 9 },
  ]
  it('due cards first by box, then unseen by frequency, skipping not-due', () => {
    const deck: Deck = {
      a: { box: 2, due: 0, reps: 1, last: 3 },
      c: { box: 1, due: 0, reps: 1, last: 1 },
      d: { box: 3, due: 10 * DAY, reps: 3, last: 3 },
    }
    expect(buildSession(items, deck, DAY, 10, (t) => t.n).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
  it('respects size', () => {
    expect(buildSession(items, {}, 0, 2, (t) => t.n).map((t) => t.id)).toEqual(['d', 'b'])
  })
})
