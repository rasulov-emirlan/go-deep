# Challenge brief

Go Deep (https://godeep.night.enkiduck.com) is getting LeetCode-style coding challenges built from its real interview question bank. Readers write Go in the browser. The code runs in the official Go Playground sandbox: the browser sends `starter or user code + check.go + harness.go` there and reads stdout. Nothing runs on our server.

The repo is `/home/agent/workspace/playground/learning/go-senior`. Another agent is writing other challenges at the same time, and I'm building the UI.

## Format: one folder per challenge, `challenges/<id>/`
Copy `challenges/unique-elements/`, which is a complete example.

- `meta.json`: `{ "title", "bank", "cat", "level", "prompt", "hint" }`
  - `bank`: the question id from `src/bank/cats/*.json`.
  - `cat`: that question's category.
  - `level`: 1 for easy, 2 for medium, 3 for hard.
  - `prompt`: markdown. Use short paragraphs, `code`, and "- " lists. At most about 60 words, plus one example. Say the exact function signature to write. Plain words, and no story padding.
  - `hint`: one sentence.
- `starter.go`: `package main`, the exact signature(s) and any types the reader needs, and a zero-value body with `// your code here`. It must compile, and it must NOT pass the checks.
- `solution.go`: a clean, idiomatic reference solution for Go 1.26, the kind a senior engineer would write in an interview. It's shown on request, so keep it short and readable.
- `check.go`: `package main` with `func main()`. It calls `check(name, func() (got, want any))` and `ok(name, func() (bool, string))` from `challenges/_harness/harness.go`, then `done()`.
  - Write 3–6 cases with short, readable names ("empty input", "k = 1", "keeps order").
  - Cover the edge cases interviewers poke at.
  - Never put `func main` or the harness helpers anywhere else.

## Picking challenges
Only pick questions that can be checked automatically: a function or type with observable behaviour. Skip code-review, design, "what prints" and SQL questions. Mark skipped questions in your report with a one-line reason.

## Concurrency challenges
These are run with `-race` locally. In the Playground:
- time is fake, so `time.Sleep` returns instantly and deterministically;
- there's no network, so give the reader a fake `fetch func(url string) (int, error)` or similar in starter.go instead of `net/http`;
- runs are limited to a few seconds.

The checks must verify the real concurrency property:
- the max concurrency is ≤ k (track it with an atomic counter inside a fake worker);
- results come back in input order;
- cancellation stops the work (count calls after cancel);
- no goroutine leak (compare `runtime.NumGoroutine()` before and after, allowing a short settle).

Checks must be deterministic. Run them 20× to prove it (see Verify).

## Go usage
Go 1.26 is at `/usr/local/go/bin/go` and is not on PATH. Standard library only, since that's all the Playground has. Generics, `slices`, `maps`, `iter`, `sync.WaitGroup.Go` (1.25+), `errgroup`: NO, it isn't stdlib.

## Verify
- `GO=/usr/local/go/bin/go sh verify/challenges.sh` must show ✓ for every one of your challenges. It checks four things:
  - the solution passes all checks under `-race`;
  - the starter compiles;
  - the starter fails;
  - vet is clean.
- For concurrency challenges, also run the solution 20 times in a loop and confirm it passes every time.
- Don't edit `_harness/`, `verify/`, or `src/`. Don't run git.

## Report (short)
- a table: id, bank id, level, cases;
- skipped bank ids with the reason;
- anything in the harness that got in your way.
