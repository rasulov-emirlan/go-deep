# dist-txns — Distributed transactions: 2PC, sagas, outbox, idempotency

Legend: **[SRC]** = read primary text this session. **[SNIP]** = seen only in web-search result summaries (egress proxy blocked
kafka.apache.org, microservices.io, stripe.com, postgresql.org, temporal docs, usenix; only GitHub raw + pkg.go.dev were fetchable). **[REASON]** = my own derivation, standard but not sourced here.
**UNVERIFIED** = memory only.

## 1. Mechanism

**The problem.** One business action touches 2+ independently-failing stores/services (order DB + payment + inventory + Kafka). No single commit point. Failure modes: crash between steps, lost ack (unknown outcome), duplicate delivery.

### 1a. Two-phase commit (2PC)
Roles: coordinator (TM) + participants (RMs).
1. **Prepare/vote**: coordinator sends PREPARE; each participant does the work, takes locks, force-writes a *prepare record* to its log, then votes YES (promise: "I can commit and will not unilaterally abort") or NO.
2. **Commit/abort**: if all YES, coordinator force-logs COMMIT (**the commit point**), then sends COMMIT; participants apply, release locks, ack. Any NO/timeout -> ABORT.
Cost: 2 round trips, 2 forced log writes on the critical path per participant, locks held across both phases (+ coordinator log write).

**The blocking problem.** A participant that voted YES is *in doubt*: it cannot abort (coordinator may have decided COMMIT and told others) nor commit (may have been ABORT). If the coordinator crashes after collecting votes (or after telling only some), participants hold locks until it recovers — possibly hours. Only the coordinator's durable log knows the outcome. Termination protocols (ask peers) resolve it only if some peer already learned the decision.
- Postgres shows the real-world shape: `PREPARE TRANSACTION 'gid'` / `COMMIT PREPARED`; `max_prepared_transactions` default **0** (disabled); orphaned prepared txns keep locks and hold back VACUUM until someone manually `ROLLBACK PREPARED` [SNIP of postgresql.org docs + CYBERTEC].
- **XA**: X/Open standard API between TM and RMs (`xa_start/end/prepare/commit/recover`); JTA in Java, `database/sql` in Go has **no XA** [REASON: no such API in stdlib]. Costs: chatty, holds locks, TM is a SPOF/availability tax, poor fit for HTTP/NoSQL/SaaS participants (Stripe can't prepare).
- **3PC** (Skeen 1981): adds pre-commit phase so participants can safely time out; non-blocking only under a synchronous/bounded-delay network model with no partitions — in a real partitioned network it can violate atomicity, so nobody uses it [REASON/UNVERIFIED-by-fetch; Gray-Lamport consensus paper contrasts it].
- **Paxos Commit** (Gray & Lamport 2006): one Paxos instance per RM's vote, 2F+1 acceptors; makes progress with F+1 alive; classic 2PC is the F=0 special case; +1 message delay in fault-free case, same stable-storage write delay [SNIP].
- **Spanner**: 2PC *over Paxos groups*. Each participant is a Paxos group with a leader; client picks one group's leader as coordinator; prepare records and the commit decision are Paxos-replicated, so a leader crash = leader re-election, not a stuck txn. Locks (2PL) at leaders; commit timestamp via TrueTime with **commit wait** until TT.after(ts) for external consistency [SNIP of Spanner OSDI'12 summaries]. Same trick: CockroachDB (txn record + parallel commits), TiDB (Percolator-style), Vitess/Citus 2PC.
- Key insight: 2PC's blocking comes from a *single non-replicated* coordinator; replicate the coordinator's log via consensus and the practical problem mostly disappears, at the cost of latency.

