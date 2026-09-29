import { describe, expect, it } from 'vitest'
import { close, make, recv, send, type ChanState } from './chanSim'

const run = (s: ChanState, ops: ((s: ChanState) => ChanState)[]) => ops.reduce((acc, f) => f(acc), s)

describe('chanSim', () => {
  it('buffered: fills, then parks the sender', () => {
    const s = run(make(2), [send, send, send])
    expect(s.buf).toEqual([1, 2])
    expect(s.sendq).toEqual([{ g: 3, v: 3 }])
    expect(s.kind).toBe('park')
  })

  it('recv from a full buffer moves the parked sender into the tail (FIFO)', () => {
    const s = run(make(2), [send, send, send, recv])
    expect(s.got.at(-1)).toEqual({ g: 4, v: 1, ok: true })
    expect(s.buf).toEqual([2, 3])
    expect(s.sendq).toEqual([])
  })

  it('unbuffered: send parks, recv takes directly from the sender', () => {
    let s = run(make(0), [send])
    expect(s.sendq).toHaveLength(1)
    s = recv(s)
    expect(s.got).toEqual([{ g: 2, v: 1, ok: true }])
    expect(s.buf).toEqual([])
  })

  it('direct send to a parked receiver skips the buffer', () => {
    const s = run(make(3), [recv, send])
    expect(s.buf).toEqual([])
    expect(s.got).toEqual([{ g: 1, v: 1, ok: true }])
  })

  it('closed: drains buffer, then zero values with ok=false', () => {
    const s = run(make(2), [send, send, close, recv, recv, recv])
    expect(s.got.map((g) => [g.v, g.ok])).toEqual([
      [1, true],
      [2, true],
      [0, false],
    ])
    expect(s.kind).toBe('zero')
  })

  it('send on closed and double close panic without changing the channel', () => {
    const c = run(make(1), [close])
    expect(send(c).kind).toBe('panic')
    expect(send(c).buf).toEqual([])
    expect(close(c).kind).toBe('panic')
    expect(close(c).msg).toMatch(/close of closed channel/)
  })

  it('close wakes parked receivers with zero values and panics parked senders', () => {
    const r = run(make(0), [recv, recv, close])
    expect(r.got).toEqual([
      { g: 1, v: 0, ok: false },
      { g: 2, v: 0, ok: false },
    ])
    const w = run(make(0), [send, close])
    expect(w.sendq).toEqual([])
    expect(w.kind).toBe('panic')
  })

  it('nil: send and recv block forever, close panics', () => {
    const s = run(make('nil'), [send, recv])
    expect(s.sendq).toHaveLength(1)
    expect(s.recvq).toHaveLength(1)
    expect(s.got).toEqual([]) // a parked receiver on nil is never paired with a parked sender
    expect(close(s).msg).toMatch(/close of nil channel/)
  })
})
