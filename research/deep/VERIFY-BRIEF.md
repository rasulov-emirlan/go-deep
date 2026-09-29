# Verify brief — independent re-check of built topic pages

You did NOT write these pages. The operator asked: "research these topics and reverify everything in the end again",
"pay a lot of time refining illustrations". Your job is to find and FIX errors on 3 finished topic pages
(`src/topics/<slug>/Page.tsx`, `flows.tsx`, optional `stories.tsx`/lab). Audience: senior Go engineers in tricky interviews —
a wrong or over-claimed fact is worse than a missing one.

## Part A — facts (do this first, most important)
1. Read the page files fully: every caption, stop card body, code snippet, prop/label text, lab text, section intro. Extract each factual
   claim (numbers, defaults, "always/never", protocol behaviour, Go behaviour, who-did-what attributions).
2. Check each against: the research note `research/deep/<research-slug>.md` (which claims are VERIFIED vs UNVERIFIED/[SNIP]); primary
   sources you fetch yourself (WebFetch/WebSearch — many sites are blocked by the egress proxy; GitHub raw, pkg.go.dev, and
   raw.githubusercontent.com mirrors of kernel/man-pages/RFC/papers work; try alternatives like arxiv, github mirrors, web.archive.org);
   and experiments you run: Go 1.24.7/1.25.1 at `/usr/local/go/bin/go` (Go 1.26.0 *source* is readable from raw.githubusercontent.com;
   the runtime source in /usr/local/go/src is 1.24/1.25), `strace`, /proc, sysctl in this container (kernel 6.18, cgroup v1, 4 vCPU).
   Compile and run every Go snippet shown on the page (put in /tmp/verify/<slug>/). Re-run any measured number the page quotes if
   feasible, and confirm the caption says how it was measured.
3. Look for: over-general statements ("always"), stale version claims, numbers that are illustrative but not labelled as such,
   misattributions, two captions that contradict each other, arithmetic that doesn't add up (check every sum/percentage/timeline
   drawn on a diagram — e.g. do the arrows in a ladder actually match the caption's order of events? does a quorum diagram really
   intersect?), a diagram that shows something the caption doesn't say (or the opposite), missing critical caveat an interviewer checks.
4. FIX what is wrong directly in the page files: correct it if you can prove the right answer from a source or experiment; if you can't
   verify a claim and it's load-bearing, soften/hedge or remove it. Keep the caps (flows.test.ts, stories.test.ts must pass: caption ≤ 30
   words, ≤ 3 stops/flow, ≤ 50 steps & ≤ 12 stops/page, 4–10 steps/flow).
5. Write a short log `research/deep/verify-<slug>.md`: each claim you checked (claim → source/experiment → OK / fixed / hedged /
   couldn't verify), every change you made. Keep it under 120 lines. This is the audit trail the operator reads.

## Part B — illustrations
1. Start vite (`npx vite --port <PORT> --host 127.0.0.1 --strictPort > /tmp/<slug>-v.log 2>&1 & echo $!`; kill by PID, never `pkill -f`).
2. `node scripts/shots.mjs <PORT> <slug> /tmp/verify-shots/<slug>` — captures EVERY step of every diagram at 390x844 and 1280x900.
   READ EVERY PNG (Read tool). For each step ask: can a reader who has never seen it understand this frame from the caption + picture?
   Check: overlapping/clipped text, tiny text, arrows that hit the wrong lane, ambiguous colours (red must mean "this step's point"),
   busy frames that should `drop` old stuff, empty space, labels colliding with arrows, wrong lane ordering between flows in one topic,
   pictures that lie (e.g. an arrow drawn to the server when the caption says it was lost), the ✕/dashed conventions used consistently.
3. Fix problems in `flows.tsx`/`stories.tsx` (coordinates, `set`/`drop`, wording, splitting a crowded step) and re-shoot. Iterate until
   every step is clean at both sizes. Also confirm no horizontal overflow (the script prints it).
4. You may NOT edit shared files (`src/components/*`, index.css, registry, App, bank, other topics). If Flow itself has a bug that hurts
   several diagrams, describe it precisely in your report and work around it locally.

## Rules
- Don't run git. Don't `tsc -b`/build. Never `pkill -f`.
- Before reporting run: `npx tsc -p tsconfig.app.json --noEmit` (clean for your folders), `npx vitest run src/topics src/components`,
  `npx oxlint src/topics/<slug>` (only-export-components warnings on flows.tsx are known and acceptable).
- Final chat reply (≤ 25 lines): per topic — # claims checked, # fixed, # hedged, # unverifiable; the 3 most important corrections;
  illustration fixes count; anything still shaky that a human should look at; proposed corrections to existing question-bank answers
  you noticed (id + what is wrong + the right text).
