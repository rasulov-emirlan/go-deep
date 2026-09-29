# dist-consistency — Consistency models, CAP, PACELC

Verification note: most primary sites (Jepsen, Kleppmann, Gilbert-Lynch PDF, Spanner docs, AWS docs) were blocked by the egress proxy. Read directly from
GitHub raw: etcd API-guarantees doc, MongoDB docs source, Cassandra docs+yaml, Postgres docs (SGML), DynamoDB developer-guide markdown, Aphyr `distsys-class`.
Jepsen hierarchy, Kleppmann and PACELC come from WebSearch snippets (tagged). Definitions of CAP terms are from my knowledge of the paper and cross-checked with Cassandra docs and snippets.

## 1. Mechanism

**Start with the register.** Many clients read/write one object on replicated storage. A *consistency model* = the set of histories the system is allowed to show.

**Strongest to weakest (single-object / multi-object), Jepsen map (snippet):**
- **Strict serializable** (= strong-1SR, "external consistency" in Spanner): transactions (multi-object) behave as if executed one at a time in an order that respects real time. Single-object strict-serializable = linearizable.
- **Linearizable**: each operation appears to take effect atomically at one point between its invocation and its response; that order respects real time (if op A completed before op B began, B sees A). Herlihy-Wing 1990 - etcd docs quote: "the illusion that each operation ... takes effect instantaneously at some point between its invocation and its response". Single object, no transactions.
- **Serializable**: transactions equivalent to *some* serial order - **no real-time constraint**, so a txn can be ordered before one that finished earlier (stale reads allowed). Multi-object.
- **Sequential consistency**: all processes see one total order consistent with each process's program order; not with real time. (Lamport 1979.)
- **Causal consistency**: if a happens-before b (incl. read-then-write, session order), everyone sees a before b; concurrent writes may be seen in different orders. Implies writes-follow-reads and PRAM (snippet). Strongest model that can be *available* under partitions (sticky-available; Bailis et al.) - UNVERIFIED direct.
- **PRAM/FIFO** -> implies monotonic reads, monotonic writes, read-your-writes (snippet of Jepsen map).
- **Eventual consistency**: if writes stop, replicas converge. Says nothing about what is read meanwhile.
- Jepsen (snippet): everything at/above snapshot isolation, cursor stability or *sequential* cannot be totally available in asynchronous networks; everything at/above read-your-writes can be at most *sticky* available.

**Session guarantees (Terry et al. 1994), per client session:** read-your-writes, monotonic reads (never see older state than already seen), monotonic writes (your writes apply in order), writes-follow-reads (a write is ordered after the reads that informed it). Implemented by sticky sessions, version tokens (LSN, MongoDB `clusterTime`, Cassandra none by default) or reading from the leader.

