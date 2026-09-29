# dist-consensus: Consensus & Raft

Verification note: raft.github.io, martin.kleppmann.com, arxiv, usenix, etc. were egress-blocked in this container. Raft facts below were checked against
(a) Ongaro's dissertation LaTeX source (github.com/ongardie/dissertation), (b) etcd-io/raft, etcd-io/etcd, hashicorp/raft, hashicorp/consul, cockroachdb/cockroach source
(shallow clones, HEAD as of 2026-09-22..29), (c) etcd website docs source. Where only memory backs a claim it is marked UNVERIFIED.

## 1. Mechanism

**Why consensus.** N replicas must agree on one value (or one ordered log) even if some crash, restart, or are cut off, and never disagree afterwards.
Naive fix 1: one primary + async replica -> failover loses acked writes / two primaries. Naive fix 2: "wait for all replicas" -> one dead node blocks everything.
Real fix: decide by **majority quorum** - any two majorities of the same set intersect in >=1 node, so a later decision always meets a node that saw the earlier one.
- Fault tolerance math: n = 2f+1 tolerates f crash faults. Majority = floor(n/2)+1. n=3 -> quorum 2 -> f=1. n=4 -> quorum 3 -> f=1 (worse than 3 in availability, no gain). n=5 -> 3 -> f=2. n=7 -> 4 -> f=3. Even sizes add cost without tolerance.
- Bigger cluster = slower writes (wait for the median-fastest majority, more replication traffic), not faster. Reads/writes all go through the leader.
- **FLP intuition** (Fischer-Lynch-Paterson 1985, from memory): in a purely asynchronous system you cannot tell a crashed node from a slow one, so no deterministic protocol can *guarantee* termination if even one node may crash. Consequence: Raft/Paxos always keep **safety** (never two different decisions) under any delays/partitions, and get **liveness** only when timing is "good enough" (partial synchrony; randomized timeouts are the escape hatch). Raft's paper timing requirement: broadcastTime << electionTimeout << MTBF (dissertation, confirmed).
- What consensus does *not* do: tolerate Byzantine nodes (needs 3f+1, PBFT), or make a minority side available (CP in CAP).

**Raft state.** Persistent on every server (fsync *before* replying): `currentTerm`, `votedFor`, `log[]` (entries carry term + command). Volatile: `commitIndex`, `lastApplied`; leader: `nextIndex[]`, `matchIndex[]`.
Roles: follower, candidate, leader. **Term** = logical clock/epoch; at most one leader per term; any RPC carrying a higher term makes the receiver adopt it and revert to follower; stale-term RPCs are rejected.

**Leader election.** Follower whose election timer fires -> increments term, votes for itself, resets timer, sends RequestVote to all. Outcomes: wins majority (becomes leader, sends heartbeats = empty AppendEntries), sees a legitimate leader (steps down), or times out again (split vote -> new term).
- **Randomized timeouts** break symmetry: paper suggests 150-300 ms (dissertation: "e.g. 150-300ms", confirmed). etcd-raft: `randomizedElectionTimeout = electionTimeout + rand(0..electionTimeout)` i.e. [T, 2T) ticks (etcdraft raft.go:2054). hashicorp/raft `randomTimeout(min) = min + rand(min)` -> [T, 2T).
- **RequestVote receiver**: reject if `term < currentTerm`; grant if (`votedFor` is null or == candidateId) AND candidate's log is **at least as up-to-date**: compare last entry's *term* first (higher wins), then last *index* (longer wins). One vote per term, persisted.
- Election Safety: at most one leader per term (one vote per term + majority).

