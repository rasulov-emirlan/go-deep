import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type Topic = {
  slug: string
  n: string
  title: string
  kicker: string
  blurb: string
  /** progress keys are prefixed with this; total = puzzles + interview questions */
  gopher?: string
  group: string
  page?: LazyExoticComponent<ComponentType>
}

export const topics: Topic[] = [
  {
    slug: 'scheduler',
    group: 'Runtime',
    n: '01',
    title: 'GMP scheduler',
    kicker: 'runtime/proc.go',
    gopher: 'convict-working-hard',
    blurb: 'Gs, Ms and Ps. Run queues, runnext, work stealing, syscall handoff, sysmon and async preemption.',
    page: lazy(() => import('./gmp/Page')),
  },
  {
    slug: 'maps',
    group: 'Runtime',
    n: '02',
    title: 'Maps & Swiss tables',
    kicker: 'internal/runtime/maps',
    gopher: 'adventure-hiking',
    blurb: 'From buckets + overflow chains to Go 1.24 Swiss tables: control words, H1/H2, probing, extendible-hash splits.',
    page: lazy(() => import('./maps/Page')),
  },
  {
    slug: 'gc',
    group: 'Runtime',
    n: '03',
    title: 'GC & Green Tea',
    kicker: 'runtime/mgc.go',
    gopher: 'fairy-tale-witch-broom',
    blurb: 'Tri-color marking, the hybrid write barrier, the pacer, GOGC/GOMEMLIMIT, and span-based Green Tea scanning.',
    page: lazy(() => import('./gc/Page')),
  },
  {
    slug: 'slices',
    group: 'Language',
    n: '04',
    title: 'Slices & strings',
    kicker: 'runtime/slice.go',
    gopher: 'adventure-pushing-cart',
    blurb: 'The three-word header, append and shared backing arrays, nil vs empty, strings as bytes vs runes.',
    page: lazy(() => import('./slices/Page')),
  },
  {
    slug: 'interfaces',
    group: 'Language',
    n: '05',
    title: 'Interfaces & nil',
    kicker: 'runtime/iface.go',
    gopher: 'arts-ballet',
    blurb: 'The two-word interface value, typed nil, embedding instead of inheritance, errors as values.',
    page: lazy(() => import('./interfaces/Page')),
  },
  {
    slug: 'channels',
    group: 'Concurrency',
    n: '06',
    title: 'Channels & select',
    kicker: 'runtime/chan.go',
    gopher: 'fairy-tale-messenger-running',
    blurb: 'hchan and its queues, buffered vs unbuffered, nil and closed channels, select and deadlocks.',
    page: lazy(() => import('./channels/Page')),
  },
  {
    slug: 'sync',
    group: 'Concurrency',
    n: '07',
    title: 'sync & data races',
    kicker: 'sync, sync/atomic',
    gopher: 'adventure-pirate-sword',
    blurb: 'Data races vs race conditions, Mutex and RWMutex, WaitGroup, atomics, Once, sync.Map.',
    page: lazy(() => import('./sync/Page')),
  },
  {
    slug: 'patterns',
    group: 'Concurrency',
    n: '08',
    title: 'context & concurrency patterns',
    kicker: 'context, errgroup',
    gopher: 'science-power-to-the-masses',
    blurb: 'Cancellation trees, worker pools, fan-in, semaphores, errgroup, rate limiting, graceful shutdown.',
    page: lazy(() => import('./patterns/Page')),
  },
  {
    slug: 'indexes',
    group: 'Databases',
    n: '09',
    title: 'Indexes & query plans',
    kicker: 'postgres',
    gopher: 'fairy-tale-witch-learning',
    blurb: 'B-trees, composite indexes and the leftmost prefix, EXPLAIN, why an index is ignored, N+1, pagination.',
    page: lazy(() => import('./indexes/Page')),
  },
  {
    slug: 'transactions',
    group: 'Databases',
    n: '10',
    title: 'Transactions & isolation',
    kicker: 'postgres MVCC',
    gopher: 'fairy-tale-princess',
    blurb: 'ACID, isolation levels and their anomalies, MVCC and VACUUM, row locks, deadlocks, lost updates.',
    page: lazy(() => import('./transactions/Page')),
  },
  {
    slug: 'kafka',
    group: 'Backend',
    n: '11',
    title: 'Kafka & delivery guarantees',
    kicker: 'messaging',
    gopher: 'adventure-pirate-lifting-goods',
    blurb: 'Partitions, consumer groups and lag, at-least-once vs exactly-once, the outbox, idempotent consumers.',
    page: lazy(() => import('./kafka/Page')),
  },
  {
    slug: 'http',
    group: 'Backend',
    n: '12',
    title: 'HTTP, TLS & gRPC',
    kicker: 'net/http',
    gopher: 'fairy-tale-messenger-showing',
    blurb: 'From URL to response: DNS, TCP, TLS, HTTP/1.1 vs 2 vs 3, keep-alive, gRPC, idempotent methods.',
    page: lazy(() => import('./http/Page')),
  },
  {
    slug: 'scaling',
    group: 'Backend',
    n: '13',
    title: 'Scaling & resilience',
    kicker: 'architecture',
    gopher: 'superhero-lifting-1TB',
    blurb: 'Caches and stampedes, circuit breakers and retries, connection pools, replication vs sharding, CAP.',
    page: lazy(() => import('./scaling/Page')),
  },
  {
    slug: 'profiling',
    group: 'Backend',
    n: '14',
    title: 'Profiling & observability',
    kicker: 'pprof, metrics',
    gopher: 'science-experiment-mishap',
    blurb: 'pprof and flame graphs, the race detector, RED/USE metrics, Prometheus types, traces and logs.',
    page: lazy(() => import('./profiling/Page')),
  },
]

export const liveTopics = topics.filter((t) => t.page)
export const groups = [...new Set(topics.map((t) => t.group))]
