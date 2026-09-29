// Steps through every frame of every story at phone and desktop width and reports
// text that is clipped, overflows its box, overlaps other text, or is too small.
// usage: node scripts/layout-check.mjs http://127.0.0.1:5173 [slug ...]
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const all = [...readFileSync(new URL('../src/topics/registry.ts', import.meta.url), 'utf8').matchAll(/slug: '([^']+)'/g)].map((m) => m[1])
const slugs = process.argv.length > 3 ? process.argv.slice(3) : all
const sizes = [
  { name: 'phone', width: 390, height: 844, minFont: 9 },
  { name: 'desktop', width: 1280, height: 900, minFont: 11 },
]

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
let problems = 0
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  for (const slug of slugs) {
    await page.goto(`${base}/${slug}`)
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' })
    await page.waitForSelector('.story, .lab, h2', { timeout: 10000 }).catch(() => {})
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    const out = []
    if (wide > 1) out.push(`page scrolls sideways by ${wide}px`)
    const stories = await page.locator('.story').count()
    for (let s = 0; s < stories; s++) {
      const story = page.locator('.story').nth(s)
      const title = (await story.locator('.story-head .kicker').innerText()).trim()
      const dots = await story.locator('.story-dots button').count()
      for (let f = 0; f < dots; f++) {
        await story.locator('.story-dots button').nth(f).click()
        const issues = await story.evaluate((el, minFont) => {
          if (el.classList.contains('flow')) {
            // <Flow> SVG diagrams: rendered font size, text leaving the drawing, text on text
            const svg = el.querySelector('.fl-stage svg')
            const box = svg.getBoundingClientRect()
            const scale = box.width / svg.viewBox.baseVal.width
            const shown = (t) => t.textContent.trim() && [...el.querySelectorAll('.fl-el')].every((g) => !g.contains(t) || getComputedStyle(g).opacity !== '0')
            const texts = [...svg.querySelectorAll('text')].filter(shown)
            const name = (t) => `"${t.textContent.trim().slice(0, 18)}"`
            const rects = texts.map((t) => t.getBoundingClientRect())
            const res = []
            texts.forEach((t, i) => {
              const r = rects[i]
              const fs = parseFloat(t.getAttribute('font-size')) * scale
              if (fs < minFont) res.push(`${name(t)} font ${fs.toFixed(1)}px`)
              if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) res.push(`${name(t)} leaves the diagram`)
            })
            for (let i = 0; i < rects.length; i++)
              for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i]
                const b = rects[j]
                const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
                const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
                const same = texts[i].closest('.fl-el') === texts[j].closest('.fl-el')
                if (ox > 3 && oy > 3 && !same) res.push(`${name(texts[i])} overlaps ${name(texts[j])}`)
              }
            return res
          }
          const st = el.querySelector('.stage').getBoundingClientRect()
          const head = el.querySelector('.story-head').getBoundingClientRect()
          const cap = el.querySelector('.story-cap').getBoundingClientRect()
          const stage = { left: st.left, right: st.right, top: head.bottom, bottom: cap.top }
          const res = []
          const texts = [...el.querySelectorAll('.stage .st-ptext, .stage .st-plabel, .stage .st-bubble, .stage .st-tag')].filter((t) => {
            const box = t.closest('.st-prop, .st-actor')
            return t.textContent.trim() && !t.querySelector('svg') && getComputedStyle(box).opacity !== '0'
          })
          const name = (t) => `${t.className.split(' ')[0].replace('st-', '')} "${t.textContent.trim().slice(0, 18)}"`
          const rects = texts.map((t) => {
            // measure the text itself, not the flex box it sits in
            const r = document.createRange()
            r.selectNodeContents(t)
            const tr = r.getBoundingClientRect()
            return t.classList.contains('st-ptext') ? tr : t.getBoundingClientRect()
          })
          texts.forEach((t, i) => {
            const r = rects[i]
            const fs = parseFloat(getComputedStyle(t).fontSize)
            if (fs < minFont) res.push(`${name(t)} font ${fs}px`)
            if (r.left < stage.left - 1 || r.right > stage.right + 1 || r.top < stage.top - 1 || r.bottom > stage.bottom + 1) res.push(`${name(t)} clipped by the stage`)
            if (t.classList.contains('st-ptext')) {
              const box = t.parentElement.getBoundingClientRect()
              if (r.width > box.width + 2 || r.height > box.height + 2) res.push(`${name(t)} overflows its box`)
            }
          })
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i]
              const b = rects[j]
              const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
              const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
              if (ox > 3 && oy > 3) res.push(`${name(texts[i])} overlaps ${name(texts[j])}`)
            }
          return res
        }, size.minFont)
        for (const m of issues) out.push(`${title} ${f + 1}/${dots}: ${m}`)
      }
    }
    if (out.length) {
      problems += out.length
      console.log(`\n${size.name} /${slug}`)
      for (const m of [...new Set(out)]) console.log('  ' + m)
    }
  }
  await page.close()
}
await browser.close()
console.log(`\n${problems} problems`)
process.exit(problems ? 1 : 0)
