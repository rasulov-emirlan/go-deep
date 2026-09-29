# Simplify brief

You are simplifying topic pages of **Go Deep** (https://godeep.night.enkiduck.com). The repo is at `/home/agent/workspace/playground/learning/go-senior`: Vite + React 19 + TS, pnpm, vitest. Other agents are simplifying other topics in the same checkout at the same time.

The operator's words: **"make sure that they are as concise and simple as possible so everyone could understand them. we do not wanna over complicate anything even illustrations and interactive elements."**

**Reader:** a developer who knows basic Go syntax, reading on a phone. It is not a runtime expert.

**The test:** a junior dev must understand every caption without googling anything.

## Read first
- `src/components/Story.tsx`: the `Frame`, `Actor` and `Prop` types.
- `src/components/TopicShell.tsx`: `TopicHero`, `NextTopic`.
- `src/bank/TopQuestions.tsx`.
- `src/topics/stories.test.ts`: it validates every exported `Frame[]`.
- Your topic's current files.

## Hard caps, per page
- **Hero `lead`:** one plain sentence, 20 words or fewer, no jargon.
- **Sections:**
  - 3–4 sections, plus "Asked in real interviews".
  - Each section has a plain-word `h2`.
  - An intro sentence is optional; if you use one, keep it to one sentence.
  - Each section has exactly ONE `<Story>`.
- **Stories:**
  - 4–7 frames each.
  - At most 2 `stop` cards per story.
  - **At most 22 frames and 6 stops for the whole page.**
- **Captions:**
  - One idea, **15 words or fewer**.
  - Plain words first.
  - Use a Go or runtime term only if interviewers expect it.
  - The first time a term appears, say what it does ("P, a slot that lets a thread run Go code").
  - At most one term per caption.
  - No struct field names (`sendx`, `sudog`, `tophash`, `schedtick`…) unless the question bank's answers use them. Even then, use them only in a stop card, explained.
- **Stop cards:**
  - Title: 5 words or fewer.
  - Body: 2 short sentences at most, or 1 sentence plus a Go snippet of 6 lines or fewer.
  - Only use a stop card for the "gotcha" an interviewer will actually ask. Plain narration goes in captions, not stop cards.
- **Pictures:**
  - At most 6 things on stage per frame, and at most 2 change per step.
  - Prop labels and text: 2 words or fewer.
  - Bubbles: 3 words or fewer.
  - Actor tags: short (`G1`, `P0`, `reader`).
  - If a scene needs a legend, it is too complex; redraw it simpler.
- **Interactive:**
  - At most ONE lab per page, and only if clicking teaches the core idea better than the stories.
  - At most 2 controls, and one sentence telling the reader what to try.
  - The outcome must be obvious at a glance (big red result, not a table of numbers).
  - It must fit a 390px-wide phone.
  - If the current lab can't meet this, simplify it or delete it. Deleting is fine.
  - A tiny table (4×3 or smaller) is fine where it beats a story (e.g. the nil/closed channel table).
- **Remove:**
  - prose paragraphs;
  - `Callout`s;
  - runtime-struct code dumps;
  - Sources walls;
  - sandboxes, `<details>` "more" boxes and multi-scenario tour pickers;
  - Quiz, OrderPuzzle and the old `Interview` components. The question bank covers those.
  - Anything "nice to know".
- **Keep:**
  - `<TopQuestions from={[…]} ids={[…]} />` with 6–8 ids that match what the page now teaches;
  - `<NextTopic slug=… />`;
  - the `TopicHero` slug and title. The title may be reworded simpler.
  - The toc lists only the sections.

Cutting is the job: if a frame or section isn't needed to answer the top interview questions, delete it. Prefer merging two stories into one short one. Reuse existing sprites, stage geometry and helpers. Don't redraw what already works.

## Accuracy
Simplifying may leave things out, but must never mislead. Don't turn "usually" into "always", and don't drop the one caveat an interviewer checks. Keep facts that were verified earlier (Go 1.26, PostgreSQL 18). Don't add new factual claims unless you verify them: Go is at `/usr/local/go/bin/go` (not on PATH), and use a scratch dir `/tmp/simplify/<slug>/`.

## Files
- Edit only `src/topics/<your slugs>/`.
- Delete components, files and tests your page no longer uses. Grep first to make sure nothing outside your folder imports them.
- Keep lab model tests if you keep the lab; update them if you change the model.
- Do NOT edit shared files (`src/components/*`, `index.css`, registry, App, bank, e2e, other topics). If you need a shared change, say so in your report.
- Do not run git, `tsc -b` or `pnpm build`. Other agents share `dist/`.

## Verify before reporting
- `npx tsc -p tsconfig.app.json --noEmit`. Errors in other agents' folders are theirs; yours must be clean.
- `npx vitest run src/topics/<slug> src/topics/stories.test.ts`.
- `npx oxlint src/topics/<slug>`.
- Look at the page:
  - Start `npx vite --port <PORT> --host 127.0.0.1 --strictPort` in the background.
  - Screenshot `/<route>` at 390×844, full page, with a Playwright script. Import `chromium` from `@playwright/test`, with `executablePath` pointing to the `chrome-headless-shell` binary under `~/.cache/ms-playwright/chromium_headless_shell-1234/`.
  - Use unique filenames in `/tmp/simplify/<slug>/`.
  - Step through each story and Read the PNGs. Fix overlap, clipping, tiny text and crowding.
  - Kill your vite server with its PID, not `pkill -f` (that kills your own shell).
- Count your caps: frames, stops, and the longest caption in words.

## Report (short)
Per topic:
- before → after: sections, frames, stops, labs, and the page's word count (`cat src/topics/<slug>/*.tsx | wc -w`);
- what you cut and what you kept;
- the question ids;
- **any stable text or aria labels on the page** (a section h2, a lab button) so e2e smoke tests can target them;
- any shared changes you wished for.
