import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'godeep.progress.v1'
type Store = Record<string, true>

let cache: Store | null = null
const subs = new Set<() => void>()

function read(): Store {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    cache = {}
  }
  return cache
}

function write(next: Store) {
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

export function markDone(id: string, done = true) {
  const s = { ...read() }
  if (done) s[id] = true
  else delete s[id]
  write(s)
}

export function useProgress() {
  const store = useSyncExternalStore(subscribe, read, () => ({}) as Store)
  const isDone = useCallback((id: string) => !!store[id], [store])
  const countPrefix = useCallback((prefix: string) => Object.keys(store).filter((k) => k.startsWith(prefix)).length, [store])
  return { isDone, countPrefix }
}
