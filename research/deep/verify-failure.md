# verify-failure (page: src/topics/failure-detection)

Sources: aphyr/partitions-post README (Bailis & Kingsbury full text), hashicorp/memberlist master (config.go, util.go, state.go,
suspicion.go), akka reference.conf, apache/cassandra FailureDetector.java, kubernetes master (kubelet defaults.go, kubelet.go,
node_lifecycle_controller.go, nodelifecycle config, kube-controller-manager flags, DefaultTolerationSeconds admission), Linux /proc, Go dial.go.
Memberlist snippet re-run: go get memberlist@latest, compiled; every value in the snippet equals DefaultLANConfig (printed 1s 500ms 3 4 8).

## Phi-accrual
- phi = -log10 P(beat still coming): 1-in-1000 -> 3 -> OK.
- Akka: threshold 8, max-sample-size 1000, min-std-dev 100 ms, acceptable pause 3 s, HB interval 1 s; comment "around 5.5 seconds
  with default settings" -> OK (label kept; assumes 1 s heartbeats). Normal distribution -> OK.
- Cassandra: phi = t/mean * PHI_FACTOR(0.434) , threshold 8, SAMPLE_SIZE 1000 -> silence 8/0.434 = 18.4x mean -> OK. Diagram check:
  Akka reaches the threshold at 121 px, Cassandra at 405 px: 405/121 = 3.35 = 18.4/5.5, i.e. a consistent 1 s mean gap -> OK.
- Timeline T=1.5 s / T=10 s: the 10 s silence arrow was 289 px against 70 px per second elsewhere -> HEDGED in-picture "(not to scale)".
- "fixed T ... failover adds load (GitHub, 2012)": in the source a busy MySQL primary failed health checks, a cold-cache replica was
  promoted and performed poorly -> reworded "a false failover can do more harm than the slowness" -> FIXED (wording).
- TCP: "Linux keepalive starts at 7200 s" -> /proc 7200/75/9 OK, but keepalive is OFF unless the socket enables it, and Go's net.Dialer
  enables it at 15 s by default (dial.go) -> FIXED (prose).

## Slow or dead ladder
- Ping every 1 s, T=3 s. Original ping positions were 60 px apart but the timer arrow started at the 2nd ping (2.4 s not 3 s) ->
  FIXED: timer now starts at the last ack and ends at the 3rd unanswered ping (1 s = 60 px), stall box extended.

## SWIM / memberlist (source)
- ProbeInterval 1 s, ProbeTimeout 500 ms, IndirectChecks 3, GossipNodes 3, GossipInterval 200 ms, PushPullInterval 30 s,
  SuspicionMult 4, SuspicionMaxTimeoutMult 6, AwarenessMaxMultiplier 8, RetransmitMult 4 -> OK.
- "A picks one random member every second": memberlist probes members round-robin in a SHUFFLED list (probeIndex, resetNodes/shuffle)
  -> FIXED ("next member in its shuffled probe list").
- ping-req to 3 members + parallel TCP fallback ping -> OK; a TCP-only success is logged and does NOT mark suspect (state.go).
- Suspect/refute: Alive with higher incarnation beats Suspect; only the owner bumps own incarnation; skipIncarnation for rejoin -> OK.
- SUSPICION TIMEOUT: page said "4 s at 8 nodes, longer as N grows". Source (suspectNode): min = SuspicionMult*max(1,log10 N)*ProbeInterval
  = 4 s at 8 nodes, but the timer STARTS at max = 6*min = 24 s and only shrinks toward min as k=SuspicionMult-2=2 independent
  confirmations arrive (Lifeguard); k=0 (timer = min) only when n-2 < k -> FIXED ("4 s at 8 nodes once others confirm, else 24 s").
- Push/pull: one random peer per PushPullInterval, interval scaled by ceil(log2(n/32))+1 above 32 nodes -> FIXED ("about every 30 s ... with one random peer").
- Lifeguard health multiplier / back off; Serf/Consul build on memberlist -> OK.

## Gray failure, partitions, split brain, STONITH (Bailis & Kingsbury text)
- 5.2 devices and 40.8 links per day, from a study of "several of Microsoft's datacenters" (Toronto+MSR) -> OK (page now says several datacenters, as reported by B&K).
- BCM5709 drops inbound but not outbound; spare kept getting keepalived heartbeats; 5 hours, needed reboot -> OK.
- EC2 MongoDB primary isolated, two hours of write loss, w=safe not majority -> OK.
- GitHub 2012-12-22: 90 s partition, Pacemaker/DRBD pairs issue STONITH, messages DELAYED so pairs thought both active, both shot each
  other on recovery, 5 h to recover "those downed pairs". Page said "A shoots B too" and "no node is left" for all -> FIXED (delayed
  delivery, "some pairs lost both nodes"; power-off arrows dashed while in flight, solid when delivered).
- 3|2 partition, non-transitive A-B-C, one-way node, leader not reaching quorum: Raft logic consistent with the consensus page -> OK.
- Split-brain 2 nodes / witness 2-of-3 / frozen leader + storage term check -> OK (arithmetic 2 of 3, 1 of 3).

## Kubernetes (master source)
- NodeMonitorPeriod 5 s, NodeMonitorGracePeriod 50 s (comment: > 30 s HTTP2 ping + 15 s read idle), older 40 s -> OK.
- Lease duration 40 s, renew every 0.25*40 = 10 s -> OK (kubelet.go:238, defaults.go).
- Page said the kubelet "posts full node status on the same 10 s beat". WRONG: NodeStatusUpdateFrequency=10 s is how often it CHECKS;
  NodeStatusReportFrequency defaults to 5 min (defaults.go:141) unless status changed -> FIXED.
- Default toleration 300 s for not-ready and unreachable (DefaultTolerationSeconds admission) -> OK; ~350 s total (page: "about 6 min") OK.
- Eviction rate 0.1/s; unhealthy zone threshold 0.55 needs >2 not-ready nodes; secondary rate 0.01/s, 0 when zone/cluster <= 50
  (large-cluster-size-threshold) -> OK. "If every zone is unhealthy it evicts nothing": the code needs every zone in FULL disruption
  (no Ready node at all) -> FIXED wording.
- DaemonSet pods tolerate the taints without tolerationSeconds -> OK (research note).
- Grace period is counted from the last heartbeat (up to 10 s before the cut) so real detection is ~40-50 s after the cut; page keeps "~50 s".

## Illustrations
- SWIM refute frame: "alive inc 5" label no longer sits on the B->F arrow. Split-brain frames: "write t1/t2" labels moved off the arrows.
- (Flow limitation, not fixed: text on a line sits exactly on the line with no halo, so labels on steep arrows are crossed by the stroke.)
- At 390 px width text inside diagrams renders around 7-9 px; no clipping, no horizontal overflow (0 px).

## Bank notes
- devops-k8s-readiness-liveness: should mention node-level timings ~50 s grace + 300 s toleration (not 40 s + 5 min as commonly quoted). Not edited.
