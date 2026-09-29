# dist-replication — Replication & quorums

Verification note: read directly from primary text (GitHub raw): Postgres docs SGML (`high-availability.sgml`, `config.sgml`, `monitoring.sgml`, `pg_rewind.sgml`), Kafka
source/docs (`ProducerConfig.java`, `TopicConfig.java`, `LogConfig.java`, `ReplicationConfigs.java`, `ServerLogConfigs.java`, `docs/design/design.md`), Cassandra docs +
`cassandra.yaml`. Dynamo paper, Kleppmann's DDIA, KIP-101, Shapiro CRDT paper: WebSearch snippets only or memory (tagged). Anything tagged UNVERIFIED was not confirmed.

## 1. Mechanism

**Why replicate:** availability (survive node loss), read scaling, latency (geo-local copies). It does not scale writes/storage (see `databases-sharding-vs-replication`).

### 1a. Single-leader
- All writes go to the leader, which appends to a log (Postgres WAL, MySQL binlog, Kafka partition log, Raft log). Followers apply the log **in order**. Clients may read from followers.
- **Async:** leader acks after local durability; followers catch up later. Fast, leader unaffected by slow followers; **lag** and **loss of acked writes on failover**.
- **Sync:** leader acks only after N followers confirm. RPO=0 but every commit pays a round trip and a dead sync follower **stalls commits**. Postgres docs: commits "may never be completed if any one of the synchronous standbys should crash".
- **Semi-sync / quorum sync:** wait for *some* subset (Postgres `ANY k (s1,s2,s3)` quorum; `FIRST k (...)` priority). Latency = k-th fastest.
- **Postgres specifics** (docs read): physical streaming = WAL sender on primary -> WAL receiver on standby, hot standby serves read-only queries. Levels of `synchronous_commit`: `off` < `local` < `remote_write` (standby OS received+wrote, not fsynced; survives standby Postgres crash, not OS crash) < `on` (default; standby fsynced WAL) < `remote_apply` (standby replayed - visible to queries; "load balancing with causal consistency" in simple cases). Settable per transaction. Sync applies only to standbys named in `synchronous_standby_names`, directly connected (cascaded standbys unknown to the primary). Lag columns in `pg_stat_replication`: `write_lag`, `flush_lag`, `replay_lag`. Replication slots make the primary keep WAL for a standby; `max_slot_wal_keep_size` default **-1 = unlimited** (a dead standby with a slot can fill `pg_wal`); `wal_keep_size` for slot-less standbys. `wal_receiver_timeout` default 60 s; standby `max_standby_streaming_delay` default 30 s (replay waits this long for conflicting queries then cancels them); `hot_standby_feedback` stops the primary vacuuming rows standby queries need (avoids cancels, causes bloat).
- **Failover:** detect (heartbeat timeout) -> pick the most advanced follower -> promote (Postgres `pg_promote()`, new **timeline**) -> repoint clients -> old leader must not accept writes. Old primary rejoins via `pg_rewind` (finds the divergence point via timeline history, copies changed blocks) or full re-base.

### 1b. Failure of the naive scheme
1. **Async failover loses acked writes.** Leader acked txn T, crashed before shipping; follower promoted without T; when the old leader returns, T is discarded/diverged. Worse if T's ids were already handed out (auto-increment reuse, GitHub 2012-style; UNVERIFIED anecdote).
2. **Split-brain:** old leader is alive but partitioned; a new leader elected; two writers. Prevent by fencing: quorum-based election with terms/epochs (Raft), STONITH/lease, storage fencing tokens - a leader must stop when it cannot reach quorum.
3. **Replication lag anomalies** (Kleppmann DDIA, snippet): read-your-writes violated; monotonic reads violated (two replicas with different lag); consistent-prefix violation (answer seen before question when different partitions replicate independently).
4. **Sync stall / cascading blocking:** one slow sync replica delays all commits.

