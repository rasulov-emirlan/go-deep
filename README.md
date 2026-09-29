# Go Deep

Interactive deep-dives into the Go runtime for senior engineers. Live: https://godeep.night.enkiduck.com

| Topic | Labs |
|---|---|
| GMP scheduler | scheduler simulator (runnext, steal-half, runqputslow, syscall handoff, netpoller, sysmon preemption), preemption timeline, container GOMAXPROCS, stack growth |
| Maps & Swiss tables | Swiss map (H1/H2, probing, tombstones, small map, table doubling + extendible-hash splits), SWAR control-word lab, classic map evacuation, growth-cost race |
| GC & Green Tea | tri-color marking vs 4 write barriers, pacer (GOGC/GOMEMLIMIT/CPU limiter), classic vs Green Tea span scanning, gctrace decoder |

Each topic: mental model → labs → puzzles → interview questions (progress in localStorage).

## Layout

- `src/sim/` — pure, deterministic TS models of the runtime (unit-tested; the scheduler reproduces go1.26's verified 300-goroutine ordering).
- `src/topics/<slug>/` — one folder per topic: `Page.tsx`, labs, `content.tsx` (quiz + interview).
- `src/topics/registry.ts` — add a topic here; entries without `page` render as "coming soon".
- `research/` — source notes the content was written from (Go 1.26.4 source + primary docs).
- `verify/` — Go programs behind every "what does this print" answer. Run `pnpm verify-go`.

## Dev

```
pnpm install
pnpm dev
pnpm test        # vitest: simulator invariants
pnpm e2e         # playwright smoke (PW_CHROMIUM=/path/to/chromium if needed)
docker compose up -d --build   # deploy behind Traefik
```
