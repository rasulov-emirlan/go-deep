export type Challenge = {
  id: string
  title: string
  bank?: string
  cat: string
  level: 1 | 2 | 3
  prompt: string
  hint?: string
  starter: string
  solution: string
  check: string
}

const files = import.meta.glob<string>('/challenges/*/*.{go,json}', { query: '?raw', import: 'default', eager: true })

export const harness = files['/challenges/_harness/harness.go']

const byId: Record<string, Partial<Challenge>> = {}
for (const [path, src] of Object.entries(files)) {
  const [, , id, file] = path.split('/')
  if (id === '_harness') continue
  const c = (byId[id] ??= { id })
  if (file === 'meta.json') Object.assign(c, JSON.parse(src))
  else if (file === 'starter.go') c.starter = src
  else if (file === 'solution.go') c.solution = src
  else if (file === 'check.go') c.check = src
}

export const challenges: Challenge[] = Object.values(byId)
  .filter((c): c is Challenge => !!(c.title && c.starter && c.solution && c.check))
  .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))

export const challengeFor = (bankId: string) => challenges.find((c) => c.bank === bankId)
