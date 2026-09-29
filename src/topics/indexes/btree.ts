/**
 * A toy B+tree over a toy heap, for the lookup lab.
 * Keys 5, 10, …, 240 (48 rows). Leaves hold 8 keys, internal pages hold 3 children.
 * Rows sit in the heap in insertion order (a fixed shuffle), 4 per page, so heap fetches jump around.
 */

export type Leaf = { keys: number[]; ctids: number[] } // ctid = heap page number
export type Inner = { seps: number[]; children: number[] } // children index into the level below

export type Tree = {
  root: Inner
  inner: Inner[]
  leaves: Leaf[]
  heap: number[][] // heap[page] = keys stored on that page
}

export const LEAF_CAP = 8
export const FANOUT = 3
export const ROWS_PER_PAGE = 4
export const KEYS = Array.from({ length: 48 }, (_, i) => (i + 1) * 5)

/** Deterministic Fisher–Yates with a tiny LCG, so the heap order is fixed. */
function shuffled<T>(xs: T[], seed = 7): T[] {
  const a = [...xs]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function group<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export function buildTree(keys = KEYS): Tree {
  const heap = group(shuffled(keys), ROWS_PER_PAGE)
  const pageOf = new Map<number, number>()
  heap.forEach((rows, p) => rows.forEach((k) => pageOf.set(k, p)))
  const sorted = [...keys].sort((a, b) => a - b)
  const leaves: Leaf[] = group(sorted, LEAF_CAP).map((ks) => ({ keys: ks, ctids: ks.map((k) => pageOf.get(k)!) }))
  const inner: Inner[] = group(
    leaves.map((_, i) => i),
    FANOUT,
  ).map((ch) => ({ children: ch, seps: ch.slice(1).map((c) => leaves[c].keys[0]) }))
  const root: Inner = { children: inner.map((_, i) => i), seps: inner.slice(1).map((n) => leaves[n.children[0]].keys[0]) }
  return { root, inner, leaves, heap }
}

/** Index of the child whose subtree may hold `key` (separator = first key of the right child). */
const pick = (n: Inner, key: number) => {
  let i = 0
  while (i < n.seps.length && key >= n.seps[i]) i++
  return n.children[i]
}

export type Visit = {
  inner: number // which internal page was read
  leaves: number[] // leaf pages read, in order
  hits: number[] // matching keys
  heapPages: number[] // distinct heap pages fetched, in first-touch order
  heapFetches: number // one per matching row (a plain Index Scan)
  indexPages: number // root + inner + leaves
  seqPages: number // what a Seq Scan reads: every heap page
}

/** Look up lo..hi (a single key when lo === hi). `indexOnly` = the query needs only the key column. */
export function lookup(t: Tree, lo: number, hi: number, indexOnly = false): Visit {
  if (lo > hi) [lo, hi] = [hi, lo]
  const innerIx = pick(t.root, lo)
  let leaf = pick(t.inner[innerIx], lo)
  const leaves: number[] = []
  const hits: number[] = []
  const heapPages: number[] = []
  let heapFetches = 0
  // descend once, then walk right along the leaf links until a key passes hi
  for (;;) {
    leaves.push(leaf)
    const L = t.leaves[leaf]
    let past = false
    L.keys.forEach((k, i) => {
      if (k > hi) past = true
      else if (k >= lo) {
        hits.push(k)
        if (!indexOnly) {
          heapFetches++
          if (!heapPages.includes(L.ctids[i])) heapPages.push(L.ctids[i])
        }
      }
    })
    // like nbtree's high-key check: don't read the next leaf if it can't hold anything <= hi
    if (past || leaf + 1 >= t.leaves.length || t.leaves[leaf + 1].keys[0] > hi) break
    leaf++
  }
  return { inner: innerIx, leaves, hits, heapPages, heapFetches, indexPages: 2 + leaves.length, seqPages: t.heap.length }
}

/** Index height (pages from root to leaf) for n keys: honest log, not a toy. */
export function levels(n: number, leafCap: number, fanout: number): number {
  let pages = Math.max(1, Math.ceil(n / leafCap))
  let h = 1
  while (pages > 1) {
    pages = Math.ceil(pages / fanout)
    h++
  }
  return h
}
