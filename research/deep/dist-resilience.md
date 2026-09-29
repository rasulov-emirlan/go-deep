# dist-resilience — Timeouts, retries, breakers & backpressure

Legend: **[SRC]** = read primary source text this session (GitHub raw / Go source). **[RUN]** = I ran it (Go 1.26, `/tmp/research/dist-resilience/`).
**[SNIP]** = only seen in web-search result summaries (sre.google, aws.amazon.com, usenix, arxiv were blocked by the egress proxy). **[REASON]** = derivation. **UNVERIFIED** = memory only.
Depth note: `src/topics/scaling/stories.tsx` already has: slow B -> callers retry -> 3x load; "3 layers x 3 retries = 27"; backoff+jitter one-liner; breaker CLOSED/OPEN/HALF-OPEN. This page goes deeper on: deadline budgets, exact retry math, jitter numbers, retry budgets & adaptive throttling, breaker window semantics, bulkheads, adaptive concurrency/load shedding, hedging, metastability.

## 1. Mechanism (naive -> failure -> real design)

### 1a. Timeouts and deadlines
Naive: no timeout (Go `http.Client{}` and `http.Server{}` have **zero = no timeout** by default [SRC/RUN: `http.DefaultClient.Timeout` = 0s]). Failure: a slow dependency parks goroutines/conns/memory (each blocked request holds a goroutine ~2-8KB+, a socket, a pool slot) until the caller itself falls over — latency becomes an outage.
Real design:
- **Every** hop has a timeout, at the granularity of the wait: dial, TLS, response headers, whole request, per-DB-statement, plus **server-side** read/write/idle timeouts.
- **Deadline (absolute) vs timeout (relative)**: propagate the *remaining budget*, not a fresh per-hop timeout. If the edge gives 1s and A spends 300ms, A calls B with <=700ms. Otherwise B keeps working after the caller gave up (wasted work, "zombie work") — under overload that is most of the load.
- **gRPC**: deadline travels as the `grpc-timeout` header (relative remaining time; clocks not synced, so it's converted to a timeout). grpc-go computes `time.Until(deadline)` from the ctx when creating headers; if <=0 it fails locally with `DeadlineExceeded` before sending [SRC: grpc-go `internal/transport/http2_client.go` createHeaderFields]. The server handler's `ctx` already carries the deadline; **propagation is automatic only if you pass that ctx (or a child) to outgoing calls** — `context.Background()` in a handler silently drops it.
- `context.WithTimeout(parent, d)`: child deadline = min(parent, now+d) [RUN: child with 5s under 200ms parent kept the parent's deadline]. So nested timeouts can only shorten. Reserve headroom: leave time for your own post-processing and the response; A's timeout for B should be < A's remaining budget minus own work.
- **Timeout budget** design: end-to-end SLO 500ms, fan-out serial chain of 3 calls: budgets sum plus overhead; parallel calls: budget = max, hedge/retry must fit inside. Set per-hop timeouts from measured p99/p99.9 of the *dependency* (not the mean), and give retries a total deadline, not a per-attempt one only.
- A timeout is an **unknown outcome** (request may have executed) — see dist-txns.

### 1b. Retries: helpful, then lethal
Naive: `for i<3 { call }` immediately. Failure modes:
- **Multiplicative amplification across layers**: if each of d layers makes `a` total attempts when the layer below fails, the bottom sees a^d. 3 layers x 3 attempts = **27**; if "retry 3 times" means 4 attempts (1+3): 4^3 = **64**; 4 layers of 3 attempts = 81; 5 layers = 243 [REASON]. NB the existing scaling story's "3 layers each retry 3 times send 27" is right only if "3" means total attempts (1 try + 2 retries); say "3 attempts" to be exact.
- **Synchronized retries** (thundering herd): fixed sleep aligns all clients into pulses.
- Retrying when overloaded adds load to a service that is failing *because* of load; in the limit goodput -> 0 (see metastable, 1h).
- Non-idempotent operations: retry after timeout can double-apply.
Real design:
- Retry only **transient + idempotent** failures (connect errors, 503/429 with `Retry-After`, gRPC `UNAVAILABLE`; not 4xx, not `DEADLINE_EXCEEDED` blindly). Non-idempotent -> idempotency key.
- **One layer retries** (usually the one closest to the user or the edge/mesh), lower layers fail fast. Google SRE: "limit retries per request" (max ~3) *and* a **server-wide retry budget**; retry only if the caller can distinguish "overloaded, don't retry" from "transient, retry" [SNIP of SRE book, Ch. 22 Cascading Failures].
- **Exponential backoff**: sleep_n = min(cap, base * 2^n).
- **Jitter** (AWS Architecture Blog, Marc Brooker 2015 [SNIP]): all with `sleep = min(cap, base*2^attempt)`:
  - *Full*: `sleep = random(0, temp)` .
  - *Equal*: `temp/2 + random(0, temp/2)`.
  - *Decorrelated*: `sleep = min(cap, random(base, sleep_prev*3))`.
  Blog result: without jitter, exponential backoff still has clustered calls (total calls only ~halved vs no backoff); with jitter calls drop dramatically; Full and Equal ~same call count, Decorrelated slightly more calls but lowest completion time (SNIP summary: "Decorrelated produced lowest total time"). My own toy simulation [RUN] (100 clients, server serves 1 call/tick, base 2, cap 100): no-jitter backoff calls=5050 (n(n+1)/2, fully synchronized collisions), **full 528**, equal 559, decorrelated 533; completion ticks full 190, equal 265, decorrelated 172. Toy model, don't quote as AWS numbers — quote the *ordering* (jitter >> no jitter; full ~ decorrelated > equal).
- **Retry budget** (token bucket / ratio): allow retries only while `retries/requests <= 10%` over a window (Finagle default 20% [UNVERIFIED], Envoy `retry_budget` default 20% [UNVERIFIED], SRE book example 10% per-request-average [SNIP]). Effect: worst case load multiplier 1.1x instead of 3x/27x. **gRPC retry throttling** (gRFC A6) [SRC: raw A6-client-retries.md]: per-server token bucket, `maxTokens` in (0,1000], `tokenRatio` >0 (e.g. 0.1); failure = -1 token, success = +tokenRatio; if tokens <= maxTokens/2, no retries (hedges too, except first). Per-method `retryPolicy.maxAttempts`: values >5 are treated as 5 (client max, configurable via channel arg). Server can send `grpc-retry-pushback-ms` (negative/unparseable = "do not retry"). Retry deadline: overall call deadline still applies to the whole chain.
- **Adaptive throttling (SRE book, client side)** [SNIP]: each client keeps 2-minute counters `requests` (attempts) and `accepts` (not rejected by backend). Reject locally with probability `max(0, (requests - K*accepts)/(requests+1))`, K=2 recommended (lower = more aggressive). Rejected-locally requests still count in `requests`. Lets a client shed toward a struggling backend without central coordination.

### 1c. Circuit breaker
Naive: keep calling a dependency that times out at 2s -> every request burns 2s + a goroutine; retries multiply it. Breaker: fail fast, give the dependency air, probe for recovery.
State machine: **Closed** (pass, record) -> trip -> **Open** (reject instantly, `ErrOpenState`) -> after a cooldown -> **Half-open** (admit limited probes) -> probes ok -> Closed; any probe fails -> Open again (cooldown restarts).
Trip criteria differ by library — a favourite trap:
- **sony/gobreaker** [SRC: gobreaker.go read]: `Settings{MaxRequests, Interval, Timeout, ReadyToTrip, IsSuccessful, OnStateChange}`. Default `ReadyToTrip` = **ConsecutiveFailures > 5** (i.e. 6th consecutive failure). `ReadyToTrip` is evaluated only on failures in Closed. **No true sliding window**: counts live in a "generation" that resets on state change or every `Interval` (default **0 = never clears** in Closed, so old successes/failures only get cleared by a state change; a success resets ConsecutiveFailures). Open `Timeout` default **60s**. Half-open admits `MaxRequests` (default **1**, code sets 1 if 0); >MaxRequests concurrent probes get `ErrTooManyRequests`; breaker closes after `ConsecutiveSuccesses >= MaxRequests`; any failure in half-open reopens immediately. Stale results from an older generation are ignored (a slow request that finishes after the state flipped doesn't corrupt counts). `IsSuccessful` decides whether e.g. a 4xx / context.Canceled counts as failure — default counts *every* non-nil error as failure. `TwoStepCircuitBreaker` lets you report success/failure after the fact.
- **resilience4j** [SRC: CircuitBreakerConfig.java constants]: failure-rate based over a sliding window: `failureRateThreshold` **50%**, `slidingWindowSize` **100**, `slidingWindowType` COUNT_BASED (or TIME_BASED), `minimumNumberOfCalls` **100** (no evaluation before this many calls -> low traffic never trips), `waitDurationInOpenState` **60s**, `permittedNumberOfCallsInHalfOpenState` **10**, `slowCallRateThreshold` 100%, `slowCallDurationThreshold` **60s** (slow calls can trip it even without exceptions). Half-open evaluates the failure rate of the permitted 10 calls (unlike gobreaker's "N consecutive successes").
- Consecutive-failure vs failure-rate: consecutive trips fast on hard-down but is blind to 40% error rate; rate needs volume (min calls) and windows.
- Breakers are **per dependency (and often per endpoint/instance)**, not one global; a shared breaker across healthy+sick instances punishes healthy traffic. Also the breaker is client-local: N clients each need to learn separately (mesh outlier detection ejects instances centrally).
- What to do while open: fallback (cache, default, degraded), or error fast. Alert on state transitions. Count what? timeouts and 5xx yes; 4xx no.

### 1d. Bulkheads
Isolate resources per dependency/tenant/priority so one failure can't drain shared capacity: separate connection pools, separate goroutine limits (semaphore) per downstream, separate worker pools per priority, separate `http.Client`/`Transport` per dependency (so one slow host can't exhaust `MaxIdleConnsPerHost`/global conns), cell/shard-based architecture at infra level. Threadpool bulkhead in Java maps in Go to a `semaphore`/bounded worker pool, since goroutines are cheap but downstream capacity isn't.

### 1e. Backpressure & bounded queues
Unbounded queue = latency bomb: under overload queue grows, every request waits the full queue (Little's law: L = lambda*W), so the server processes requests whose clients already timed out. Bound queues; when full, **reject fast** (503/`RESOURCE_EXHAUSTED`/`429`) or block the producer (Go bounded channel: `ch := make(chan T, N)` + `select { case ch <- x: default: reject }`). Prefer **LIFO/adaptive-LIFO** or drop-oldest under overload so you serve requests that still have a live client [REASON; Facebook/Google practice: UNVERIFIED]. Queue at the *edge* not deep inside. Propagate pressure (HTTP/2 flow control, TCP windows, Kafka consumer pause, `MaxConcurrentStreams`).

### 1f. Load shedding & adaptive concurrency
- **Static limit**: N in-flight (semaphore) — too high = collapse, too low = wasted capacity, and the right N changes with workload/latency.
- **Adaptive (Netflix concurrency-limits, TCP-inspired)** [SNIP]: **AIMD** (+1 per RTT when no drops, x0.9/0.5 on drop/timeout); **Vegas** (estimate queue = limit*(1 - RTT_noload/RTT); increase if below alpha, decrease if above beta); **Gradient/Gradient2** (limit *= RTT_noload/RTT_current, smoothed). Recommendation in the repo: delay-based (Vegas) on servers, loss-based (AIMD) on clients [SNIP]. When over limit the server rejects fast (`UNAVAILABLE`/429). Go: `platinummonkey/go-concurrency-limits` [UNVERIFIED], or roll `x/sync/semaphore`+AIMD.
- **Criticality/priority shedding** (SRE book): under overload drop lowest-criticality first (batch < interactive < critical); reject *cheaply* (the reject path must cost far less than serving, or shedding itself overloads — cost of rejection matters).
- Shed at the **front** (before parsing/auth/DB), and give clients a distinguishable "overloaded, don't retry" signal (e.g., gRPC `RESOURCE_EXHAUSTED` vs `UNAVAILABLE`; `Retry-After`; gRPC pushback).

### 1g. Hedged requests & tail latency
Dean & Barroso, *The Tail at Scale*, CACM 2013 [SNIP]: fan-out amplifies tail (P(at least one slow) = 1-(1-p)^N: p=1%, N=100 -> 63%). **Hedged request**: send to a second replica if the first hasn't answered within ~the p95 latency; take the first reply, cancel the other. Their BigTable benchmark (1,000 keys across 100 servers): hedge after 10ms cut p99.9 of the whole read from **1,800ms to 74ms** with only **~2% extra requests** [SNIP]. **Tied requests**: send both immediately, each tagged with the other; whichever starts first cancels the peer (avoids queueing duplicates). Other techniques: micro-partitions, selective replication, latency-induced probation (temporarily drop slow servers), canary requests.
Rules: hedge only idempotent/read requests; hedge delay >= p95 (hedging at p50 doubles load); cap hedges with the same retry-budget/throttle (gRPC hedging honors throttling and `maxAttempts` <=5 [SRC A6]); cancel losers (ctx cancel) or you waste capacity; hedging + overload = amplification, so disable when the system is saturated.

### 1h. Metastable failures & cascading failure
Bronson, Aghayev, Charapko, Zhu, HotOS 2021 [SNIP]: a **trigger** (blip, deploy, cache flush, load spike) pushes the system into a state where a **sustaining effect** (retry amplification, cache-miss storms -> more DB load -> more misses, slow error paths, lock/GC thrash, work queued for dead clients) keeps it overloaded *after the trigger is gone*. Recovery needs load reduction below the normal level, not just trigger removal. OSDI 2022 "Metastable Failures in the Wild" (Huang et al.): 22 incidents from 11 orgs; retry policy was the most common amplifier; >=4 of 15 major AWS outages in the last decade were metastable [SNIP: numbers via search summary; exact "retry share" figure UNVERIFIED]. Mitigation: prevent amplification (budgets, backoff+jitter, load shedding, breaker, no retries in deep layers), reduce hysteresis (cold-cache protection, request coalescing = singleflight), make overload *cheaper* than success, have a big red "shed/deprioritize" lever and load-test past the edge.
**Cascading failure** (SRE book Ch.22) [SNIP]: server overload -> slower -> more in-flight -> more memory/GC/threads -> crash -> remaining servers get more load. Causes: no shedding, retries, long queues, missing deadlines, health-check-kills-busy-server loops, cold caches after restart. Fixes: shed, cap queues, deadlines, retry budgets, graceful degradation.

### 1i. Graceful degradation
Decide per feature what degrades: serve stale cache, drop recommendations/personalization, disable non-critical calls (feature flags/brownouts), return partial results with a flag, static fallback, queue writes for later. Design fallbacks to not depend on the failing system (a fallback that calls the same DB isn't one) and to be *tested* (they rot).

## 2. Edge cases & gotchas
- **`http.Client.Timeout` includes reading the body** [RUN: headers arrived, then body read failed with "context deadline exceeded (Client.Timeout or context cancellation while reading body)"]. Why: it's a total deadline for the whole exchange. For streaming responses use ctx or transport-level timeouts instead.
- **`DefaultTransport`**: dial 30s, keepalive 30s, TLS handshake 10s, `IdleConnTimeout` 90s, `MaxIdleConns` 100, `MaxIdleConnsPerHost` **2** (`DefaultMaxIdleConnsPerHost`) [SRC: net/http/transport.go]. Why it bites: with concurrency >2 to one host you keep churning connections (TIME_WAIT, TLS handshakes) -> latency; raise it for service-to-service.
- **No `ResponseHeaderTimeout` by default** — a server that accepts and never replies hangs until Client.Timeout (which is also 0 by default).
- **Not closing/draining `resp.Body`** leaks the connection (and its pool slot).
- **`http.Server`**: all timeouts 0 by default; `ReadHeaderTimeout` guards slowloris; `WriteTimeout` is per-response total, and a handler can't be cancelled by it (it just closes) — use `http.TimeoutHandler` or ctx for handler-level limits. Why: ReadTimeout/WriteTimeout apply at the connection level.
- **Retry on `context.DeadlineExceeded` from your own parent ctx** is pointless — the budget is gone; check `ctx.Err()` before sleeping/retrying and use `select{case <-time.After(d): case <-ctx.Done():}` (not `time.Sleep`).
- **Backoff sleep bigger than remaining deadline**: cap sleep by remaining budget or fail immediately.
- **Retry after a timeout on a non-idempotent call** -> duplicate side-effect. Why: timeout = unknown outcome.
- **Retrying at every layer** (SDK + client + mesh + app): e.g. AWS SDK 3 attempts x Envoy 2 x app 3 = 18 — check *all* layers (mesh sidecars retry by default policy in Istio: 2 retries [UNVERIFIED]).
- **Breaker + retries order**: retry outside the breaker, so open-circuit errors aren't retried into it; or make `ErrOpenState` non-retriable. Breaker inside retry with backoff can be ok; never retry `ErrOpenState` immediately.
- **gobreaker Interval=0** means a service with 5 failures, 1000 successes, then 1 failure... consecutive counter reset by every success, so flaky-at-40% never trips [SRC]. Why: consecutive logic only.
- **gobreaker half-open with MaxRequests=1**: one unlucky probe reopens for another 60s.
- **Breaker counts client-side cancellations** (`context.Canceled`, user aborts) as failures unless `IsSuccessful` excludes them -> trips on user behaviour.
- **resilience4j minimumNumberOfCalls=100**: on a low-traffic service the breaker never opens (failure rate not evaluated) [SRC].
- **Health check that fails under load** -> LB ejects busy nodes -> remaining nodes hit harder (cascade). Why: liveness/readiness conflated with load.
- **Cold start thundering herd**: after restart empty caches + pool warmups -> DB flood; ramp traffic (slow start), pre-warm, singleflight.
- **Unbounded goroutine-per-request under overload** -> memory; a semaphore/limit at the entry is the Go bulkhead.
- **`x/sync/semaphore.Weighted` is FIFO**; `Acquire` fast-path only if no waiters (a big waiter at the front blocks smaller ones even if capacity exists — anti-starvation) [SRC semaphore.go]. `Acquire(ctx)` returns `ctx.Err()` on cancel; `TryAcquire` for load shedding; acquiring `n > size` blocks until ctx done (never succeeds) — waiting forever if no deadline [SRC].
- **Hedging doubles load** if the tail isn't independent (shared bottleneck, overloaded backend) — hedges make it worse.
- **Retry budget per client is local** — 1000 clients each with a "10% budget" is fine in aggregate, but a low-traffic client can't retry at all; use min retries-per-second floor (Envoy `min_retry_concurrency` [UNVERIFIED]).
- **Timeout ordering**: inner timeouts must be < outer; otherwise outer fires first and inner work continues orphaned.
- **gRPC `DEADLINE_EXCEEDED` vs `CANCELLED`**: server cannot tell if client gave up early; propagate ctx into DB calls so the query is cancelled (pgx cancels via a cancel request).

## 3. Common misconceptions
- "Add retries for reliability." Retries convert partial failure into overload unless bounded (budget, jitter, one layer, idempotent).
- "Exponential backoff solves the herd." Without jitter clients stay synchronized; jitter is what spreads them (AWS blog).
- "Full jitter means we wait randomly, so the average is smaller and it's worse." It reduces total *work* (calls) at slightly higher individual delay; decorrelated has best completion time in AWS's sim.
- "Circuit breaker = retry limiter." It's a failure isolator; it has no memory of budget or rate of retries; it sits per dependency.
- "Breaker half-open lets 'a few' through." Depends: gobreaker MaxRequests default 1; resilience4j 10.
- "Timeout = failure." It's unknown outcome.
- "gRPC deadlines propagate automatically through my service." Only if the handler passes its ctx into outbound calls; in Go it's the ctx, not magic.
- "http.Client{Timeout: 5s} is enough." Doesn't cover server-side, DB, or per-phase; and covers body read (streaming breaks); also pool settings default to 2 idle/host.
- "Bulkheads are just thread pools." They're any capacity partition (conn pool, semaphore, queue, process, cell).
- "Load shedding is dropping users." It preserves goodput for the requests you keep and avoids collapse; rejecting cheaply and *early* is the point.
- "A queue absorbs bursts safely." Only bounded and short; long queues hold dead work.
- "Hedge every slow request." Hedge only at ~p95+, idempotent, budgeted.
- "Metastable failure is just overload." The system stays broken after the trigger ends because of a sustaining feedback loop (retries/caches).

## 4. Go tie-ins
- `net/http`: `http.Client{Timeout}` (whole exchange incl. body); `Transport{DialContext: (&net.Dialer{Timeout}).DialContext, TLSHandshakeTimeout, ResponseHeaderTimeout, ExpectContinueTimeout, IdleConnTimeout, MaxIdleConnsPerHost}`; per-request `http.NewRequestWithContext(ctx, ...)` (preferred; deadline = min(client timeout, ctx)). `http.Server{ReadHeaderTimeout, ReadTimeout, WriteTimeout, IdleTimeout}`; `http.TimeoutHandler`. [dial timeout to blackhole IP returned `i/o timeout` at exactly 300ms in my run.]
- `context`: `WithTimeout`/`WithDeadline` (min wins), `context.WithoutCancel` (1.21) for cleanup work that must outlive the request, `context.WithTimeoutCause`/`Cause` (1.21) to say *why*; `AfterFunc` (1.21).
- gRPC-Go: deadline -> `grpc-timeout` header automatically from ctx [SRC]; service-config `retryPolicy`/`hedgingPolicy`/`retryThrottling` via `grpc.WithDefaultServiceConfig` (A6; maxAttempts capped at 5, pushback header) [SRC]; interceptors for per-method timeouts; server-side `grpc.MaxConcurrentStreams`, `keepalive` params; `status.Code(err)==codes.DeadlineExceeded`.
- `golang.org/x/sync/semaphore`: `NewWeighted(n)`, `Acquire(ctx, w)`, `TryAcquire`, `Release`; FIFO waiters [SRC]. `errgroup.SetLimit(n)` for bounded fan-out. Bounded channel worker pools for queue backpressure.
- `golang.org/x/sync/singleflight` for request coalescing (`Do`, `DoChan`, `Forget`; panics in `fn` propagate to all waiters [SRC: panicError]).
- `golang.org/x/time/rate` (token bucket) for client-side rate/retry limiting; `sony/gobreaker` (v1 and generic v2), `failsafe-go/failsafe-go` (has `adaptivethrottler` pkg implementing SRE-style throttling [SNIP], retry policies with jitter, hedge policy, bulkhead), `cenkalti/backoff/v4` (exponential + jitter `RandomizationFactor` default 0.5 [UNVERIFIED]), `hashicorp/go-retryablehttp`. Backoff by hand: `d := time.Duration(rand.Int64N(int64(min(cap, base<<attempt))))` (full jitter) with `select` on `ctx.Done()`; watch shift overflow for big attempt.
- Sizing: `db.SetMaxOpenConns`, `SetConnMaxLifetime`; `db.Stats().WaitCount/WaitDuration` = pool queue depth (see scaling page).
- Server load shedding in Go: middleware using `semaphore.TryAcquire` -> 503 + `Retry-After`; check `r.Context().Err()` before expensive work; `runtime/metrics`/`/sched/latencies` as overload signal.

## 5. Illustration plan
**Scene A — deadline budget (7 frames).** Ladder: Client -> Edge -> Svc A -> Svc B -> DB with a shrinking budget bar (1000ms).
1. Edge sets deadline 1000ms. 2. Edge->A carries `grpc-timeout: ~990ms`. 3. A spends 300ms; passes ~690ms to B. 4. B->DB ~500ms. 5. DB slow; budget hits 0; client gives up. 6. **Without propagation**: B and DB keep working on a dead request (zombie work bar). **STOP: "what if A used context.Background() for the call to B?"** 7. Child `WithTimeout(5s)` under 200ms parent: min wins.

**Scene B — retry amplification (7 frames).** Stack of 3 layers + database load meter.
1. One user request, all healthy: load 1x. 2. DB gets slow; L3 times out and retries 3 attempts: 3x. 3. L2 retries too: 9x. 4. L1: 27x. **STOP: "3 layers, 3 attempts each?"** (a^d; 4 attempts -> 64). 5. Fix: retry at L1 only: 3x. 6. Retry budget 10%: worst case ~1.1x. 7. Adaptive throttle: local reject probability rising as accepts fall.

**Scene C — jitter (6 frames).** Timeline strip (time on x, 100 client dots).
1. Server hiccup: all clients fail at t=0. 2. No backoff: 100 calls each ms. 3. Exponential no jitter: dots re-collide at t=2,4,8 (spikes). 4. Full jitter: retries smeared across [0, 2^n]. 5. Numbers panel: calls with none/expo/full/equal/decorrelated (use toy sim numbers labelled "toy"). **STOP: "why does jitter help if the average wait is lower?"** 6. Decorrelated formula `min(cap, rand(base, prev*3))`.

**Scene D — circuit breaker state machine (8 frames).** Three-state diagram + counters + timeline.
1. CLOSED: green calls pass; ConsecutiveFailures=0. 2. failures 1..5 counted; 6th trips (gobreaker default). 3. OPEN: calls rejected instantly (ErrOpenState); 60s timer. 4. Timer expires -> HALF-OPEN; one probe (MaxRequests=1); second concurrent caller gets ErrTooManyRequests. **STOP: "what happens to the second concurrent request in half-open?"** 5. Probe ok -> CLOSED; counters reset. 6. Probe fails -> OPEN again. 7. Side-by-side: resilience4j window (100 calls, 50% failure, min 100 calls) — a steady 40% error stream (successes interleaved) never reaches 6 consecutive failures, so gobreaker's default never trips, while a rate-based breaker trips only once the rate reaches its 50% threshold over >=100 calls. **STOP: "consecutive vs rate?"** 8. Stale generation ignored.

**Scene E — overload, queues, shedding, hedging (8 frames).** Queue + server + clients.
1. Arrival rate > capacity, unbounded queue grows; wait time bar grows. 2. Requests at the head already timed out client-side: server does dead work (goodput 0). **STOP: "why does latency explode after 100% utilisation?"** 3. Bounded queue: full -> 503 fast. 4. Adaptive limit: limit graph AIMD sawtooth vs latency. 5. Priority shedding: critical kept, batch dropped. 6. Tail-at-scale: fan-out to 100 servers, P(slow)=63%. 7. Hedge after p95: second request, first reply wins, loser cancelled: 1800ms->74ms (paper). 8. Metastable loop diagram: trigger -> retries -> load -> failures -> retries; remove trigger, loop persists **STOP: "why doesn't it recover when the trigger is gone?"**

## 6. Existing interview questions
- `concurrency-patterns-timeouts-retries-backoff`: correct and broad (timeouts, deadline propagation, full jitter formula, retry budget 10%, one layer, breaker, bulkheads, hedging p95). Missing: exact retry amplification math, per-phase Go client timeouts, backpressure/bounded queues, adaptive concurrency, metastability, hedging caveats.
- `architecture-circuit-breaker`: mostly right. Says "failures are counted in a sliding window" — true for resilience4j, **not for gobreaker** (consecutive count by default, generation/interval reset); says half-open lets "a few" through — gobreaker default is 1. Flag as imprecise. Otherwise mentions the timeout dependency (breaker never sees failures without timeouts) — good.
- `networking-http-timeouts`: correct that Go client/server have no default timeouts; I saw only the first ~400 chars (rest UNREVIEWED).
- `context-timeout-wrapper`: goroutine + buffered chan(1) + select on ctx.Done — standard; leak-safe only because chan is buffered (good) — the underlying func still runs (cannot be cancelled).
- `architecture-payment-timeout-reconciliation`: right (timeout = unknown).
- Scaling page (`src/topics/scaling/stories.tsx`) claims to verify: "Three layers that each retry 3 times send up to 27 calls" — ambiguous (3 attempts vs 3 retries = 64). "backoff: wait 0-800ms" fine.
- No ids found for: hedged requests as a standalone, bulkhead standalone, load shedding/adaptive concurrency, metastable failure, retry budgets (only mentioned inside answers).

## 7. Sources
- sony/gobreaker source `gobreaker.go` (fetched raw): https://raw.githubusercontent.com/sony/gobreaker/master/gobreaker.go — defaults (Timeout 60s, Interval 0, MaxRequests 1, ReadyToTrip consecutive>5), half-open/generation logic. [SRC, read 2026-09-29]
- resilience4j `CircuitBreakerConfig.java` (fetched raw): https://raw.githubusercontent.com/resilience4j/resilience4j/master/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java — DEFAULT_* constants. [SRC]
- gRFC A6 client retries (fetched raw): https://raw.githubusercontent.com/grpc/proposal/master/A6-client-retries.md — maxAttempts cap 5, throttling maxTokens/tokenRatio (threshold maxTokens/2), pushback header, hedging semantics. [SRC]
- grpc-go transport source (fetched): `internal/transport/http2_client.go` createHeaderFields — `grpc-timeout` from `time.Until(deadline)`, local DeadlineExceeded if <=0. [SRC]
- Go stdlib source (fetched raw): net/http `transport.go` DefaultTransport & `DefaultMaxIdleConnsPerHost = 2`; `x/sync/semaphore/semaphore.go` (FIFO waiters); `x/sync/singleflight`. [SRC]. Experiments in /tmp/research/dist-resilience/main.go [RUN].
- AWS Architecture Blog, "Exponential Backoff And Jitter" (Brooker, 2015): https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ — formulas + qualitative results via search summary only (page blocked) [SNIP]. AWS Builders' Library "Timeouts, retries and backoff with jitter" [not fetched].
- Google SRE Book ch.21 "Handling Overload" (adaptive throttling K=2, 2-min window, formula) and ch.22 "Addressing Cascading Failures" (retry limits/budgets): https://sre.google/sre-book/handling-overload/ [SNIP; page blocked].
- Dean & Barroso, "The Tail at Scale", CACM 56(2), 2013: hedged/tied requests, 1,800ms->74ms with ~2% extra [SNIP via search summary].
- Bronson et al., "Metastable Failures in Distributed Systems", HotOS 2021; Huang et al., "Metastable Failures in the Wild", OSDI 2022 [SNIP]; Brooker blog "Metastability and Distributed Systems" [not fetched].
- Netflix/concurrency-limits README (AIMD, Vegas, Gradient2, server vs client guidance) [SNIP]. failsafe-go adaptivethrottler (pkg.go.dev) [SNIP].
- Unverified: Finagle/Envoy 20% retry budget defaults, Istio default 2 retries, cenkalti/backoff defaults, platinummonkey concurrency-limits port, exact share of retry-caused metastable incidents.
