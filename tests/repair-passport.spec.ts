import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { coach, coachedReport, guidance, report } from './unified-fixture'

async function start(page: Page) {
  await page.goto('/')
  await page.getByLabel('Brand and model').fill('Example Washer 100')
  await page.getByLabel('City or postcode').fill('Chennai 600073')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
}
async function navigate(page: Page, name: string) {
  await page.locator('.app-shell').waitFor({ state: 'visible' })
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name }).click()
}

test('batches AI observation questions, saves the answer, and prints the dated evidence without extra calls', async ({
  page,
}, testInfo) => {
  const requests: Record<string, unknown>[] = []
  const updated = {
    nextStep: {
      title: 'Take the reported code to a repairer',
      reason: 'The new observations narrow the possibilities, but an inspection is still needed.',
    },
    questions: [],
  }
  await page.route('**/api/research', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({
      json:
        requests.length === 1
          ? coachedReport
          : {
              ...guidance,
              coach: updated,
              text: `Next step\n${updated.nextStep.title}. ${updated.nextStep.reason}\n\n${guidance.text}`,
            },
    })
  })
  await start(page)
  await page
    .locator('.repair-coach')
    .screenshot({ path: testInfo.outputPath('next-step-card.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const button = page.getByRole('button', { name: 'Refine with my observations' })
  await expect(button).toBeDisabled()
  await page.getByLabel(coach.questions[0].question, { exact: true }).fill('I saw E1 last night.')
  await page.getByLabel(coach.questions[1].question, { exact: true }).fill('Yes, water remained.')
  expect(requests).toHaveLength(1)
  await button.click()
  await expect(page.locator('.repair-coach')).toContainText(updated.nextStep.title)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toMatchObject({ task: 'follow-up' })
  expect(requests[1]).not.toHaveProperty('image')
  expect(requests[1].question).toContain('I saw E1 last night.')
  expect(requests[1].question).toContain('Yes, water remained.')
  expect(requests[1].question).not.toContain(coach.questions[2].question)
  expect(String(requests[1].previousAssessment)).toContain(coach.nextStep.title)
  await page.getByRole('button', { name: 'Save report', exact: true }).click()
  await page.reload()
  await navigate(page, 'Saved estimates')
  await page.getByRole('button', { name: 'View report' }).click()
  await expect(page.locator('.repair-coach')).toContainText(updated.nextStep.title)
  await expect(page.locator('.ai-conversation')).toContainText('I saw E1 last night.')
  await expect(page.getByText(/Reopened report · No new API request/)).toBeVisible()
  await page.getByRole('button', { name: 'Update saved report' }).click()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('second-life-estimates-v1')!).length),
  ).toBe(1)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.evaluate(() => {
    window.print = () => window.dispatchEvent(new Event('beforeprint'))
  })
  await page.getByRole('button', { name: 'Print passport' }).click()
  await page.emulateMedia({ media: 'print' })
  const passport = page.getByRole('article', { name: 'Printable repair passport' })
  await expect(passport).toBeVisible()
  await expect(passport).toContainText('I saw E1 last night.')
  await expect(passport).toContainText('Generated:')
  await expect(
    passport.getByRole('table', { name: 'Repair cost estimates', exact: true }).first(),
  ).toContainText('₹750–₹1,250')
  await expect(
    passport.getByRole('table', { name: 'Recycling value estimates', exact: true }).first(),
  ).toContainText('₹900–₹1,900')
  await expect(passport).toContainText('https://example.com/part')
  await expect(page.getByRole('button', { name: 'Refresh assessment' })).toBeHidden()
  if (testInfo.project.name === 'desktop-chromium')
    await page.pdf({
      path: testInfo.outputPath('repair-passport.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    })
  expect(requests).toHaveLength(2)
})

test('navigation keeps the unsaved report; explicit refresh replaces its guidance', async ({
  page,
}) => {
  let count = 0
  await page.route('**/api/research', (route) =>
    route.fulfill({ json: ++count === 1 ? coachedReport : guidance }),
  )
  await start(page)
  await navigate(page, 'Repair resources')
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Secondlife. home' }).click()
  await expect(page.locator('.repair-coach')).toContainText(coach.nextStep.title)
  expect(count).toBe(1)
  await page.getByRole('button', { name: 'Refresh assessment' }).click()
  await expect(page.locator('.repair-coach')).toHaveCount(0)
  await expect(page.locator('.research-answer')).toContainText('An obstruction is possible')
  expect(count).toBe(2)
})

test('old detail-only records open without an automatic AI request', async ({ page }) => {
  let count = 0
  await page.route('**/api/research', (route) => {
    count++
    return route.fulfill({ json: report })
  })
  await page.goto('/')
  await page.evaluate(() =>
    localStorage.setItem(
      'second-life-estimates-v1',
      JSON.stringify([
        {
          id: 'legacy',
          createdAt: '2026-10-27T10:00:00Z',
          input: {
            appliance: 'washing-machine',
            age: 4,
            currency: 'INR',
            symptoms: 'Not draining',
          },
        },
      ]),
    ),
  )
  await page.reload()
  await navigate(page, 'Saved estimates')
  await page.getByRole('button', { name: 'View estimate' }).click()
  await expect(page.getByRole('button', { name: 'Research this repair' })).toBeVisible()
  expect(count).toBe(0)
})