### 1b. Sagas
Origin: Garcia-Molina & Salem, SIGMOD 1987, for long-lived transactions: a saga = sequence T1..Tn of short local txns, each with a compensating Ci; if Tk fails, run C(k-1)..C1 [SNIP, ACM DL]. Purpose then: don't hold locks for a long time. Microservices reuse it for cross-service consistency.
- **Orchestration**: central orchestrator (state machine persisted in DB or a workflow engine) issues commands, tracks state, triggers compensations. Explicit flow, easy to observe; orchestrator is a new component (must itself be durable).
- **Choreography**: services publish events and react to each other. No coordinator; flow is implicit, cyclic-dependency and "where is the order now?" debugging pain beyond ~3-4 steps.
- **Step classes (Richardson)** [SNIP]: *compensatable* (before the point of no return, has an undo), **pivot** (the go/no-go step; after it commits the saga runs to completion; either last compensatable or first retriable), *retriable* (after pivot, no undo — must be idempotent and retried until success). Design rule: order steps so failure-prone/cheap-to-undo first, pivot as late as possible (charge card after reserving stock, not before).
- **Compensation is not rollback.** A rollback erases; a compensation is a *new forward transaction* that semantically counters the effect (refund != never charged: fees, an emailed receipt, a notification, downstream reads already happened). Compensations must be idempotent, retried until success (they "cannot fail" — a failing compensation needs human/alert), commutative with late-arriving originals (the cancel can arrive *before* the create it cancels — must handle "cancel of unknown id" by recording a tombstone), and some effects are irreversible (email sent, parcel shipped) -> put those after the pivot.
- **Isolation anomalies (saga = ACD, no I)** [SNIP]: lost updates (another txn overwrites what saga step wrote, then compensation clobbers it), dirty reads (reading a state that will be compensated), non-repeatable reads. Countermeasures (Richardson): **semantic lock** (status flag e.g. `PENDING`/`APPROVAL_PENDING` on the record; other txns fail/wait/skip), **commutative updates** (debit/credit instead of set), **pessimistic view** (reorder so risky reads happen after retriable steps), **reread value** (optimistic check before overwrite), **version file** (log ops to reorder), **by value** (choose concurrency strategy by business risk).

### 1c. Transactional outbox + relay
Dual write problem: `COMMIT db` and `publish kafka` can't be atomic. Commit-then-publish loses events on crash; publish-then-commit emits phantom events.
- In the **same local txn** as the state change, `INSERT INTO outbox(...)`. A relay later publishes and marks sent.
- **Polling relay**: `SELECT ... WHERE sent_at IS NULL ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED`. Simple; latency = poll interval; load on DB; ordering hazard: with a `bigserial`/auto-inc id, txn A can take id 10, txn B take id 11 and commit first; a poller can read 11, advance past it, and miss 10 later. Fixes: single relay + only read ids below the oldest in-flight txn (`pg_snapshot_xmin`), or order by commit LSN via CDC, or accept per-aggregate ordering only [REASON]. Multiple workers with SKIP LOCKED give no global ordering, at best per-key if you shard workers by key.
- **CDC relay** (Debezium outbox event router): tail the WAL (Postgres logical replication slot, `pgoutput`) or binlog; low latency, no polling, commit order preserved. Costs: replication slot retains WAL until confirmed — a stuck/dead connector lets WAL grow unbounded and can fill the primary's disk (mitigate `max_slot_wal_keep_size`, alert on slot lag) [SNIP]. Table can be insert-then-delete (delete still produces WAL, connector needs only the INSERT).
- **Delivery is at-least-once**: relay can publish then crash before marking / connector restarts from last confirmed LSN -> duplicates. So consumers must dedupe. Ordering: use aggregate id as Kafka key so one aggregate's events land in one partition in order; retries with idempotent producer preserve order.
- Cleanup: delete/partition sent rows or the table balloons.

### 1d. Inbox / idempotent consumer
`BEGIN; INSERT INTO inbox(msg_id) ON CONFLICT DO NOTHING; if rows==0 -> skip+commit; else apply effect; COMMIT;` Effect and dedupe record commit atomically or it's not exactly-once (crash between them = lost or doubled effect). Key must be stable across redeliveries (producer-assigned event id, not broker offset that changes after republish). Dedupe retention >= max redelivery/replay window. Naturally idempotent effects (upsert `SET x = v`, `INSERT ... ON CONFLICT`) need no inbox; counters (`x = x + 1`) do.

