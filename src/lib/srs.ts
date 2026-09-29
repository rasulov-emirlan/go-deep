import { useSyncExternalStore } from 'react'

/**
 * Leitner-box spaced repetition, kept in localStorage.
 * Box 0 = never seen. "Knew it" moves a card up a box (a new card starts in box 2), "Shaky" keeps it
 * (at least box 1), "Didn't know" drops it back to box 1.
 */
export type Grade = 1 | 2 | 3 // didn't know · shaky · knew it
export type Card = { box: number; due: number; reps: number; last: Grade }
export type Deck = Record<string, Card>

const KEY = 'godeep.srs.v1'
const DAY = 86_400_000
/** days until a card in box i is due again */
export const INTERVAL = [0, 0, 1, 3, 7, 21]
export const MAX_BOX = INTERVAL.length - 1

export function grade(prev: Card | undefined, g: Grade, now: number): Card {
  const box = g === 3 ? Math.min(prev ? prev.box + 1 : 2, MAX_BOX) : g === 2 ? Math.max(prev?.box ?? 1, 1) : 1
  // "shaky" comes back tomorrow; "didn't know" comes back this session
  const days = g === 1 ? 0 : g === 2 ? 1 : INTERVAL[box]
  return { box, due: now + days * DAY, reps: (prev?.reps ?? 0) + 1, last: g }
}

export const isDue = (c: Card | undefined, now: number) => !!c && c.due <= now
export const mastered = (c: Card | undefined) => !!c && c.box >= 4

/**
 * Pick the next session: due cards first (lowest box first), then unseen
 * cards ordered by `rank` (most-asked first). Cards not yet due are skipped.
 */
export function buildSession<T extends { id: string }>(items: T[], deck: Deck, now: number, size: number, rank: (t: T) => number): T[] {
  const due = items.filter((t) => isDue(deck[t.id], now)).sort((a, b) => deck[a.id].box - deck[b.id].box || deck[a.id].due - deck[b.id].due)
  const fresh = items.filter((t) => !deck[t.id]).sort((a, b) => rank(b) - rank(a))
  return [...due, ...fresh].slice(0, size)
}

let cache: Deck | null = null
const subs = new Set<() => void>()

function read(): Deck {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Deck
  } catch {
    cache = {}
  }
  return cache
}

function write(next: Deck) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f())
}

function subscribe(f: () => void) {
  subs.add(f)
  return () => subs.delete(f)
}

export function record(id: string, g: Grade, now = Date.now()) {
  const d = read()
  write({ ...d, [id]: grade(d[id], g, now) })
}

export function resetDeck(ids?: string[]) {
  if (!ids) return write({})
  const d = { ...read() }
  for (const id of ids) delete d[id]
  write(d)
}

export function exportDeck() {
  return JSON.stringify(read())
}

export function importDeck(json: string) {
  const d = JSON.parse(json) as Deck
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('not a deck')
  write({ ...read(), ...d })
}

const empty: Deck = {}
export function useDeck(): Deck {
  return useSyncExternalStore(subscribe, read, () => empty)
}
