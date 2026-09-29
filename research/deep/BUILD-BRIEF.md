# Build brief — deep topics (distributed systems, networking, OS & hardware)

You are building ONE topic page (a folder under `src/topics/<slug>/`) for **Go Deep**, interview prep for
senior Go engineers. The operator's asks for this wave:
- Distributed systems: "very in depth", the cool patterns, and "concentrate on illustrations as much as possible
  since this is a difficult section with lots of edge cases".
- Networking: "as short as possible", skip obvious parts, only edge cases that matter in tricky senior interviews,
  "pay a lot of time refining illustrations".
- OS & hardware: explain WHY (syscalls, user/kernel split…), "no need to state how important to get illustrations right".
- Everything must be reverified against sources: a second agent will check your page against your research file.

## Inputs
1. `research/deep/<slug>.md` — your source of truth (mechanism, edge cases, illustration plan, sources).
   Every factual claim on your page must be traceable to it (or to something you verify yourself with
   `/usr/local/go/bin/go` (Go 1.26, not on PATH), `strace`, `/proc`, or the web). If the note marks something
   `UNVERIFIED`, don't state it as fact.
2. Existing pages as style references: `src/topics/http/` (stories + tiny lab), `src/topics/kafka/` (lab with pure model + test),
   `src/topics/scaling/`. Existing question-bank ids are listed in `src/bank/cats/*.json`.
3. The diagram tool for this wave: **`<Flow>`** — `src/components/Flow.tsx`, model + docs in `src/components/flow.ts`.
   Read both files fully. It draws ladder/sequence diagrams (lanes + arrows, slanted for latency, lost arrows ✕),
   boxes, nodes (rings, state machines), free lines/paths, text, and gophers, as a stepper. Steps are DIFFS
   (`add` / `set` / `drop`), so each step changes one or two things — that is the point. Coordinates live on a
   560-wide stage, height `h` you choose per flow. The old gopher `<Story>` (`src/components/Story.tsx`) is still
   available — use it where a character metaphor is clearer than a diagram (e.g. a kernel gatekeeper). Prefer Flow for
   message flows, timelines, state, rings, memory maps; you may mix both on one page.

## Page shape
- `Page.tsx` (default export; keep the `slug` the stub already uses) — `TopicHero` (lead ≤ 25 words, plain),
  then 3–5 `<Section id="…" n="01" kicker="…" title="…">` blocks, then `Asked in real interviews`
  (`<Section id="asked" n="0N" kicker="Real interviews" title="Asked in real interviews">` containing
  `<TopQuestions from={[…]} ids={[…]} />` with 6–10 existing bank ids that match), then `<NextTopic slug=… />`.
  IMPORTANT: `scripts/lessons.py` reads `<Section id="x" n="NN" kicker="…" title="…">` with exactly that attribute order and
  plain double-quoted string literals for `title` — keep it that way (no JSX in title).
- Each section: an optional 1–2 sentence intro (`<p className="prose">`-free plain `<p>`; keep it short), then 1–2 `<Flow>`/`<Story>` visuals.
  Order sections in design order: naive version → how it fails → the real mechanism → the edge cases.
- Put flows in `flows.tsx` (exports of type `FlowDef`; `src/topics/flows.test.ts` finds every export of that file), gopher stories
  (if any) in `stories.tsx` (exports of `Frame[]`; `src/topics/stories.test.ts` applies its caps to them).
- Depth budget (this wave is deeper than earlier pages): per flow 4–10 steps, ≤ 3 stops; whole page ≤ 50 steps and ≤ 12 stops
  (distributed pages will use most of it; networking pages should stay near 20–25 steps; OS pages ~30).
  Gopher `Story` keeps its old caps (4–7 frames, ≤ 2 stops, captions ≤ 15 words).