### 1e. Idempotency keys (API side)
Goal: client retry after unknown outcome must not repeat the effect. Design details (Stripe semantics [SNIP], bank answer `architecture-idempotency-keys-payments` matches):
1. Client generates key per *logical operation* (UUID at intent creation), reuses on every retry. Stripe: keys up to 255 chars; may be pruned after >=24h [SNIP].
2. Server: **atomically** claim key with a unique constraint: `INSERT (key, scope/user, request_fingerprint, status='in_progress', locked_at)`; scope by tenant/user so keys don't collide across customers.
3. Outcomes on second arrival: *completed* -> return the **stored response** (status+body, even a 500 — Stripe stores whatever the first execution returned [SNIP]); *in-flight* -> 409/425 (or block/poll) — never run twice concurrently; *different fingerprint* (hash of method+path+body) -> 422/400 "key reused with different params" (Stripe errors) [SNIP]. Requests rejected before execution starts (validation error, concurrency conflict) don't save a result [SNIP].
4. Store result **in the same DB txn as the business write** (else crash between effect and key-update = double effect on retry or stuck in-flight). For side effects in *other* systems (PSP), forward a derived idempotency key downstream and use a recovery/reconciliation step; in_progress rows need a lease (`locked_at`) so a crashed worker's key becomes retryable (as a resume from a recorded step, not from scratch).
5. TTL long enough to cover client retry horizon and queue redelivery; Redis `SET NX` is a fast pre-check, not the durability guarantee.
6. HTTP: `PUT/DELETE/GET` idempotent by RFC 9110 semantics; `POST/PATCH` not. Idempotency != same response.

### 1f. "Exactly-once" — what's real
- Network can't give exactly-once *delivery* (Two Generals); you get at-least-once + dedup = **effectively-once processing**.
- **Kafka idempotent producer**: broker assigns PID; per (PID, partition) monotonically increasing sequence numbers; broker drops duplicates and rejects gaps. Scope: one producer session (PID changes on restart unless transactional), one partition. Default `enable.idempotence=true` since Kafka 3.0 (implies `acks=all`, retries=MAX, `max.in.flight<=5`; conflicting explicit configs disable it silently unless idempotence is set explicitly) [SNIP].
- **Kafka transactions** (KIP-98): `transactional.id` gives a stable identity across restarts; coordinator bumps a producer **epoch** on `initTransactions`, fencing zombie producers (KIP-447 changed fencing for consumer-group EOS) [SNIP]. Atomic multi-partition write + consumer offsets commit (offsets are just writes to `__consumer_offsets`) = atomic consume-transform-produce. Consumers need `isolation.level=read_committed` (default is `read_uncommitted`). Default `transaction.timeout.ms` = 60000 [SNIP, UNVERIFIED-by-fetch]. **Scope: inside one Kafka cluster.** A DB write, HTTP call or email inside the "transaction" is not covered — that's why outbox/inbox exist [SNIP: KIP-98/strimzi].
- Kafka Streams `exactly_once_v2` = the above wired up; "exactly-once" in marketing = exactly-once *state and output within Kafka*.
- Everything external: idempotent consumer + outbox.

### 1g. TCC (Try-Confirm-Cancel)
Each participant exposes 3 ops: **Try** reserves resources (hold funds, decrement "available", not "total"), **Confirm** makes it final, **Cancel** releases. Coordinator drives (like 2PC but at the *application* level with business-level reservations, no DB locks held). Requirements: Confirm/Cancel idempotent, retried until success; Cancel must tolerate arriving *before* Try ("empty rollback") and Try after Cancel ("hanging"/suspension) — track txn state per xid. Benefit: reservations visible = mitigates saga isolation issues; cost: every service needs 3 endpoints. (Alibaba Seata TCC) [UNVERIFIED-by-fetch].

