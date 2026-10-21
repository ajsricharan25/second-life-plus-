import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import type { ResearchResult } from '../src/lib/research-types'

const repair = 'Example Washer 100 total repair including parts and labour in India: ₹1,500–₹3,000.'
const replacement = 'Example Washer 100 new whole-device replacement in India: ₹20,000–₹30,000.'
const text = `Summary\nThe drain path may be obstructed. Check the accessible hose first.\n\nLikely causes\nA kinked external hose or blocked filter can prevent draining.\n\nSafe checks\nCheck the hose from outside without disconnecting wiring.\n\nRepair options and prices\n${repair} [1]\n${replacement} [2]\n\nRepair or replace\nIf these example prices apply, investigate repair first.\n\nWhat would narrow it down\nWhat error code appears?`
const sources = [
  {
    start: text.indexOf('[1]'),
    end: text.indexOf('[1]') + 3,
    url: 'https://example.com/repair-prices',
    title: 'Fixture repair price list',
  },
  {
    start: text.indexOf('[2]'),
    end: text.indexOf('[2]') + 3,
    url: 'https://example.com/new-washer',
    title: 'Fixture replacement listing',
  },
]
const fixture: ResearchResult = {
  status: 'ok',
  text,
  citations: sources,
  checkedAt: '2026-10-21T00:00:00Z',
  provider: 'gemini',
  model: 'test-model',
  photoIncluded: false,
  priceCheck: {
    status: 'checked',
    items: [
      {
        kind: 'total-repair',
        low: 1500,
        high: 3000,
        currency: 'INR',
        modelMatch: 'exact',
        excerpt: repair,
        sourceUrl: sources[0].url,
        sourceTitle: sources[0].title,
      },
      {
        kind: 'replacement',
        low: 20000,
        high: 30000,
        currency: 'INR',
        modelMatch: 'exact',
        excerpt: replacement,
        sourceUrl: sources[1].url,
        sourceTitle: sources[1].title,
      },
    ],
  },
}

test('primary AI action runs once, shows detailed sources and calculator, and downloads the assessment', async ({
  page,
}) => {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, json: fixture })
  })
  await page.goto('/')
  expect(sent).toHaveLength(0)
  await page.getByLabel('Brand and model').fill('Example Washer 100')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toContainText('What error code appears?')
  await expect(page.getByText('Google Gemini + Google Search', { exact: false })).toBeVisible()
  await expect(page.getByLabel('AI-sourced cost calculator')).toContainText('5–15%')
  await expect(page.locator('.repair-cost')).not.toBeVisible()
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ brandModel: 'Example Washer 100', symptoms: 'Not draining' })
  expect(sent[0]).not.toHaveProperty('image')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadEvent
  const report = await readFile((await download.path())!, 'utf8')
  expect(report).toContain('AI REPAIR ASSESSMENT')
  expect(report).toContain('What error code appears?')
  expect(report).toContain(sources[0].url)
  expect(report).toContain('OFFLINE PLANNING ESTIMATE — UNVERIFIED')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Changing scope invalidates both visible and downloadable AI results, without another paid request.
  await page.getByLabel('City or postcode').fill('Chennai')
  await expect(page.locator('.research-answer')).toHaveCount(0)
  expect(sent).toHaveLength(1)
  const staleDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  expect(await readFile((await (await staleDownload).path())!, 'utf8')).not.toContain(
    'AI REPAIR ASSESSMENT',
  )
})

test('photo sharing is opt-in and uses a resized JPEG only after consent', async ({ page }) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    const input = route.request().postDataJSON()
    requests.push(input)
    return route.fulfill({ status: 200, json: { ...fixture, photoIncluded: Boolean(input.image) } })
  })
  await page.goto('/')
  await page.getByLabel('Add a photo').setInputFiles({
    name: 'washer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByRole('img', { name: 'Your appliance reference photo' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Include this photo/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).not.toHaveProperty('image')
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByRole('checkbox', { name: /Include this photo/ }).check()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText(/Google Gemini.*Photo included/)).toBeVisible()
  expect(requests).toHaveLength(2)
  const image = requests[1].image as { mimeType: string; data: string }
  expect(image.mimeType).toBe('image/jpeg')
  expect(Buffer.from(image.data, 'base64').subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]))
  expect(image.data.length).toBeLessThanOrEqual(1398104)
})

test('missing AI configuration leaves usable offline planning and search alternatives', async ({
  page,
}) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText(/Web research isn’t enabled yet/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Search Google' })).toBeVisible()
  await page
    .getByText('Offline planning estimate and material assumptions', { exact: true })
    .click()
  await expect(page.getByText('Unverified repair allowance')).toBeVisible()
})

test('Google Search attribution renders in an isolated frame without executing supplied scripts', async ({
  page,
}) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...fixture,
        searchSuggestionsHtml:
          '<div>Google Search suggestions</div><script>parent.document.body.dataset.injected="yes"</script>',
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  const frame = page.locator('iframe[title="Google Search suggestions"]')
  await expect(frame).toBeVisible()
  await expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
  await expect(
    page
      .frameLocator('iframe[title="Google Search suggestions"]')
      .getByText('Google Search suggestions'),
  ).toBeVisible()
  expect(await page.locator('body').getAttribute('data-injected')).toBeNull()
})

test('returning from resources does not silently repeat a paid AI request', async ({ page }) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.fulfill({ status: 200, json: fixture })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name: 'Repair resources' }).click()
  await page.getByRole('button', { name: 'A little about Second Life' }).click()
  await page.getByRole('button', { name: 'Let’s get started' }).click()
  await expect(page.getByRole('button', { name: 'Research this repair' })).toBeVisible()
  expect(requests).toBe(1)
})