### 1c. Multi-leader
Leader per region/datacenter, async replication between leaders. Wins: local write latency, DC-outage tolerance. Cost: **write conflicts** (same key updated concurrently on two leaders), no global uniqueness/constraints, replication loops, harder auto-increment. Conflict handling: avoid (route a key's writes to one home leader), LWW by timestamp (loses data, see dist-time), merge (per-field, CRDT), app-level resolvers, keep siblings. Topologies: all-to-all (can reorder causally), circular/star (single point). Postgres logical replication/BDR-style, MySQL group repl, Cassandra multi-DC, CouchDB.

### 1d. Leaderless (Dynamo-style)
- Key -> N replicas (consistent hashing preference list). Client/coordinator sends write to all N, waits for **W** acks; read asks all/some N, waits for **R** responses, returns newest (by version). If **W+R>N**, every read set intersects every write set, so at least one responder holds the latest acked write.
- Typical N=3, W=2, R=2. W=N,R=1 -> fast reads, writes block on any failure. W=1,R=N opposite. Cassandra: writes always go to all replicas, CL only controls how many acks the coordinator awaits; `QUORUM` = n/2+1 (docs read).
- **Why W+R>N still isn't linearizable** (DDIA snippet): N=3, W=3, R=2. Writer sends v1 to r1,r2,r3; only r1 has it so far (write not yet complete). Reader X reads r1,r2 -> sees v1 (newest). Reader Y starts *after* X finished, reads r2,r3 -> both old -> returns v0. Real-time order violated. Also: LWW/clock skew, sloppy quorums, concurrent writes, partial-failed writes that are not rolled back (a write that got <W acks reports failure but remains on some replicas and can be read later), a node restored from stale data.
  Making it linearizable needs read repair *synchronously before returning* (ABD-style) or consensus (Cassandra LWT/Paxos).
- **Sloppy quorum + hinted handoff:** if home replicas are unreachable, write to other reachable nodes (stand-ins) with a hint; on recovery the stand-in forwards. Availability up, but R/W no longer guarantee overlap; the stand-in is not in the read set. Cassandra: `hinted_handoff_enabled: true`, **`max_hint_window: 3h`** (stop storing hints for a node dead longer than that), `max_hints_delivery_threads: 2`, `hinted_handoff_throttle: 1024KiB`; CL `ANY` = a stored hint counts as an ack (cassandra.yaml + docs read).
- **Read repair:** on a read, coordinator compares replies, writes newest back to stale replicas. Only repairs keys that are read.
- **Anti-entropy:** background compare of replicas using **Merkle trees** (hash of key ranges, compare roots, descend into differing subtrees, sync only mismatched ranges). Cassandra `nodetool repair` (docs: "best-effort techniques... to guarantee eventual consistency Cassandra implements anti-entropy repair"). Repairs must run within `gc_grace_seconds` (default 864000 = 10 days; UNVERIFIED) or deleted data can resurrect.
- **Versioning/conflicts:** vector clocks (Dynamo) -> siblings returned to client; or LWW timestamps (Cassandra per-cell). See dist-time.

### 1e. Conflict resolution & CRDTs
- **LWW register:** keep highest (timestamp, replicaId). Convergent; silently drops concurrent writes.
- **Siblings:** keep all concurrent versions (vector clock-detected), app merges (Riak, Dynamo shopping cart = union; deleted items can reappear).
- **CRDT** (Shapiro et al. 2011; convergent = state-based, merge is commutative, associative, idempotent = a join in a semilattice; snippets/memory): 
  - **G-Counter:** vector of per-replica counts; `inc` bumps own slot; `merge` = element-wise max; value = sum. Grows only.
  - **PN-Counter:** two G-Counters P and N; value = sum(P) - sum(N).
  - **OR-Set (observed-remove):** `add(e)` creates unique tag `(e, id)`; `remove(e)` removes only the tags *observed* at the remover; merge = union of adds minus union of tombstones (or causal-context variant). Concurrent add(e) & remove(e) -> add wins (new tag unseen by the remover). Fixes the naive 2P-set where a removed element can never return.
  - Operation-based CRDTs need reliable causal delivery; state-based need only gossip/merge but bigger messages (delta-CRDTs mitigate).
  - Limits: CRDTs give **strong eventual consistency** - no invariants like "balance >= 0" or uniqueness without coordination.

### 1f. Worked example: Kafka (single-leader with ISR, not a majority quorum)
Setup: partition P, RF=3 = leader L, followers F1, F2. Facts read from source/design docs:
- Committed = replicated to **all replicas currently in the ISR** (design.md). Consumers only see committed records (up to the high watermark).
- ISR membership: a follower is removed if it has not fetched/caught up to the leader's log end for **`replica.lag.time.max.ms` = 30000** (default). `replica.fetch.wait.max.ms` default 500 ms must stay below it.
- Producer `acks`: `0` (fire and forget), `1` (leader only), **`all`/`-1` (current `ProducerConfig` default is "all"; the release that changed it, believed 3.0, UNVERIFIED, `enable.idempotence` default true, `retries` default Integer.MAX_VALUE, `delivery.timeout.ms` 120000)**. `acks=all` = every *current* ISR member must ack, **not** every assigned replica. If ISR shrinks to {L}, `acks=all` succeeds with only the leader having the record (design.md: "these writes could be lost if the remaining replica also fails").
- **`min.insync.replicas`** (default **1**, topic/broker) = minimum ISR size (including the leader) for an `acks=all` write to be accepted; else producer gets `NotEnoughReplicas` (rejected before append) or `NotEnoughReplicasAfterAppend` (ISR shrank after leader appended; record may still become committed/visible -> retry duplicates unless idempotent). Typical durable set: RF=3, `min.insync.replicas=2`, `acks=all`, `unclean.leader.election.enable=false` (default false).
- Frames: happy path (all 3 in ISR, all 3 ack). F2 stalls 30 s -> dropped from ISR -> ack needs L+F1 (2 >= min ISR). F1 dies too -> ISR={L}, size 1 < 2 -> writes rejected (availability sacrificed for durability). L dies with ISR={L}: with unclean=false the partition stays offline until L or an ISR member returns; with unclean=true a stale replica becomes leader and **acked messages are lost** (design.md "Unclean leader election" - a consistency vs availability choice).
- Failure tolerated: with f+1 replicas in ISR, tolerates f failures without losing committed messages (design.md); majority-quorum needs 2f+1. Cost: latency is set by the *slowest ISR member*, not the fastest majority.
- Truncation after failover: old high-watermark based truncation could lose committed data on fast leader changes; **KIP-101** stamps records with a *leader epoch* and follower truncation uses epoch start offsets instead (snippet).
- Controller: KRaft (Raft) in Kafka 4.x; ZooKeeper removed in 4.0 (matches existing bank answer). Eligible Leader Replicas (ELR) changes `min.insync.replicas` semantics in newer versions (TopicConfig doc note, read; details UNVERIFIED).

## 2. Edge cases & gotchas

- **`synchronous_commit=on` is not "RPO 0 on failover".** Why: only the *named sync standby* is guaranteed to have it; if you promote a different/async standby you lose commits. Also the txn is locally committed and visible on the primary *before* the standby ack, so readers may see a value that a failover then erases.
- **Sync standby down = primary commits hang** (Postgres docs). Why: it waits forever for the required acks; use `ANY 1 (a,b)` or a monitor that relaxes it.
- **`remote_write` durability**: standby OS crash can lose it, Postgres crash cannot (docs). Why: data is in OS cache, not fsynced.
- **Standby reads cancelled**: "canceling statement due to conflict with recovery" after 30 s (`max_standby_streaming_delay`); `hot_standby_feedback=on` trades this for primary bloat.
- **Replication slot fills the disk**: `max_slot_wal_keep_size` default -1 (unlimited). Why: slot pins WAL until the standby confirms it.
- **Old primary rejoins with divergent WAL** -> cannot just start streaming; needs `pg_rewind` or rebuild (docs: timelines diverged).
- **Lag is not a constant**: `replay_lag` spikes on big transactions/VACUUM/conflicts; `write_lag < flush_lag < replay_lag` ordering.
- **Kafka `acks=all` with `min.insync.replicas=1` (the default)** is durable only against "everyone in ISR", which can be just the leader. Why: default min ISR is 1 and RF default is 1 (broker `default.replication.factor`=1).
- **`min.insync.replicas=RF`** blocks writes on any single failure (no fault tolerance for writes). Rule: RF=3, min ISR=2 tolerates 1 broker down for writes, 2 down for reads of committed data.
- **`NotEnoughReplicasAfterAppend` -> record may exist**; blind retry = duplicates without idempotent producer (default on in modern clients; requires acks=all and max.in.flight <= 5).
- **Producer `acks=all` durability only ISR-wide**, and ISR shrink lag is up to 30 s: for up to `replica.lag.time.max.ms` a dead follower is still "in sync" so writes wait for it (latency spike) before it is dropped.
- **Unclean leader election** = pick availability over consistency; produces silent loss and divergent consumer offsets.
- **W+R>N with sloppy quorums** does not guarantee overlap; Dynamo/Riak/Cassandra `ANY` accept writes that only exist as hints.
- **Hints expire**: Cassandra stops hinting after `max_hint_window` (3 h); node down longer than that needs repair, else stale replicas.
- **Deletes need tombstones** and repair within `gc_grace_seconds`; otherwise a stale replica reintroduces deleted data ("zombie").
- **Failed quorum write is not rolled back**: it can appear later. Why: no atomic commit across replicas; "write failed" means "unknown".
- **Multi-leader auto-increment/unique constraints** conflict across leaders; use UUID/ULID/node-id ranges.
- **LWW + partial timestamps lose concurrent updates** (dist-time).
- **Leader lease/clock assumption**: a "leader" that pauses (GC, VM stall) can wake up believing it still leads -> fencing tokens must be checked at the storage layer, not just in the leader (Kleppmann on Redlock; local `/tmp/research/src/redlock.md` exists from another agent, not read).

## 3. Common misconceptions

- "Sync replication means no data loss." Only for the standbys named, only if you fail over to one, and `remote_write`/`on`/`remote_apply` differ in what "received" means.
- "Async replicas are eventually consistent, so they're fine for reads." Session anomalies (read-your-writes, monotonic reads) need explicit handling.
- "R+W>N gives strong consistency." It gives read/write set overlap only; not linearizable (counterexample above), sloppy quorums remove even overlap.
- "Quorum = majority." In Dynamo-style systems quorum is just W+R>N; W/R can be any numbers. Kafka isn't a majority quorum at all (ISR + min.insync).
- "`acks=all` means all replicas have the message." Only all *in-sync* replicas; with min ISR 1 that may be one.
- "Multi-master scales writes." Every node still applies every write (existing bank answer says this correctly).
- "CRDTs solve all conflicts." They only resolve conflicts whose semantics are join-able; can't enforce invariants.
- "Read repair keeps replicas consistent." Only for keys that are read; anti-entropy/repair is required for cold data.
- "Failover is instantaneous and safe if you use a VIP." Without fencing you get split-brain.
- "Postgres logical and physical replication are the same." Physical = byte-level WAL, whole cluster, read-only standby; logical = row changes per table, version-independent, writable subscriber (existing bank card correct).

## 4. Go tie-ins

- **Kafka clients:** `sarama` (`config.Producer.RequiredAcks = sarama.WaitForAll`, `Producer.Idempotent = true` needs `Net.MaxOpenRequests = 1` in older sarama - UNVERIFIED), `franz-go` (`kgo.RequiredAcks(kgo.AllISRAcks())`; idempotent by default - UNVERIFIED), `confluent-kafka-go` (librdkafka `acks`). Handle `ErrNotEnoughReplicas*` with bounded retries. Default `min.insync.replicas` is a *broker/topic* setting, not a client one.
- **Postgres:** `pgx` for routing: use `target_session_attrs=read-write` (libpq feature, pgx supports it - UNVERIFIED) or `SELECT pg_is_in_recovery()`; per-transaction `SET LOCAL synchronous_commit = remote_apply` for read-your-writes-critical paths; LSN wait: `pg_current_wal_lsn()` on primary then `pg_last_wal_replay_lsn()` on standby. `jackc/pglogrepl` implements the replication protocol in Go (used for CDC; UNVERIFIED).
- **Raft in Go:** `etcd-io/raft`, `hashicorp/raft` (both cloned at `/tmp/research/src/etcdraft`, `hraft` by other agents; not inspected here) - majority-quorum replicated log (contrast with Kafka ISR).
- **Cassandra:** `gocql` `Consistency(gocql.Quorum)`; LWT with `SerialConsistency` (UNVERIFIED names).
- **CRDT libs in Go:** none in stdlib; G-Counter is ~15 lines (element-wise max) - good live-coding question. `sync/atomic` counters are *not* CRDTs (single node).
- **Idempotency:** retries against replicated stores require idempotency keys (Kafka producer id + sequence; app-level `Idempotency-Key`), otherwise `context` timeouts produce duplicates (ambiguous outcome).
- **Timeouts:** a `context.DeadlineExceeded` on a quorum write means *unknown*, not *failed*.

## 5. Illustration plan

**Scene A — Single-leader: sync, async, failover** (9 frames)
1. Leader + 2 followers, WAL ribbon flowing right. 2. Async commit: client ack before followers receive (ack arrow leaves early). 3. Lag counter climbs on F2. 4. **STOP:** leader crashes with 3 unshipped records: those are gone if F1 promoted. 5. Sync variant: ack waits for F1 (`on`); latency bar longer. 6. F1 crashes -> commits stall (red). **STOP:** "What happens to a sync-replicated Postgres when its sync standby dies?" 7. Switch to `ANY 1 (F1,F2)`: F2 keeps commits flowing. 8. Split-brain: old leader partitioned but alive, new leader elected, two writers; fencing epoch rejects old leader. 9. `pg_rewind` reattaches the old primary at the divergence point (timeline fork drawn).

**Scene B — Read anomalies on lagging replicas** (6 frames)
1. Primary, R1 fast, R2 slow. 2. Write x=2; read R1 -> 2. 3. Next read routed to R2 -> 1 (time went backwards). **STOP:** name the violated guarantees. 4. Consistent-prefix: two shards replicate at different speeds; reader sees reply before question. 5. Fix: sticky routing / LSN token / `remote_apply`. 6. Trade-off bar: latency vs freshness.

**Scene C — Dynamo-style quorums** (9 frames)
1. Ring with key K -> replicas A,B,C (N=3). 2. Write with W=2: sent to all three, C slow; A,B ack -> success. 3. Read R=2 from B,C: B has v1, C v0 -> coordinator returns v1. 4. Read repair writes v1 to C. 5. **STOP:** the non-linearizable counterexample with W=3/R=2 (X sees new, Y later sees old). 6. C down: sloppy quorum sends third copy to D with a hint. 7. C returns; D hands off; hint window 3 h. **STOP:** what if C is down 5 h? 8. Anti-entropy: Merkle tree root mismatch -> descend -> sync one leaf range. 9. Concurrent writes v1(A) v1'(B): vector clocks -> siblings vs LWW dropping one.

**Scene D — Kafka ISR worked example** (9 frames)
1. Leader L, F1, F2; ISR={L,F1,F2}; producer acks=all; HWM marker. 2. Write m1: all three fetch, ack after all ISR have it, HWM advances, consumer can read m1. 3. F2 stops fetching; timer 30 s (`replica.lag.time.max.ms`). 4. ISR shrinks to {L,F1}; writes now ack with 2 (>= min ISR 2). 5. F1 also dies -> ISR={L}: producer gets NotEnoughReplicas (rejected). **STOP:** "min.insync=1 vs 2 here?" With 1 the leader alone acks. 6. Leader dies with unclean=false -> partition offline; with unclean=true F2 (missing m2) leads -> m2 lost. **STOP.** 7. NotEnoughReplicasAfterAppend timeline: append, ISR shrinks, error, retry -> duplicate unless idempotent. 8. Leader epoch tag stamped on records; follower truncation uses epoch offsets (KIP-101). 9. Compare with majority-quorum (Raft): f+1 vs 2f+1 replicas.

**Scene E (optional) — CRDT merge** (6 frames): two replicas G-counter [3,0] and [0,2] merge -> [3,2]=5; OR-set concurrent add/remove; add wins.

## 6. Existing interview questions

- `databases-replication-types`: correct and fairly complete (async vs sync, `synchronous_commit` levels, `ANY 1 (...)`, stalls when sync replica down, WAL-LSN read-after-write). Misses: `on` vs `remote_write` details, that RPO=0 only if you promote the sync standby, `pg_rewind`/timelines, slot WAL retention.
- `databases-sharding-vs-replication`: correct (not read fully here).
- `databases-masters-replicas-count`: answer about one writable primary plus many replicas / WAL senders; consistent with docs (not verified deeply).
- `databases-multi-master`: correct on conflicts, LWW clock skew, no global constraints, home-region ownership; note doesn't mention CRDTs by name (they say "CRDTs").
- `messaging-kafka-replication-fault-tolerance`: right on leader/follower/ISR, `acks=all` + `min.insync.replicas=2`, unclean election, idempotent producer, KRaft/4.0. Imprecise: "acknowledged only when at least 2 replicas have it" - really *all* current ISR members ack and ISR size must be >= min ISR; misses that min ISR default is 1, `NotEnoughReplicas*` behaviour, `replica.lag.time.max.ms` 30 s, RF default 1, KIP-101 leader epoch.
- `architecture-cap-theorem`: mentions `R + W > N` as tunable consistency - true but must caveat it is not linearizable.
- `architecture-eventual-consistency`: fine.
- No card for: quorum non-linearizability, sloppy quorum/hinted handoff, read repair/anti-entropy/Merkle, CRDT (G-Counter/OR-Set), split-brain fencing.

## 7. Sources

- Postgres docs source `doc/src/sgml/high-availability.sgml`, `config.sgml`, `monitoring.sgml`, `ref/pg_rewind.sgml` (postgres/postgres master, raw, 2026-09-29): sync levels, quorum/priority sync, stall warning, slot/WAL settings, defaults (wal_receiver_timeout 60 s, max_standby_streaming_delay 30 s, max_slot_wal_keep_size -1), lag columns, pg_rewind timelines, `synchronized_standby_slots`.
- Kafka `docs/design/design.md` (apache/kafka trunk): committed = all ISR; unclean election tradeoff; acks=all caveat; min ISR semantics; f+1 vs 2f+1. Source: `ProducerConfig.java` (acks default "all", idempotence default true, retries MAX_INT, delivery.timeout 120000), `TopicConfig.java` (min.insync doc, NotEnoughReplicas*, unclean doc), `LogConfig.java` (unclean default false), `ServerLogConfigs.java` (`MIN_IN_SYNC_REPLICAS_DEFAULT = 1`), `ReplicationConfigs.java` (`replica.lag.time.max.ms` 30000, `replica.fetch.wait.max.ms` 500, default RF 1).
- KIP-101 https://cwiki.apache.org/confluence/display/KAFKA/KIP-101+-+Alter+Replication+Protocol+to+use+Leader+Epoch+rather+than+High+Watermark+for+Truncation (snippet only).
- Cassandra docs `dynamo.adoc`, `guarantees.adoc` and `conf/cassandra.yaml` (apache/cassandra trunk): CL list, writes to all replicas, hinted handoff settings (`max_hint_window: 3h`), read repair/hints/Merkle anti-entropy, LWW, LWT linearizable.
- Dynamo paper (SOSP 2007) https://www.cs.cornell.edu/courses/cs5414/2017fa/papers/dynamo.pdf (snippet): sloppy quorum, hinted handoff, vector clocks, Merkle trees, N=3/R=2/W=2.
- Kleppmann, *Designing Data-Intensive Applications*, ch. 5 (replication lag anomalies, quorum counterexample) - via search snippets/notes; not the book itself.
- Shapiro et al. 2011 "A comprehensive study of Convergent and Commutative Replicated Data Types" (INRIA RR-7506) - not fetched; CRDT definitions from memory - UNVERIFIED verbatim.
- Aphyr `distsys-class` (local clone): replication/CRDT overview.
- etcd `api_guarantees.md`: Raft consensus required for linearizable reads.
