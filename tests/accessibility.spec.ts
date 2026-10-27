import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { report } from './unified-fixture'

test('form, unified report, AI actions, and resources are accessible on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.route('**/api/research', (route) => route.fulfill({ json: report }))
  await page.goto('/')
  async function checkPage() {
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await checkPage()
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
  await checkPage()
  await page.locator('#ai-question').fill('The hose is clear. What now?')
  await page.getByRole('button', { name: 'Ask a follow-up with AI' }).click()
  await expect(page.getByRole('region', { name: 'Ask a follow-up response' })).toBeVisible()
  await checkPage()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name: 'Repair resources' }).click()
  await checkPage()
})
