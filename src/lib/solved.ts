import { useSyncExternalStore } from 'react'

/** Solved challenges and saved drafts, kept in this browser. */
const SOLVED = 'godeep.solved.v1'
const DRAFT = 'godeep.draft.v1:'
const subs = new Set<() => void>()
let cache: Record<string, number> | null = null

function read(): Record<string, number> {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(SOLVED) ?? '{}')
  } catch {
    cache = {}
  }
  return cache!
}

export function markSolved(id: string) {
  cache = { ...read(), [id]: Date.now() }
  try {
    localStorage.setItem(SOLVED, JSON.stringify(cache))
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f())
}

export function useSolved(): Record<string, number> {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    read,
    () => ({}),
  )
}

export function loadDraft(id: string): string | null {
  try {
    return localStorage.getItem(DRAFT + id)
  } catch {
    return null
  }
}

export function saveDraft(id: string, code: string | null) {
  try {
    if (code === null) localStorage.removeItem(DRAFT + id)
    else localStorage.setItem(DRAFT + id, code)
  } catch {
    /* private mode */
  }
}
