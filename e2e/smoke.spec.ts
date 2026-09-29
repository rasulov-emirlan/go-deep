import { expect, test } from '@playwright/test'

const topics = ['scheduler', 'maps', 'gc', 'slices', 'interfaces', 'channels', 'sync', 'patterns', 'indexes', 'transactions', 'kafka', 'http', 'scaling', 'profiling']
const pages = [{ path: '/', text: 'Watch' }, ...topics.map((s) => ({ path: '/' + s, text: 'Asked in real interviews' }))]

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
