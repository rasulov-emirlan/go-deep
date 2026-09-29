// Tri-color marking with a scripted mutator, to show why Go needs the
// *hybrid* write barrier (Yuasa deletion + Dijkstra insertion, Go 1.8).
// Stack writes never get a barrier — that asymmetry is the whole story.

export type Color = 'white' | 'grey' | 'black'
export type Barrier = 'none' | 'dijkstra' | 'yuasa' | 'hybrid'
export type Obj = { id: string; fields: (string | null)[]; color: Color; x: number; y: number; freed?: boolean; born?: boolean }
export type Root = { id: string; label: string; slots: (string | null)[]; scanned: boolean; y: number }

export type Action =
  | { k: 'scanRoot'; root: string }
  | { k: 'mark' } // pop one grey object and scan it
  | { k: 'drain' } // mark until no grey remains
  | { k: 'write'; obj: string; field: number; to: string | null; say: string } // heap pointer write (barrier applies)
  | { k: 'stackWrite'; root: string; slot: number; to: string | null; say: string } // no barrier
  | { k: 'alloc'; id: string; root: string; slot: number; x: number; y: number; say: string } // new object, pointer kept in a stack slot
  | { k: 'sweep' }

/** Typed events, one per thing that happened, for guided tours. */
export type TEventKind =
  | 'root-scan'
  | 'shade'
  | 'scan-black'
  | 'heap-write'
  | 'black-to-white'
  | 'barrier-deletion'
  | 'barrier-insertion'
  | 'insert-skipped'
  | 'stack-write'
  | 'alloc-black'
  | 'mark-done'
  | 'sweep-free'
  | 'sweep-cycle'
  | 'lost'
  | 'safe'

export type TEvent = { kind: TEventKind; ids: string[]; text: string; root?: string; obj?: string; old?: string | null; to?: string | null; say?: string }

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
  events: TEvent[] // every event since start, in order
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
    events: [],
  }
}

const find = (s: State, id: string) => s.objs.find((x) => x.id === id)!

const ev = (s: State, e: TEvent) => s.events.push(e)

function shade(s: State, id: string | null, why?: string, half?: 'deletion' | 'insertion') {
  if (!id) return
  const x = find(s, id)
  if (x.color !== 'white') return
  x.color = 'grey'
  s.grey.push(id)
  if (why) {
    s.shaded.push(id)
    s.log.unshift(`  ↳ write barrier shades ${id} grey (${why})`)
    ev(s, { kind: half === 'insertion' ? 'barrier-insertion' : 'barrier-deletion', ids: [id], text: `write barrier shades ${id} grey (${why})` })
  } else ev(s, { kind: 'shade', ids: [id], text: `${id} → grey` })
}

