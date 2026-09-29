# Verify log: clocks, consistency, replication (independent re-check)

Method: Go 1.24.7 snippets run in /tmp/verify/clocks; source read from GitHub raw (cockroachdb, kafka, postgres, cassandra, etcd-io/website, golang/proposal, jepsen-io/elle); Cloudflare/Google-smear/Abadi only via search snippets (sites blocked).

## Clocks (about 40 claims checked)
- time.Time = 24 bytes; `a==a.Round(0)` false, `Equal` true; map miss after Round(0): re-run, OK.
- Strip list (Round(0), UTC, In, Local, AddDate, Truncate, Round(d), time.Unix, JSON) vs Add keeps mono: run, OK. Mixed Sub gives -800ms: OK.
- CockroachDB `--max-offset` default 500ms (pkg/base/constants.go, docs), crash at 80% vs "at least half of the nodes" (server/config.go 0.8, rpc/clock_offset.go, docs): OK.
- Cassandra docs "correctness does depend on these clocks... NTP": OK. Dynamo ~10-entry truncation: snippet only (paper), left.
- Cloudflare 2017 (RRDNS, wall-clock RTT negative -> rand.Int63n panic, fix `<= 0`): search snippets agree; Go proposal 12914 corroborates. Google smear 24 h noon-to-noon, ~11.6 ppm: snippet OK.
- ntpd numbers (128 ms step, 500 ppm slew, 1000 s panic) are ntpd defaults, not "ordinary NTP": HEDGED (caption now says ntpd; chrony differs).
- Lamport/vector/HLC arithmetic in every frame re-derived by hand: OK. TrueTime frame numbers ([100,108], [103,107], [110,118]) consistent with the rules; ~2 epsilon wait and 1-7 ms epsilon are from the Spanner paper (not fetched; illustrative).
- Unverifiable directly: Spanner OSDI text, Kulkarni HLC paper, Lamport 1978 (blocked).
Changes: leap-second last caption "Ordinary NTP" -> "ntpd". No other errors found.

## Consistency (about 45 claims)
- **Ladder was wrong**: drew serializable -> sequential. Jepsen/Elle map (consistency_model.clj): strict-serializable -> serializable, linearizable; linearizable -> sequential -> causal -> writes-follow-reads, PRAM -> MR/MW/RYW; serializable -> repeatable-read/snapshot-isolation only. FIXED: removed the serializable->sequential arrow and caption now says "Linearizable implies it; serializable does not."
- etcd: "strict serializability for all KV API calls", serializable option may be stale (api_guarantees.md): OK; caption now says "default KV calls".
- W+R>N counterexample (N=3,W=2,R=2, v2 only on R1): X reads R1,R3 -> v2, later Y reads R2,R3 -> v1; real-time order violated: OK, sound.
- PACELC: Abadi lists Dynamo, Cassandra, Riak as PA/EL and PNUTS PC/EL; SimpleDB was not in that list -> replaced by Riak.
- Cassandra LWT: "~4 round trips" is the classic (v1, default in cassandra.yaml) Paxos; v2 (4.1+) is fewer -> label "classic Paxos".
- Postgres synchronous_commit levels (on = remote flush, remote_write = OS write, remote_apply = replay, "causal consistency" note): config.sgml/high-availability.sgml OK. pg_current_wal_lsn / pg_last_wal_replay_lsn names OK.
- CAP/Gilbert-Lynch wording, Mongo majority/linearizable, causal sessions: consistent with docs read by the research note; not re-fetched.
- Picture fix: nemesis frame drew the timed-out write with the lost marker (x), contradicting "did it happen? unknown". Now dashed arrow reaching the cluster labelled "write 8 ?".

## Replication (about 50 claims)
- Kafka (source): min.insync.replicas default 1; replica.lag.time.max.ms 30000; unclean default false; acks=all = all current ISR (TopicConfig/design.md); NotEnoughReplicasAfterAppend "producer retries will cause duplicates"; f+1 replicas tolerate f failures "without losing committed messages": OK.
- Cassandra max_hint_window 3h (cassandra.yaml), CL ANY counts a hint: OK. **Hints are stored on the coordinator, not on a stand-in node**; the sloppy-quorum stand-in picture is Dynamo/Riak. FIXED: caption names Dynamo/Riak, stop card says Cassandra keeps hints on the coordinator.
- Kafka frame drew the ISR already shrunk while the caption said writes still wait for F2 (30 s). FIXED: ISR box shrinks in the next frame; frame "F1 dies" now says it leaves the ISR; final caption adds "without losing committed data".
- Failover frame: fencing shown while the partition line was still drawn (message blocked by the partition, not by epoch). FIXED: caption "after the link heals", cut line greyed.
- Quorum counterexample frames (N=3, W=3, R=2) re-checked step by step: OK. QuorumLab/quorum.ts arithmetic (overlap = max(0,W+R-N), brute-force test) OK.
- Postgres: sync stall wording, remote_write/on/remote_apply, pg_rewind timelines: OK per docs.
- CRDT arithmetic (G-counter [3,0]+[0,2] -> [3,2]=5, OR-set add-wins): OK. Merkle/read-repair/anti-entropy: qualitative, OK.
Picture fix: "Overlap without linearizability" was a pile of overlapping diagonals; rewritten (old messages dropped per step, lane subs show v0/v1, in-flight note).

## Illustrations
All frames of all 29 diagrams viewed at 390 (contact sheets) and spot-checked at 1280; no horizontal overflow. Fixed: nemesis lost-marker, counterFlow clutter, failover cut line, Kafka ISR timing, ladder arrow. Not fixed (cosmetic): read-repair lane is labelled Client though it acts as coordinator.

## Bank answers to correct (not edited)
- messaging-kafka-replication-fault-tolerance: "acknowledged only when at least 2 replicas have it" -> "when every replica currently in the ISR has it, and the ISR has at least min.insync.replicas members (default 1)".
- databases-replication-types: "zero data loss (RPO 0) with at least one sync replica" -> only if you fail over to that sync standby; `on` means remote flush, not replay.
- architecture-cap-theorem: mentions R+W>N as tunable consistency; add that it is not linearizable.
