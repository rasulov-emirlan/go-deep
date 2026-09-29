// Tri-color marking with a scripted mutator, to show why Go needs the
// *hybrid* write barrier (Yuasa deletion + Dijkstra insertion, Go 1.8).
// Stack writes never get a barrier — that asymmetry is the whole story.

export type Color = 'white' | 'grey' | 'black'
export type Barrier = 'none' | 'dijkstra' | 'yuasa' | 'hybrid'
export type Obj = { id: string; fields: (string | null)[]; color: Color; x: number; y: number; freed?: boolean }
export type Root = { id: string; label: string; slots: (string | null)[]; scanned: boolean; y: number }

export type Action =
  | { k: 'scanRoot'; root: string }
  | { k: 'mark' } // pop one grey object and scan it
  | { k: 'drain' } // mark until no grey remains
  | { k: 'write'; obj: string; field: number; to: string | null; say: string } // heap pointer write (barrier applies)
  | { k: 'stackWrite'; root: string; slot: number; to: string | null; say: string } // no barrier
  | { k: 'sweep' }

export type Scenario = { id: string; title: string; blurb: string; roots: Root[]; objs: Obj[]; script: Action[]; needs: Barrier[] }

export type State = {
  roots: Root[]
  objs: Obj[]
  grey: string[] // LIFO work queue
  pc: number
  barrier: Barrier
  log: string[]
  shaded: string[] // objects shaded by the barrier (for highlight)
  done: boolean
  dangling: string[] // freed but still referenced → use-after-free
}

const o = (id: string, fields: (string | null)[], x: number, y: number): Obj => ({ id, fields, color: 'white', x, y })

export const scenarios: Scenario[] = [
  {
    id: 'heap',
    title: 'Hide it in the heap',
    blurb: 'The mutator copies B→C into already-black A, then deletes B→C. C is still reachable (via A) but the marker will never look at A again.',
    roots: [{ id: 'globals', label: 'globals', slots: ['B', 'A'], scanned: false, y: 0 }],
    objs: [o('A', [null], 1, 0), o('B', ['C'], 1, 1), o('C', [], 2, 1), o('D', [], 2, 2)],
    script: [
      { k: 'scanRoot', root: 'globals' },
      { k: 'mark' },
      { k: 'write', obj: 'A', field: 0, to: 'C', say: 'A.f = B.g   // black A now points at white C' },
      { k: 'write', obj: 'B', field: 0, to: null, say: 'B.g = nil   // the only grey path to C is gone' },
      { k: 'drain' },
      { k: 'sweep' },
    ],
    needs: ['dijkstra', 'yuasa', 'hybrid'],
  },
  {
    id: 'stack-hide',
    title: 'Hide it on a scanned stack',
    blurb: 'G1’s stack is already scanned (black). G1 loads B.g into a local — a stack write, so no barrier — then clears B.g. Only the deletion (Yuasa) half sees it.',
    roots: [
      { id: 'G1', label: 'G1 stack', slots: [null], scanned: false, y: 0 },
      { id: 'globals', label: 'globals', slots: ['A'], scanned: false, y: 1 },
    ],
    objs: [o('A', ['B'], 1, 1), o('B', ['C'], 2, 1), o('C', [], 3, 1)],
    script: [
      { k: 'scanRoot', root: 'G1' },
      { k: 'scanRoot', root: 'globals' },
      { k: 'mark' },
      { k: 'stackWrite', root: 'G1', slot: 0, to: 'C', say: 'local := b.g // stack write: NO barrier' },
      { k: 'write', obj: 'B', field: 0, to: null, say: 'b.g = nil    // heap write: deletes the last heap path' },
      { k: 'drain' },
      { k: 'sweep' },
    ],
    needs: ['yuasa', 'hybrid'],
  },
  {
    id: 'stack-to-heap',
    title: 'Move it from a grey stack into the heap',
    blurb: 'Only G1’s (not yet scanned) stack references C. G1 stores C into black A, then drops its local. Only the insertion (Dijkstra) half sees it.',
    roots: [
      { id: 'globals', label: 'globals', slots: ['A'], scanned: false, y: 0 },
      { id: 'G1', label: 'G1 stack', slots: ['C'], scanned: false, y: 1 },
    ],
    objs: [o('A', [null], 1, 0), o('C', [], 2, 1)],
    script: [
      { k: 'scanRoot', root: 'globals' },
      { k: 'mark' },
      { k: 'write', obj: 'A', field: 0, to: 'C', say: 'a.f = local  // black A now points at white C' },
      { k: 'stackWrite', root: 'G1', slot: 0, to: null, say: 'local = nil  // stack write: NO barrier' },
      { k: 'scanRoot', root: 'G1' },
      { k: 'drain' },
      { k: 'sweep' },
    ],
    needs: ['dijkstra', 'hybrid'],
  },
]

