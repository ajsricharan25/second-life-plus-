import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const claim = 'Example AP100 air purifier full repair including parts and labour in India: ₹1,200.'
const text = `Summary\nYour air purifier starts and then stops. Check the visible intake and record the filter indicator before buying a fan.\n\nLikely causes\nA restricted intake or filter alert could explain the symptoms.\n\nSafe checks\nUse the manual to check the accessible filter indicator. Do not open the motor housing.\n\nRepair options and prices\n${claim} [1]\n\nRepair or replace\nCompare the complete repair with your entered new-device budget.\n\nWhat would narrow it down\nDoes the display show an error code?`
const citation = {
  start: text.indexOf('[1]'),
  end: text.indexOf('[1]') + 3,
  url: 'https://example.com/ap100-repair',
  title: 'Fixture AP100 repair guide',
}
const fixture = {
  status: 'ok',
  text,
  citations: [citation],
  checkedAt: '2026-10-21T00:00:00Z',
  provider: 'openai',
  photoIncluded: true,
  priceCheck: {
    status: 'checked',
    items: [
      {
        kind: 'total-repair',
        low: 1200,
        high: 1200,
        currency: 'INR',
        modelMatch: 'exact',
        excerpt: claim,
        sourceUrl: citation.url,
        sourceTitle: citation.title,
      },
    ],
  },
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name }).click()
}

async function selectOther(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Other devices', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Explore my options' })).toHaveCount(0)
  await expect(page.getByLabel('Replacement budget', { exact: false })).toHaveValue('')
}

test('other devices use photo, condition and regional AI pricing, with a complete downloadable report', async ({
  page,
  context,
}) => {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, json: fixture })
  })
  await selectOther(page)
  await page.getByLabel('Device type or name').fill('Air purifier')
  await page.getByLabel('Brand and model').fill('Example AP100')
  await page
    .getByLabel('Describe its condition and problem')
    .fill('Fan stops after two minutes and the filter light is red. No visible cracks.')
  await page.getByLabel('Replacement budget', { exact: false }).fill('10000')
  await page.getByLabel('City or postcode').fill('Chennai')
  await page.getByLabel('Add a photo').setInputFiles({
    name: 'purifier.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByRole('checkbox', { name: /Include this photo/ }).check()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toContainText(
    'Does the display show an error code?',
  )
  await expect(page.getByRole('heading', { name: 'Air purifier', exact: true })).toBeVisible()
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({
    appliance: 'other',
    deviceName: 'Air purifier',
    brandModel: 'Example AP100',
    location: 'Chennai',
    replacementCost: 10000,
    image: { mimeType: 'image/jpeg' },
  })
  expect(sent[0].service).toBe('air purifier repair diagnosis')
  const calculator = page.getByLabel('AI-sourced cost calculator')
  await expect(calculator).toContainText('Your new-device budget')
  await expect(calculator).toContainText('12–12%')
  await expect(page.locator('.repair-cost')).toHaveCount(0)
  await expect(page.getByText('Unverified repair allowance')).toHaveCount(0)
  await expect(
    page.getByText('Offline planning estimate and material assumptions', { exact: true }),
  ).toHaveCount(0)
  const replacement = new URL(
    (await page.getByRole('link', { name: 'Search replacement prices' }).getAttribute('href'))!,
  )
  expect(replacement.searchParams.get('q')).toContain('Air purifier Example AP100')
  await page.getByText('Ask an AI search companion', { exact: true }).click()
  await expect(page.getByLabel('Repair question to copy')).toHaveValue(/Air purifier/)
  await expect(page.getByRole('link', { name: 'Open Gemini' })).toHaveAttribute(
    'href',
    'https://gemini.google.com/',
  )
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const report = await readFile((await (await downloadEvent).path())!, 'utf8')
  expect(report).toContain('Device: Air purifier')
  expect(report).toContain('AI REPAIR ASSESSMENT')
  expect(report).toContain(citation.url)
  expect(report).not.toContain('Unverified repair allowance:')
  expect(report).not.toContain('Potential material value:')
  await context.route('https://www.google.com/maps/**', (route) =>
    route.fulfill({ status: 200, body: '<title>Map fixture</title>' }),
  )
  const mapEvent = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Find repair shops' }).click()
  const map = await mapEvent
  await map.waitForURL('https://www.google.com/maps/**')
  expect(new URL(map.url()).searchParams.get('query')).toBe(
    'air purifier repair diagnosis in Chennai',
  )
  await map.close()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('custom saved details survive reload and reopen without an automatic AI charge', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, json: { ...fixture, photoIncluded: false } })
  })
  await selectOther(page)
  await page.getByLabel('Device type or name').fill('Air purifier')
  await page.getByLabel('Brand and model').fill('Example AP100')
  await page.getByLabel('Describe its condition and problem').fill('Fan stops after two minutes')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toBeVisible()
  await page.getByRole('button', { name: 'Save estimate', exact: true }).click()
  await page.reload()
  await navigate(page, 'Saved estimates')
  await expect(page.getByRole('heading', { name: 'Air purifier', exact: true })).toBeVisible()
  await expect(page.getByText('AI assessment · Research prices for this device')).toBeVisible()
  await page.getByRole('button', { name: 'View estimate' }).click()
  await expect(page.getByLabel('Service to look for')).toHaveValue('air purifier repair diagnosis')
  await expect(page.getByRole('button', { name: 'Research this repair' })).toBeVisible()
  expect(requests).toHaveLength(1)
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByLabel('Device type or name')).toHaveValue('Air purifier')
  await expect(page.getByLabel('Brand and model')).toHaveValue('Example AP100')
  await page.getByLabel('Device type or name').fill('Coffee machine')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toMatchObject({
    appliance: 'other',
    deviceName: 'Coffee machine',
    service: 'coffee machine repair diagnosis',
  })
  expect(requests[1]).not.toHaveProperty('image')
})

test('custom device identity is required before starting AI', async ({ page }) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.abort()
  })
  await selectOther(page)
  await page.getByLabel('Describe its condition and problem').fill('The device will not turn on')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  expect(
    await page
      .getByLabel('Device type or name')
      .evaluate((element: HTMLInputElement) => element.validity.valid),
  ).toBe(false)
  await page.getByLabel('Device type or name').fill('  ')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('2–80 characters')
  expect(requests).toBe(0)
})

test('other-device hazards and external searches remain available when AI is not configured', async ({
  page,
}) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } }),
  )
  await selectOther(page)
  await page.getByLabel('Device type or name').fill('E-bike charger')
  await page
    .getByLabel('Describe its condition and problem')
    .fill('Smoke and sparks from the connector')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Stop using and charging the device')
  await expect(page.getByText(/Web research isn’t enabled yet/)).toBeVisible()
  await expect(page.getByLabel('Service to look for')).toHaveValue(
    'e-bike charger safety assessment',
  )
  const google = new URL(
    (await page.getByRole('link', { name: 'Search Google' }).getAttribute('href'))!,
  )
  expect(google.searchParams.get('q')).toContain('E-bike charger')
  await expect(page.locator('.repair-cost')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Refresh web research' })).toHaveCount(0)
})
