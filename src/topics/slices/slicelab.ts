/**
 * A tiny, deterministic model of Go slices of int (8-byte elements) for the
 * playground: backing arrays, slice headers (array, offset, len, cap) and the
 * runtime's growth rule (runtime/slice.go nextslicecap + malloc size classes).
 */

export type Arr = { id: number; cells: number[] }
export type Header = { arr: number; off: number; len: number; cap: number }
export type Name = 'a' | 'b'
export type LabState = { arrays: Arr[]; s: Record<Name, Header>; next: number; nextId: number }

export type Op = 'append' | 'write' | 'drop1' | 'extend' | 'clip' | 'copy'
export type Result = { state: LabState; line: string; note: string; grew: boolean }

/** Largest capacity the playground draws (a phone row of cells). */
export const MAX_CAP = 16

/** Go malloc size classes up to 1 KiB (runtime/sizeclasses.go). */
const CLASSES = [8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024]

/** Capacity growslice picks for 8-byte elements (heap path). */
export function growCap(oldCap: number, newLen: number): number {
  let c = oldCap
  const dbl = c + c
  if (newLen > dbl) c = newLen
  else if (oldCap < 256) c = dbl
  else while (c < newLen) c += (c + 768) >> 2
  const bytes = c * 8
  const cls = CLASSES.find((x) => x >= bytes)
  return cls ? cls / 8 : c
}

export function initial(): LabState {
  // a := make([]int, 3, 5); b := a[:2]
  return {
    arrays: [{ id: 1, cells: [0, 0, 0, 0, 0] }],
    s: { a: { arr: 1, off: 0, len: 3, cap: 5 }, b: { arr: 1, off: 0, len: 2, cap: 5 } },
    next: 1,
    nextId: 2,
  }
}

export const initCode = ['a := make([]int, 3, 5)', 'b := a[:2]']

const other = (n: Name): Name => (n === 'a' ? 'b' : 'a')

/** Whether `op` on slice `n` is allowed in this state. */
export function can(st: LabState, n: Name, op: Op): boolean {
  const h = st.s[n]
  switch (op) {
    case 'append':
      return h.len < h.cap || growCap(h.cap, h.len + 1) <= MAX_CAP
    case 'write':
    case 'drop1':
      return h.len > 0
    case 'extend':
      return h.len < h.cap
    case 'clip':
      return h.cap > h.len
    case 'copy':
      return true
  }
}

function clone(st: LabState): LabState {
  return { ...st, arrays: st.arrays.map((a) => ({ ...a, cells: [...a.cells] })), s: { a: { ...st.s.a }, b: { ...st.s.b } } }
}

/** Arrays no header points at are garbage: drop them. */
function gc(st: LabState): LabState {
  const live = new Set([st.s.a.arr, st.s.b.arr])
  return { ...st, arrays: st.arrays.filter((a) => live.has(a.id)) }
}

export function apply(prev: LabState, n: Name, op: Op): Result {
  const st = clone(prev)
  const h = st.s[n]
  const arr = () => st.arrays.find((a) => a.id === h.arr)!
  const o = other(n)
  let line = ''
  let note = ''
  let grew = false
  switch (op) {
    case 'append': {
      const v = st.next++
      line = `${n} = append(${n}, ${v})`
      if (h.len < h.cap) {
        const idx = h.off + h.len
        const shared = st.s[o].arr === h.arr && idx < st.s[o].off + st.s[o].len && idx >= st.s[o].off
        arr().cells[idx] = v
        h.len++
        note = shared ? `len < cap: written in place, over a value ${o} can see!` : 'len < cap: written in place, no allocation.'
      } else {
        const nc = growCap(h.cap, h.len + 1)
        const old = arr().cells.slice(h.off, h.off + h.len)
        const cells = [...old, v, ...Array(nc - h.len - 1).fill(0)]
        const id = st.nextId++
        st.arrays.push({ id, cells })
        note = `len == cap: new array (cap ${h.cap} → ${nc}), ${h.len} copied.`
        st.s[n] = { arr: id, off: 0, len: h.len + 1, cap: nc }
        grew = true
      }
      break
    }
    case 'write': {
      const v = st.next++
      line = `${n}[0] = ${v}`
      arr().cells[h.off] = v
      const b = st.s[o]
      const seen = b.arr === h.arr && h.off >= b.off && h.off < b.off + b.len
      note = seen ? `Same array: ${o} sees it too.` : `Only ${n} sees this cell.`
      break
    }
    case 'drop1':
      line = `${n} = ${n}[1:]`
      h.off++
      h.len--
      h.cap--
      note = 'Pointer moves right; len and cap shrink by 1.'
      break
    case 'extend':
      line = `${n} = ${n}[:cap(${n})]`
      note = `len ${h.len} → ${h.cap}: old values in the spare cells reappear.`
      h.len = h.cap
      break
    case 'clip':
      line = `${n} = ${n}[:len(${n}):len(${n})]`
      note = `cap ${h.cap} → ${h.len}: the next append must allocate.`
      h.cap = h.len
      break
    case 'copy':
      line = `${o} = ${n}`
      st.s[o] = { ...h }
      note = 'Copies the 24-byte header only. Same array.'
      break
  }
  return { state: gc(st), line, note, grew }
}

/** What each header can see, as Go would print it. */
export function view(st: LabState, n: Name): number[] {
  const h = st.s[n]
  return st.arrays.find((a) => a.id === h.arr)!.cells.slice(h.off, h.off + h.len)
}
