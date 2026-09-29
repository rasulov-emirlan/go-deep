# Verify log — resilience (src/topics/resilience)

Sources: sony/gobreaker gobreaker.go and resilience4j CircuitBreakerConfig.java (raw GitHub, read this session); Go experiments in /tmp/verify/resilience/main.go (Go 1.24); "Tail at Scale" figures via search summary (matches the paper's text).

## Claims checked
- gobreaker: default ReadyToTrip `ConsecutiveFailures > 5` (6th trips), Timeout 60s, Interval 0, MaxRequests 0 -> 1, half-open `Requests >= maxRequests` -> ErrTooManyRequests, close at `ConsecutiveSuccesses >= MaxRequests`, any half-open failure -> Open (new 60s expiry), stale generation results ignored, default IsSuccessful counts every non-nil error (incl. context.Canceled). All OK. Nuance not drawn: Open->HalfOpen is lazy (evaluated on next call), no timer.
- resilience4j defaults: failureRateThreshold 50, slidingWindowSize 100 COUNT_BASED, minimumNumberOfCalls 100, waitDurationInOpenState 60s, permittedCallsInHalfOpen 10. OK (only 50% / 100 / 100 appear on the page).
- **"A steady 40% error rate never makes 6 in a row"**: false for random failures (P(run>=6) per position ~0.4%, so it eventually trips); true only for evenly spread failures. FIXED caption ("Failures spread evenly ...") and stop card ("mostly blind ... random runs of 6 can still trip it"). Also the drawn strip said "8 failed, max 2 in a row" but the bit string had 7 failures and no adjacent pair: FIXED string (8 failures, max run 2).
- Retry arithmetic: attempts^layers: 3^3=27, 4^3=64 ("retry 3 times" = 4 attempts), flow and lab both use "attempts" consistently (lab shows N+1 variant). OK. Retry budget 10% -> 1.1x: correct per budgeted layer; budgets at every layer would compound (1.1^3 ~ 1.33). Frame drew 1.1x on all three arrows -> FIXED (only top layer 1.1x, lower arrows x1; caption "per budgeted layer"). Frame "Fix three" label "-> 1x" over-promised -> "↓".
- Adaptive throttling formula `max(0,(requests-K*accepts)/(requests+1))`, K=2, lower K = more aggressive: SRE book (SNIP), matches. OK.
- **Deadline timeline did not add up**: A "works 300 ms" but the box spanned t=30..300 (270 ms), the call to B was labelled 690 ms left while sent at t=300 (700), B->DB 470 left though B started at 330. FIXED with one consistent timeline: edge->A 30 ms transit, A works to t=330, B gets 670 left, B works 200 ms (360..560), DB gets 440 left; boxes, axis ticks (330, 560), captions and the "5 s -> 670 ms" label updated. Zombie/cancel bars re-based.
- `context.WithTimeout(parent 200ms, 5s)` keeps parent deadline: re-run true. `http.DefaultClient.Timeout`, `http.Server` timeouts = 0: re-run true. OK.
- grpc-timeout is a relative header derived from ctx deadline (grpc-go, read earlier by researcher): [SRC], kept.
- Jitter toy model (page's own seeded model): fixed/expo peak 100, jitter peaks 61/60/26; formulas match AWS blog. Stop-card sim ("5,050 vs 528"): independent re-run 5,050 exactly (n(n+1)/2) and full jitter 563 avg over 50 seeds (equal 561, decorrelated 603). FIXED to "about 550 (average of 50 seeded runs)". "Full jitter picks between 0 and the backoff cap" ambiguous -> "that attempt's backoff time".
- Queue arithmetic: 120-100 = 20/s growth; 100 queued = 1 s, 200 = 2 s; bound 20 = 0.2 s. OK. "goodput falls toward zero" needs FIFO + client timeouts -> HEDGED in stop card. `429 Retry-After` "do not retry" -> "429 or 503 with Retry-After".
- Metastable: 70/s x 3 attempts = 210/s vs 100/s. OK. HotOS 2021 concept, "trigger + sustaining effect": [SNIP], only described, no numbers.
- Hedging: 1-0.99^100 = 63.4%. Tail at Scale: hedge after 10 ms cut p99.9 of retrieving all 1,000 values (BigTable, 100 servers) from 1,800 ms to 74 ms with 2% more requests: attribution correct; caption said only "the 99.9th percentile" -> FIXED to say it is for a 1,000-value fan-out read. "hedge at p95 ~ 5% extra" is the paper's rule of thumb. OK.
- `http.Client.Timeout` includes body read (researcher [RUN]) — page only says "no timeouts by default" -> OK.

## Not verified
Netflix concurrency-limits, failsafe-go, Finagle/Envoy budget defaults (not on the page).

## Illustrations
390 sheets reviewed for all 7 figures: no overflow, no clipping. Changes: deadline geometry (above), budget arrows, breaker strip.
