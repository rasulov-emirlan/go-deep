// Checks every "Go further" link still resolves. Network, so not part of the unit suite:
//   node scripts/check-further.mjs
import { readFileSync } from 'node:fs'

const all = JSON.parse(readFileSync(new URL('../src/topics/further.json', import.meta.url)))
const UA = { 'user-agent': 'Mozilla/5.0 (go-deep link check)' }

async function check(f) {
  if (f.url.startsWith('https://www.youtube.com/')) {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(f.url))
    return r.ok ? '' : `oembed ${r.status}`
  }
  let r = await fetch(f.url, { method: 'HEAD', redirect: 'follow', headers: UA }).catch(() => undefined)
  if (!r?.ok) r = await fetch(f.url, { redirect: 'follow', headers: UA }).catch((e) => ({ ok: false, status: e.message }))
  return r.ok ? '' : `${r.status}`
}

const jobs = Object.entries(all).flatMap(([slug, items]) => items.map((f) => ({ slug, f })))
// sites that block bots answer 403/429; those are reported but don't fail the run
const blocked = (err) => /^(403|429)$/.test(err)
let bad = 0
for (let i = 0; i < jobs.length; i += 8) {
  const res = await Promise.all(jobs.slice(i, i + 8).map(async (j) => ({ ...j, err: await check(j.f).catch((e) => e.message) })))
  for (const { slug, f, err } of res) if (err) blocked(err) ? console.log(`? ${slug}  ${err} (bot-blocked, check by hand)  ${f.url}`) : (bad++, console.log(`✗ ${slug}  ${err}  ${f.url}`))
}
console.log(`${jobs.length - bad}/${jobs.length} links ok (bot-blocked ones count as ok)`)
process.exit(bad ? 1 : 0)
