# Verify log — sharding (src/topics/sharding)

Method: re-ran numbers independently in Go 1.24 (/tmp/verify/sharding/main.go, FNV-64a + mix, 200k keys, 100 random rings), CRC16 in Python, Redis cluster-spec fetched raw.

## Claims checked
- mod-N moved 3->4 75%, 10->11 91%, 100->101 99% -> exact (agree only when h=r in [0,N) per N(N+1) period). Re-run: 75.0 / 91.0 / 99.0. OK.
- Rolling deploy `73%10=3`, `73%11=7`; `1234 mod 7 = 2`; `1-0.99^100 = 63%` -> computed. OK.
- Redis slot numbers (CRC16/XMODEM mod 16384): user:42=15880, {u1}:cart=4574, {u1}:prefs=4574, cart:u1=13083, prefs:u1=5853, {bigcorp}:*=8179; "123456789" -> 0x31C3. All OK. Owners with 3 equal masters (0-5460/5461-10922/10923-16383): 15880->C, 8179->B. OK.
- Hash-tag rules (first `{`, first `}` after, non-empty), CROSSSLOT, ~1000-node guidance, MIGRATING/IMPORTING, ASK vs MOVED, ASKING one-shot flag, MIGRATE atomic/locks both instances, big keys unwise: read cluster-spec.md. OK. MIGRATING node serves only keys that exist, else ASK -> caption "a key that has already moved" was narrower than truth: FIXED to "a key A does not hold".
- Ring drawing: A owns (80,300] = 61.1%, B 22.2%, C 16.7%; key->owner arcs; 15 points 5 each; D points sit inside gaps; replica walk A,A,B (2 machines) -> skip -> A,B,C; 12 points, 3 each. OK.
- Maglev: permutations (offset,skip) 3/4, 0/2, 3/1 reproduce; populate gives BABACCA, 3/2/2, round 1 = A3,B0,C4. OK.
- Rendezvous: remove node moves exactly its share (re-run: 10.0% = node3 share 10.0%, add 9.0%). OK.
- Jump hash: 10->11 9.26%, 100->101 0.97%, 10->9 moved 9.97%, all from bucket 9. Caption said "exactly 1/(n+1)": it is an expectation -> HEDGED ("on average"). "Bucket 2 dies ... its data must be copied there" was ambiguous -> reworded (last machine takes number 2, needs bucket 2's data from a replica).
- Ring lab (ring.ts, 20k keys, FNV-1a32+murmur fmix): mod 90.9/90.1%, ring add 6-9%, `minimal` true. Consistent with my Go run (avg ring add 9.0-9.2%). OK. Lab shows one fixed draw; foot text now says so.
- **Load spread numbers 48/22/6.6/3.1% and "1.86x / 0.23x" were single random draws**. Averaged over 100 rings, 10 nodes: v=1 CV 88% (max/mean 2.9x), v=10 29%, v=100 9.6%, v=1000 2.9%. FIXED: chart now shows averages, caption says "averaged over 100 random rings", stop card says ~2.9x on average. 1/sqrt(v) holds (theory ~95/30/9.5/3).
- Naive replica walk "29% of keys <3 distinct": theory 1-0.9*0.8 = 28%, mine 27.7%. FIXED to "about 28% (1 - 0.9 x 0.8)".
- Hot key Zipf 27.3% -> 19.0% salted: my run 25.2% -> 16.0% (ring draw, Zipf sampling differ). HEDGED to "about 25-27%" / "about 16-19%", labelled simulation.
- 10->11 ring "10.3% moved, ideal 9.1%", remove "10.2%": one-draw values from research run; my mean 9.2%. Kept (labelled "ring test"), within noise.
- Reshard "switching back is instant" -> "quick" (Vitess ReverseTraffic is fast, not instant). Reverse replication recipe: [SNIP], kept generic.
- Cassandra/Dynamo/Vitess/Citus/Mongo statements on the page are only qualitative ("as Dynamo and Cassandra do" for vnodes) -> fine.
- Could not verify: Karger 3.2% figure (page no longer quotes it); Citus/Vitess specifics (not on page).

## Illustrations
Reviewed all 49 frames at 1280 and key ones at 390: no overflow, no clipped text. Scatter-gather query arrows overlapped almost completely (three arrows from one point): FIXED by staggering start y. Small mobile text is the Flow component's scaling (shared, not touched).
