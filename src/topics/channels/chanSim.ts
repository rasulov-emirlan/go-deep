/** A deterministic model of one Go channel: buffer ring, sendq, recvq, closed flag. */

export type Cap = 'nil' | 0 | 1 | 2 | 3
export type Kind = 'ok' | 'park' | 'panic' | 'zero' | 'idle'
export type Parked = { g: number; v?: number }
export type Got = { g: number; v: number; ok: boolean }

export type ChanState = {
  cap: Cap
  buf: number[]
  sendq: Parked[]
  recvq: Parked[]
  closed: boolean
  next: number // next value a sender will send
  nextG: number // next goroutine id
  got: Got[] // receives that completed, newest last
  msg: string
  kind: Kind
}

export function make(cap: Cap): ChanState {
  return {
    cap,
    buf: [],
    sendq: [],
    recvq: [],
    closed: false,
    next: 1,
    nextG: 1,
    got: [],
    msg: cap === 'nil' ? 'var ch chan int — no hchan behind it.' : cap === 0 ? 'make(chan int) — unbuffered.' : `make(chan int, ${cap}).`,
    kind: 'idle',
  }
}

export function send(s: ChanState): ChanState {
  const g = s.nextG
  const v = s.next
  const t = { ...s, nextG: g + 1 }
  if (s.cap === 'nil') return { ...t, sendq: [...s.sendq, { g, v }], msg: `G${g} blocks forever: send on a nil channel is never woken.`, kind: 'park' }
  if (s.closed) return { ...t, msg: `G${g} panics: send on closed channel.`, kind: 'panic' }
  const n = { ...t, next: v + 1 }
  if (s.recvq.length) {
    const [r, ...rest] = s.recvq
    return { ...n, recvq: rest, got: [...s.got, { g: r.g, v, ok: true }], msg: `G${g} hands ${v} straight to parked G${r.g}, skipping the buffer.`, kind: 'ok' }
  }
  if (s.buf.length < s.cap) return { ...n, buf: [...s.buf, v], msg: `G${g} puts ${v} in the buffer and moves on.`, kind: 'ok' }
  return {
    ...n,
    sendq: [...s.sendq, { g, v }],
    msg: s.cap === 0 ? `No receiver waiting: G${g} parks in sendq holding ${v}.` : `Buffer full: G${g} parks in sendq holding ${v}.`,
    kind: 'park',
  }
}

export function recv(s: ChanState): ChanState {
  const g = s.nextG
  const t = { ...s, nextG: g + 1 }
  if (s.cap === 'nil') return { ...t, recvq: [...s.recvq, { g }], msg: `G${g} blocks forever: receive on a nil channel is never woken.`, kind: 'park' }
  if (s.buf.length) {
    const [v, ...rest] = s.buf
    if (s.sendq.length) {
      const [w, ...q] = s.sendq
      return { ...t, buf: [...rest, w.v!], sendq: q, got: [...s.got, { g, v, ok: true }], msg: `G${g} takes ${v}; parked G${w.g}’s ${w.v} moves into the buffer tail and G${w.g} wakes.`, kind: 'ok' }
    }
    return { ...t, buf: rest, got: [...s.got, { g, v, ok: true }], msg: `G${g} takes ${v} from the buffer head${s.closed ? ' (closed, still draining)' : ''}.`, kind: 'ok' }
  }
  if (s.sendq.length) {
    const [w, ...q] = s.sendq
    return { ...t, sendq: q, got: [...s.got, { g, v: w.v!, ok: true }], msg: `G${g} copies ${w.v} straight from parked G${w.g} and wakes it.`, kind: 'ok' }
  }
  if (s.closed) return { ...t, got: [...s.got, { g, v: 0, ok: false }], msg: `Closed and empty: G${g} gets 0, false immediately.`, kind: 'zero' }
  return { ...t, recvq: [...s.recvq, { g }], msg: `Nothing to take: G${g} parks in recvq.`, kind: 'park' }
}

export function close(s: ChanState): ChanState {
  if (s.cap === 'nil') return { ...s, msg: 'panic: close of nil channel.', kind: 'panic' }
  if (s.closed) return { ...s, msg: 'panic: close of closed channel.', kind: 'panic' }
  const woke = s.recvq.map((r) => ({ g: r.g, v: 0, ok: false }))
  const parts = ['Closed.']
  if (woke.length) parts.push(`${woke.length} parked receiver${woke.length > 1 ? 's get' : ' gets'} 0, false.`)
  if (s.sendq.length) parts.push(`${s.sendq.length} parked sender${s.sendq.length > 1 ? 's panic' : ' panics'}: send on closed channel.`)
  if (s.buf.length) parts.push(`${s.buf.length} buffered value${s.buf.length > 1 ? 's' : ''} can still be received.`)
  return { ...s, closed: true, recvq: [], sendq: [], got: [...s.got, ...woke], msg: parts.join(' '), kind: s.sendq.length ? 'panic' : 'ok' }
}