**CAP (Gilbert & Lynch 2002, formal proof of Brewer's 2000 conjecture).**
- C = *atomic/linearizable* register. Not ACID's C.
- A = every request received by a **non-failing** node must eventually get a non-error response (no latency bound, but not "sometimes").
- P = network may drop arbitrarily many messages between nodes.
- Theorem: in an asynchronous network you cannot have C and A when a partition happens. Proof sketch = whiteboard: two nodes, client writes v1 to G1, partition, client reads from G2: either G2 answers stale (lose C) or refuses/blocks (lose A).
- Corollary people over-read: not "pick two of three"; P is not optional, the choice is C vs A *during* a partition. Cassandra docs restate this as "Consistency: every read receives the most recent write or errors out".

**PACELC (Abadi 2010/2012).** If Partition: Availability vs Consistency; Else: Latency vs Consistency. Reason for the "else": replication itself forces the choice (wait for replicas = latency, or answer from a nearby possibly-stale copy). Examples (Abadi via snippet): Dynamo/Cassandra/SimpleDB = PA/EL; PNUTS = PC/EL. Common classifications: Spanner, etcd/ZK, MongoDB (majority) = PC/EC; DynamoDB default reads = PA/EL, with per-request strong reads moving it toward PC/EC (UNVERIFIED as official label).

**Per-system, what you actually get (read from docs unless tagged):**
- **etcd**: KV ops are **strictly serializable**; reads linearizable by default (go through Raft ReadIndex); opt-in `serializable` reads may be stale, no consensus round. Watch API is *not* linearizable; ordered/unique/reliable/atomic by revision. Revision = logical clock. Lease expiry is wall-clock TTL (so lease != safe lock alone).
- **Spanner**: strict serializable (external consistency) using TrueTime commit-wait; also stale reads at a timestamp for lower latency (Spanner docs blocked; paper - UNVERIFIED verbatim).
- **DynamoDB**: reads eventually consistent by default; `ConsistentRead=true` reads leader -> latest writes acknowledged before; not supported on GSIs; costs 2x RCU, may return 500 if leader unreachable; "usually within one second or less" propagation (AWS dev-guide markdown, read). Global tables = multi-region LWW (UNVERIFIED).
- **Cassandra**: eventual per table; tunable CL (ONE, QUORUM, LOCAL_QUORUM, EACH_QUORUM, ALL, ANY(write only)); writes always sent to all replicas, CL = how many acks the coordinator waits for; LWT (Paxos) gives linearizable compare-and-set (docs `guarantees.adoc`, `dynamo.adoc`, read). Per-cell LWW timestamps.
- **Postgres**: single primary: serializable/snapshot isolation is about txns, not replicas. Async streaming standby reads: stale, monotonic-reads *not* guaranteed across different standbys. `synchronous_commit=remote_apply` waits until sync standbys have *replayed* the txn -> "load balancing with causal consistency" in simple cases (docs read). `on` (default) waits for remote *flush* only, so a standby read may still not see the row.
- **MongoDB**: default read concern `local` (may return rolled-back data, no causal guarantee); default write concern `w: "majority"` since 5.0 unless arbiters make voting majority unreachable -> `w:1` (docs read). `readConcern: "majority"` = durable-on-majority snapshot (possibly stale); `"linearizable"` = single document, primary only, confirms with majority, slow, **always set maxTimeMS**. Causally consistent sessions give all four session guarantees only with `majority` read + `majority` write (docs read).

**How to test: Jepsen / Knossos idea.** Run concurrent clients against a real cluster, inject partitions/kills/clock skew with a nemesis, record every op as invoke/ok/fail/info (timeouts = *info*, unknown outcome), then check the history against a model. Linearizability checking (Wing-Gong / Lowe; Knossos, Porcupine in Go - UNVERIFIED) searches for a legal linearization consistent with real-time order: NP-complete in general, so histories are kept small/short. Elle (Jepsen) infers write-write/write-read/read-write dependency cycles from transactional histories to detect G0/G1/G2 anomalies instead of brute force (snippet).

## 2. Edge cases & gotchas

- **CAP "availability" is far stronger than "the service is up".** Why: every non-failing node must answer, including nodes in the minority partition. A Raft cluster's majority side keeps serving but the minority does not -> CAP-"unavailable", still 99.99% highly available in practice.
- **CAP says nothing about latency or non-partition behaviour.** Why: only proves the partition case. That's PACELC's E clause.
- **"C" = linearizability of a register, only.** Why: the proof uses one atomic object. Kleppmann ("Please stop calling databases CP or AP", snippet): CAP is too coarse; real systems mix per-operation guarantees, and many are neither.
- **Serializable is not linearizable.** Why: serializable only demands *some* serial order, real time not required, so a txn may be ordered before one that already finished (stale-looking reads). Strict serializable = serializable + real-time order (Spanner, etcd). Postgres on a single primary is documented as serializable (SSI); its replicas add staleness on top (strict-serializability of Postgres SERIALIZABLE is UNVERIFIED).
- **Sequential consistency lets a completed write be invisible to a later read from another client.** Why: no real-time constraint, only per-process order.
- **Quorum reads/writes (W+R>N) are not linearizable.** Why: a write partially propagated (W acks, rest pending) can be seen by one reader and missed by another later reader (see replication note). Also sloppy quorums, LWW, clock skew, concurrent writes all break it.
- **`readConcern majority` is not linearizable.** Why: it reads the majority-committed snapshot, which can lag a just-acked write on another primary/ term; `linearizable` adds a majority heartbeat check. Also `majority` write + `local` read on a secondary can read older data than you wrote.
- **etcd `serializable` read option** can return stale data with no error; `clientv3.WithSerializable()`. Why: served from local applied state without ReadIndex.
- **etcd watch is not linearizable**; use revisions to order.
- **Read-your-writes breaks with load-balanced replicas** even when each replica is eventually consistent; fixes: read primary for N s / after write, pass LSN/version token, sticky session.
- **DynamoDB strong reads not on GSIs; GSIs are always eventually consistent** (docs read).
- **Cassandra QUORUM+QUORUM still not linearizable** (`R+W>N` overlaps but LWW timestamps, partial writes, read repair races). Only LWT/SERIAL gives linearizable CAS. Also LWT uses Paxos (4 round trips) - slower.
- **Timeouts are ambiguous** ("info" in Jepsen): a write that timed out may have taken effect; checkers must treat it as possibly-applied. Real code needs idempotency/fencing.
- **Stale leader.** After partition, an old leader that hasn't noticed serves reads -> non-linearizable unless it needs a quorum round or a lease (leases rely on bounded clock drift). Why linearizable reads in Raft need ReadIndex/lease read.
- **Consistency vs isolation vocabulary collision**: Jepsen/Kleppmann use "consistency" for replicas (single-object, real-time), "isolation" for multi-object txns. Postgres RC/RR/SER are isolation levels.

## 3. Common misconceptions

- "CAP: pick any two." Correct: partitions happen; choose C or A *while partitioned*. "CA systems" don't exist for distributed systems (single node isn't distributed).
- "Cassandra is AP, Spanner is CP, so that's their whole story." Cassandra with `QUORUM`/LWT gets close to linearizable for CAS; Spanner gives up availability for minority side only; DynamoDB is tunable per read.
- "Eventual consistency = no guarantees." Convergence is a guarantee; session guarantees layered on top; CRDTs give strong eventual consistency.
- "Strong consistency = ACID C." ACID C = app invariants preserved; CAP C = linearizability.
- "Linearizability = serializability." Different axes (real-time vs multi-object). Both = strict serializable.
- "Async replica reads are 'eventually consistent so fine'." Without session guarantees you can see time go backwards (reading replica A then a lagging replica B: monotonic-reads violation).
- "`w: majority` in Mongo means reads see your write." Need `majority` read concern (or causal session) too.
- "Quorum = strongly consistent." Only with extra machinery (read repair on read path before returning + no sloppy quorum + no clock LWW) and even then not in general.
- "Google Spanner beats CAP." No: it is CP; it uses very high availability infrastructure and private network to make partitions rare (Brewer's 2017 "Spanner, TrueTime and the CAP theorem" - UNVERIFIED, from memory).

## 4. Go tie-ins

- etcd `clientv3`: default `Get` is linearizable; `clientv3.WithSerializable()` opts into stale local reads; `concurrency` package (sessions, mutex, election) sits on leases (wall TTL) and revisions. `Txn().If(Compare(...)).Then().Else()` = CAS.
- CockroachDB/Cockroach-style stores: Go; `pgx` connects; serializable retries (SQLSTATE 40001) must be handled by app code.
- MongoDB Go driver: `options.Client().SetReadConcern(readconcern.Majority())`, `SetWriteConcern(writeconcern.Majority())`, `client.StartSession(options.Session().SetCausalConsistency(true))` (API names UNVERIFIED for current v2 driver).
- gocql: `session.Query(...).Consistency(gocql.Quorum)`, `.SerialConsistency(gocql.Serial)` with `ScanCAS` for LWT (UNVERIFIED names).
- Postgres via pgx: to get read-your-writes on replicas, capture `pg_current_wal_lsn()` after commit and wait until `pg_last_wal_replay_lsn() >= lsn` on the standby.
- Testing: Porcupine (`anishathalye/porcupine`) is the standard Go linearizability checker (UNVERIFIED, not fetched); Jepsen itself is Clojure. `hashicorp/raft` docs: `Apply` = linearizable writes, stale reads from FSM unless you use barrier/leader checks (`raft.Barrier`, `VerifyLeader`) (UNVERIFIED specifics).
- In-process analogue: Go's memory model is a consistency model (happens-before, data-race-free = sequentially consistent) - a natural warm-up: `sync/atomic` ops are sequentially consistent.

## 5. Illustration plan

**Scene A — The model ladder** (8 frames)
1. Stage: a vertical ladder (strict serializable -> linearizable/serializable -> sequential -> causal -> PRAM -> eventual) with two axes labelled "real-time" and "multi-object".
2. Two clients, one register x, timeline with intervals. Draw a linearizable history with the linearization point dots.
3. Same intervals but read returns old value after a write already completed (red) -> not linearizable, but sequentially consistent (reorder points ignoring real time).
4. **STOP:** "Sequential vs linearizable - what's the difference?" Highlight the real-time edge.
5. Transactions T1,T2 on two objects: serial order exists (serializable) but order contradicts real-time -> serializable, not strict.
6. Merge: strict serializable = both edges lit; Spanner/etcd stamp.
7. Causal: A writes, B reads then replies, C sees the reply before the original -> violation; show dependency arrow.
8. Eventual: converge after quiet period; anything in between allowed.

**Scene B — CAP proof in 7 frames** (7 frames)
1. Two nodes G1,G2 each holding v0; client C1, C2.
2. C1 writes v1 to G1; G1 replicates -> G2 acks. Healthy.
3. Partition: link cut.
4. C1 writes v1 to G1; replication message dropped.
5. C2 reads from G2. Fork: answer v0 (stale = not C) or wait/err (not A).
6. **STOP:** "Is a Raft minority side 'available' by CAP?" No; majority side is fine.
7. PACELC panel: no partition, but G1 waits for G2 ack (latency) vs answers immediately (stale).

**Scene C — Session guarantees on replicas** (7 frames)
1. Primary + replicas R1 (lag 0), R2 (lag 2 s). Client writes x=2 to primary.
2. Client reads R1 -> 2 (sees write).
3. LB sends next read to R2 -> 1: read-your-writes and monotonic reads both violated. **STOP.**
4. Fix 1: sticky session. Fix 2: version token (LSN) -> R2 blocks until replay >= LSN (`remote_apply` variant).
5. Postgres `on` vs `remote_apply` lines: flush vs replay on standby.
6. Mongo causal session: `afterClusterTime` token required with majority/majority.
7. etcd default (leader) vs `serializable`.

**Scene D — Testing with a nemesis** (6 frames)
1. Clients + cluster + nemesis. 2. Ops recorded as invoke/ok/info. 3. Partition injected. 4. History fed to checker. 5. Search for a linearization; failure prints minimal witness. 6. **STOP:** "Why is a timed-out write a problem?" -> ambiguous outcome.

## 6. Existing interview questions

- `architecture-cap-theorem`: mostly right (CP vs AP during partition, C != ACID C, PACELC, tunable). Misses: the precise CAP definition of A (every non-failing node responds), that C means linearizability of one register (it does say "linearizability"), Kleppmann's critique, and that "DynamoDB default AP" hides per-request strong reads. Also lists "Consul, ZooKeeper" as CP - fine. Calling "a single-node Postgres not CA" is fine.
- `architecture-eventual-consistency`: right; could mention session guarantees by name (read-your-writes is there) and strong eventual consistency (CRDT) and that convergence needs conflict resolution.
- `databases-replication-types`: right; `remote_apply` and reading standby (causal consistency) not mentioned. `synchronous_commit=on` "RPO 0" caveat (must promote the sync standby).
- `databases-multi-master`: right on LWW loss; mentions CockroachDB/Yugabyte/Spanner raft ranges.
- `databases-isolation-limit-count`: (isolation, not distributed) fine - useful to contrast isolation vs consistency.
- No card on linearizable vs serializable vs strict serializable, session guarantees, or how Jepsen tests.

## 7. Sources

- etcd API guarantees: `etcd-io/website` `content/en/docs/v3.6/learning/api_guarantees.md` (raw, read 2026-09-29): strict serializability, linearizable default, `serializable` option, watch not linearizable, revision as logical clock.
- MongoDB docs source (`mongodb/docs` master): `reference/mongodb-defaults.txt` (defaults: rc local; wc majority since 5.0 with arbiter rule), `reference/read-concern-linearizable.txt`, `core/causal-consistency-read-write-concerns.txt`.
- Cassandra docs `architecture/guarantees.adoc`, `dynamo.adoc` (apache/cassandra trunk): CAP text, LWT linearizable, CL list, "writes always sent to all replicas".
- Postgres docs `high-availability.sgml` (postgres/postgres master): 2-safe/group-safe, `remote_write` vs `remote_apply` ("causal consistency" note).
- DynamoDB dev guide `HowItWorks.ReadConsistency.md` (awsdocs/amazon-dynamodb-developer-guide): read-consistency semantics.
- Jepsen consistency map https://jepsen.io/consistency/models (+ /linearizable, /sequential, /pram, /strong-serializable) - snippets only (page blocked): implication chain and availability classes.
- Aphyr `distsys-class` README (local clone): consistency models, CAP framing.
- Kleppmann, "Please stop calling databases CP or AP" https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html (snippet).
- Abadi PACELC http://dbmsmusings.blogspot.com/2010/04/problems-with-cap-and-yahoos-little.html (snippet): definition and PA/EL, PC/EL examples.
- Gilbert & Lynch 2002 "Brewer's conjecture and the feasibility of consistent, available, partition-tolerant web services" https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf (fetch blocked; definitions from memory) - UNVERIFIED verbatim.
- Herlihy & Wing 1990 (quoted via etcd doc); Terry et al. 1994 "Session guarantees" (not fetched).
