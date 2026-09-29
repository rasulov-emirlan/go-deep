# Verify log — dist-transactions (src/topics/dist-transactions)

Sources: Kafka trunk ProducerConfig.java / ConsumerConfig.java (raw GitHub), reasoning for DB behaviours. No Go snippets on page except SQL/`select` pseudo-code (Postgres `INSERT ... ON CONFLICT DO NOTHING` syntax valid).

## Claims checked
- 2PC roles, prepare = force-write + locks + YES promise, commit point = coordinator log, in-doubt blocking, duplicate COMMIT must be idempotent, peers help only if one heard: standard, consistent with research note. OK.
- Go `database/sql` has no XA: true (no such API in stdlib). OK.
- Spanner = 2PC over Paxos groups, replicated prepare/decision: [SNIP], kept. Step-7 caption "new leader reads the log and finishes COMMIT" overclaimed (if the crash came before COMMIT was logged the leader may abort) -> FIXED: "commit if decided, else abort".
- Saga: T1/T2 committed, undo in reverse order (refund then release), pivot semantics (go/no-go, after it retry), compensation is a forward txn, idempotent, alert when stuck. OK (Richardson terms; [SNIP]).
- Cancel-before-create timeline: reserve sent y=90, arrives y=230; cancel sent y=140 arrives y=190 -> overtakes; box at y=250 after both. Adds up. OK. Box clipped at right edge on phone -> FIXED (moved/narrowed).
- Saga isolation: "dirty read: 4 never really existed" imprecise (it was committed, later undone) -> FIXED wording. Semantic lock, commutative updates: OK.
- Outbox: dual-write failure both orders; relay crash between publish and mark -> at-least-once. OK.
- **Polling skip claim**: logically right only for a *cursor* poll (`id > last`, advance to max seen). Needs: ids allocated at insert (sequence/auto-inc, not rolled back), commit order != id order, and a poll snapshot taken after B commits but before A commits (true in every isolation level: the poll only sees committed rows). With a flag poll (`WHERE sent_at IS NULL`, incl. SKIP LOCKED) nothing is skipped, but row 10 can be published after 11 (misordering). The research note bullet blurred these two. FIXED: stop card now states both, plus the safe-cursor fix (advance only past ids no open txn can still commit, e.g. Postgres xmin horizon) or CDC.
- Inbox SQL and same-txn rule: OK. Key = producer event id not offset: OK.
- Idempotency key flow: unique claim row, stored response, 409 in-flight, 422 different hash (design choice; IETF idempotency-key draft uses same codes; Stripe differs, page does not attribute), lease for crashed worker, TTL > retry horizon. OK.
- Kafka idempotent producer: PID + per-partition sequence, per producer session, needs acks=all, retries>0, max.in.flight<=5; enabled by default when no conflicting config (ProducerConfig doc). Page states scope only. OK.
- Kafka transactions: transactional.id + epoch fencing, atomic output+offsets, consumers default `read_uncommitted` (ConsumerConfig DEFAULT_ISOLATION_LEVEL = READ_UNCOMMITTED). OK. "Inside one Kafka cluster": [SNIP] kept.
- Idempotency "PSP key derived from K1": design advice. OK.

## Not verified
Paxos Commit, 3PC (not on page), Stripe specifics (not on page), Temporal (not on page).

## Illustrations
All frames of the 10 figures reviewed at 390 (and 1280 sheets generated). Fixes: cancelFirst box clipping, inbox box clipping at right, "no 2nd charge" label near edge. No overlapping arrows or misleading dashes found; lost arrows end in x as intended.
