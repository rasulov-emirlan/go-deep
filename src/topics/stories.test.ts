import { describe, expect, it } from 'vitest'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Frame } from '../components/Story'

const sprites = new Set(Object.keys(import.meta.glob('/public/gophers/*.webp')).map((k) => k.split('/').pop()!.replace('.webp', '')))

// every exported Frame[] in any topic's stories file
const mods = import.meta.glob<Record<string, unknown>>('./*/stories.tsx', { eager: true })
const stories = Object.entries(mods).flatMap(([file, m]) =>
  Object.entries(m)
    .filter(([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 'caption' in v[0] && 'actors' in v[0])
    .map(([name, v]) => [`${file.split('/')[1]}.${name}`, v as Frame[]] as const),
)

const text = (n: Frame['caption']) => renderToStaticMarkup(createElement(Fragment, null, n)).replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, 'x')
const words = (n: Frame['caption']) => text(n).split(/\s+/).filter(Boolean).length

// keep every topic short: the whole page's stories stay small
const perTopic: Record<string, Frame[]> = {}
for (const [name, f] of stories) (perTopic[name.split('.')[0]] ??= []).push(...f)

describe('stories', () => {
  it.each(Object.entries(perTopic))('%s stays short', (_, frames) => {
    expect(frames.length).toBeLessThanOrEqual(22)
    expect(frames.filter((f) => f.stop).length).toBeLessThanOrEqual(6)
  })

  it('found some', () => {
    expect(sprites.size).toBeGreaterThan(20)
    expect(stories.length).toBeGreaterThan(5)
  })
  it.each(stories)('%s is well-formed', (_, frames) => {
    expect(frames.length).toBeGreaterThanOrEqual(4)
    expect(frames.length).toBeLessThanOrEqual(7)
    expect(frames.filter((f) => f.stop).length).toBeLessThanOrEqual(2)
    for (const f of frames) {
      expect(f.caption).toBeTruthy()
      expect(words(f.caption), text(f.caption)).toBeLessThanOrEqual(15)
      const ids = f.actors.map((a) => a.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const a of f.actors) expect(sprites.has(a.sprite), `${a.sprite} sprite`).toBe(true)
      const pids = (f.props ?? []).map((p) => p.id)
      expect(new Set(pids).size).toBe(pids.length)
      if (f.stop) expect(f.stop.title && f.stop.body).toBeTruthy()
    }
  })
})
