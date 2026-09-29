# Relink notes (new topic sections -> interview bank)

Method: read all ~700 questions (algorithms/behavioral/generics/slices/maps/interfaces/errors were screened by
keyword/id only; none fit a new section), judged by section titles/flows and each Page.tsx "Asked in real
interviews" id list. Links are conservative; max 2 per question.

## Counts
- relink.json entries: 78 (all validated against the bank ids)
- New links added to previously unlinked questions: 26
- Existing links replaced/extended (list changed): 52
  - of those, existing anchor kept as 2nd (or 1st) where still fitting: ~35; fully replaced: ~17
- Existing links unchanged: 237 (289 previously linked minus 52 changed)
- Result: 315 linked questions (was 289), 156 sections. `npx vitest run src/bank`: 600 tests pass.

## Deliberately NOT linked (section does not really teach it)
- networking-https-tls, networking-tls-handshake-asymmetric: tls-quic starts after the handshake (resume/certs/MTU only).
- architecture-service-discovery, leader election: no section covers a registry; consensus#election is Raft terms only.
- concurrency-patterns-rate-limiter-external-api, throttle-token-bucket, system-design-distributed-rate-limit: rate
  limiting appears only as a retry-budget caption in resilience, not a limiter section.
- memory-gc-goroutine-stack, memory-gc-stack-vs-heap: virtual-memory#go has no stack content.
- databases-uuid-v7, sql-row-order-uuid (clocks): tangential. devops-ipc-mechanisms: pipes only in passing.

## Answers that look wrong/outdated versus the new pages (answers NOT edited)
| id | what is wrong | correct statement |
|---|---|---|
| networking-keep-alive | ALB idle-timeout ordering backwards | The target's keep-alive/idle timeout must be LONGER than the LB idle timeout, so the LB (not the backend) closes first; otherwise the backend closes an idle conn the LB reuses -> 502/RST (dns-lb#timeouts) |
| architecture-circuit-breaker | Describes sliding window / half-open with a few probe requests | gobreaker default trips on consecutive failures (>5) and half-open MaxRequests defaults to 1; rate/window-based tripping needs a custom ReadyToTrip (resilience#breaker) |
| goroutines-scheduler-netpoller | Says regular files are "always ready" to epoll | epoll_ctl on regular files fails with EPERM; file I/O blocks a thread in a syscall (P handed off), it is not parked via netpoller (os-io#go) |
| goroutines-scheduler-syscalls-handoff | Mentions the _Psyscall P state | _Psyscall was removed in Go 1.26; do not present it as current (syscalls#go) |
| messaging-kafka-replication-fault-tolerance | acks=all described as all replicas / min.insync default | acks=all means all IN-SYNC replicas (the ISR); min.insync.replicas defaults to 1, so durability needs RF=3 + min.insync.replicas=2 (replication#kafka) |

Not verified in depth beyond the five known candidates; other answers were not audited line by line.
