/**
 * The append lab: `a := []int{1, 2, 3, 4}; b := a[:2]`, then `b = append(b, v)`
 * again and again. While b has spare cap it writes into a's array; once full,
 * append copies b into a new array (runtime/slice.go nextslicecap + size classes).
 */

/** Go malloc size classes up to 128 B (runtime/sizeclasses.go). */
const CLASSES = [8, 16, 24, 32, 48, 64, 80, 96, 112, 128]

/** Capacity growslice picks for 8-byte elements (heap path, small caps). */
export function growCap(oldCap: number, newLen: number): number {
  const c = newLen > 2 * oldCap ? newLen : 2 * oldCap
  const cls = CLASSES.find((x) => x >= c * 8)
  return cls ? cls / 8 : c
}

export type LabState = {
  a: number[] // a's backing array; a sees all 4
  b: { cells: number[]; len: number; shared: boolean } // b's backing array
  next: number
}

/** What the last append did. */
export type Event = 'start' | 'overwrote' | 'moved' | 'inplace'

/** The lab stops once b would need a second new array. */
export const MAX_CAP = 8

export function initial(): LabState {
  const a = [1, 2, 3, 4]
  return { a, b: { cells: a, len: 2, shared: true }, next: 7 }
}

export const canAppend = (st: LabState) => st.b.len < st.b.cells.length || growCap(st.b.cells.length, st.b.len + 1) <= MAX_CAP

export function append(st: LabState): { state: LabState; event: Event } {
  const v = st.next
  const { cells, len, shared } = st.b
  if (len < cells.length) {
    const out = [...cells]
    out[len] = v
    const state = { a: shared ? out : st.a, b: { cells: out, len: len + 1, shared }, next: v + 1 }
    return { state, event: shared ? 'overwrote' : 'inplace' }
  }
  const nc = growCap(cells.length, len + 1)
  const out = [...cells.slice(0, len), v, ...Array(nc - len - 1).fill(0)]
  return { state: { a: st.a, b: { cells: out, len: len + 1, shared: false }, next: v + 1 }, event: 'moved' }
}

export const view = (st: LabState) => st.b.cells.slice(0, st.b.len)
