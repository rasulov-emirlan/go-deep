/**
 * Two goroutines each run `n++` on a shared counter. Without a mutex, `n++` is
 * LOAD / ADD / STORE; with one it is wrapped in LOCK … UNLOCK. The reader
 * picks which goroutine executes its next instruction.
 */
export type Op = 'LOCK' | 'LOAD' | 'ADD' | 'STORE' | 'UNLOCK'
export type Gid = 0 | 1

export type State = {
  mutex: boolean
  n: number
  pc: [number, number]
  reg: [number | null, number | null]
  holder: Gid | null
  log: string[]
}

export const program = (mutex: boolean): Op[] => (mutex ? ['LOCK', 'LOAD', 'ADD', 'STORE', 'UNLOCK'] : ['LOAD', 'ADD', 'STORE'])

export const init = (mutex: boolean): State => ({ mutex, n: 0, pc: [0, 0], reg: [null, null], holder: null, log: [] })

export const done = (s: State, g: Gid) => s.pc[g] >= program(s.mutex).length

export const finished = (s: State) => done(s, 0) && done(s, 1)

/** Can goroutine g execute its next instruction right now? */
export function canStep(s: State, g: Gid): boolean {
  if (done(s, g)) return false
  const op = program(s.mutex)[s.pc[g]]
  return op !== 'LOCK' || s.holder === null
}

export function step(s: State, g: Gid): State {
  if (!canStep(s, g)) return s
  const op = program(s.mutex)[s.pc[g]]
  const pc: [number, number] = [...s.pc]
  const reg: [number | null, number | null] = [...s.reg]
  let { n, holder } = s
  const name = `G${g + 1}`
  let line: string
  switch (op) {
    case 'LOCK':
      holder = g
      line = `${name} LOCK`
      break
    case 'LOAD':
      reg[g] = n
      line = `${name} LOAD n → r=${n}`
      break
    case 'ADD':
      reg[g] = (reg[g] ?? 0) + 1
      line = `${name} ADD r=${reg[g]}`
      break
    case 'STORE':
      n = reg[g] ?? 0
      line = `${name} STORE r → n=${n}`
      break
    case 'UNLOCK':
      holder = null
      line = `${name} UNLOCK`
      break
  }
  pc[g]++
  return { ...s, n, pc, reg, holder, log: [...s.log, line] }
}

/** Run a whole schedule like [0,1,1,0,…]; steps that can't run are skipped. */
export const run = (mutex: boolean, order: Gid[]): State => order.reduce(step, init(mutex))

/** Every complete interleaving of the two programs (blocked steps excluded), with its final n. */
export function allOutcomes(mutex: boolean): { order: Gid[]; n: number }[] {
  const out: { order: Gid[]; n: number }[] = []
  const walk = (s: State, order: Gid[]) => {
    if (finished(s)) return void out.push({ order, n: s.n })
    for (const g of [0, 1] as Gid[]) if (canStep(s, g)) walk(step(s, g), [...order, g])
  }
  walk(init(mutex), [])
  return out
}
