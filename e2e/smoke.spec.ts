import { expect, test } from '@playwright/test'

const pages = [
  { path: '/', text: 'Watch' },
  { path: '/scheduler', text: 'Watch the scheduler work' },
  { path: '/maps', text: 'Swiss map lab' },
  { path: '/gc', text: 'Paint the reachable town' },
  ...['slices', 'interfaces', 'channels', 'sync', 'patterns', 'indexes', 'transactions', 'kafka', 'http', 'scaling', 'profiling'].map((s) => ({ path: '/' + s, text: 'Asked in real interviews' })),
]

for (const p of pages)
  test(`${p.path} renders without errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(p.path)
    await expect(page.getByText(p.text).first()).toBeVisible()
    expect(errors).toEqual([])
  })

test('guided tour stops to explain, and reproduces the runnext order', async ({ page }) => {
  await page.goto('/scheduler')
  const tour = page.locator('#lab .story')
  let explained = 0
  for (let i = 0; i < 30; i++) {
    const ok = tour.getByRole('button', { name: /^OK/ })
    if (await ok.count()) {
      explained++
      await ok.click()
      continue
    }
    if (await tour.getByText('P0 runs g2 — from runnext').count()) break
    await tour.getByRole('button', { name: 'Step →' }).click()
  }
  await expect(tour.getByText('P0 runs g2 — from runnext')).toBeVisible()
  expect(explained).toBeGreaterThan(2)
})

test('story steps forward with Next', async ({ page }) => {
  await page.goto('/scheduler')
  const story = page.locator('#model .story').first()
  await expect(story.getByText('1/5')).toBeVisible()
  await story.getByRole('button', { name: 'Next →' }).click()
  await expect(story.getByText('2/5')).toBeVisible()
  await expect(story.locator('img').first()).toBeVisible()
})

test('predict-the-output puzzle accepts the verified answer', async ({ page }) => {
  await page.goto('/scheduler')
  const q = page.locator('.quiz').filter({ hasText: 'five goroutines' })
  for (const n of ['4', '0', '1', '2', '3']) await q.getByRole('button', { name: n, exact: true }).click()
  await expect(q.getByText('Correct')).toBeVisible()
})

test('swiss lab grows from small map to a table on the 9th key', async ({ page }) => {
  await page.goto('/maps')
  const box = page.locator('#sandbox details').filter({ hasText: 'Swiss map lab' })
  await box.locator('summary').click()
  const lab = box.locator('.lab')
  await lab.getByRole('button', { name: '+8 keys' }).click()
  await expect(lab.getByText('Small map — a single group')).toBeVisible()
  await lab.getByRole('button', { name: '+1 key' }).click()
  await expect(lab.getByText(/Table T\d/).first()).toBeVisible()
})

test('tri-color sandbox: no barrier loses C, hybrid keeps it', async ({ page }) => {
  await page.goto('/gc')
  await page.locator('#sandbox summary', { hasText: 'Tri-color' }).click()
  const lab = page.locator('#sandbox .lab').first()
  await lab.getByRole('button', { name: 'Run all' }).click()
  await expect(lab.getByText('use-after-free: C')).toBeVisible()
  await lab.getByRole('button', { name: 'Hybrid (Go 1.8+)' }).click()
  await lab.getByRole('button', { name: 'Run all' }).click()
  await expect(lab.getByText('every reachable object survived').first()).toBeVisible()
})

test('gc guided tour stops on each case and ends in use-after-free without a barrier', async ({ page }) => {
  await page.goto('/gc')
  const tour = page.locator('#guided-gc')
  await tour.getByRole('button', { name: /hide it in the heap/ }).click()
  const step = tour.getByRole('button', { name: /^Step/ })
  const ok = tour.getByRole('button', { name: /^OK/ })
  for (let i = 0; i < 40 && !(await tour.getByText('Saved by:').count()); i++) {
    if (await ok.count()) await ok.first().click()
    else await step.click()
  }
  await expect(tour.getByText(/use-after-free/).first()).toBeVisible()
  await expect(tour.getByText('Saved by: Dijkstra, Yuasa, Hybrid (Go 1.8+)')).toBeVisible()
  await tour.getByRole('button', { name: 'Hybrid (Go 1.8+)' }).click()
  for (let i = 0; i < 40 && !(await tour.getByText(/^Safe with|Safe with/).count()); i++) {
    if (await ok.count()) await ok.first().click()
    else await step.click()
  }
  await expect(tour.getByText(/Safe with “Hybrid/)).toBeVisible()
})

test('gc story autoplay halts at a stop until OK', async ({ page }) => {
  await page.goto('/gc')
  const story = page.locator('#story-mark')
  await story.getByRole('button', { name: /Autoplay/ }).click()
  await expect(story.getByRole('button', { name: /OK, next/ })).toBeVisible({ timeout: 6000 })
  await expect(story.getByText(/the first of two short pauses/)).toBeVisible()
})

test('maps guided tour stops on the false positive and explains it', async ({ page }) => {
  await page.goto('/maps')
  const tour = page.locator('#tour .story')
  await tour.getByRole('button', { name: /^2 · insert/ }).click()
  for (let i = 0; i < 40 && !(await tour.getByText('the fingerprint matched, but it’s someone else').count()); i++) {
    const ok = tour.getByRole('button', { name: /^OK, next/ })
    if (await ok.count()) await ok.click()
    else await tour.getByRole('button', { name: /^Step/ }).click()
  }
  await expect(tour.getByText('the fingerprint matched, but it’s someone else')).toBeVisible()
  await expect(tour.locator('.story-chips span.on', { hasText: 'false positive' })).toHaveCount(1)
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
