import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type Topic = {
  slug: string
  n: string
  title: string
  kicker: string
  blurb: string
  /** progress keys are prefixed with this; total = puzzles + interview questions */
  gopher?: string
  page?: LazyExoticComponent<ComponentType>
}

export const topics: Topic[] = [
  {
    slug: 'scheduler',
    n: '01',
    title: 'GMP scheduler',
    kicker: 'runtime/proc.go',
    gopher: 'convict-working-hard',
    blurb: 'Gs, Ms and Ps. Run queues, runnext, work stealing, syscall handoff, sysmon and async preemption.',
    page: lazy(() => import('./gmp/Page')),
  },
  {
    slug: 'maps',
    n: '02',
    title: 'Maps & Swiss tables',
    kicker: 'internal/runtime/maps',
    gopher: 'adventure-hiking',
    blurb: 'From buckets + overflow chains to Go 1.24 Swiss tables: control words, H1/H2, probing, extendible-hash splits.',
    page: lazy(() => import('./maps/Page')),
  },
  {
    slug: 'gc',
    n: '03',
    title: 'GC & Green Tea',
    kicker: 'runtime/mgc.go',
    gopher: 'fairy-tale-witch-broom',
    blurb: 'Tri-color marking, the hybrid write barrier, the pacer, GOGC/GOMEMLIMIT, and span-based Green Tea scanning.',
    page: lazy(() => import('./gc/Page')),
  },
  { slug: 'channels', n: '04', title: 'Channels & select', kicker: 'runtime/chan.go', blurb: 'hchan, sudog queues, direct send, select fairness, close semantics.' },
  { slug: 'sync', n: '05', title: 'sync & the memory model', kicker: 'sync, sync/atomic', blurb: 'Mutex starvation mode, RWMutex, WaitGroup, happens-before, data races.' },
  { slug: 'pools', n: '06', title: 'Connection pools', kicker: 'database/sql, net/http', blurb: 'MaxOpen/MaxIdle, conn lifetime, http.Transport idle pools, pool exhaustion.' },
  { slug: 'db', n: '07', title: 'Databases in Go', kicker: 'pgx, database/sql', blurb: 'Transactions, context cancellation, prepared statements, N+1, batching.' },
  { slug: 'profiling', n: '08', title: 'Profiling & tracing', kicker: 'pprof, trace', blurb: 'CPU/heap/mutex/block profiles, execution traces, flame graphs, PGO.' },
  { slug: 'scaling', n: '09', title: 'Scaling services', kicker: 'backpressure', blurb: 'Worker pools, rate limiting, load shedding, graceful shutdown, fan-out.' },
]

export const liveTopics = topics.filter((t) => t.page)
