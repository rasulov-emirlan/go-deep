import { describe, expect, it } from 'vitest'
import further from './further.json'
import lessons from '../bank/lessons.json'
import { topics } from './registry'
import type { FurtherItem } from '../components/Further'

const all = further as Record<string, FurtherItem[]>
const slugs = new Set(topics.map((t) => t.slug))

describe('go further links', () => {
  it('belong to real topics and sections', () => {
    for (const [slug, items] of Object.entries(all)) {
      expect(slugs.has(slug), slug).toBe(true)
      for (const lang of ['en', 'ru']) expect(items.filter((f) => f.lang === lang).length, `${slug} ${lang}`).toBeLessThanOrEqual(6)
      for (const f of items) if (f.section) expect(lessons.sections, `${slug}: ${f.url}`).toHaveProperty([`${slug}#${f.section}`])
    }
  })
  it('are well formed', () => {
    for (const [slug, items] of Object.entries(all)) {
      expect(new Set(items.map((f) => f.url)).size, slug).toBe(items.length)
      for (const f of items) {
        const at = `${slug}: ${f.url}`
        expect(f.url, at).toMatch(/^https:\/\/[^\s]+$/)
        if (/youtu/.test(f.url)) expect(f.url, at).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}(&t=\d+s?)?$/)
        expect(['interactive', 'video', 'article', 'paper', 'docs'], at).toContain(f.kind)
        expect(['en', 'ru'], at).toContain(f.lang)
        expect(f.title.trim(), at).not.toBe('')
        expect(f.by.trim(), at).not.toBe('')
        expect(f.note.length, at).toBeGreaterThan(10)
        expect(f.note.length, at).toBeLessThanOrEqual(140)
      }
    }
  })
})
