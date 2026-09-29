/**
 * Runs Go in the official Go Playground sandbox, straight from the browser
 * (play.golang.org allows cross-origin requests). Nothing runs on our server.
 * Runs are one at a time with a short cooldown, and code size is capped, so a
 * stuck key or a script can't hammer the Playground.
 */
const COMPILE = 'https://play.golang.org/compile'
const SHARE = 'https://play.golang.org/share'
export const MAX_BYTES = 64 * 1024
export const COOLDOWN_MS = 3000

export type Case = { ok: boolean; name: string; detail?: string }
export type Outcome =
  | { kind: 'pass'; cases: Case[]; output: string }
  | { kind: 'fail'; cases: Case[]; output: string; passed: number; total: number }
  | { kind: 'compile'; errors: string }
  | { kind: 'crash'; cases: Case[]; output: string }
  | { kind: 'output'; output: string }

type Event = { Message: string; Kind: 'stdout' | 'stderr' }
export type Response = { Errors?: string; Events?: Event[] | null; Status?: number; VetErrors?: string }

/** Joins files into the Playground's multi-file format; the first is prog.go. */
export function bundle(prog: string, extra: Record<string, string> = {}): string {
  return [prog.trimEnd(), ...Object.entries(extra).map(([name, src]) => `-- ${name} --\n${src.trimEnd()}`)].join('\n\n') + '\n'
}

/** Turns a Playground response into what the UI shows. `checked` = run had the hidden checks. */
export function parse(res: Response, checked: boolean): Outcome {
  if (res.Errors) return { kind: 'compile', errors: tidy(res.Errors) }
  const output = (res.Events ?? []).map((e) => e.Message).join('')
  if (!checked) return { kind: 'output', output }
  const cases: Case[] = []
  let result: [number, number] | undefined
  for (const line of output.split('\n')) {
    const m = /^([✓✗]) ([^:]+?)(?:: (.*))?$/.exec(line)
    if (m) cases.push({ ok: m[1] === '✓', name: m[2], detail: m[3] })
    const r = /^RESULT (\d+)\/(\d+)$/.exec(line)
    if (r) result = [Number(r[1]), Number(r[2])]
  }
  if (!result) return { kind: 'crash', cases, output }
  const [passed, total] = result
  return passed === total && total > 0 ? { kind: 'pass', cases, output } : { kind: 'fail', cases, output, passed, total }
}

/** Playground paths like ./prog.go:3:2 → prog.go:3:2, and drop the harness's lines. */
function tidy(errors: string): string {
  return errors
    .split('\n')
    .map((l) => l.replace(/^\.\//, ''))
    .filter((l) => l.trim() && !l.startsWith('# '))
    .join('\n')
}

let busy = false
let last = 0

export class RunError extends Error {}

/** Sends a program to the Playground. Throws RunError when throttled or too big. */
export async function compile(body: string, post: typeof fetch = fetch, now = Date.now): Promise<Response> {
  if (new Blob([body]).size > MAX_BYTES) throw new RunError('That’s over 64 KB. Trim it down to run it.')
  if (busy) throw new RunError('Already running…')
  const wait = last + COOLDOWN_MS - now()
  if (wait > 0) throw new RunError(`Wait ${Math.ceil(wait / 1000)} s before the next run.`)
  busy = true
  try {
    const form = new URLSearchParams({ version: '2', body, withVet: 'true' })
    const res = await post(COMPILE, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new RunError(res.status === 429 ? 'The Go Playground is busy. Try again in a minute.' : `The Go Playground answered ${res.status}.`)
    return (await res.json()) as Response
  } catch (e) {
    if (e instanceof RunError) throw e
    throw new RunError('Couldn’t reach the Go Playground. Check your connection.')
  } finally {
    busy = false
    last = now()
  }
}

/** Saves code on the Playground and returns its go.dev/play link. */
export async function share(code: string, post: typeof fetch = fetch): Promise<string> {
  if (new Blob([code]).size > MAX_BYTES) throw new RunError('That’s over 64 KB.')
  const res = await post(SHARE, { method: 'POST', body: code, signal: AbortSignal.timeout(15_000) })
  const id = (await res.text()).trim()
  if (!res.ok || !/^[\w-]+$/.test(id)) throw new RunError('Couldn’t share to the Go Playground.')
  return `https://go.dev/play/p/${id}`
}

/** for tests */
export function _reset() {
  busy = false
  last = 0
}
