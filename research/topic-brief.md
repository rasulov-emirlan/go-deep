# Wave-2 topic brief

You are building ONE topic page of **Go Deep** (https://godeep.night.enkiduck.com), a site that teaches senior-Go interview topics with gopher illustrations. Repo root: `/home/agent/workspace/playground/learning/go-senior` (Vite 8 + React 19 + TS, pnpm, vitest). Ten other agents are building other topics in parallel, in the same checkout.

The operator's words: **"as short as possible and as visual as possible."** Readers are preparing for interviews, often on a phone.

## Read first
- `research/illustration-brief.md`: the illustration rules. Stepper first, at most 6 moving parts, one caption sentence per step, speech bubbles, monochrome plus a red accent.
- `src/components/Story.tsx`: `Story`, `Frame`, `Actor`, `Prop`, `Stage`. Frames with `stop` halt autoplay and show a "Why?" or "Edge case" card until OK is pressed.
- `src/topics/gmp/stories.tsx` and `src/topics/gmp/Page.tsx`: a finished example of stories and page layout.
- `src/components/TopicShell.tsx`: `TopicHero`, `NextTopic`.
- `src/bank/TopQuestions.tsx` plus `src/bank/cats/*.json`: the real interview questions.
- `src/components/Code.tsx` (Go highlighting), `Quiz.tsx`, `OrderPuzzle.tsx`. Use them if they help.
- `src/index.css`: house style tokens. Paper `#fafafa`, ink `#0a0a0a`, one red `#e63946`; Space Grotesk, Inter, JetBrains Mono. Sharp borders, mono uppercase kickers.
- `public/gophers/*.webp`: the only sprites. Actor `sprite` is the file name without `.webp`.

## Page shape

Keep it short.

1. `<TopicHero slug=… title=… lead=… toc=… />`. The lead is one sentence.
2. **3–5 sections.** Each has:
   - a short `h2`,
   - at most 2 sentences of intro,
   - one `<Story>` of 4–9 frames.

   Put the subtle, interview-relevant parts (edge cases, "why") into `stop` cards. A stop body is at most about 3 short sentences, and may include a tiny `<Code>`. Captions are one sentence of 20 words or fewer. Bubbles are 4 words or fewer.
3. **At most ONE small interactive lab.** Only include one where fiddling teaches something the stories can't. Put its logic in a pure, deterministic TS module with vitest tests (`src/topics/<slug>/*.test.ts`). It must fit a 390px-wide phone.
4. **"Asked in real interviews" section:** `<TopQuestions from={[catJson…]} ids={[…]} />`, hand-picking 6–8 question ids from `src/bank/cats/<cat>.json` that match what you taught. Import the JSON directly, e.g. `import channels from '../../bank/cats/channels.json'`.
5. `<NextTopic slug="<slug>" />`.

No prose essays, no sources walls, no sandboxes of dashboards. If a sentence doesn't earn its place, cut it. Prefer a picture.

## Files — stay inside your folder
- Only create or edit files in `src/topics/<slug>/`: `Page.tsx` (replace the stub, default export), `stories.tsx` (export each story as a `Frame[]`; `src/topics/stories.test.ts` validates every export: sprites exist, ids unique, 3–14 frames), an optional lab, `<slug>.css` (prefix classes with your slug), and tests.
- Do NOT edit shared files (components, index.css, registry, App, bank, other topics). If you truly need a shared change, work around it locally and mention it in your report.
- Do not run git.

## Accuracy
Target Go 1.26, PostgreSQL 18, Kafka 4.x (KRaft), current HTTP/TLS. When you claim what code prints, run it: Go is at `/usr/local/go/bin/go` (not on PATH), in a scratch dir under `/tmp/wave2/<slug>/`. Interviewers love edge cases, so be precise.

## Verify before reporting
- `npx tsc -p tsconfig.app.json --noEmit`. Don't use `tsc -b` or `pnpm build`: other agents share `dist/` and the build info.
- `npx vitest run src/topics/<slug> src/topics/stories.test.ts`
- `npx oxlint src/topics/<slug>`, with no warnings in your files.
- Look at your page. Start `npx vite --port <PORT> --host 127.0.0.1 --strictPort` in the background, where PORT is in your prompt. Then screenshot `/<slug>` at 1280×900 and 390×844 (full page) with Playwright from a script. Use `executablePath` = the `chrome-headless-shell` binary found under `~/.cache/ms-playwright/chromium_headless_shell-1234/`, and import `chromium` from `@playwright/test`. Step through a story or two. **Look at the PNGs** (Read tool) and fix overlap, overflow, tiny text and empty space. Kill your vite server when done.

## Report
Keep it short:
- the sections and stories, with frame counts and stop counts;
- the lab, if any;
- the question ids used;
- the best card gopher for the home page;
- anything shared you wished you could change;
- any accuracy findings.
