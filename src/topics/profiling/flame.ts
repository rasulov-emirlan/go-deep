/**
 * A fixed synthetic CPU profile of an HTTP service, plus the pure logic the
 * flame-graph lab needs: flat/cum, icicle layout with zoom, `pprof -top`, and a
 * verdict for "which frame would you optimize first?".
 * 1 sample = 10 ms (the runtime samples at 100 Hz).
 */
export type Spec = [name: string, flat: number, children?: Spec[]]

export type FNode = { id: string; name: string; flat: number; cum: number; depth: number; parent?: string; children: FNode[] }
export type Rect = { id: string; name: string; depth: number; x: number; w: number; flat: number; cum: number }

const MALLOC = 'runtime.mallocgc'

export const PROFILE: Spec = [
  'root',
  0,
  [
    [
      'net/http.(*conn).serve',
      10,
      [
        [
          'api.handleOrders',
          20,
          [
            ['store.ListOrders', 20, [['database/sql.(*Rows).Scan', 90, [[MALLOC, 40]]]]],
            [
              'api.applyDiscounts',
              30,
              [
                [
                  'regexp.MustCompile',
                  60,
                  [
                    ['regexp/syntax.Parse', 110],
                    ['regexp.compile', 90, [[MALLOC, 50]]],
                  ],
                ],
              ],
            ],
            ['encoding/json.Marshal', 20, [['json.(*encodeState).reflectValue', 160, [[MALLOC, 60]]]]],
          ],
        ],
        ['api.handleHealth', 10],
        ['net.(*conn).Write', 10, [['syscall.Syscall6', 60]]],
      ],
    ],
    ['runtime.gcBgMarkWorker', 20, [['runtime.gcDrain', 30, [['runtime.scanobject', 110]]]]],
  ],
]

export function build(spec: Spec, parent?: FNode): FNode {
  const [name, flat, kids = []] = spec
  const id = parent ? `${parent.id};${name}` : name
  const n: FNode = { id, name, flat, cum: flat, depth: parent ? parent.depth + 1 : 0, parent: parent?.id, children: [] }
  n.children = kids.map((k) => build(k, n))
  n.cum = flat + n.children.reduce((s, c) => s + c.cum, 0)
  return n
}

export function index(root: FNode): Map<string, FNode> {
  const m = new Map<string, FNode>()
  const walk = (n: FNode) => {
    m.set(n.id, n)
    n.children.forEach(walk)
  }
  walk(root)
  return m
}

/**
 * Icicle layout (root on top, like pprof's web UI). With `focus`, that frame
 * fills the width, its ancestors span full width, and everything else is hidden.
 * Children sit left to right in the given order: x means nothing about time.
 */
export function layout(root: FNode, focus?: string): Rect[] {
  const idx = index(root)
  const f = (focus && idx.get(focus)) || root
  const out: Rect[] = []
  for (let a = idx.get(f.parent ?? ''); a; a = idx.get(a.parent ?? '')) out.push({ id: a.id, name: a.name, depth: a.depth, x: 0, w: 1, flat: a.flat, cum: a.cum })
  const place = (n: FNode, x: number, w: number) => {
    out.push({ id: n.id, name: n.name, depth: n.depth, x, w, flat: n.flat, cum: n.cum })
    let cx = x
    for (const c of n.children) {
      const cw = (c.cum / n.cum) * w
      place(c, cx, cw)
      cx += cw
    }
  }
  place(f, 0, 1)
  return out.sort((a, b) => a.depth - b.depth || a.x - b.x)
}

/** `go tool pprof -top`: flat and cum summed per function across every stack it appears in. */
export function top(root: FNode, n = 5): { name: string; flat: number; cum: number }[] {
  const flat = new Map<string, number>()
  const cum = new Map<string, number>()
  const walk = (x: FNode, seen: Set<string>) => {
    if (x.name !== 'root') {
      flat.set(x.name, (flat.get(x.name) ?? 0) + x.flat)
      // cum counts a function once per stack, even if it recurses
      if (!seen.has(x.name)) cum.set(x.name, (cum.get(x.name) ?? 0) + x.cum)
    }
    const s = new Set(seen).add(x.name)
    x.children.forEach((c) => walk(c, s))
  }
  walk(root, new Set())
  return [...flat.entries()]
    .map(([name, f]) => ({ name, flat: f, cum: cum.get(name) ?? 0 }))
    .sort((a, b) => b.flat - a.flat || a.name.localeCompare(b.name))
    .slice(0, n)
}

export const TARGET = 'root;net/http.(*conn).serve;api.handleOrders;api.applyDiscounts;regexp.MustCompile'

export type Verdict = { kind: 'yes' | 'close' | 'no'; text: string }

/** What the lab says when you tap a frame as "the one to optimize first". */
export function verdict(root: FNode, id: string): Verdict {
  const idx = index(root)
  const n = idx.get(id)
  if (!n) return { kind: 'no', text: 'Tap a frame.' }
  const pct = (v: number) => `${Math.round((v / root.cum) * 100)}%`
  if (id === TARGET)
    return { kind: 'yes', text: `Yes. ${pct(n.cum)} of all CPU compiles the same regex on every request. Hoist it to a package-level var and it drops to ~0.` }
  if (id.startsWith(TARGET + ';'))
    return { kind: 'close', text: `Hot (flat ${pct(n.flat)}), but it's the standard library. Walk up to the call you own: who compiles a regex per request?` }
  if (id === 'root;net/http.(*conn).serve;api.handleOrders;api.applyDiscounts')
    return { kind: 'close', text: `Right branch (cum ${pct(n.cum)}) but its own flat is ${pct(n.flat)}. Go one level down.` }
  if (n.name.startsWith('runtime.gc') || n.name === 'runtime.scanobject' || n.name === MALLOC)
    return { kind: 'no', text: `GC and malloc are a symptom (${pct(n.cum)} here): allocations cause them. Fix the code that allocates first.` }
  if (n.name.includes('json'))
    return { kind: 'close', text: `A real cost (cum ${pct(n.cum)}), but encoding is work you need. There's a wider frame that is pure waste.` }
  if (n.cum === n.flat && n.cum / root.cum < 0.1) return { kind: 'no', text: `Only ${pct(n.cum)} of samples. Look for wider frames.` }
  if (n.cum > 3 * n.flat)
    return { kind: 'no', text: `Wide (cum ${pct(n.cum)}) but its own flat is only ${pct(n.flat)}: the time is in its callees. Look below it.` }
  return { kind: 'no', text: `${pct(n.cum)} of samples. Is there a wider frame that shouldn't run at all?` }
}

export const ms = (samples: number) => (samples * 10 >= 1000 ? `${(samples / 100).toFixed(2)}s` : `${samples * 10}ms`)
