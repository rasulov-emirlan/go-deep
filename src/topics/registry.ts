import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type Topic = {
  slug: string
  n: string
  title: string
  kicker: string
  blurb: string
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
    blurb: 'How millions of goroutines share a few threads, and who runs next.',
    page: lazy(() => import('./gmp/Page')),
  },
  {
    slug: 'maps',
    group: 'Runtime',
    n: '02',
    title: 'Maps & Swiss tables',
    kicker: 'internal/runtime/maps',
    gopher: 'adventure-hiking',
    blurb: 'How a Go map finds a key fast, grows, and why it panics on concurrent writes.',
    page: lazy(() => import('./maps/Page')),
  },
  {
    slug: 'gc',
    group: 'Runtime',
    n: '03',
    title: 'Garbage collection',
    kicker: 'runtime/mgc.go',
    gopher: 'fairy-tale-witch-broom',
    blurb: 'How Go finds garbage while your program keeps running, and how to tune it.',
    page: lazy(() => import('./gc/Page')),
  },
  {
    slug: 'slices',
    group: 'Language',
    n: '04',
    title: 'Slices & strings',
    kicker: 'runtime/slice.go',
    gopher: 'adventure-pushing-cart',
    blurb: 'Why append sometimes changes another slice, and what a string really is.',
    page: lazy(() => import('./slices/Page')),
  },
  {
    slug: 'interfaces',
    group: 'Language',
    n: '05',
    title: 'Interfaces & nil',
    kicker: 'runtime/iface.go',
    gopher: 'arts-ballet',
    blurb: 'Why an interface holding a nil pointer is not nil.',
    page: lazy(() => import('./interfaces/Page')),
  },
  {
    slug: 'channels',
    group: 'Concurrency',
    n: '06',
    title: 'Channels & select',
    kicker: 'runtime/chan.go',
    gopher: 'fairy-tale-messenger-red-letter',
    blurb: 'Handshakes, mailboxes, closed channels, select, and deadlocks.',
    page: lazy(() => import('./channels/Page')),
  },
  {
    slug: 'sync',
    group: 'Concurrency',
    n: '07',
    title: 'sync & data races',
    kicker: 'sync, sync/atomic',
    gopher: 'adventure-pirate-sword',
    blurb: 'Two goroutines, one counter: races, mutexes and atomics.',
    page: lazy(() => import('./sync/Page')),
  },
  {
    slug: 'patterns',
    group: 'Concurrency',
    n: '08',
    title: 'context & concurrency patterns',
    kicker: 'context, errgroup',
    gopher: 'science-power-to-the-masses',
    blurb: 'Cancel work with context, and share it out with worker pools.',
    page: lazy(() => import('./patterns/Page')),
  },
  {
    slug: 'indexes',
    group: 'Databases',
    n: '09',
    title: 'Indexes & query plans',
    kicker: 'postgres',
    gopher: 'fairy-tale-witch-learning',
    blurb: 'How an index turns a full-table scan into a quick lookup, and when it doesn’t.',
    page: lazy(() => import('./indexes/Page')),
  },
  {
    slug: 'transactions',
    group: 'Databases',
    n: '10',
    title: 'Transactions & isolation',
    kicker: 'postgres MVCC',
    gopher: 'fairy-tale-princess',
    blurb: 'What two transactions can see of each other, and how to avoid lost updates.',
    page: lazy(() => import('./transactions/Page')),
  },
  {
    slug: 'kafka',
    group: 'Backend',
    n: '11',
    title: 'Kafka & delivery guarantees',
    kicker: 'messaging',
    gopher: 'adventure-pirate-lifting-goods',
    blurb: 'Partitions, consumer groups, and why messages can arrive twice.',
    page: lazy(() => import('./kafka/Page')),
  },
  {
    slug: 'http',
    group: 'Backend',
    n: '12',
    title: 'HTTP, TLS & gRPC',
    kicker: 'net/http',
    gopher: 'fairy-tale-messenger-showing',
    blurb: 'What happens between typing a URL and getting a response.',
    page: lazy(() => import('./http/Page')),
  },
  {
    slug: 'scaling',
    group: 'Backend',
    n: '13',
    title: 'Scaling & resilience',
    kicker: 'architecture',
    gopher: 'superhero-lifting-1TB',
    blurb: 'Caches, retries and circuit breakers that keep a service up under load.',
    page: lazy(() => import('./scaling/Page')),
  },
  {
    slug: 'profiling',
    group: 'Backend',
    n: '14',
    title: 'Profiling & observability',
    kicker: 'pprof, metrics',
    gopher: 'science-welding',
    blurb: 'Find the slow code with pprof, and watch a service with metrics.',
    page: lazy(() => import('./profiling/Page')),
  },
]

export const liveTopics = topics.filter((t) => t.page)
export const groups = [...new Set(topics.map((t) => t.group))]
