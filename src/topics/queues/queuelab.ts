/**
 * The log-vs-queue lab: two readers, messages sent one at a time.
 * A log gives every reader every message and keeps it (Kafka, one group each).
 * A queue gives each message to one reader, round-robin, and deletes it on ack (SQS).
 */

export type Mode = 'log' | 'queue'

export type LabState = {
  mode: Mode
  sent: number
  stored: number[] // still kept by the broker after the readers are done
  a: number[]
  b: number[]
}

export const MAX = 5

export const initial = (mode: Mode): LabState => ({ mode, sent: 0, stored: [], a: [], b: [] })

export const canSend = (st: LabState) => st.sent < MAX

export function send(st: LabState): LabState {
  if (!canSend(st)) return st
  const n = st.sent + 1
  if (st.mode === 'log') return { ...st, sent: n, stored: [...st.stored, n], a: [...st.a, n], b: [...st.b, n] }
  const toA = n % 2 === 1
  return { ...st, sent: n, a: toA ? [...st.a, n] : st.a, b: toA ? st.b : [...st.b, n] }
}

/** Who received the latest message. */
export function lastReaders(st: LabState): ('A' | 'B')[] {
  const n = st.sent
  if (n === 0) return []
  return (['A', 'B'] as const).filter((r) => (r === 'A' ? st.a : st.b).includes(n))
}
