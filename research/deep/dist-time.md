# dist-time — Clocks, time & ordering

Verification note: the network proxy blocked most primary sites (research.google, usenix, cloudflare blog, cockroachlabs.com,
developers.google.com, lamport/MIT PDFs). What I could read directly: pkg.go.dev/time, Go source (`golang/go`,
`golang/proposal`) and CockroachDB docs source via raw.githubusercontent.com, Cassandra docs/yaml. Everything else comes via
WebSearch snippets (secondary) and is tagged `(snippet)` or `UNVERIFIED`. Go code claims were run on Go 1.26 in `/tmp/research/dist-time/`.

## 1. Mechanism

**Two clocks on every machine.**
- Wall clock (`CLOCK_REALTIME`): "what time is it", tied to UTC/epoch. Adjusted by NTP: *slewed* (rate changed) for small errors,
  *stepped* (jumped, possibly backwards) for big ones. Also jumps on manual `date -s`, VM resume, leap-second handling.
- Monotonic clock (`CLOCK_MONOTONIC`): only ever moves forward, arbitrary origin (no meaning outside the process/boot). Still slewed by NTP
  (rate) but never stepped. Right tool for durations/timeouts. On Linux it does not count suspend (Go doc: "On some systems the monotonic
  clock will stop if the computer goes to sleep").
- Go runtime on linux/amd64 reads both via vDSO: `CLOCK_REALTIME`=0 for walltime, `CLOCK_MONOTONIC`=1 for nanotime (`runtime/time_linux_amd64.s`, read).

**How Go's `time.Time` holds both (Go >= 1.9).** `time.Now()` returns a `Time` with wall reading + monotonic reading. Layout (time.go, read):
`wall uint64` top bit = hasMonotonic; if set, `wall` holds seconds-since-1885 in 33 bits + nsec, and `ext` holds the monotonic reading in ns since
process start; if clear, `ext` holds full seconds since year 1. `unsafe.Sizeof(time.Time{})` = 24 bytes (run).
Rules (pkg.go.dev/time + source):
- `Sub`, `Before`, `After`, `Equal`, `Compare` use the monotonic reading **only if both operands have one**; otherwise fall back to wall.
  (`Sub`: `if t.wall&u.wall&hasMonotonic != 0 { return subMono(t.ext,u.ext) }`.) `time.Since`/`Until` take a fast path on mono.
- `Add` keeps the monotonic reading (adds the duration to both). `AddDate`, `Round(d)`, `Truncate(d)`, `In`, `Local`, `UTC` **strip** it.
  Canonical strip: `t = t.Round(0)`. Marshal (JSON/Text/Binary/gob) drops it. `Time.String()` prints it as `m=+0.000048613`.
- `==` compares the struct (wall, ext, loc) so `t == t.Round(0)` is **false** while `t.Equal(t.Round(0))` is true (run). A `time.Time` with mono as a
  map key misses after `Round(0)` (run: `m[a.Round(0)]` -> 0). Doc: don't use Time as map/DB key unless Location set and mono stripped.

**Naive design: order events by timestamp.** Use `time.Now().UnixNano()` (or DB `now()`) as the version; highest wins.
**Why it fails:** (1) node clocks disagree (NTP error is ms on a LAN, tens-hundreds of ms on bad WAN/VM; steps happen); (2) wall clock can go backwards
so even one node's timestamps are not monotone; (3) two events can share a timestamp; (4) physical time can't express causality: if A's message
causes B, B's timestamp can still be smaller than A's when B's clock lags. Timestamps give at best a *plausible* order, never a *causal* one.

**Real designs, in order of cost.**
1. **Happens-before (Lamport 1978).** a -> b if same process and a before b; or a = send(m), b = receive(m); or transitive. If neither a->b nor b->a
   the events are *concurrent*. This is a partial order and needs no physical time.
2. **Lamport clock.** Integer L per process. Local event/send: `L++`; send carries L; receive: `L = max(L, Lmsg) + 1`. Guarantees
   `a -> b  =>  L(a) < L(b)`. **Converse is false**: `L(a)<L(b)` does not imply a->b, so Lamport clocks cannot detect concurrency.
   Total order = compare `(L, processID)` (tie-break); that order is consistent with causality but otherwise arbitrary.
3. **Vector clock.** Vector V[1..n], one counter per process. Local/send: `V[i]++`; receive: elementwise max then `V[i]++`.
   Compare: `a<=b` iff every component <=; a->b iff `V(a)<V(b)`; concurrent iff neither <= (run, `hlc.go`:
   `{A:2,B:1}` vs `{A:1,B:2}` -> concurrent; `{A:1}` vs `{A:2,B:1}` -> before). Detects concurrency exactly, hence usable for conflict detection
   (Dynamo: keep both versions as siblings when clocks are concurrent). **Size problem:** O(#writers) not O(#replicas-if-fixed); with client-ids
   it grows unbounded. Dynamo truncates the oldest entries past ~10 (snippet of Dynamo paper) which loses causality info and can produce false
   conflicts. Mitigations: per-server (not per-client) ids, dotted version vectors (Riak; UNVERIFIED details), pruning by age.
4. **Hybrid Logical Clock (Kulkarni et al. 2014).** Pair (l, c): `l` tracks max physical time seen, `c` counter breaks ties/keeps causality.
   Send/local: `l' = max(l, pt); c = (l'==l) ? c+1 : 0`. Receive(m): `l' = max(l, m.l, pt)`; if l' equals both l and m.l: `c = max(c, m.c)+1`;
   if only l: `c+1`; if only m.l: `m.c+1`; else `0`. Property: `a->b => HLC(a)<HLC(b)`, and `l - pt` stays bounded by clock skew, so HLC
   stays within epsilon of wall time and fits in 64 bits (snippet of paper). Run: node b with pt=90 receives (100,0) -> (100,1); next send at pt=91 -> (100,2):
   time never goes backwards even though b's physical clock lags. Used by CockroachDB ("physical component always close to local wall time, logical
   component to distinguish events with the same physical component"; nodes fold in timestamps from every message; crdb docs read).
5. **TrueTime / Spanner (OSDI 2012).** `TT.now()` returns an interval `[earliest, latest]` guaranteed to contain absolute time; `TT.after(t)`,
   `TT.before(t)`. Time masters use GPS + atomic clocks; each machine's daemon polls masters (30 s) and assumes worst-case drift 200 us/s, so
   epsilon is a sawtooth ~1-7 ms (0..6 ms drift + ~1 ms comms) (snippet of paper; primary PDF blocked -> UNVERIFIED verbatim).
   **Commit wait:** a read-write txn picks commit timestamp `s >= TT.now().latest`, then waits until `TT.after(s)` is true before releasing locks/acknowledging.
   So any txn starting after this one commits gets a strictly larger timestamp -> **external consistency** (strict serializability) without a
   coordination round. Cost = wait ~2*epsilon, mostly hidden behind the Paxos round. Bigger uncertainty -> slower commits, not wrong answers.
   CockroachDB has no atomic clocks: it assumes bounded skew (`--max-offset`, default 500 ms) and uses uncertainty intervals + read restarts instead.

**LWW (last-write-wins).** Each write stamped with a timestamp; replicas keep the highest. Convergent and simple but only as correct as the clocks:
the write that "wins" is the one from the fastest clock, not the latest in causal order. See gotchas.

## 2. Edge cases & gotchas

- **Wall clock goes backwards -> negative durations.** Why: NTP step / leap-second reset while you measured with wall time. Cloudflare, 2017-01-01 00:00 UTC:
  RRDNS measured upstream RTT with Go `time.Now()` differences; during the leap second some were negative, got passed to `rand.Int63n` which panics on n<=0; ~0.2% of
  DNS queries affected at peak (snippet of Cloudflare blog; corroborated by Go proposal 12914, which cites it, read). Fix was checking `<= 0` not `== 0`; the deeper fix is Go 1.9 monotonic time.
- **`t.Sub` across a stripped value silently switches to wall.** Why: monotonic used only if both operands have it. `deadline := time.Now().Add(d)` is safe; `time.Unix(...)`,
  values from JSON/DB, `.UTC()`, `.Round()` are wall-only, so `time.Since(thoseValues)` follows wall steps.
- **`==` on `time.Time` and map keys.** Why: compares wall, ext, and `*Location` pointer, not the instant. Use `Equal`, or `Round(0)` + `UTC()` first.
- **NTP step vs slew.** ntpd: steps if offset > 128 ms, slew otherwise; slew max 500 ppm; panic (exits) if offset > 1000 s (snippets; ntp docs. chrony emulates with
  `makestep 0.128 -1` / `maxchange 1000 1 1`; chrony's own default is *no* step after startup unless `makestep` is set (UNVERIFIED)). Why: slewing 100 ms at 500 ppm takes 200 s, so big errors are stepped.
- **Leap second handling differs by fleet.** Options: step back (repeat 23:59:59, or 23:59:60 shown as 0), or *smear*. Google's public NTP: 24 h linear smear from noon to noon UTC,
  rate change ~11.6 ppm (1/86400) (snippet of developers.google.com/time/smear). The 2017 Go proposal describes an older 20-hour smear (99.9986% speed) - Google later standardised on 24 h;
  I trust the smear page. **Never mix smearing and non-smearing NTP sources** on one host: they differ by up to 0.5 s during the window.
- **Skew bound is not a guarantee.** Why: VM pauses, live migration, suspended laptops, broken NTP peers, misconfigured smear. CockroachDB: node crashes itself if its offset is
  >= 80% of `--max-offset` (default 500 ms -> 400 ms) vs at least half the cluster (docs read + snippet), because correctness of uncertainty intervals rests on that bound.
- **Uncertainty restarts.** A read at ts T that meets a value with ts in (T, T+max_offset] cannot know whether it was written before T; CockroachDB pushes the txn timestamp and
  refreshes or restarts (`ReadWithinUncertaintyIntervalError`, crdb docs read). Why: skew makes "later timestamp" ambiguous.
- **Commit-wait latency scales with epsilon.** Spanner ~ 2*epsilon; CockroachDB non-blocking txns "commit-wait" until HLC passes a future commit timestamp (docs read). Why: to make timestamp order equal real-time order.
- **LWW loses data with skewed clocks.** Two clients update the same cell; the one with the *lagging* clock writes later in real time but loses; replicas converge on the wrong value with no error.
  Cassandra: per-column mutation timestamps from client or coordinator clock; "Cassandra's correctness does depend on these clocks... make sure NTP" (cassandra docs `dynamo.adoc`, read).
  A future-dated timestamp acts like an immortal write: it shadows all normal-clock writes (and deletes/tombstones) until real time catches up.
- **LWW ties / same-millisecond writes.** Two writes same timestamp: need a deterministic tiebreak (Cassandra compares values - UNVERIFIED; DynamoDB global tables are LWW too - UNVERIFIED detail).
- **Lamport clock cannot detect concurrency.** `L(a)<L(b)` says nothing about causality. Vector clocks needed for "these two writes conflict".
- **Vector clock growth with client ids** and **false conflicts after pruning** (see mechanism 3).
- **HLC is not a proof of real-time order.** It guarantees causal order and bounded divergence from wall time; it does *not* give external consistency without waiting or uncertainty handling.
- **Ordering by DB `now()` inside one Postgres txn**: `now()` is txn start time, `clock_timestamp()` is actual - a classic source of "newer row has older timestamp" (Postgres docs; UNVERIFIED fetch).

## 3. Common misconceptions

- "NTP makes clocks synchronized, so timestamps order events." No: skew is ms..100s of ms, clocks step, and even perfect sync doesn't give causality across events closer than the skew. `distsys-class` (Aphyr): "NTP is probably not as good as you think".
- "Monotonic clock = correct time across machines." No: origin is arbitrary per host/boot; only differences on the same host are meaningful (Go strips it on marshal for this reason).
- "`time.Now()` can go backwards, so use `time.Now().UnixNano()` for durations." Opposite: `time.Since(start)` with the original `Time` is safe; `UnixNano()` pulls out the wall reading only.
- "`time.Now().Round(0)` rounds to the nearest second/nanosecond." It rounds to no multiple: it *only* strips the monotonic reading.
- "`Equal` and `==` are interchangeable." Not when one side carries a monotonic reading (verified run: `false true`).
- "Lamport timestamps tell you which event was first." Only consistent with causality; concurrent events get arbitrary order.
- "Google Spanner *has* no clock uncertainty." It has bounded uncertainty and pays for it with commit-wait.
- "Leap second = 23:59:60 is always visible." Many systems never show it (smear or step), which is precisely why software breaks differently per fleet.
- "Vector clocks scale like Lamport clocks (one int)." One int per *participant*.

## 4. Go tie-ins

- Go 1.9 added transparent monotonic time (release notes via search; design in `golang/proposal/design/12914-monotonic.md`, read). Before that `time.Now()` was wall-only.
- `time.Since`, `time.Until`, `Timer`/`Ticker`/`context.WithTimeout` deadlines are computed from `time.Now().Add(d)` and compare on monotonic - so system clock changes do not fire or delay them (context deadline from `WithDeadline(t)` uses whatever clock reading `t` carries: a wall-only `t` compares on wall; UNVERIFIED runtime detail).
- Stripping: `Round(0)`, `UTC()`, `In`, `Local`, `AddDate`, `Truncate`. Preserved: `Add`. Serialisation drops mono; `time.Parse` results have none.
- Never persist `UnixNano()` as a version/ordering key across nodes; use a logical counter (etcd revision "can be used as a logical clock", etcd docs read), DB sequence, or an HLC.
- Stdlib has no Lamport/HLC/vector clock; typical Go libs: CockroachDB `pkg/util/hlc` (UNVERIFIED path), `hashicorp/serf` (Lamport clock for events - the clone in `/tmp/research/src/serf` exists; UNVERIFIED usage), `etcd` revisions, Raft terms/indexes as logical clocks.
- Testing with time: Go 1.25+ `testing/synctest` runs a fake clock inside a "bubble" (`runtimeIsBubbled()` appears in `time.Since` source, read). Injecting a `Clock` interface is the older idiom.
- Minimal HLC implementation (30 lines) run and checked: `/tmp/research/dist-time/hlc.go`.

## 5. Illustration plan

**Scene A — Two clocks in one process (Go `time.Time`)** (7 frames)
1. Stage: a `time.Time` struct drawn as 3 boxes (wall, ext, loc) with a hasMonotonic bit lit. Point: `Now()` stores wall AND mono.
2. Two timelines: wall clock line and monotonic line, both running. Start `t0=Now()`.
3. NTP step: wall line jumps back 1 s (leap second); mono line unaffected. Point: wall is adjustable.
4. `time.Since(t0)`: arrow uses mono line -> correct 5 s. Wall-based subtraction shows -1 s (red).
5. `t0.Round(0)` / `.UTC()`: mono box greyed out. Point: stripping.
6. **STOP:** `Sub` with one stripped operand -> arrow flips to wall line (dependence on "both"). Question: "why did my elapsed time go negative after a JSON round trip?"
7. **STOP:** `t == t.Round(0)` false, `Equal` true; map key miss.

**Scene B — Why timestamps can't order events; Lamport -> vector** (9 frames)
1. Three nodes A, B, C with clocks 100/98/105 ms. A writes x=1 (ts 100).
2. B reads x=1 then writes x=2 at local clock 99 (< 100): LWW replicas keep x=1. **STOP:** "Which write is the last one?" (skew loses the causal successor.)
3. Replace with Lamport: A sends (L=1), B receives -> max+1 = 2. Counters shown on the ladder.
4. C does an independent event at L=2 (concurrent with B's) -> equal Lamport numbers, tie-break by id. Point: total order exists but is arbitrary.
5. **STOP:** "Does L(a)<L(b) mean a happened before b?" No - show C(L=1) vs A... a concurrent pair with smaller L.
6. Vector clocks on the same ladder: [1,0,0], [1,1,0], [0,0,1]. Compare arrows.
7. Two writes with [2,1,0] vs [1,2,0] -> concurrent -> keep siblings.
8. Vector size: add client ids, vector grows; truncation at 10 causes false conflict. **STOP.**

**Scene C — Hybrid clocks and TrueTime** (8 frames)
1. Wall time line with skew band epsilon drawn around it.
2. HLC (l,c) boxes; B (pt=90) receives (100,0): shows (100,1); next local (100,2). Point: never goes back.
3. CockroachDB read at T meets write at T+300 ms within max-offset 500: uncertainty interval drawn; txn pushed/restarted. **STOP:** "why do reads restart?"
4. Node offset gauge 0..500 ms with a line at 400: process exits. **STOP.**
5. TrueTime: TT.now interval [earliest, latest] bar with sawtooth epsilon 1-7 ms.
6. Txn T1 chooses s = latest; commit-wait bar until TT.after(s).
7. T2 starts after T1 acked, gets ts > s. Point: real-time order == timestamp order.
8. Leap second strip: hard step vs 24 h smear ramp (11.6 ppm) side by side.

## 6. Existing interview questions (`src/bank/cats/*.json`)

- No question directly on clocks/time/ordering (grep for lamport|vector clock|monotonic|clock returned only unrelated `algorithms-monotonic-slice`).
- `architecture-eventual-consistency`: mentions "last-write-wins" and "timestamps" as conflict tools but says nothing about clock-skew data loss - incomplete on LWW pitfalls.
- `databases-multi-master`: correctly notes LWW "lost updates and clock-skew issues" - right, one line; could add per-column merge/HLC.
- Gap: no card on Go monotonic time / `Round(0)` / `Equal` vs `==`, none on Lamport/vector/HLC/TrueTime.

## 7. Sources

- https://pkg.go.dev/time (fetched 2026-09-29) - "Monotonic Clocks" section: strip list, both-operands rule, `Round(0)`, map-key warning.
- `golang/go` `src/time/time.go` and `src/runtime/time_linux_amd64.s` (raw.githubusercontent, master, 2026-09-29) - struct layout, `Sub`/`Since` code, CLOCK_REALTIME=0/MONOTONIC=1.
- `golang/proposal` `design/12914-monotonic.md` - motivation, Cloudflare reference, 20 h smear remark.
- Go 1.9 release notes https://go.dev/doc/go1.9 (search snippet only).
- Cloudflare post-mortem https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/ (fetch blocked; details from search snippets + Go proposal + Aphyr distsys-class).
- Aphyr `distsys-class` README (`aphyr/distsys-class`, cloned locally) - NTP step 128 ms, POSIX time non-monotonic, Lamport/vector clock outline.
- https://developers.google.com/time/smear (snippet) - 24 h linear smear, 11.6 ppm.
- ntp/chrony docs (snippets: chrony-project.org FAQ, eecis.udel.edu clock state machine) - 128 ms step, 1000 s panic, 500 ppm slew.
- Spanner OSDI 2012 https://www.usenix.org/system/files/conference/osdi12/osdi12-final-16.pdf (blocked; epsilon 1-7 ms sawtooth, 200 us/s drift, 30 s poll from search snippet) - UNVERIFIED verbatim.
- Kulkarni et al., "Logical Physical Clocks" (OPODIS 2014) https://cse.buffalo.edu/tech-reports/2014-04.pdf (snippet only; algorithm given from memory and validated by my Go run).
- Lamport 1978 "Time, Clocks, and the Ordering of Events" (blocked; from memory + Aphyr summary).
- CockroachDB `architecture/transaction-layer.md`, `cockroach-start.md` (cockroachdb/docs raw): HLC, 80% crash rule, uncertainty, commit-wait. 500 ms default from search snippet (start.md flag text read but default value not visible in the truncated line).
- Cassandra `dynamo.adoc` (apache/cassandra raw): LWW per-column timestamps, NTP dependence.
- etcd `api_guarantees.md` (etcd-io/website raw): revision as logical clock.
- Dynamo paper (Cornell mirror, snippet): vector clock truncation ~10.
