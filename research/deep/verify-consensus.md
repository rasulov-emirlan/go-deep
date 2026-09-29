# verify-consensus (page: src/topics/consensus)

Sources fetched this pass: ongardie/dissertation LaTeX (prevote.tex, clients.tex, availability.tex, consensus.tex), etcd-io/raft raft.go,
etcd-io/etcd v3_server.go/config.go (raw GitHub). Raft paper PDF itself not reachable; the dissertation text covers every rule below.
Legend: OK = confirmed, FIXED = page changed, HEDGED = wording softened.

## Facts
- Majority = floor(n/2)+1; n=3/4/5/7 -> need 2/3/3/4, survive 1/1/2/3; 2 nodes worse than 1 -> OK (arithmetic).
- Any two majorities intersect (S2 in both regions in the diagram) -> OK, geometry checked (regions 130-350 / 270-490 share S2).
- Election timer 150-300 ms suggested -> OK (consensus.tex:214 "e.g. 150-300 ms"). Timers 212/158/287 ms sit inside the range.
- Vote rule: not voted this term + candidate log at least as up to date, last term first then length -> OK (research note + thesis).
- Vote/term fsynced before replying -> OK (Raft persistent state).
- Higher term makes any server step down -> OK.
- Broadcast << election timeout << MTBF -> OK (thesis).
- Pre-Vote: no term bump, peers say yes only if log up to date AND no heartbeat from a valid leader for a baseline election
  timeout; thesis extension (not 2014 paper); inspired by ZooKeeper -> OK (prevote.tex verbatim).
- Without Pre-Vote a partitioned server's larger term forces the leader to step down -> OK (prevote.tex).
- Pre-Vote scene step 4 said "S2 refuses the vote (S3's log is stale)": nothing earlier in the flow made S3's log stale -> HEDGED
  ("Here it refuses the vote too, because S3 missed committed entries").
- AppendEntries check prevLogIndex/prevLogTerm; reject; nextIndex--; delete conflicting suffix; leader never overwrites own log -> OK.
- LOG GRID ARITHMETIC (replication): leader S1 = [1,1,1,3,3] + idx6 (T3). S2 = [1,1,1,2,2]. Probe prev=(5,T3): S2 has T2 -> reject;
  prev=(4,T3): T2 -> reject; prev=(3,T1): T1 matches -> S2 becomes [1,1,1,3,3,3]. S3 = [1,1,1] short, accepts 4-6.
  Every prev=(idx,term) in the arrows equals the LEADER's entry at idx -> OK, no change. commitIndex=6 is valid (own-term entry on all 3).
- LOG GRID ARITHMETIC (Figure 8): checked (a)-(e) against paper/dissertation: (a) S1 leader T2, idx2 on S1,S2; (b) S5 wins T3 with
  S3,S4,self (S2 refuses: its last term 2 > S5's 1); (c) S1 wins T4, idx2(T2) on S1,S2,S3 = 3/5 not committed; (d1) S5 (last term 3)
  wins with S2,S3,S4 (last terms 2,2,1) and overwrites idx2; (d2) S1 puts a T4 entry on S1,S2,S3 -> commits, S5 (last term 3 < 4)
  gets S4+self = 2/5 in (e). Terms and vote counts all match caption -> OK.
- Commit rule: count replicas only for entries of the leader's current term; older ones commit indirectly -> OK (etcd maybeCommit
  requires term==r.Term, raft.go).
- New leader appends an empty entry -> OK (raft.go:961 emptyEnt). "needed for read-only queries" -> OK (thesis clients.tex:327).
- Committed != replied; client sessions + serial numbers (thesis ch.6) -> OK.
- ReadIndex: leader must have committed an entry in its term, readIndex=commitIndex, heartbeat round, wait for apply, answer;
  one heartbeat round serves many reads; followers can ask leader for readIndex -> OK (clients.tex 327-376).
- Lease reads: extend to start + election timeout/clock drift bound; if the drift assumption breaks "arbitrarily stale" -> OK (clients.tex 396-429).
- etcd default ReadOnlySafe; ReadOnlyLeaseBased requires CheckQuorum -> OK (raft.go:336). etcd Serializable:true skips
  LinearizableReadNotify -> OK (v3_server.go:138,174).
- Joint consensus: C_old,new needs majorities of both; new config effective on append; then C_new -> OK (thesis safety.tex). Single-server
  change: 2+3>4 overlap arithmetic OK; add before remove OK; learner first OK; etcd one conf change in flight (pendingConfIndex) OK.
- Removed server disrupts; fix = ignore RequestVote within min election timeout of hearing a leader -> OK (availability.tex 305-317).
  MISSING CAVEAT ADDED: thesis (availability.tex 270-300) says Pre-Vote does NOT solve this case -> FIXED (stop card).
  etcd-raft implements it as inLease (raft.go:1103) and that needs checkQuorum -> added.
- etcd defaults: not quoted on this page except "lease option needs CheckQuorum" (OK).

## Not on the page (checked to make sure nothing over-claims)
- No claim of CheckQuorum semantics beyond "leader that hears no majority steps down" -> OK.

## Changes
1. flows.tsx prevote step 4 caption hedged (see above).
2. flows.tsx membership last stop: Pre-Vote does not fix removed-server disruption; lease check needs CheckQuorum.
Illustrations (see report): quorum step 3 copy arrows no longer overlap (S3 arrow moved up); election last frame drops the stale lost
arrows and moves "heartbeat T2" up; Pre-Vote alternative frame labelled "with Pre-Vote"; joint-consensus frame keeps C_old black /
C_new red instead of two black outlines.

## Bank notes
- architecture-two-phase-commit / cap-theorem: fine. No correction needed for this topic.
