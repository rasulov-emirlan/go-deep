import { expect, test } from '@playwright/test'

const topics = ['scheduler', 'maps', 'gc', 'memory-layout', 'slices', 'interfaces', 'defer', 'generics', 'channels', 'sync', 'memory-model', 'patterns', 'indexes', 'transactions', 'mongo-vs-postgres', 'kafka', 'queues', 'http', 'scaling', 'profiling', 'clocks', 'consistency', 'replication', 'consensus', 'locks', 'failure-detection', 'sharding', 'dist-transactions', 'resilience', 'tcp', 'dns-lb', 'tls-quic', 'syscalls', 'virtual-memory', 'os-scheduling', 'os-io', 'containers', 'cpu-caches']
const pages = [{ path: '/', text: 'Watch' }, { path: '/challenges', text: 'Remove duplicates, keep order' }, { path: '/playground', text: 'Open in Go Playground' }, ...topics.map((s) => ({ path: '/' + s, text: 'Asked in real interviews' }))]

for (const p of pages)
  test(`${p.path} renders without errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(p.path)
    await expect(page.getByText(p.text).first()).toBeVisible()
    expect(errors).toEqual([])
  })

test('story steps forward with Next', async ({ page }) => {
  await page.goto('/scheduler')
  const story = page.locator('#model .story').first()
  await expect(story.getByText('1/6')).toBeVisible()
  await story.getByRole('button', { name: 'Next →' }).click()
  await expect(story.getByText('2/6')).toBeVisible()
  await expect(story.locator('img').first()).toBeVisible()
})

test('story autoplay halts at a stop until OK', async ({ page }) => {
  await page.goto('/gc')
  const story = page.locator('#mark .story')
  await story.getByRole('button', { name: /Autoplay/ }).click()
  const ok = story.getByRole('button', { name: /OK, next/ })
  await expect(ok).toBeVisible({ timeout: 12000 })
  await page.waitForTimeout(2000)
  await expect(story.getByText('4/7')).toBeVisible()
  await ok.click()
  await expect(story.getByText('5/7')).toBeVisible()
})

test('append lab: b overwrites a, then moves out', async ({ page }) => {
  await page.goto('/slices')
  const lab = page.locator('.lab', { hasText: 'Append lab' })
  await lab.getByRole('button', { name: /b = append/ }).click()
  await expect(lab.getByText('a changed!')).toBeVisible()
  for (let i = 0; i < 3 && !(await lab.getByText('copied it to a new array').count()); i++) await lab.getByRole('button', { name: /b = append/ }).click()
  await expect(lab.getByText('copied it to a new array')).toBeVisible()
})

test('nil box: a nil pointer in an interface is not nil', async ({ page }) => {
  await page.goto('/interfaces')
  const lab = page.locator('.lab', { hasText: 'Nil box' })
  await lab.getByRole('button', { name: '(*T)(nil)' }).click()
  await expect(lab.getByText('err == nil → false')).toBeVisible()
  await lab.getByRole('button', { name: 'nil', exact: true }).click()
  await expect(lab.getByText('err == nil → true')).toBeVisible()
})

test('crash lab: commit first loses m2', async ({ page }) => {
  await page.goto('/kafka')
  const lab = page.locator('.lab', { hasText: 'Crash the consumer' })
  await lab.getByRole('button', { name: 'Commit first' }).click()
  await expect(lab.getByText('m2 lost')).toBeVisible()
  await lab.getByRole('button', { name: 'Commit after' }).click()
  await lab.getByRole('button', { name: 'No dedup' }).click()
  await expect(lab.getByText('m2 charged twice')).toBeVisible()
})

test('flame lab: tapping the regex bar is the fix', async ({ page }) => {
  await page.goto('/profiling')
  await page.getByRole('group', { name: 'flame graph' }).getByRole('button', { name: 'regexp.MustCompile' }).first().click()
  await expect(page.locator('.profiling-verdict')).toBeVisible()
})

test('question bank drill: reveal, grade, progress persists', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/interview?cat=slices')
  await expect(page.getByRole('heading', { name: /Interview drill/ })).toBeVisible()
  await page.getByRole('button', { name: /Start drill/ }).click()
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible()
  await page.getByRole('button', { name: /Show answer/ }).click()
  await page.getByRole('button', { name: /Knew it/ }).click()
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible()
  await page.keyboard.press('Space')
  await page.keyboard.press('1')
  await page.reload()
  await expect(page.locator('.bank-stat').filter({ hasText: 'learning' }).locator('b')).toHaveText('1')
  await expect(page.locator('.bank-stat').filter({ hasText: 'due now' }).locator('b')).toHaveText('1')
  await page.getByRole('tab', { name: 'Browse' }).click()
  await page.getByPlaceholder(/Search/).fill('append')
  await page.locator('.bq summary').first().click()
  await expect(page.locator('.bq[open] .qans')).toBeVisible()
  expect(errors).toEqual([])
})

test('rating: a dislike asks why and sends it', async ({ page }) => {
  let sent: unknown
  await page.route('**/api/feedback', async (r) => {
    sent = r.request().postDataJSON()
    await r.fulfill({ status: 204 })
  })
  await page.goto('/defer')
  const rate = page.locator('.rate')
  await rate.getByRole('button', { name: /No/ }).click()
  await rate.getByRole('button', { name: 'Too complicated' }).click()
  await expect(rate.getByRole('combobox')).not.toContainText('Watch & read elsewhere')
  await rate.getByRole('combobox').selectOption({ index: 1 })
  await rate.getByRole('textbox').fill('lost me at the named results')
  await rate.getByRole('button', { name: 'Send' }).click()
  await expect(rate.getByText(/Thanks/)).toBeVisible()
  expect(sent).toMatchObject({ topic: 'defer', vote: 'down', reasons: ['too-complicated'], note: 'lost me at the named results' })
  expect((sent as { section: string }).section).toBeTruthy()
  await page.reload()
  await expect(page.locator('.rate').getByText(/Thanks/)).toBeVisible()
})

test('rating: shows an error when the api is down', async ({ page }) => {
  await page.route('**/api/feedback', (r) => r.fulfill({ status: 500 }))
  await page.goto('/queues')
  await page.locator('.rate').getByRole('button', { name: /Yes/ }).click()
  await expect(page.locator('.rate').getByRole('alert')).toContainText('Couldn’t send')
})

test('challenge: runs the checks in the playground and marks it solved', async ({ page }) => {
  let body = ''
  await page.route('https://play.golang.org/compile', async (r) => {
    body = new URLSearchParams(r.request().postData() ?? '').get('body') ?? ''
    await r.fulfill({ json: { Errors: '', Events: [{ Message: '✓ ints\n✗ empty gives empty: got nil, want []\nRESULT 1/2\n', Kind: 'stdout' }] } })
  })
  await page.goto('/challenges/unique-elements')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('button', { name: /Run tests/ }).click()
  await expect(page.getByText('✗ 1 of 2 checks pass')).toBeVisible()
  await expect(page.getByText('got nil, want []')).toBeVisible()
  expect(body).toContain('func Unique')
  expect(body).toContain('-- check.go --')
  expect(body).toContain('-- harness.go --')
  await page.route('https://play.golang.org/compile', (r) => r.fulfill({ json: { Errors: '', Events: [{ Message: '✓ a\n✓ b\nRESULT 2/2\n', Kind: 'stdout' }] } }))
  await page.waitForTimeout(3100)
  await page.getByRole('button', { name: /Run tests/ }).click()
  await expect(page.getByText('✓ All 2 checks pass')).toBeVisible()
  await page.goto('/challenges')
  await expect(page.getByText(/1 of \d+ solved/)).toBeVisible()
})

test('challenge: compile errors are shown', async ({ page }) => {
  await page.route('https://play.golang.org/compile', (r) => r.fulfill({ json: { Errors: './prog.go:4:2: declared and not used: x\n', Events: null } }))
  await page.goto('/challenges/unique-elements')
  await page.getByRole('button', { name: /Run tests/ }).click()
  await expect(page.getByText('Doesn’t compile')).toBeVisible()
  await expect(page.getByText('prog.go:4:2: declared and not used: x')).toBeVisible()
})

test('challenge: long code lines scroll inside the editor on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/challenges/batch-pipe')
  await expect(page.locator('.cm-content')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('question links to the section that animates it, scrolled into view', async ({ page, context }) => {
  await page.goto('/interview?mode=browse')
  await page.getByPlaceholder(/Search/).fill('under the hood, and what happens when')
  await page.locator('.bq summary').first().click()
  const link = page.locator('.bq[open] .qlesson a').first()
  await expect(link).toHaveText(/Slices & strings · append: in place or a new array/)
  const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
  await expect(tab).toHaveURL(/\/slices#append$/)
  await expect(tab.locator('#append')).toBeInViewport()
})

test('flow diagram steps forward and draws arrows', async ({ page }) => {
  await page.goto('/tcp')
  const flow = page.locator('figure.flow').first()
  await expect(flow.getByText('1/')).toBeVisible()
  await flow.getByRole('button', { name: 'Next →' }).click()
  await expect(flow.getByText('2/')).toBeVisible()
  await expect(flow.locator('svg')).toBeVisible()
})

test('go further: outside links open in a new tab, section tags jump back up', async ({ page }) => {
  await page.goto('/consensus')
  const box = page.locator('.further')
  await expect(box.getByRole('heading', { name: 'Watch & read elsewhere' })).toBeVisible()
  await expect(box.getByRole('heading', { name: 'На русском' })).toBeVisible()
  const out = box.locator('a.further-title').first()
  await expect(out).toHaveAttribute('target', '_blank')
  await expect(out).toHaveAttribute('href', /^https:\/\//)
  await box.locator('.further-meta a').first().click()
  await expect(page).toHaveURL(/\/consensus#\w+/)
})
