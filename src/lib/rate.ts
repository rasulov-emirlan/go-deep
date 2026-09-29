export type Vote = 'up' | 'down'

export const REASONS = [
  { id: 'too-complicated', label: 'Too complicated' },
  { id: 'too-basic', label: 'Too basic' },
  { id: 'wrong', label: 'Something is wrong' },
  { id: 'confusing-pics', label: 'Pictures are confusing' },
  { id: 'missing', label: 'Something is missing' },
  { id: 'broken', label: 'Page is broken' },
] as const

export type Rating = { topic: string; vote: Vote; reasons?: string[]; section?: string; note?: string }

const KEY = 'godeep.rated.v1'

export function payload(r: Rating): Rating {
  const out: Rating = { topic: r.topic, vote: r.vote }
  if (r.vote === 'down') {
    if (r.reasons?.length) out.reasons = [...new Set(r.reasons)]
    if (r.section?.trim()) out.section = r.section.trim().slice(0, 80)
    if (r.note?.trim()) out.note = r.note.trim().slice(0, 1000)
  }
  return out
}

export async function send(r: Rating, post: typeof fetch = fetch): Promise<void> {
  const res = await post('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(r)) })
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many ratings from here. Try again later.' : 'Couldn’t send. Try again.')
}

export function rated(topic: string): Vote | undefined {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Vote>)[topic]
  } catch {
    return undefined
  }
}

export function remember(topic: string, v: Vote | undefined) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Vote>
    if (v) all[topic] = v
    else delete all[topic]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode */
  }
}