- Captions: one idea, ≤ 30 words (aim for ≤ 22), plain words; the first time a term appears, say what it is. Use `code` in backticks sparingly.
- Stop cards (`stop`): title ≤ 5 words; body 1–3 short sentences OR 1 sentence + a Go/shell snippet ≤ 8 lines (`<Code>`, see
  `src/components/Code.tsx`; lines ≤ 38 chars so a phone doesn't scroll). Use `edge: true` for the interview edge cases — these are what
  the page is for. Every edge case in your research note that a senior interviewer would ask should land in a caption or a stop.
- Optional ONE lab per page, only if clicking teaches the idea better than a stepper (good candidates: consistent-hash ring with an
  "add node" button showing % of keys moved; quorum N/W/R sliders showing when a stale read is possible; retry amplification; Lamport /
  vector clock playground). ≤ 2 controls, obvious result, fits 390px. Logic in a pure `.ts` model with vitest tests.
  Use `Lab`, `Seg`, `Stat` from `src/components/Lab.tsx`. Skip the lab if you can't make it obvious.
- No prose walls, no callouts, no Sources section on the page (sources live in your research note).

## Illustration quality (this is what the operator cares about most)
- Consistent visual language: **ink = normal, grey = old/inactive/history, red = the thing this step is about (failure, the edge case, the
  new message)**, dashed = absent/in-flight/unconfirmed, ✕ = lost. Same lane order and x positions across the flows of one topic, so the
  reader learns the map once.
- One new thing per step. Old arrows recede automatically; use `set` to recolor/move, `drop` to clear when the picture gets busy.
- Every diagram must be readable at 390 px wide: message labels ≤ ~14 chars, ≤ 5 lanes (≤ 4 preferred), ≥ 90 units between lanes, no
  text smaller than the built-ins. `flows.test.ts` estimates overlaps and off-stage elements — it must pass, but it's a floor: LOOK at
  the pictures.
- Build the mechanism in design order (naive → failure → fix). Name where the metaphor lies in a stop card if it matters.
- Where the topic has numbers (quorum sizes, timeouts, latencies, defaults), draw them on the picture or caption.
- Gopher sprites: `public/gophers/*.webp` (file name without extension). Use sparingly in Flow (a `gopher` element as an actor with a
  bubble ≤ 3 words); don't force them where a lane or box is clearer.

## Files & rules
- Edit ONLY your `src/topics/<slug>/` folder (Page.tsx, flows.tsx, stories.tsx, optional lab + model + test, `<slug>.css` with classes prefixed
  `<slug>-`). Don't edit shared files (components, index.css, registry, App, bank, e2e, other topics). If you need a shared change, say so in
  your report instead. Registry entry (title/kicker/blurb) exists; suggest better ones in your report if you have them.
- Don't run git. Don't run `tsc -b` or `pnpm build`. Never `pkill -f` (it kills your own shell) — start vite with
  `npx vite --port <PORT> --host 127.0.0.1 --strictPort > /tmp/<slug>-vite.log 2>&1 & echo $!` and kill that PID.
- Go code you show or claim about: run it. Linux behaviour you claim: reproduce with `strace`, `/proc`, `sysctl` where the container allows, else cite your research note.

## Verify before reporting
- `npx tsc -p tsconfig.app.json --noEmit` (your folder must be clean)
- `npx vitest run src/topics/<slug> src/topics/flows.test.ts src/topics/stories.test.ts src/components`
- `npx oxlint src/topics/<slug>`
- Screenshots of EVERY step at both sizes: `node scripts/shots.mjs <port> <slug> /tmp/shots/<slug>` (defaults to 390x844 and 1280x900; prints
  horizontal overflow). Read the PNGs (Read tool) — fix overlaps, clipped/tiny text, ambiguous arrows, empty space, confusing colour use.
  Iterate until every step reads on its own. Budget real time here; this is where quality comes from.
- Count caps: steps, stops, longest caption in words.
- Re-read your page top to bottom once against the research note: does anything overstate ("always"/"never" where the note says "usually")?

## Report (≤ 25 lines)
Sections (id + title), flows/stories with step & stop counts, lab (if any), question ids used, suggested registry title/kicker/blurb,
stable text for e2e (h2s, buttons), any claim you could not fully verify (be explicit), shared changes you wish for.
