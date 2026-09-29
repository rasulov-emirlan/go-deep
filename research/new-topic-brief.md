# New-topic brief (wave 3)

You are building ONE new topic page for **Go Deep** (https://godeep.night.enkiduck.com). It is interview prep for senior Go engineers, told as gopher picture-stories. The repo is `/home/agent/workspace/playground/learning/go-senior` (Vite + React 19 + TS, pnpm, vitest). Five other agents are building other topics in the same checkout at the same time.

What the operator asked for:
- "as concise and simple as possible so everyone could understand them … even illustrations and interactive elements"
- "make sure these look great on both mobile and desktop"

## The rules: read `research/simplify-brief.md` and follow every cap in it
In short:
- 3–4 sections, one `<Story>` each, then "Asked in real interviews", then `<NextTopic>`.
- Stories have 4–7 frames and at most 2 stops. The whole page has at most 22 frames and 6 stops.
- Captions are 15 words or fewer, in plain words. Explain each term the first time it appears.
- Stop cards: title of 5 words or fewer, body of 2 short sentences or 1 sentence plus a snippet of 6 lines or fewer.
- A frame has at most 6 things on stage, and at most 2 of them change per step.
- Prop text is 2 words or fewer. Bubbles are 3 words or fewer.
- At most ONE lab, with at most 2 controls and an obvious big result. Only add a lab if clicking teaches the core idea better than a story. Put its logic in a pure `.ts` model with vitest tests. A tiny table (4×3 or smaller) is fine where it beats a picture.
- `src/topics/stories.test.ts` enforces the frame, stop and caption caps. It must pass.

## Look at finished examples before you start
- `src/topics/sync/` (stories only)
- `src/topics/slices/` (one small lab)
- `src/topics/transactions/` (a tiny table instead of a lab)
- `src/components/Story.tsx`: `Frame`, `Actor`, `Prop`. The stage is 800×360 units and is cropped automatically at the top.
- `src/components/TopicShell.tsx`, `src/components/Lab.tsx` (`Section`, `Lab`, `Seg`), `src/components/Code.tsx`
- `src/bank/TopQuestions.tsx`, `src/bank/cats/*.json`
- Sprites: `public/gophers/*.webp`. Use the file name without the extension. Reuse sprites that fit the metaphor.

## Mobile + desktop, which is the extra focus this wave
- On a 390px phone the stage is scaled to ~0.49×, so:
  - keep every prop at least **90 units wide** if it has text;
  - keep actors at `h` ≥ 100 when they are the focus;
  - never put two text props closer than 12 units apart;
  - keep bubbles away from the stage edges and from each other.
- Fewer, bigger things read better on both screens. Use at most 4 actors.
- Labs must work at 390px with no horizontal scroll, and must not look empty or stretched at 1280px.
- Code blocks must fit 390px without wrapping badly. Lines should be about 38 characters or fewer.

## Files
- **Your folder:** replace the stub `src/topics/<folder>/Page.tsx`. It must stay the default export and keep `slug=` as given. Add `stories.tsx`, an optional lab plus its model and test, and `<folder>.css` with classes prefixed by your folder name.
- **The registry entry already exists.** Don't edit `registry.ts`. Put a better title, blurb, kicker or card-gopher suggestion in your report instead.
- **Don't edit shared files** (components, index.css, bank, e2e, other topics) and don't run git. No `tsc -b` and no `pnpm build`.
- **No new question-bank entries.** Pick 4–8 existing ids from the bank that match what you teach. Search every category with grep. Some topics have few questions, and 4 is fine.

## Accuracy: senior interviewers check edge cases
- **Go facts:** target Go 1.26. Run every claim about what code prints, sizes (`unsafe.Sizeof`/`Alignof`/`Offsetof`) or behavior with `/usr/local/go/bin/go` (it's not on PATH), in `/tmp/wave3/<folder>/`. For benchmarks, report numbers as "on an 8-core box" and give ratios, not absolutes.
- **Cloud and database product facts** (SQS, Pub/Sub, Kafka 4.x, MongoDB 8.x, PostgreSQL 18): check the current official docs with WebFetch or WebSearch. Don't rely on memory for limits, retention, ordering or delivery guarantees. Put the doc URLs in your report, not on the page.

## Verify before reporting
- `npx tsc -p tsconfig.app.json --noEmit`: your folder must be clean.
- `npx vitest run src/topics/<folder> src/topics/stories.test.ts`
- `npx oxlint src/topics/<folder>`
- Screenshots:
  - Start `npx vite --port <PORT> --host 127.0.0.1 --strictPort` in the background.
  - With a Playwright script (import `chromium` from `@playwright/test`, and set `executablePath` to the `chrome-headless-shell` binary under `~/.cache/ms-playwright/chromium_headless_shell-1234/`), capture **every frame of every story at 390×844 AND at 1280×900**, plus the lab at both sizes.
  - Save files under `/tmp/wave3/<folder>/`.
  - Read the PNGs and fix overlap, clipping, tiny text, crowding and empty space.
- When you're done, kill your vite server by its PID. **Check with `ss -ltnp | grep <PORT>` that it's gone.** Don't use `pkill -f`.

## Report (short)
- Sections and stories, with frame and stop counts, and the longest caption.
- The lab, if any.
- Question ids.
- Suggested registry title, kicker, blurb (15 words or fewer) and card gopher.
- Stable text for e2e: h2s, lab title and buttons.
- Accuracy findings, with the Go versions and doc URLs you checked.
- Shared changes you wished for.
