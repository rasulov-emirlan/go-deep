import { expect, test } from '@playwright/test'

const pages = [
  { path: '/', text: 'Watch' },
  { path: '/scheduler', text: 'The scheduler lab' },
  { path: '/maps', text: 'Swiss map lab' },
  { path: '/gc', text: 'Why Go needs the hybrid barrier' },
]

for (const p of pages)
  test(`${p.path} renders without errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(p.path)
    await expect(page.getByText(p.text).first()).toBeVisible()
    expect(errors).toEqual([])
  })

test('scheduler lab steps and reproduces the runnext order', async ({ page }) => {
  await page.goto('/scheduler')
  const lab = page.locator('#runnext .lab')
  for (let i = 0; i < 8; i++) await lab.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(lab.locator('.log')).toContainText('P0 runs g4 — from runnext')
})

test('predict-the-output puzzle accepts the verified answer', async ({ page }) => {
  await page.goto('/scheduler')
  const q = page.locator('.quiz').filter({ hasText: 'five goroutines' })
  for (const n of ['4', '0', '1', '2', '3']) await q.getByRole('button', { name: n, exact: true }).click()
  await expect(q.getByText('Correct')).toBeVisible()
})

test('swiss lab grows from small map to a table on the 9th key', async ({ page }) => {
  await page.goto('/maps')
  const lab = page.locator('#lab .lab')
  await lab.getByRole('button', { name: '+8 keys' }).click()
  await expect(lab.getByText('Small map — a single group')).toBeVisible()
  await lab.getByRole('button', { name: '+1 key' }).click()
  await expect(lab.getByText(/Table T\d/).first()).toBeVisible()
})

test('tri-color lab: no barrier loses C, hybrid keeps it', async ({ page }) => {
  await page.goto('/gc')
  const lab = page.locator('#barrier .lab')
  await lab.getByRole('button', { name: 'Run all' }).click()
  await expect(lab.getByText('use-after-free: C')).toBeVisible()
  await lab.getByRole('button', { name: 'Hybrid (Go 1.8+)' }).click()
  await lab.getByRole('button', { name: 'Run all' }).click()
  await expect(lab.getByText('every reachable object survived').first()).toBeVisible()
})
