import { describe, expect, it } from 'vitest'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { problems, resolve, type FlowDef } from '../components/flow'

const sprites = new Set(Object.keys(import.meta.glob('/public/gophers/*.webp')).map((k) => k.split('/').pop()!.replace('.webp', '')))

// every exported FlowDef in any topic's flows file
const mods = import.meta.glob<Record<string, unknown>>('./*/flows.tsx', { eager: true })
const flows = Object.entries(mods).flatMap(([file, m]) =>
  Object.entries(m)
    .filter(([, v]) => typeof v === 'object' && v !== null && 'steps' in v && 'h' in v)
    .map(([name, v]) => [`${file.split('/')[1]}.${name}`, v as FlowDef] as const),
)

const text = (n: unknown) =>
  renderToStaticMarkup(createElement(Fragment, null, n as never))
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, 'x')
const words = (n: unknown) => text(n).split(/\s+/).filter(Boolean).length

const perTopic: Record<string, FlowDef[]> = {}
for (const [name, d] of flows) (perTopic[name.split('.')[0]] ??= []).push(d)

describe('flows', () => {
  it('is wired to the glob', () => {
    expect(Array.isArray(flows)).toBe(true)
  })

  it.each(Object.entries(perTopic))('%s stays a manageable length', (_, defs) => {
    const steps = defs.flatMap((d) => d.steps)
    expect(steps.length).toBeLessThanOrEqual(50)
    expect(steps.filter((s) => s.stop).length).toBeLessThanOrEqual(12)
  })

  it.each(flows)('%s is well-formed', (_, def) => {
    expect(def.steps.length).toBeGreaterThanOrEqual(4)
    expect(def.steps.length).toBeLessThanOrEqual(10)
    expect(def.steps.filter((s) => s.stop).length).toBeLessThanOrEqual(3)
    const frames = resolve(def)
    frames.forEach((f, i) => {
      expect(f.caption, `step ${i + 1} caption`).toBeTruthy()
      expect(words(f.caption), text(f.caption)).toBeLessThanOrEqual(30)
      if (f.stop) expect(f.stop.title && f.stop.body).toBeTruthy()
      for (const s of f.els) if (s.el.t === 'gopher') expect(sprites.has(s.el.sprite), `${s.el.sprite} sprite`).toBe(true)
      expect(problems(f, def.h), `step ${i + 1}`).toEqual([])
    })
  })
})
