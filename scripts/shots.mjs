// Screenshot every step of every story/flow on a topic page.
//   node scripts/shots.mjs <port> <route> <outDir> [390x844,1280x900]
// e.g. start `npx vite --port 5301 --host 127.0.0.1 --strictPort` first (kill it by PID afterwards).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [, , port, route, out, sizes = '390x844,1280x900'] = process.argv
mkdirSync(out, { recursive: true })
const exe = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const b = await chromium.launch({ executablePath: exe })
for (const size of sizes.split(',')) {
  const [w, h] = size.split('x').map(Number)
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto(`http://127.0.0.1:${port}/${route}`)
  await p.waitForSelector('.story')
  const figs = await p.$$('figure.story')
  for (let s = 0; s < figs.length; s++) {
    const fig = figs[s]
    const n = await fig.$$eval('.story-dots button', (d) => d.length)
    if (!n) continue
    for (let k = 0; k < n; k++) {
      await (await fig.$$('.story-dots button'))[k].click()
      await p.waitForTimeout(900)
      await fig.screenshot({ path: `${out}/${route}-${w}-s${String(s + 1).padStart(2, '0')}-f${String(k + 1).padStart(2, '0')}.png` })
    }
  }
  // overflow check: the page must not scroll sideways
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log(`${size}: ${figs.length} figures, horizontal overflow ${over}px`)
  await p.close()
}
await b.close()
