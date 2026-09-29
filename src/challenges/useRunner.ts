import { useState } from 'react'
import { RunError, compile, parse, type Outcome } from '../lib/playground'

/** Runs code in the Playground and keeps the latest outcome. */
export function useRunner() {
  const [out, setOut] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (body: string, checked: boolean) => {
    setBusy(true)
    setErr('')
    try {
      const o = parse(await compile(body), checked)
      setOut(o)
      return o
    } catch (e) {
      setErr(e instanceof RunError ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }
  return { out, busy, err, run, clear: () => setOut(null) }
}

