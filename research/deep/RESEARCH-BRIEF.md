# Research brief — distributed systems, networking, OS & hardware topics

Audience: senior Go backend engineers preparing for tricky interviews. The site (Go Deep) turns each topic
into illustrated step-by-step scenes. Your notes are the source of truth the page authors will write from,
and a second, independent agent will re-verify the finished pages against your sources. So be precise.

## What to produce
One markdown file per topic at `research/deep/<slug>.md` (≤ 300 lines each). Sections, in order:

1. **Mechanism** — how it actually works, in the order you'd explain it at a whiteboard (naive version → its
   failure → the real design).
2. **Edge cases & gotchas** — the things a senior interviewer uses to separate "read a blog" from "ran it in prod".
   Each with a one-line "why it happens". Prefer concrete numbers/defaults (kernel/Go/RFC/paper values).
3. **Common misconceptions** — the wrong answers candidates give, and the correction.
4. **Go tie-ins** — where Go's runtime / stdlib / typical libs touch this (verify code claims by running
   `/usr/local/go/bin/go` (Go 1.26, not on PATH) in `/tmp/research/<slug>/`; Linux facts via `strace`,
   `/proc`, `/sys` where available in this container — kernel 6.18).
5. **Illustration plan** — 3–4 sections, each a scene of 5–9 frames. For every frame: what is on stage, what
   changes, the one-sentence point. Think in ladder/sequence diagrams, timelines, rings, state machines,
   memory maps and queues — these are the "illustrations" the reader gets. Mark the frames where an
   interviewer's edge-case question lives (those become "stop" cards).
6. **Existing interview questions** — grep `src/bank/cats/*.json` (fields `id`, `q`, `a`) and list ids that
   match this topic, with a note on whether the existing answer is right/complete or misses something.
7. **Sources** — URL + what you took from it + date/version. Primary sources first (RFCs, papers, kernel docs,
   man7.org, Go source/docs, official product docs, Jepsen/Kleppmann/etc). Say plainly if you could not verify
   a claim; mark it `UNVERIFIED` rather than guessing.

## Rules
- Use WebSearch / WebFetch heavily. Do not rely on memory for numbers, defaults, or version-specific behaviour.
  Cross-check every non-trivial number with a second source when possible.
- Don't edit anything outside `research/deep/`. Don't run git. Don't install packages.
- If two sources disagree, write both and say which one you trust and why.
- Final chat reply: ≤ 15 lines — files written, the 5 most surprising/most-likely-to-be-wrongly-taught facts
  you found, and anything you could not verify.