export function start(sc: Scenario, barrier: Barrier): State {
  return {
    roots: structuredClone(sc.roots),
    objs: structuredClone(sc.objs),
    grey: [],
    pc: 0,
    barrier,
    log: [],
    shaded: [],
    done: false,
    dangling: [],
  }
}

const find = (s: State, id: string) => s.objs.find((x) => x.id === id)!

function shade(s: State, id: string | null, why?: string) {
  if (!id) return
  const x = find(s, id)
  if (x.color !== 'white') return
  x.color = 'grey'
  s.grey.push(id)
  if (why) {
    s.shaded.push(id)
    s.log.unshift(`  ↳ write barrier shades ${id} grey (${why})`)
  }
}

function markOne(s: State) {
  const id = s.grey.pop()
  if (!id) return false
  const x = find(s, id)
  for (const f of x.fields) shade(s, f)
  x.color = 'black'
  s.log.unshift(`mark: scan ${id} → black` + (x.fields.some(Boolean) ? `, shade ${x.fields.filter(Boolean).join(', ')}` : ''))
  return true
}

/** Is some root-slot on a not-yet-scanned stack? (Go's hybrid barrier shades ptr "if current stack is grey"). */
function stackGrey(s: State) {
  return s.roots.some((r) => r.id !== 'globals' && !r.scanned)
}

export function stepScript(sc: Scenario, s: State): State {
  if (s.done) return s
  const a = sc.script[s.pc]
  s.shaded = []
  switch (a.k) {
    case 'scanRoot': {
      const r = s.roots.find((x) => x.id === a.root)!
      for (const t of r.slots) shade(s, t)
      r.scanned = true
      s.log.unshift(`scan root ${r.label}` + (r.slots.some(Boolean) ? ` → shade ${r.slots.filter(Boolean).join(', ')}` : ' (no pointers)'))
      break
    }
    case 'mark':
      markOne(s)
      break
    case 'drain':
      if (!s.grey.length) s.log.unshift('mark: no grey objects left — marking done')
      while (markOne(s));
      break
    case 'write': {
      const x = find(s, a.obj)
      const old = x.fields[a.field]
      s.log.unshift(`mutator: ${a.say}`)
      if (s.barrier === 'yuasa' || s.barrier === 'hybrid') shade(s, old, `deletion: old value of ${a.obj}.f`)
      if (s.barrier === 'dijkstra' || (s.barrier === 'hybrid' && stackGrey(s))) shade(s, a.to, `insertion: new value`)
      x.fields[a.field] = a.to
      break
    }
    case 'stackWrite': {
      const r = s.roots.find((x) => x.id === a.root)!
      r.slots[a.slot] = a.to
      s.log.unshift(`mutator: ${a.say}`)
      break
    }
    case 'sweep': {
      const freed = s.objs.filter((x) => x.color === 'white')
      for (const x of freed) x.freed = true
      s.dangling = reachable(s).filter((id) => find(s, id).freed)
      s.log.unshift(
        freed.length ? `sweep: free white ${freed.map((x) => x.id).join(', ')}` : 'sweep: nothing to free',
      )
      if (s.dangling.length) s.log.unshift(`✗ ${s.dangling.join(', ')} was freed but is still reachable → use-after-free`)
      else s.log.unshift('✓ heap is consistent: every reachable object survived')
      s.done = true
      break
    }
  }
  s.pc++
  return s
}

export function reachable(s: State): string[] {
  const seen = new Set<string>()
  const q = s.roots.flatMap((r) => r.slots.filter((x): x is string => !!x))
  while (q.length) {
    const id = q.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    q.push(...find(s, id).fields.filter((x): x is string => !!x))
  }
  return [...seen]
}

export function runAll(sc: Scenario, barrier: Barrier): State {
  const s = start(sc, barrier)
  while (!s.done) stepScript(sc, s)
  return s
}