**Log replication.** Client -> leader appends entry (current term) -> AppendEntries(term, leaderId, prevLogIndex, prevLogTerm, entries[], leaderCommit) to followers.
- **Consistency check**: follower rejects if it lacks an entry at prevLogIndex with term == prevLogTerm. On success: delete any existing entry that conflicts (same index, different term) *and everything after it*, append the rest, `commitIndex = min(leaderCommit, index of last new entry)`.
- **Log Matching Property**: same (index, term) => same command and identical all preceding entries (induction over the check).
- **Divergence repair**: after a leader change, follower logs can be shorter, or have extra uncommitted entries from old terms. Leader keeps `nextIndex[f]` (init = leader last+1); on rejection decrement (or jump using conflict-term hint) until match, then overwrite the follower's suffix. Leader never overwrites/deletes its own log (Leader Append-Only).
- **Commit rule**: leader marks index N committed when a majority have `matchIndex >= N` **and `log[N].term == currentTerm`**. Entries from earlier terms are committed only *indirectly* (once a current-term entry after them commits, Log Matching commits the prefix). Confirmed in etcd: `maybeCommit` calls `raftLog.maybeCommit(entryID{term: r.Term, index: trk.Committed()})` and `matchTerm(at)` must hold (etcdraft raft.go:775, log.go:455).
- **Figure 8 scenario** (paper Fig. 8 / dissertation `oldTermCommit`): (a) S1 leader term 2 replicates index 2 to S2 only. (b) S1 crashes; S5 wins term 3 (votes S3,S4,itself - their logs are no less up-to-date than S5's), appends a different entry at index 2. (c) S5 crashes; S1 restarts, wins term 4, and continues replicating its term-2 entry until it sits on S1,S2,S3 = majority - **but not committed**. (d1) If S1 now crashes, S5 (last term 3 > 2) can win with S2,S3,S4 and overwrite index 2 -> a "majority-replicated" entry was lost. (d2) If S1 first replicates a *term-4* entry to a majority, S5 can no longer win (its last term 3 < 4), so index 2 is safely committed with it. Hence the rule.
- **New leader no-op**: on becoming leader etcd-raft immediately appends an empty entry (raft.go becomeLeader: `emptyEnt := &pb.Entry{Data: nil}`) so it can commit something from its own term and learn the true commit index; the dissertation calls this out for read-only queries too.
- **Leader Completeness**: any committed entry is in the log of every leader of a higher term. Enforced by the vote's up-to-date check + majority intersection. **State Machine Safety**: no two servers apply different commands at the same index.

**Reads.** Naive: read from leader's state machine -> stale if a newer leader exists (deposed leader unaware). Options (dissertation ch. 6, confirmed):
1. Put reads through the log - correct, slow (fsync, replication).
2. **ReadIndex**: leader (a) has committed an entry in its term (no-op), (b) records `readIndex = commitIndex`, (c) confirms leadership with a heartbeat round to a majority, (d) waits for apply >= readIndex, (e) answers. One heartbeat round can amortize many reads. Followers can serve linearizable reads by asking the leader for its readIndex, then waiting to apply that index locally.
3. **Lease reads**: after a majority-acked heartbeat, leader assumes no rival for ~electionTimeout/clockDriftBound and answers without messages. Depends on bounded clock *rate* drift; "if the assumptions are violated, the system could return arbitrarily stale information" (dissertation). etcd-raft: `ReadOnlyLeaseBased` requires `CheckQuorum` and warns clock can move backward/pause without bound (raft.go:61-69, 336). Default is `ReadOnlySafe` (ReadIndex).
4. **Stale/serializable follower reads**: local read, no coordination, may lag. etcd: `Serializable: true` on Range skips `LinearizableReadNotify` (v3_server.go:138-175).

**Membership change.** Unsafe naive: switch every node from C_old to C_new "at once" -> some nodes still use old majority, others new -> two leaders in one term.
- **Joint consensus** (paper): leader replicates `C_old,new`; while it is in effect every decision (elections + commits) needs a majority of *both* configs; once `C_old,new` commits, replicate `C_new`; done when `C_new` commits. A server uses the *latest config in its log, committed or not* - takes effect on append (dissertation safety.tex:124).
- **Single-server change** (dissertation ch. 4): add/remove one server at a time; any majority of C_old and C_new overlap, so no joint phase. Bigger changes = sequence of single steps; add before remove (3 -> 4 -> 3 keeps one-failure tolerance; remove-then-add drops to 2 nodes that need both).
- Implementations: etcd-raft supports joint consensus (`ConfChangeV2`, `ConfChangeTransitionAuto/JointImplicit/JointExplicit`) and guards with `pendingConfIndex` (only one conf change in flight; set conservatively at becomeLeader). Learners (non-voting) catch up first: etcd `MemberPromote`, hashicorp `Nonvoter`.
- Availability hazards: new server with empty log must catch up *before* it counts (else it stalls commits); removed servers time out and start elections with higher terms -> disrupt leader (solution: ignore RequestVote within min election timeout of hearing a leader, dissertation availability.tex:321; etcd-raft implements as "lease" check raft.go:1103).

**Snapshots.** Log grows unbounded; each server snapshots its state machine up to `lastApplied` independently, records lastIncludedIndex/Term, discards the prefix. A follower too far behind (leader already compacted the needed entries) gets `InstallSnapshot`. Defaults: etcd `SnapshotCount=10000` entries (server.go:78); hashicorp `SnapshotThreshold 8192`, `SnapshotInterval 120s`, `TrailingLogs 10240` (config.go DefaultConfig); Consul overrides to 16384 / 30s (consul config.go:673-676).

**Pre-Vote & disruptive servers.** Partitioned follower keeps timing out, incrementing its term (2, 3, ... 50). On rejoin its huge term forces the healthy leader to step down (even though it has a stale log and can't win). Pre-Vote (dissertation 9.6): candidate first asks peers "would you vote for me?" *without* bumping any term; peers say yes only if the candidate's log is up-to-date and they haven't heard from a leader for a baseline election timeout. Only then increments term. **CheckQuorum**: leader steps down if it hasn't heard from a majority within an election timeout (avoids zombie leader on the minority side). etcd: `--pre-vote` default **true** (embed/config.go:544), `CheckQuorum: true` hard-wired (bootstrap.go:572). hashicorp/raft: pre-vote implemented, on unless `PreVoteDisabled` or transport lacks `WithPreVote` (api.go:554-588); leader steps down when it can't contact a quorum within `LeaderLeaseTimeout` (raft.go `checkLeaderLease`).

**Relationship to other protocols.**
- **Paxos** (Lamport): single-decree = prepare/promise + accept/accepted with ballot numbers; **Multi-Paxos** = stable leader skips phase 1 for subsequent log slots. Raft = Multi-Paxos with a strong-leader, contiguous log (no holes), and explicit election + membership; equal fault tolerance and message cost in the steady state.
- **ZAB** (ZooKeeper): primary-backup atomic broadcast; epochs + zxid (epoch,counter); leader election picks the node with highest zxid, then a synchronization phase before broadcast; orders per-client FIFO + sessions/ephemeral nodes. (From memory, UNVERIFIED against paper.) Dissertation notes Pre-Vote was "inspired by ZooKeeper's algorithm".
- **Viewstamped Replication**: closest ancestor of Raft (views ~ terms). Byzantine: PBFT, not covered.

**Who uses what.** etcd: single Raft group (etcd-io/raft), holds k8s state; default heartbeat 100 ms, election 1000 ms (embed/config.go:520-521), election >= 5x heartbeat enforced, max 50 000 ms; docs: election timeout must be >=10x RTT; quota default 2 GiB. Consul servers: hashicorp/raft; `raft_multiplier` default 5 (max 10) scales the base timings (consul config.go:38-42; how it scales each timer NOT verified). CockroachDB: **Multi-Raft** - one Raft group *per range*, default 3 replicas (system ranges 5), ranges split at 512 MiB (`RangeMaxBytes`, zonepb/zone.go:255-257), min 128 MiB. Kafka KRaft, TiKV, Dgraph, Docker Swarm also Raft (etcd raft README list).

## 2. Edge cases & gotchas
- **Committed != applied != durable-on-client-visible-side.** Leader can commit, crash before replying; client retries -> duplicate. Why: response and commit aren't atomic. Fix: client sessions + serial numbers deduped in the state machine (dissertation ch. 6 `retrydup`).
- **Old-term entries never committed by counting** (Figure 8). Why: a majority-replicated old entry can still lose an election to a node with a higher last-term.
- **Vote check compares last *term* before length.** A longer but older-term log loses. Why: length is meaningless across terms.
- **Persist before you answer.** `currentTerm`/`votedFor` must be fsynced before granting a vote, else a restart can double-vote in a term -> two leaders. Log entries fsynced before acking AppendEntries.
- **Leader crash with uncommitted entries**: entries may or may not survive. Why: only committed ones are guaranteed by Leader Completeness.
- **2-node cluster is worse than 1** (quorum 2, tolerance 0, two failure points). 4 nodes tolerate the same as 3.
- **Deposed leader thinks it's leader** until it hears the new term (or CheckQuorum fires). Why: no global clock. It can't commit (no majority) but can serve stale local reads -> need ReadIndex.
- **Election timeout vs GC/disk stalls**: a follower/leader stalled longer than the timeout triggers elections. Why: timeouts can't distinguish slow from dead. etcd docs: slow disk (fsync) is the #1 cause of leader flapping; tune heartbeat ~ max RTT (0.5-1.5x RTT), election >= 10x RTT.
- **Pre-Vote can hurt liveness** in partial partitions (asymmetric link failures): a node that can reach some but not all peers, or one-way links, may keep the cluster leaderless/oscillating; Cloudflare's Nov 2020 etcd outage (partial switch failure, ~6 h) is the canonical case - see dist-failure.md. Sources on details UNVERIFIED (blog blocked).
- **Membership changes: only one at a time; new leader must have committed something in its term** before accepting a conf change (etcd sets `pendingConfIndex` conservatively at becomeLeader). Why: a known safety bug in naive single-server change (Ongaro mailing list 2015, from memory, UNVERIFIED) when a leader's prior-term config entry is still uncommitted.
- **Quorum loss = permanent unavailability until disaster recovery** (`etcd --force-new-cluster`, snapshot restore). Why: safety > liveness; forcing a smaller quorum can lose committed data.
- **Lease reads and clock jumps**: NTP step / VM pause makes lease reads stale. Why: safety now depends on clocks, not on messages.
- **Follower read on etcd default is linearizable via ReadIndex** (extra RTT to leader); `Serializable` is opt-in and can be stale.
- **Log growth when quorum lost**: leader keeps accepting proposals unless bounded (etcd-raft README: "Protection against unbounded log growth when quorum is lost").
- **Learner/non-voter needed** when adding a slow, empty node: else it counts toward quorum while catching up and can stall commits.
- **Batched fsync/disk order**: leader can write its own log in parallel with sending AppendEntries (etcd-raft feature) - legal because the leader's own persistence only needs to precede *its own* matchIndex counting.

## 3. Common misconceptions
- "Raft/Paxos tolerates f failures out of 2f" - no, needs 2f+1; with 4 nodes you still tolerate only 1.
- "Raft solves FLP" - no; safety always, liveness needs timing assumptions (randomized timeouts make livelock improbable, not impossible).
- "A leader commits once a majority has the entry" - only for entries of its *current* term (Figure 8).
- "Committed = applied on all nodes" - only on a majority durably; followers lag.
- "Reading from the leader is linearizable" - not without ReadIndex/lease/log-read; a deposed leader serves stale data.
- "More nodes = more throughput" - writes get slower; only reads (serializable) scale.
- "Raft tolerates network partitions so it's AP" - CP: minority side blocks.
- "Election timeout should be as small as possible" - false-positive elections under jitter; must be >> broadcast time.
- "Term = leader lease time" - term is a logical epoch with no time meaning.
- "Pre-Vote is Raft" - it's an extension (thesis 9.6), not in the 2014 paper.
- "Consul/etcd use different algorithms" - both Raft (different libraries: hashicorp/raft vs etcd-io/raft).

## 4. Go tie-ins
- **etcd-io/raft** (`go.etcd.io/raft/v3`, go.mod go 1.26): pure state machine - `Node` takes `Tick()`/`Step(msg)`/`Propose`; returns `Ready{Entries, CommittedEntries, Messages, HardState, Snapshot}` via channel; *you* do storage + network, must persist HardState/Entries before sending messages. Config: `ElectionTick` (README example 10), `HeartbeatTick` 1, `MaxInflightMsgs` 256, `CheckQuorum`, `PreVote`, `ReadOnlyOption`. Deterministic and testable (no goroutines inside). Used by etcd, CockroachDB, TiKV(Rust port), Dgraph, swarmkit.
- **hashicorp/raft**: batteries-included; you supply `FSM` (Apply/Snapshot/Restore), `LogStore`, `StableStore`, `SnapshotStore`, `Transport`. `DefaultConfig`: Heartbeat 1000 ms, Election 1000 ms, Commit 50 ms, LeaderLease 500 ms, MaxAppendEntries 64, TrailingLogs 10240, SnapshotThreshold 8192, SnapshotInterval 120 s. `Apply(cmd, timeout)` returns a Future; `Barrier()` blocks until prior entries applied; `VerifyLeader()` does the leadership heartbeat check; `AddVoter/AddNonvoter/RemoveServer` are single-server changes. Consul uses it (with 16384 threshold override).
- Client-facing Go gotchas: pass `context.WithTimeout` to etcd clients, treat timeouts as *unknown outcome* (op may have committed); retry only idempotent ops or use txn compare.
- Verified in this container: `/usr/local/go/bin/go version` reports **go1.24.7** (brief says 1.26); the etcd raft module itself declares go 1.26 - no runtime demo of raft was built (no module downloads allowed).

## 5. Illustration plan
**Scene A - "Why a majority?" (6 frames).**
1. 3 nodes, one primary, async replica; client write acked. 2. Primary crashes before replicating; replica promoted; acked write gone. 3. Try "all must ack": one node dies, writes stop. 4. Introduce majority: 3 nodes, quorum ring of 2; draw two overlapping majorities sharing one node. 5. Table 3->1, 4->1, 5->2, 7->3 with node counts lighting up. 6. **STOP: why is a 4-node cluster no better than 3? / what does the minority side do?**
**Scene B - "Election & terms" (8 frames).**
1. Three followers, timers as shrinking rings with different lengths (randomized 150-300 ms). 2. S2's timer fires: term 1, votes self, RequestVote fan-out. 3. S1 grants (log ok), S3 grants; S2 leader, heartbeats pulse. 4. Leader partitioned: S1/S3 time out, term 2, S3 leads. 5. Old leader S2 (term 1) sends heartbeat -> sees term 2 -> steps down. 6. **STOP: split vote** - two candidates, one vote each, both time out, retry with new random timers. 7. **STOP: log up-to-date check** - candidate with longer but older-term log denied. 8. **STOP: partitioned follower bumps term to 9; on rejoin deposes leader -> show Pre-Vote asking first.**
**Scene C - "Replication, commit, and Figure 8" (9 frames).**
1. Leader appends entry (idx 5, term 3), AppendEntries with prevLogIndex 4/prevLogTerm. 2. Follower with mismatched idx 4 rejects; leader decrements nextIndex. 3. Match found; follower's conflicting suffix deleted & overwritten (divergence repair). 4. Majority matchIndex >= 5 -> commitIndex moves, entries turn solid; applied to state machine. 5-8. Figure 8 in four panels (a)-(d) with S1..S5 logs as colored term blocks; panel (c) shows old entry on 3 servers with a "NOT committed" badge. 9. **STOP: why can't S1 count replicas of the term-2 entry? -> (d1) overwritten vs (d2) commit via term-4 entry.**
**Scene D - "Reads, membership, snapshots" (7 frames).**
1. Deposed leader serves stale read (red). 2. ReadIndex: readIndex=commitIndex, heartbeat round, wait apply. 3. Lease read: timeline bar with lease window; clock jumps -> lease bar wrongly long. **STOP: lease read vs ReadIndex trade-off.** 4. Joint consensus: C_old,new dual-majority rings. 5. Then C_new committed. 6. Single-server change: overlap Venn of majorities. 7. Snapshot: log prefix collapses into snapshot box; lagging follower gets InstallSnapshot.

## 6. Existing interview questions (src/bank/cats/*.json)
- `architecture-cap-theorem`: right and concise (CP/AP during partition, PACELC). Misses: consensus systems are CP only for the majority side; linearizability vs serializability distinction; tie to Raft.
- `architecture-two-phase-commit`: mentions Paxos/Raft groups removing the blocking coordinator; accurate, no detail. Could link to Multi-Raft (CockroachDB range = Raft group) - verified above.
- `messaging-kafka-replication-fault-tolerance`, `messaging-kafka-core-entities`: mention KRaft controller; fine. Note Kafka data replication is ISR-based, *not* Raft (only the metadata quorum is Raft) - answers correct but could be misread.
- `databases-multi-master` (mentions Raft/consensus): not inspected in depth.
- `architecture-service-discovery`: lists etcd/Consul/ZooKeeper; correct. No existing question directly asks "explain Raft", "why odd number of nodes", "how do linearizable reads work in etcd", "what is Figure 8" - gaps.

## 7. Sources
- Ongaro dissertation LaTeX, github.com/ongardie/dissertation (basicraft/consensus.tex, clients/clients.tex, membership/*.tex, leaderelection/prevote.tex) - commit/vote rules, Figure 8, 150-300 ms, ReadIndex 5 steps, lease reads + drift caveat, joint vs single-server, min-election-timeout rule, Pre-Vote. Fetched 2026-09-29.
- etcd-io/raft @ HEAD (README.md, raft.go, log.go, raftpb/raft.proto), go.mod `go 1.26`. Fetched 2026-09-29.
- etcd-io/etcd @ HEAD (server/embed/config.go, server/etcdserver/{bootstrap,server,v3_server}.go); etcd-io/website v3.6 docs `tuning.md`, `learning/api_guarantees.md`.
- hashicorp/raft @ HEAD (config.go, raft.go, api.go, util.go, commit 2026-09-22); hashicorp/consul @ HEAD (agent/consul/config.go).
- cockroachdb/cockroach pkg/config/zonepb/zone.go (512 MiB / 128 MiB / 3 replicas).
- Not fetched (blocked): raft.github.io/raft.pdf (paper), Lamport Paxos papers, FLP paper, ZAB paper -> general descriptions from memory, UNVERIFIED wording.
