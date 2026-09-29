# Go Deep

Interactive deep-dives into the Go runtime for senior engineers. Live: https://godeep.night.enkiduck.com

| Topic | Labs |
|---|---|
| GMP scheduler | scheduler simulator (runnext, steal-half, runqputslow, syscall handoff, netpoller, sysmon preemption), preemption timeline, container GOMAXPROCS, stack growth |
| Maps & Swiss tables | Swiss map (H1/H2, probing, tombstones, small map, table doubling + extendible-hash splits), SWAR control-word lab, classic map evacuation, growth-cost race |
| GC & Green Tea | tri-color marking vs 4 write barriers, pacer (GOGC/GOMEMLIMIT/CPU limiter), classic vs Green Tea span scanning, gctrace decoder |

| Distributed systems | clocks & ordering, consistency & CAP, replication & quorums, Raft, locks & fencing, failure detection, sharding & consistent hashing, sagas/2PC/outbox, resilience patterns (a consistent-hash ring lab, quorum lab and retry-amplification lab) |
| Networking | TCP, DNS & load-balancer, TLS & QUIC edge cases |
| OS & hardware | syscalls & kernel mode, virtual memory, threads & CPU scheduling, I/O (page cache, epoll, io_uring), containers, CPU caches & memory ordering |

Each topic: mental model → labs → puzzles → interview questions (progress in localStorage).

## Layout

- `src/sim/` — pure, deterministic TS models of the runtime (unit-tested; the scheduler reproduces go1.26's verified 300-goroutine ordering).
- `src/topics/<slug>/` — one folder per topic: `Page.tsx`, `stories.tsx` (gopher scenes) and/or `flows.tsx` (SVG step diagrams: ladders, timelines, rings; see `src/components/Flow.tsx`, layout rules in `flow.ts`, enforced by `src/topics/flows.test.ts`), optional lab.
- `src/topics/registry.ts` — add a topic here; entries without `page` render as "coming soon".
- `src/bank/` — the `/interview` question bank: `questions.json` (deduplicated, answered, puzzles run with `go run` / Postgres 18) and a Leitner spaced-repetition drill (`src/lib/srs.ts`). `scripts/assemble-bank.py` merges the per-category outputs and applies the cross-category merge table; the raw interview notes are not in the repo.
- `research/` — source notes the content was written from (Go 1.26.4 source + primary docs). `research/deep/` holds the per-topic notes and the `verify-*.md` audit logs for the distributed / networking / OS pages.
- `scripts/shots.mjs` — screenshots every step of every story/flow on a page at phone and desktop widths.
- `verify/` — Go programs behind every "what does this print" answer. Run `pnpm verify-go`.

## Dev

```
pnpm install
pnpm dev
pnpm test        # vitest: simulator invariants
pnpm e2e         # playwright smoke (PW_CHROMIUM=/path/to/chromium if needed)
docker compose up -d --build   # deploy behind Traefik
```