function markOne(s: State) {
  const id = s.grey.pop()
  if (!id) return false
  const x = find(s, id)
  ev(s, { kind: 'scan-black', ids: [id], text: `scan ${id} → black` })
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
      ev(s, { kind: 'root-scan', ids: r.slots.filter((x): x is string => !!x), root: r.id, text: `scan root ${r.label}` })
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
      ev(s, { kind: 'mark-done', ids: [], text: 'no grey left — marking done' })
      break
    case 'write': {
      const x = find(s, a.obj)
      const old = x.fields[a.field]
      s.log.unshift(`mutator: ${a.say}`)
      ev(s, { kind: 'heap-write', ids: [a.obj], obj: a.obj, old, to: a.to, say: a.say, text: `program: ${a.say}` })
      if (s.barrier === 'yuasa' || s.barrier === 'hybrid') shade(s, old, `deletion: old value of ${a.obj}.f`, 'deletion')
      const insert = s.barrier === 'dijkstra' || (s.barrier === 'hybrid' && stackGrey(s))
      if (insert) shade(s, a.to, `insertion: new value`, 'insertion')
      else if (s.barrier === 'hybrid' && a.to && find(s, a.to).color === 'white')
        ev(s, { kind: 'insert-skipped', ids: [a.to], text: `insertion half skipped: the writer's stack is already scanned` })
      x.fields[a.field] = a.to
      if (x.color === 'black' && a.to && find(s, a.to).color === 'white') ev(s, { kind: 'black-to-white', ids: [a.obj, a.to], text: `black ${a.obj} now points at white ${a.to}` })
      break
    }
    case 'stackWrite': {
      const r = s.roots.find((x) => x.id === a.root)!
      const old = r.slots[a.slot]
      r.slots[a.slot] = a.to
      s.log.unshift(`mutator: ${a.say}`)
      ev(s, { kind: 'stack-write', ids: a.to ? [a.to] : [], root: r.id, old, to: a.to, say: a.say, text: `program: ${a.say}` })
      break
    }
    case 'alloc': {
      const r = s.roots.find((x) => x.id === a.root)!
      s.objs.push({ id: a.id, fields: [], color: 'black', x: a.x, y: a.y, born: true })
      r.slots[a.slot] = a.id
      s.log.unshift(`mutator: ${a.say}  // allocated black`)
      ev(s, { kind: 'alloc-black', ids: [a.id], root: r.id, to: a.id, say: a.say, text: `program: ${a.say} → ${a.id} is born black` })
      break
    }
    case 'sweep': {
      const freed = s.objs.filter((x) => x.color === 'white')
      for (const x of freed) x.freed = true
      s.dangling = reachable(s).filter((id) => find(s, id).freed)
      s.log.unshift(
        freed.length ? `sweep: free white ${freed.map((x) => x.id).join(', ')}` : 'sweep: nothing to free',
      )
      const ids = freed.map((x) => x.id)
      ev(s, { kind: 'sweep-free', ids, text: freed.length ? `sweep frees white ${ids.join(', ')}` : 'sweep: nothing to free' })
      const cyc = freed.filter((x) => x.fields.some((f) => f && ids.includes(f))).map((x) => x.id)
      if (cyc.length && !s.dangling.length) ev(s, { kind: 'sweep-cycle', ids: cyc, text: `${cyc.join(' and ')} point at each other, but nothing reaches them` })
      if (s.dangling.length) {
        s.log.unshift(`✗ ${s.dangling.join(', ')} was freed but is still reachable → use-after-free`)
        ev(s, { kind: 'lost', ids: [...s.dangling], text: `${s.dangling.join(', ')} was freed but is still reachable → use-after-free` })
      } else {
        s.log.unshift('✓ heap is consistent: every reachable object survived')
        ev(s, { kind: 'safe', ids: [], text: 'every reachable object survived' })
      }
      s.done = true
      break
    }
  }
  s.pc++
  return s
}

/**
 * Like stepScript, but a `drain` is split into one scan per call, so a tour can
 * show each grey object being scanned. Returns the events this call produced.
 */
export function stepOne(sc: Scenario, s: State): TEvent[] {
  const n = s.events.length
  if (s.done) return []
  const a = sc.script[s.pc]
  if (a.k === 'drain') {
    s.shaded = []
    if (markOne(s)) return s.events.slice(n)
    s.log.unshift('mark: no grey objects left — marking done')
    ev(s, { kind: 'mark-done', ids: [], text: 'no grey left — marking done' })
    s.pc++
    return s.events.slice(n)
  }
  stepScript(sc, s)
  return s.events.slice(n)
}

/** A plain marking run for the tour: shared targets, a garbage cycle, and an allocation during mark. */
export const paintTown: Scenario = {
  id: 'plain',
  title: 'Paint the reachable town',
  blurb: 'No tricks: two roots, a shared target (C), a garbage cycle (E ↔ F), and one allocation while marking runs.',
  roots: [
    { id: 'G1', label: 'G1 stack', slots: ['A'], scanned: false, y: 0 },
    { id: 'globals', label: 'globals', slots: ['B'], scanned: false, y: 1 },
    { id: 'G2', label: 'G2 stack', slots: [null], scanned: false, y: 2 },
  ],
  objs: [o('A', ['C'], 1, 0), o('C', [], 2, 0), o('E', ['F'], 3, 0), o('B', ['C', 'D'], 1, 1), o('D', [], 2, 1), o('F', ['E'], 3, 1)],
  script: [
    { k: 'scanRoot', root: 'G1' },
    { k: 'scanRoot', root: 'globals' },
    { k: 'scanRoot', root: 'G2' },
    { k: 'mark' },
    { k: 'alloc', id: 'N', root: 'G2', slot: 0, x: 1, y: 2, say: 'n := &T{}' },
    { k: 'drain' },
    { k: 'sweep' },
  ],
  needs: ['none', 'dijkstra', 'yuasa', 'hybrid'],
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
