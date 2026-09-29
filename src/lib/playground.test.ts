import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _reset, bundle, compile, parse, share } from './playground'

beforeEach(_reset)

describe('bundle', () => {
  it('puts the program first and names the other files', () => {
    expect(bundle('package main\n', { 'check.go': 'package main\n' })).toBe('package main\n\n-- check.go --\npackage main\n')
  })
})

describe('parse', () => {
  const out = (m: string) => ({ Errors: '', Events: [{ Message: m, Kind: 'stdout' as const }] })
  it('passes when every case passes', () => {
    const o = parse(out('✓ ints\n✓ empty\nRESULT 2/2\n'), true)
    expect(o.kind).toBe('pass')
  })
  it('lists failing cases with their details', () => {
    const o = parse(out('✓ ints\n✗ empty: got nil, want []\nRESULT 1/2\n'), true)
    expect(o).toMatchObject({ kind: 'fail', passed: 1, total: 2 })
    if (o.kind === 'fail') expect(o.cases[1]).toEqual({ ok: false, name: 'empty', detail: 'got nil, want []' })
  })
  it('shows compile errors without the ./ prefix', () => {
    expect(parse({ Errors: './prog.go:4:2: declared and not used: x\n' }, true)).toEqual({ kind: 'compile', errors: 'prog.go:4:2: declared and not used: x' })
  })
  it('calls it a crash when the verdict line never printed', () => {
    const o = parse({ Events: [{ Message: '✓ a\n', Kind: 'stdout' }, { Message: 'fatal error: all goroutines are asleep - deadlock!\n', Kind: 'stderr' }] }, true)
    expect(o.kind).toBe('crash')
  })
  it('just shows output for free-form runs', () => {
    expect(parse(out('hi\n'), false)).toEqual({ kind: 'output', output: 'hi\n' })
  })
})

describe('compile throttling', () => {
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ Errors: '', Events: [] })))
  it('refuses oversized programs without calling out', async () => {
    const post = ok()
    await expect(compile('x'.repeat(70_000), post as unknown as typeof fetch)).rejects.toThrow(/64 KB/)
    expect(post).not.toHaveBeenCalled()
  })
  it('enforces a cooldown between runs', async () => {
    const post = ok()
    let t = 1_000_000
    await compile('package main', post as unknown as typeof fetch, () => t)
    t += 1000
    await expect(compile('package main', post as unknown as typeof fetch, () => t)).rejects.toThrow(/Wait 2 s/)
    t += 2500
    await compile('package main', post as unknown as typeof fetch, () => t)
    expect(post).toHaveBeenCalledTimes(2)
  })
  it('allows one run at a time', async () => {
    let release!: () => void
    const post = vi.fn(() => new Promise<Response>((r) => (release = () => r(new Response('{}')))))
    const first = compile('a', post as unknown as typeof fetch)
    await expect(compile('b', post as unknown as typeof fetch)).rejects.toThrow(/Already running/)
    release()
    await first
  })
})

describe('share', () => {
  it('returns a go.dev/play link', async () => {
    const post = vi.fn(async () => new Response('Z_1CTqPibWJ'))
    expect(await share('package main', post as unknown as typeof fetch)).toBe('https://go.dev/play/p/Z_1CTqPibWJ')
  })
  it('rejects a strange answer', async () => {
    const post = vi.fn(async () => new Response('<html>oops</html>'))
    await expect(share('package main', post as unknown as typeof fetch)).rejects.toThrow()
  })
})
