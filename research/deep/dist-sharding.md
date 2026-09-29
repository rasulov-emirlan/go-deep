# dist-sharding — Sharding & consistent hashing

Verification legend: **[RUN]** = I ran it (Go 1.26, `/tmp/research/dist-sharding/main.go`, 200k keys, FNV-64a + murmur finalizer).
**[SRC]** = read primary source text. **[SNIP]** = only seen in a web-search result summary (egress proxy blocked most doc sites), treat as
"likely right, re-verify". **UNVERIFIED** = from memory only.

## 1. Mechanism (whiteboard order)

**Why shard at all.** Replicas scale reads and availability; only sharding scales writes, storage and working-set RAM. Cost: N shards means
N failure domains, no cross-shard joins/FKs/unique constraints, scatter-gather for queries without the shard key.

**Partitioning families.**
- *Range*: shard = which key interval. Range scans stay local; monotonic keys (timestamp, auto-inc id) hammer the last range. Needs split/merge (Spanner, HBase, CockroachDB, TiKV, Vitess with unhashed keyspace ids).
- *Hash*: shard = f(hash(key)). Even spread; range scans become scatter-gather; hides hot ranges but not hot keys.
- *Directory/lookup*: explicit `tenant -> shard` table. Most flexible (move one big tenant), extra hop, must be cached + HA.

**Naive hash: `hash(k) % N`.** Add one node and almost everything moves. [RUN] 10->11 nodes moved **90.9%** of keys (ideal 9.1%); 100->101 moved **99.0%** (ideal 1%).
Why: `h mod N` and `h mod (N+1)` agree only for ~1/(N+1) of hashes. For a cache that's a miss storm; for a DB it's a full data migration.

**Consistent hashing ring (Karger et al. 1997).** Hash nodes and keys onto the same circular space; a key belongs to the first node clockwise. Adding/removing a node only moves the
keys in the arcs adjacent to it: ~K/N keys. [RUN] ring 10->11 (200 vnodes): 10.3% moved; removing a node moved 10.2% (= what it owned, ideal 10%).
Failure of the naive ring: with 1 point per node, arc lengths are exponentially distributed. [RUN] 10 nodes, 1 point each: max node = **1.86x** mean, min = 0.23x, CV 48%.

