export type Kind = 'theory' | 'output' | 'code' | 'algo' | 'sql' | 'design' | 'behavioral'

export type Question = {
  id: string
  cat: string
  kind: Kind
  q: string
  code?: string
  a: string
  level: 1 | 2 | 3
  asked: string[]
  /** how many interviews in the notes asked it */
  n: number
  /** the snippet or reference solution was actually run */
  verified?: boolean
}

export type Category = { slug: string; title: string; group: string }

export const categories: Category[] = [
  { slug: 'go-basics', title: 'Language basics', group: 'Go' },
  { slug: 'slices', title: 'Slices & arrays', group: 'Go' },
  { slug: 'maps', title: 'Maps', group: 'Go' },
  { slug: 'interfaces', title: 'Interfaces', group: 'Go' },
  { slug: 'errors', title: 'Errors', group: 'Go' },
  { slug: 'generics', title: 'Generics', group: 'Go' },
  { slug: 'goroutines-scheduler', title: 'Goroutines & scheduler', group: 'Concurrency' },
  { slug: 'channels', title: 'Channels & select', group: 'Concurrency' },
  { slug: 'sync', title: 'sync, atomics, races', group: 'Concurrency' },
  { slug: 'context', title: 'context', group: 'Concurrency' },
  { slug: 'concurrency-patterns', title: 'Concurrency patterns', group: 'Concurrency' },
  { slug: 'memory-gc', title: 'Memory & GC', group: 'Runtime' },
  { slug: 'tooling-testing', title: 'Tooling & testing', group: 'Engineering' },
  { slug: 'architecture', title: 'Architecture & patterns', group: 'Engineering' },
  { slug: 'devops', title: 'DevOps & observability', group: 'Engineering' },
  { slug: 'databases', title: 'Databases', group: 'Backend' },
  { slug: 'networking', title: 'HTTP, gRPC, network', group: 'Backend' },
  { slug: 'messaging', title: 'Kafka & queues', group: 'Backend' },
  { slug: 'system-design', title: 'System design', group: 'Backend' },
  { slug: 'algorithms', title: 'Algorithms', group: 'Other' },
  { slug: 'behavioral', title: 'Behavioral', group: 'Other' },
]

export const kindLabel: Record<Kind, string> = {
  theory: 'theory',
  output: 'what prints?',
  code: 'write code',
  algo: 'algorithm',
  sql: 'sql',
  design: 'design',
  behavioral: 'behavioral',
}