### 1h. Durable execution (Temporal, Cadence, Restate, Azure Durable Functions)
Workflow code is ordinary code; the engine persists an **event history** of every command/result (activity scheduled/completed, timers, signals). After a crash a worker **replays** the code against the history, skipping completed activities, resuming at the exact line. Hence workflow code must be **deterministic** (no wall-clock, random, goroutines/map iteration, direct I/O — use `workflow.Now`, `workflow.Go`, side-effect APIs); non-deterministic code causes replay non-determinism errors [SNIP of Temporal docs]. Activities (all I/O) carry a default retry policy (workflows don't) with backoff, timeouts (schedule-to-close, start-to-close, heartbeat); activities are **at-least-once** so still need idempotency keys (Temporal provides stable activity ID). Saga = plain code with a `defer`/compensations list; compensations are activities (durably retried). Trades: infra to run, versioning of running workflows (`workflow.GetVersion`), history size limits, determinism discipline. It replaces hand-rolled orchestrator + outbox + retry tables, not idempotency.

## 2. Edge cases & gotchas
- **Coordinator crash after PREPARE-ack, before COMMIT written**: participants stuck holding locks. Why: YES vote is irrevocable; outcome known only to coordinator's log.
- **Coordinator crash after COMMIT logged but before delivery**: recovery must re-send COMMIT (participants must handle duplicate commit/abort idempotently); "presumed abort" optimization: no log record => abort.
- **Participant crash after voting YES**: must recover its prepared state from its log and ask coordinator — hence force-write before voting.
- **Timeouts in 2PC**: a participant can time out and abort *only before* voting; after YES it must wait.
- **Postgres prepared txns idle for days** block VACUUM, bloat, and hold row locks -> outage; `max_prepared_transactions` default 0 [SNIP].
- **Saga: compensation ordering vs. concurrency** — compensations run reverse order but parallel branches may complete in any order; cancel-before-create race.
- **Saga has no atomic visibility**: users see "order created, payment pending"; design the UX/state model for it (PENDING states).
- **Compensation failures**: retry forever w/ backoff + alert; a saga stuck in COMPENSATING is a P1.
- **Outbox published-twice**: relay crash between publish and mark; Debezium restart replays from last flushed offset -> duplicates.
- **Outbox row IDs commit out of order** -> polling by `id > last` can skip rows [REASON].
- **Replication slot leak** (CDC): WAL fills disk [SNIP].
- **Idempotency key stored but response lost again**: retry returns stored response — good; but key stored *after* effect in a *different* txn -> double effect. Same-txn rule.
- **Key reuse with different body** must be rejected, not silently return old result.
- **In-flight duplicate** (client retries after its own timeout while first request still running) -> need `in_progress` state; otherwise two concurrent executions.
- **TTL shorter than retry horizon** (e.g. 24h key vs a queue redelivering after a week) -> duplicate effect.
- **Kafka EOS doesn't cover your DB**; also consumer `read_uncommitted` default sees aborted messages. Producer `transactional.id` collisions across instances fence each other (zombie fencing works both ways).
- **`max.in.flight>5` with idempotence** -> config error; explicit conflicting configs can silently turn idempotence off in some versions [SNIP].
- **Temporal non-determinism**: editing workflow code with running executions breaks replay unless versioned.

## 3. Common misconceptions
- "Sagas give you rollback." No, they give semantic compensation; intermediate states are visible, and some effects can't be undone.
- "Saga = eventual consistency, so no isolation problems." They're *ACD*; you must design countermeasures (semantic locks etc.).
- "Use 2PC when you need correctness, sagas when you don't care." Sagas are correct *if* you model states/compensations; 2PC trades availability and throughput for isolation.
- "2PC is blocked forever if a participant dies." Mostly the coordinator; a dead participant before voting = abort. After voting YES it recovers from its log.
- "3PC solves 2PC blocking." Only under synchronous-network assumptions; Paxos Commit / consensus-replicated coordinator is the real answer.
- "Kafka gives exactly-once, so I don't need idempotency." Only inside Kafka.
- "Outbox gives exactly-once." At-least-once + ordering-per-key; needs idempotent consumers.
- "Idempotency key = dedupe cache in Redis with TTL." Must be atomic with the effect and store the result; Redis alone can't be atomic with the DB write.
- "Idempotent means same response." Same *state change*.
- "Retries fix timeouts." Timeout = unknown outcome; only safe with idempotency.
- "Event sourcing/CDC makes the outbox unnecessary." CDC on business tables is an alternative, but couples consumers to your schema; outbox = explicit contract.

## 4. Go tie-ins
- `database/sql`: no XA; use `db.BeginTx(ctx, &sql.TxOptions{Isolation: ...})`. Postgres 2PC needs raw `PREPARE TRANSACTION` via `tx.Exec` and a connection you keep — do not go through a pool that can hand the connection to someone else. pgx: `pgx.Tx`, `pgconn.PgError` code `23505` for unique violation — use it for idempotency insert conflicts; `INSERT ... ON CONFLICT DO NOTHING` + `RowsAffected()==0` for inbox.
- Idempotency store pattern in Go: middleware reads `Idempotency-Key`, computes `sha256(method+path+body)`, `tx.Begin`, insert-or-select-for-update the key row, run handler with the same `tx`, write response into key row, `tx.Commit`. In-process only `singleflight` is *not* idempotency (per-process, per-call).
- Outbox relay: `SELECT ... FOR UPDATE SKIP LOCKED`; Kafka clients: `segmentio/kafka-go` (`RequiredAcks: RequireAll`, Writer `Async` off), `IBM/sarama` (`Producer.Idempotent=true` requires `Net.MaxOpenRequests=1` in sarama, `Producer.RequiredAcks=WaitForAll`; sarama transactional producer supported), `twmb/franz-go` (`kgo.TransactionalID`, `kgo.GroupTransactSession` for EOS consume-transform-produce — best-in-class EOS in Go). Debezium is JVM (Kafka Connect); Go alternatives: `wal-listener`, pglogrepl (`jackc/pglogrepl`) for hand-rolled CDC. [library option details UNVERIFIED-by-fetch]
- Temporal Go SDK (`go.temporal.io/sdk`): `workflow.ExecuteActivity`, `workflow.Go`, `workflow.NewSelector`, `workflow.Now`; use `workflow.GetVersion`; saga helper: keep `var compensations []func(ctx) error` and `defer` with `workflow.NewDisconnectedContext` so compensation runs even if the workflow was cancelled. [SNIP]
- Context: cancellation after unknown outcome — `ctx` timeout on a payment call must map to `PENDING`, not `FAILED` (bank id `architecture-payment-timeout-reconciliation` says this correctly).

## 5. Illustration plan
**Scene A — 2PC ladder (8 frames).** Lifelines: Client, Coordinator, Shard A, Shard B, each with a log strip.
1. Client -> Coord: "transfer". Point: two resources must change together.
2. Coord -> A,B: PREPARE. 3. A, B write prepare record + take locks (padlock icons), reply YES. Point: promise, locks held.
4. Coord force-writes COMMIT to its log (star = commit point). 5. COMMIT -> A, B; apply, unlock, ack. Happy path.
6. Replay frames 1-3, then **coordinator crashes** (red): A and B sit "in doubt", locks stay. **STOP: "what happens if the coordinator dies after prepare?"**
7. Why they can't decide alone: cannot commit (maybe ABORT), cannot abort (maybe COMMIT). 8. Fix: coordinator log replicated by Paxos (Spanner) — crash = new leader reads log and finishes. **STOP: "how does Spanner avoid it?"**

**Scene B — saga with a failure (9 frames).** Row of 3 services + orchestrator state machine.
1. Orchestrator: order PENDING. 2. T1 reserve stock ok. 3. T2 charge card ok (pivot? shown labelled). 4. T3 ship fails (or, for a variant, fails at T2). 5. Orchestrator runs C2 refund, 6. C1 release stock, order CANCELLED. 7. Meanwhile another user reads stock mid-saga — sees reduced qty (dirty read). **STOP: "what isolation does a saga give?"** 8. Semantic lock: stock row flagged `RESERVED_PENDING`. 9. Compensation arrives before the create (cancel-before-reserve race) -> tombstone. **STOP.** Add legend: compensatable / pivot / retriable colors.

**Scene C — outbox to consumer (8 frames).** Boxes: App+DB (with `orders` and `outbox` tables), Relay, Kafka, Consumer(+inbox table).
1. App writes order + outbox row in one txn (single commit). 2. Relay polls/tails WAL, reads outbox row. 3. Relay publishes to Kafka. 4. **Crash before marking sent** — row remains. 5. Relay restarts, publishes again: duplicate in topic. **STOP: "outbox is exactly-once, right?"** 6. Consumer inbox: INSERT msg_id ON CONFLICT DO NOTHING; second copy skipped. 7. Polling ordering hazard: ids 10/11 commit order swapped, relay skips 10. **STOP.** 8. CDC variant: WAL stream in commit order; slot lag meter ↑ when connector dies.

**Scene D — idempotency key + exactly-once scope (7 frames).** Ladder: Client, API, DB(idempotency table), PSP.
1. POST with key K; API inserts (K, hash, in_progress). 2. Charge + write result + mark done, one DB txn. 3. Response lost (X on arrow). 4. Client retries K: API finds done -> returns stored response, no second charge. 5. Variant: retry arrives while first still in progress -> 409. 6. Variant: same K, different body -> 422. **STOP: "same key, different body?"** 7. Zoom-out: Kafka EOS box wraps only Kafka topics; DB and PSP outside the box -> need idempotency. **STOP: "does Kafka EOS cover my DB write?"**

## 6. Existing interview questions
- `architecture-saga-pattern`: correct and fairly complete (orchestration/choreography, idempotent compensations, pivot, semantic locks). Missing: retriable-vs-compensatable classification, "compensation may arrive before the action", specific anomalies (lost update/dirty read), and the note that compensation is a forward action not a rollback (says "semantic undo", ok).
- `architecture-saga-booking-design`: consistent with pivot ordering; fine.
- `architecture-idempotency-keys-payments`: good and matches Stripe semantics; missing request-fingerprint reasoning detail ok (it has request_hash, 422), missing in-flight lease/crash recovery and "don't store result when validation fails".
- `architecture-idempotency`: fine. `networking-http-methods-idempotency`: not read in full.
- `architecture-payment-timeout-reconciliation`: right (timeout = unknown outcome).
- `messaging-transactional-outbox`: right; missing outbox polling ordering hazard (id gaps/commit order) and CDC replication-slot WAL retention risk.
- `messaging-outbox-relay-concurrency`: SKIP LOCKED correct; note it loses global ordering — bank answer's "publish per aggregate in id order" only holds with one relay per key.
- `messaging-idempotent-consumer-dedup`: correct (inbox in same txn).
- `messaging-delivery-guarantees-exactly-once`: correct and appropriately scoped (Kafka->Kafka only). Missing: `read_committed` default is off; idempotent producer scope (PID+partition, per session); epoch fencing.
- No existing id on 2PC/XA/3PC/Paxos-Commit/TCC/Temporal found by grep (searched ids containing 2pc/saga/outbox/idempot/exactly) -> gap.

## 7. Sources
- Kafka KIP-98 (cwiki.apache.org/confluence/display/KAFKA/KIP-98...), KIP-447, Confluent "Transactions in Apache Kafka", Strimzi transactions blog: PID/sequence, epoch fencing, read_committed, scope limited to one Kafka cluster [SNIP; pages blocked]. Idempotence default true since 3.0 (kafka.apache.org/30/getting-started/upgrade) [SNIP].
- Gray & Lamport, "Consensus on Transaction Commit", ACM TODS 2006 (dl.acm.org/doi/10.1145/1132863.1132867) [SNIP].
- Corbett et al., Spanner, OSDI 2012 (research.google.com/archive/spanner-osdi2012.pdf) [SNIP].
- Garcia-Molina & Salem, "Sagas", SIGMOD 1987 (dl.acm.org/doi/10.1145/38713.38742) [SNIP].
- Richardson, microservices.io/patterns/data/saga.html and *Microservices Patterns* ch.4: pivot/retriable/compensatable, countermeasures [SNIP via search summaries of secondary articles].
- Stripe API idempotent requests (docs.stripe.com/api/idempotent_requests): 255 chars, 24h pruning, stored result incl. 500, param mismatch error, not saved if validation fails/concurrent conflict [SNIP].
- PostgreSQL PREPARE TRANSACTION docs (postgresql.org/docs/current/sql-prepare-transaction.html), CYBERTEC "prepared transactions and their dangers": default 0, locks, VACUUM [SNIP].
- Debezium PostgreSQL connector docs + Trade Republic/Zalando blogs: slot, WAL retention, at-least-once, `max_slot_wal_keep_size` [SNIP].
- Temporal docs (docs.temporal.io: event history, retry policies, deterministic replay) [SNIP].
- Not verified/none: Skeen 3PC original, Seata TCC, Go client library option names (franz-go/sarama specifics), exact Kafka `transaction.timeout.ms` default.
