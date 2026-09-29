import { describe, expect, it } from 'vitest'
import { allQuestions } from './data'
import lessons from './lessons.json'

const links = lessons.links as Record<string, string[]>
const ids = new Set(allQuestions.map((q) => q.id))

describe('question → lesson links', () => {
  it('section list matches the topic pages (run scripts/lessons.py after renaming a section)', () => {
    const registry = import.meta.glob<string>('../topics/registry.ts', { eager: true, query: '?raw', import: 'default' })['../topics/registry.ts']
    const pages = import.meta.glob<string>('../topics/*/Page.tsx', { eager: true, query: '?raw', import: 'default' })
    const fresh: Record<string, string[]> = {}
    for (const [, slug, title, folder] of registry.matchAll(/slug: '([^']+)'[\s\S]*?title: '([^']+)'[\s\S]*?import\('\.\/([^/]+)\/Page'\)/g))
      for (const [, id, t] of pages[`../topics/${folder}/Page.tsx`].matchAll(/<Section id="([^"]+)" n="\d+" kicker="[^"]*" title="([^"]*)"/g))
        if (t !== 'Asked in real interviews') fresh[`${slug}#${id}`] = [title, t]
    expect(fresh).toEqual(lessons.sections)
  })
  it('links point at real questions and real sections', () => {
    for (const [id, anchors] of Object.entries(links)) {
      expect(ids.has(id), id).toBe(true)
      expect(anchors.length).toBeGreaterThan(0)
      expect(anchors.length).toBeLessThanOrEqual(2)
      for (const a of anchors) expect(lessons.sections, `${id} -> ${a}`).toHaveProperty([a])
    }
  })
})