**Virtual nodes.** Each physical node claims v points. [RUN] 10 nodes: v=10 -> max/mean 1.34, CV 21.7%; v=100 -> 1.09, CV 6.6%; v=200 -> 1.10, CV 5.8%; v=1000 -> 1.04, CV 3.1%.
(Karger's own experiments: 1000 points per bucket ~ 3.2% std-dev [SNIP], matches my run.) Load balance improves roughly like 1/sqrt(v); cost is ring metadata (N*v entries)
and slower bootstrap/repair (more, smaller ranges). Bonus: a joining node takes small slices from *many* peers, so streaming is parallel and no single neighbour is crushed; a heterogeneous
fleet gets weight by giving bigger boxes more vnodes.
- Cassandra: `num_tokens` default was 256, changed to **16** in 4.0 (CASSANDRA-13701), only good because of the new replica-aware allocator (`allocate_tokens_for_local_replication_factor`, default 3) [SNIP]. Lesson: random vnodes with small v are unbalanced; smart allocation lets v shrink.
- Dynamo paper (2007) evolved through 3 strategies; final = **Q equal-size fixed partitions, Q/S tokens per node**, decoupling partitioning from placement (faster bootstrap, easier archival) [SNIP].

**Replication on the ring.** Replicas = next R *distinct physical* nodes clockwise (the "preference list"). With vnodes you must skip vnodes of a node already chosen (and ideally of the same rack/AZ).
[RUN] naively taking the next 3 vnodes put replicas on **<3 distinct physical nodes for 29.2%** of keys (10 nodes, v=200). That's a data-loss bug, not a perf nit.

**Rendezvous / HRW (Thaler & Ravishankar 1996).** For key k pick `argmax_n hash(n,k)`. No ring, no state; removal of a node moves exactly its keys, add moves ~1/(N+1) [RUN: 9.2%; removing node3 moved 10.0% = exactly node3's share].
Lookup is O(N) per key (fine for tens of nodes, bad for thousands; skeleton/tree variants exist). Top-R scores give replica sets for free, naturally on distinct nodes. Weighted variant: score = -w / ln(u).

**Jump consistent hash (Lamping & Veach, Google 2014).** ~5 lines, zero memory, `JumpConsistentHash(key uint64, numBuckets int32) int32`, near-perfect balance [RUN counts 10 buckets: 19875..20267 of 200k].
Moves exactly 1/(n+1) of keys when growing n->n+1 [RUN 9.0%]. **Limit:** buckets are numbered 0..n-1, so you can only add/remove the *last* bucket. Node 3 of 10 dying cannot be expressed; you'd have to
renumber (move the last node into slot 3 = data still needs to be copied there) [RUN: 10->9 moved only bucket 9's keys, 10.1%, all from bucket 9]. Fits sharded *storage* with fixed replicated shards
(shard i = replica set i), not caches with arbitrary node loss. Also gives no replica placement or weights. Paper says it's "more suitable for data storage than web caching" [SNIP].

**Maglev (Google NSDI 2016).** Lookup table of size M (prime; paper used 65537, recommends M >> N, ~100x [SNIP]). Each backend has a permutation of table slots (offset, skip from two hashes);
backends take turns claiming their next preferred free slot until full -> near-equal slot counts (+-1). Lookup = `table[hash(5-tuple) % M]` O(1), very fast; rebuild on change is O(M) and
not perfectly minimal-disruption (small extra churn vs ring, shrinks as M grows). Envoy: Maglev table_size default 65537; ring-hash min ring 1024, max 8M [SNIP]. Used for L4 load balancing where you also have connection tracking, so occasional remaps are tolerable.

**Bounded loads (Mirrokni/Thorup/Zadimoghaddam, Vimeo/HAProxy).** Cap each node at ceil((1+e) * avg); if the chosen node is full, walk to the next. Answers "consistent hashing + hot key overloads a node" for *load balancing*
(many identical stateless backends) — not for data ownership [SNIP].

**Fixed logical buckets (the pragmatic answer).** Hash key -> one of B fixed slots (Redis Cluster **16384**, Vitess keyspace-id ranges, Citus 32 shards default in docs' recommendations of 32-128 for SaaS [SNIP], Dynamo Q partitions, Kafka partitions);
maintain slot->node map. Resharding = move slots, not rehash keys. B is a ceiling on node count and granularity; choose big enough at day 0 (Kafka partitions can't be reduced; MongoDB chunks, DynamoDB partitions do split).

**Redis Cluster in detail [SRC: redis/docs cluster-spec.md].** `HASH_SLOT = CRC16(key) mod 16384` (CRC16-XMODEM, "123456789" -> 0x31C3). Hash tags: `{...}` — first `{`, first `}` after it, non-empty content only; `foo{}{bar}` hashed whole; `foo{{bar}}zap` hashes `{bar`.
Multi-key ops need same slot else `CROSSSLOT`. Client learns map via `MOVED slot host:port` (permanent, refresh table) vs `ASK` (one-shot during migration; client sends `ASKING` first). Migration: target `CLUSTER SETSLOT s IMPORTING A`, source `MIGRATING B`; source serves existing keys, redirects misses with ASK; `MIGRATE` moves keys atomically one at a time. Spec: suggested max ~1000 nodes.
Why 16384 not 65536: heartbeat gossip carries a slot bitmap: 16384/8 = 2 KB vs 8 KB per ping; also >1000 masters is unrealistic so 16k slots is plenty [SNIP; antirez's answer in redis/redis issue #2576; not in spec]. Replication is async, so failover can lose acked writes (`WAIT` reduces, not eliminates).

**Resharding without downtime (generic recipe).** (1) snapshot/backfill from old to new topology; (2) stream changes (CDC/binlog/logical replication) or dual-write; (3) verify (row counts, checksums / VDiff); (4) cut over reads, then writes, with a brief write-block/lock; (5) keep *reverse* replication so you can roll back; (6) drop old data.
- **Vitess** [SNIP]: `MoveTables` / `Reshard` workflows built on VReplication; `SwitchTraffic` (replicas/rdonly, then primary), `ReverseTraffic`; `--enable-reverse-replication` keeps writes flowing back to source for rollback. Vindexes map column -> keyspace id; *lookup vindex* = a global secondary index table (`LookupVindex` workflow builds it).
- **Citus** [SNIP]: shard rebalancer uses PG logical replication, fully online since 11.0 (Community); brief write lock only at the metadata swap.
- **MongoDB 5.0+** `reshardCollection` changes the shard key online [SNIP]. **DynamoDB**: partitions split automatically ("split for heat"): per-partition limits 3000 RCU / 1000 WCU, ~10 GB [SNIP]; adaptive capacity shifts throughput to hot partitions but cannot exceed the per-partition cap.
- **Cassandra**: bootstrap streams ranges to the new node from replicas; only that node's ranges move; then `nodetool cleanup` on old owners.

**Cross-shard work.**
- *Queries* without shard key = scatter-gather: latency = max of N shard latencies (tail-at-scale), N x fan-out load, global ORDER BY/LIMIT needs k-way merge with per-shard over-fetch (LIMIT+OFFSET per shard -> deep pagination cost).
- *Transactions*: single-shard is free; cross-shard = 2PC (Vitess `twopc`, Citus 2PC, Spanner) or sagas (see dist-txns). Best design: choose the key so ~all txns are single-shard.
- *Joins*: co-locate on shard key (Citus co-location groups), replicate small reference tables to every shard, or join in app.
- *Secondary indexes*: **local** (each shard indexes its own rows; writes cheap and atomic, reads by index = scatter-gather to all shards — Cassandra 2i, Mongo, Elasticsearch) vs **global** (index partitioned by the indexed term; reads hit 1 shard, but each write updates another shard -> distributed txn or async, eventually-consistent index — DynamoDB GSI is async, Vitess lookup vindex, Spanner interleaved/global). Kleppmann DDIA ch.6 [UNVERIFIED-by-fetch, standard].

**Hot keys / hot shards.** Hashing evens *keys*, not *traffic*. [RUN] Zipf(s=1.2) over 100k keys on 10 nodes (v=200): hottest node takes **27.3%** of requests (ideal 10%); salting the single hottest key across 8 sub-keys (`k#0..7`) dropped it to 19.0% (rest is the next-hottest keys).
Mitigations: key salting/suffix (writes scatter, reads must fan-in over S suffixes — fine for counters, bad for strict reads); read replicas or a local/near cache with short TTL for read-hot keys; split the hot range/tablet (range systems auto-split by load); dedicated shard for a whale tenant (directory sharding); request coalescing (singleflight); write-buffering/aggregation for counters (batch increments). Note: **a single hot key cannot be fixed by resharding** — it lives on one shard by definition.

**Shard-key pitfalls.** Low cardinality (country, status); monotonic key on range partitioning (timestamp -> last shard hot; ULID/UUIDv7 have the same problem under range sharding); key not in most queries (scatter-gather forever); mutable key (row must move); skewed tenant sizes; too-coarse key leads to jumbo chunks that cannot split (Mongo); embedding shard in id is fast but freezes the topology.

## 2. Edge cases & gotchas
- **`hash % N` with N in config**: rolling deploy where half the fleet has N=10, half N=11 -> both write same key to different nodes. Why: no atomic topology change; use versioned/epoch'd shard map.
- **Ring without version**: two clients with different membership views route the same key differently -> split-brain of data. Why: consistent hashing is only consistent given the same membership.
- **Removing a node dumps its whole load on ONE successor** (plain ring, v=1) -> cascading overload. Why: vnodes spread it; Dynamo/Cassandra do.
- **Jump hash + "node died"**: can't drop bucket 3. Why: only tail buckets removable; you'd need remap or replicas per bucket.
- **Non-uniform hash** (e.g. `hashCode`/FNV without finalizer on sequential ids) skews the ring. Why: ring balance assumes random points. [I applied a murmur finalizer in the experiment.]
- **Go `hash/maphash`/map seed is per-process random** — never use it for routing across processes. Why: seed differs each run/replica. Use stable hash (FNV/xxhash/CRC32/murmur with fixed seed).
- **Vnode count vs repair/bootstrap**: 256 vnodes made repair and bootstrap slow (many small ranges, many SSTable streams) — hence default 16 in Cassandra 4.0 [SNIP].
- **Rebalance = load spike**: moving data competes with prod traffic; throttle streaming, do it off-peak; watch replication lag.
- **Dual-write cutover** can lose/reorder writes unless one side is authoritative; CDC-based (VReplication) beats app-level dual-write. Why: dual write is two commits with no atomicity.
- **Scatter-gather tail**: with 100 shards each p99=1% slow, P(at least one slow) = 1-0.99^100 = 63%. Why: request latency = max of the fan-out.
- **Auto-increment ids per shard collide**; use UUIDv7/Snowflake/(shard, seq) composite. Unique constraints are per-shard only.
- **Redis multi-key without hash tags -> CROSSSLOT**; but hash tags concentrate load onto one slot (a whale tag = hot shard).
- **Moving one slot with huge keys** blocks the source (MIGRATE is synchronous, both instances locked per key [SRC]).

## 3. Common misconceptions
- "Consistent hashing gives perfect balance." No: needs vnodes; balance ~1/sqrt(v) and it balances *keys*, not *load*.
- "Consistent hashing means no data moves." ~K/N still moves; it's the minimum, not zero.
- "Just add virtual nodes to fix hot keys." Vnodes fix arc-size variance, never per-key popularity.
- "Redis Cluster uses consistent hashing." It uses fixed hash slots (static mod 16384) plus an explicit slot->node table; the redis docs themselves say so.
- "Jump hash is strictly better than a ring." Only if nodes are an append-only numbered list; no removal of arbitrary nodes, no weights.
- "Sharding = partitioning." Partitioning (Postgres declarative) is within one server; sharding spans servers.
- "Sharding improves availability." It multiplies failure domains (P(all up) = a^N) unless each shard is replicated.
- "Range sharding is bad, hash is good." Range is right when you scan by key range/time; it needs auto-split and non-monotonic keys.
- "Resharding = change N in the config."

## 4. Go tie-ins
- Stable hashes in stdlib: `hash/fnv`, `hash/crc32`, `hash/crc64`; `hash/maphash` is randomly seeded per process (fine only for in-process tables). Third-party: `cespare/xxhash`, `spaolacci/murmur3`, `buraksezer/consistent` (ring w/ bounded load), `dgryski/go-jump`, `dgryski/go-rendezvous`. [names UNVERIFIED-by-fetch]
- Go's `sync.Map`/built-in map shard? Not relevant. But in-process *lock striping* is the same idea: `shards [N]struct{mu sync.Mutex; m map[string]V}` with `hash(k) % N` — N fixed so mod is fine.
- Redis: `go-redis/redis` `ClusterClient` follows MOVED/ASK, refreshes slot map; `redis-go` needs `{tag}` for multi-key/`MGET`/pipelines to work per-slot; `ClusterClient.ForEachMaster` for scatter.
- `database/sql` doesn't shard; typical: `map[shardID]*sql.DB` + router; each with its own pool (`SetMaxOpenConns` x N shards x pods can exceed server limits; see scaling page). Vitess/Citus speak the MySQL/Postgres wire protocol so pgx/database/sql work unchanged.
- Snippet used for experiments (jump hash, 12 lines, `float64(int64(1)<<31)/float64((key>>33)+1)`) — verified output above.
- `golang.org/x/sync/singleflight` for hot-key coalescing (per-process only).

## 5. Illustration plan
**Scene A — "mod-N is a trap" (6 frames).**
1. 3 shard boxes, 12 keys (colored) landing by `h%3`. Point: simple, even.
2. Add shard 4: keys recolor with `h%4`; count moved keys, red flash. Point: ~75% move (N/(N+1)).
3. Same at N=10->11: bar shows 91% moved. Point: gets worse with size. **STOP: "why does adding one node move everything?"**
4. Cache view: hit rate drops to ~9%, DB flood. Point: it's an outage for caches.
5. Callout: what we want (only ~1/(N+1) moves). Point: goal statement.

**Scene B — ring + vnodes (8 frames).**
1. Empty circle, 3 nodes hashed to points. 2. Keys hashed; clockwise arrow to owner. 3. Arcs uneven -> node A owns 60%. **STOP: "why is the ring unbalanced?"** (exponential gaps, 1.86x max).
4. Each node gets 8 vnodes (colored dots). Arcs even out; bar chart of CV: 48% -> 22% -> 6.6% -> 3.1% (v=1,10,100,1000).
5. Add node D: only slices adjacent to its dots recolor; keys arrow from many peers. 6. Node dies: its slices go to *different* successors (no single dump).
7. Replication R=3: walk clockwise skipping same-physical vnodes; show the bug when skipping isn't done (29% of keys have <3 distinct nodes). **STOP.**
8. Node with 2x weight = 2x dots.

**Scene C — other algorithms (6 frames).**
1. Rendezvous: key with scores per node (numbers), highest wins; remove node -> only its keys re-pick 2nd highest. 2. Jump hash: row of numbered buckets 0..n-1; growing adds bucket n and 1/(n+1) keys hop into it. 3. Try to remove bucket 3: keys can't; shows forced renumber. **STOP: "why can't jump hash remove an arbitrary node?"** 4. Maglev table of 7 slots with backends taking turns (animation) then lookup `hash % M`. 5. Redis 16384-slot bar with slot ranges per master, `{user1}` tags collapsing keys to one slot. 6. Compare table (memory, lookup, removal, weights).

**Scene D — hot keys & resharding (8 frames).**
1. 4 shards, traffic bars: one shard at 27%+ (zipf). 2. Resharding doesn't help: the hot key sits in one shard. **STOP: "how do you fix a hot key?"** 3. Salt: `k#0..7` fan across shards; reads fan-in. 4. Online move: snapshot copy + CDC stream (two lanes). 5. VDiff/verify. 6. SwitchTraffic reads, then writes (brief pause). 7. Reverse replication armed -> rollback arrow. 8. Redis ASK/MOVED ladder: client -> A (miss, migrating) -> `-ASK` -> B with `ASKING`. **STOP: "MOVED vs ASK?"**

Optional Scene E (5 frames): local vs global secondary index, scatter read vs cross-shard write.

## 6. Existing interview questions (src/bank/cats/databases.json unless noted)
- `databases-sharding-basics`, `-vs-replication`, `-key`, `-problems`, `-experience`: generally right and reasonably complete. Gaps: no mention of local vs global secondary indexes, hot-key-vs-hot-shard distinction (salting), jump hash/rendezvous/Maglev, replication placement on ring, online resharding mechanics (CDC + cutover + reverse replication), scatter-gather tail-latency math. `databases-sharding-key` says "consistent hashing or fixed virtual buckets" — correct; add the Redis 16384-slot example.
- `algorithms-hash-table`, `-hash-collisions-hash-function`, `-linked-list-vs-hash-table`, `databases-hash-index`: unrelated (single-node hashing).
- `system-design.json`: I did not exhaustively review; grep for "consistent hashing" returned no dedicated id in the ids I scanned (UNVERIFIED completeness).

## 7. Sources
- Redis Cluster spec (raw markdown, fetched): https://raw.githubusercontent.com/redis/docs/main/content/operate/oss_and_stack/reference/cluster-spec.md — slot formula, CRC16 params, hash-tag rules, MOVED/ASK, MIGRATING/IMPORTING, ~1000 node guidance. [SRC]
- Redis source `CLUSTER_SLOTS (1<<14)`: https://raw.githubusercontent.com/redis/redis/unstable/src/cluster.h [SRC]. Rationale for 16384 (2KB bitmap): redis/redis issue #2576 via search snippet [SNIP].
- Lamping & Veach, "A Fast, Minimal Memory, Consistent Hash Algorithm", arXiv 1406.2294 (2014) — code + limitation, seen via search snippet [SNIP]; behaviour independently reproduced [RUN].
- Karger et al. 1997 (STOC) consistent hashing, 1000 points ~3.2% std dev [SNIP via search]. Thaler & Ravishankar 1996 HRW [UNVERIFIED-by-fetch].
- Eisenbud et al., Maglev, NSDI 2016 (usenix.org/conference/nsdi16/technical-sessions/presentation/eisenbud): table size 65537, M>=100N, permutation population [SNIP]. Envoy LB docs (ring 1024/8M, Maglev 65537) [SNIP].
- Mirrokni, Thorup, Zadimoghaddam, "Consistent Hashing with Bounded Loads", SODA 2018, arXiv 1608.01350 [SNIP].
- DeCandia et al., Dynamo, SOSP 2007 (partitioning strategy 3) [SNIP]. Cassandra `num_tokens` 256->16, CASSANDRA-13701, thelastpickle.com 2021/01/29 post [SNIP].
- Vitess VReplication/MoveTables/Reshard docs (vitess.io/docs/25.0/reference/vreplication/...) [SNIP]. Citus rebalancer docs (docs.citusdata.com cluster_management) [SNIP]. MongoDB reshardCollection docs / Percona blog [SNIP]. AWS DynamoDB partition/adaptive capacity docs [SNIP; exact 10 GB figure UNVERIFIED].
- My experiments: /tmp/research/dist-sharding/main.go (Go 1.26.0, run 2026-09-29). FNV-64a + murmur3 finalizer; numbers are for that setup.
- Could not fetch (egress blocked): arxiv, usenix, redis.io, vitess.io, cassandra.apache.org, docs.aws. All [SNIP] items came via WebSearch summaries.
