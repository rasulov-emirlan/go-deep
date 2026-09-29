# verify-locks (page: src/topics/locks)

PRIMARY TEXTS OBTAINED THIS PASS (blocked on the web, found as GitHub mirrors):
- Kleppmann "How to do distributed locking": raw source ept/blog src/_posts/2016-02-08-how-to-do-distributed-locking.md (Kleppmann's own repo).
- antirez "Is Redlock safe?": full English text quoted in dllen/roc-blog (translation post keeps original paragraphs).
- Redis distlock spec: redis/redis-doc docs/manual/patterns/distributed-locks.md.
- etcd session.go/server.go/lease.go, kubernetes client-go leaderelection.go + component-base defaults.go (raw GitHub).

## Redlock debate (both sides checked against the texts)
- Kleppmann: two purposes, efficiency vs correctness -> OK. Broken-lock diagram with GC pause; check-before-write does not help
  (pause between check and write) -> OK. Fencing token: number that increases on each acquire, storage rejects lower; ZooKeeper zxid or
  version as token -> OK. Redlock has no token; the random value is not monotonic; a counter on one node fails, on several drifts
  -> OK. Synchronous-model assumptions (bounded network delay, pauses, clock error) -> OK. Example A,B,C / clock jump on C / client 2
  gets C,D,E -> page matches exactly. Recommends single Redis for efficiency locks; ZooKeeper (or a transactional DB) + fencing for
  correctness; "neither fish nor fowl" -> OK. He also gives a second, pause-during-acquisition example (responses buffered in kernel).
- antirez: (1) token argument: needs a linearizable store; unique random token + check-and-set instead; "if you have such a system you
  probably don't need a strong lock" -> OK. (2) system model: needs only equal clock RATE, not absolute time; 10% error example -> OK.
  (3) Redlock times acquisition (steps 1..3) so delays during acquisition are caught; a pause after the last check hits every
  auto-release lock -> OK. (4) fsync optional, delayed restarts -> OK. Concessions: Martin is right that Redis/Redlock should use the
  monotonic clock API -> was MISSING, added.
- Page said the reply argued "a pause after the check hurts every lock, ZooKeeper too": antirez's text never mentions ZooKeeper
  -> FIXED (removed). Page said "elapsed time is measured after acquiring": actually measured ACROSS the acquisition -> FIXED.
- Verdict card said EFFICIENCY: "Redlock or Redis OK". Kleppmann's actual claim is that Redlock is overkill there and single Redis is
  enough -> FIXED ("single Redis is enough").
- Critique stop card now also says the fencing point applies to any expiring lock (first half of his post is not Redlock-specific) and
  gives his recommended alternative.
- Redlock spec: N=5 masters, no replication, per-node timeout small vs TTL (5-50 ms for 10 s), majority AND elapsed<TTL,
  validity=TTL-elapsed-drift, unlock all on failure, random 20-byte value, Lua compare-and-delete, replication failover hazard, "mutual
  exclusion only while the holder finishes within validity time" -> all OK.
- "Redis has no token" stop card said "SET NX returns a random string": WRONG (SET returns OK; the random string is the value the client
  stores) -> FIXED.

## etcd / ZooKeeper / Kubernetes / Postgres
- etcd Session default TTL 60 s (session.go defaultSessionTTL=60) -> OK.
- etcd minimum lease TTL: page said "1.5 s with default settings". Source: minTTL=(3*ElectionTicks/2)*heartbeat = 15*100 ms = 1.5 s,
  then MinLeaseTTL: int64(math.Ceil(minTTL.Seconds())) = 2 s (server.go:344-349) -> FIXED ("1.5 s rounded up to 2 s"). research note dist-locks.md
  repeats the 1.5 s error.
- etcd lock: lowest CreateRevision holds, waiters watch predecessor, revision usable as fencing token, Session.Done() on lease loss
  -> OK (mutex.go, session.go). Client keepalive defaults not used on page.
- ZooKeeper Disconnected vs Expired -> OK (recipes).
- client-go leader election defaults LeaseDuration 15 s, RenewDeadline 10 s, RetryPeriod 2 s (component-base/config/v1alpha1/defaults.go);
  RenewDeadline must exceed JitterFactor(1.2)*RetryPeriod; renew loop = PollUntilContextTimeout(RetryPeriod, RenewDeadline) -> OK.
  "5 s margin only if A's timer ran" -> OK; not a fence (package comment says only best-effort skew tolerance) -> OK.
- Postgres advisory locks: xact variant auto-releases, session variant + transaction pooler leaks -> OK (docs, research).
- Go snippet on the page (check time then write) is illustrative pseudo-code, not a runnable program. Research demo (SIGSTOP) already
  measured in dist-locks.md.

## Illustrations
- Redlock step 5: C now shows "key" (Client 2's key) instead of staying "gone".
- Leader flow: "renew 2s/4s" relabelled "renew at t=2s / t=4s" (were readable as TTLs).
- Choice flowchart: arrow labels "else: one DB / else: outside DB" (were readable as steps after "conditional write").

## Bank notes
- databases-redis-use-cases: OK but thin. databases-consistency-without-transactions "a lease in Redis" cannot mint a monotonic token by itself
  (INCR separately is not atomic with the grant): suggest appending "Redis SET NX gives no monotonic token; use etcd revision / ZooKeeper zxid".
