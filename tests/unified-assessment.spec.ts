import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { guidance, report, shop } from './unified-fixture'

async function fillDevice(page: Page) {
  await page.goto('/')
  await page.getByLabel('Brand and model').fill('Example Washer 100')
  await page.getByLabel('City or postcode').fill('Chennai 600073')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
}
async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('button', { name, exact: false }).click()
}

test('one API report contains diagnosis, reason, prices, recycling evidence and local Maps listings', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: report })
  })
  await fillDevice(page)
  await expect(page.getByRole('button', { name: 'Explore my options' })).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await analyze(page)
  const answer = page.locator('.research-answer')
  await expect(answer).toContainText('Why it may have occurred')
  await expect(answer).toContainText('₹500, excluding labour')
  await expect(answer).toContainText('Full repair quote needed')
  await expect(answer).toContainText('Copper: 2 kg')
  await expect(page.locator('.published-prices, .planning-details, .repair-cost')).toHaveCount(0)
  await expect(page.getByText('Offline planning estimate and material assumptions')).toHaveCount(0)
  const maps = page.getByRole('link', { name: 'Open shop in Google Maps' })
  const url = new URL((await maps.getAttribute('href'))!)
  expect(url.hostname).toBe('www.google.com')
  expect(url.searchParams.get('query')).toContain(shop.name)
  expect(url.searchParams.get('query')).toContain('Chennai 600073')
  await expect(
    page.getByRole('link', { name: /Search Maps for washing machine drain pump/ }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    task: 'assessment',
    symptoms: 'Not draining',
    location: 'Chennai 600073',
  })
  expect(requests[0]).not.toHaveProperty('image')
  await page.getByText('Sources used in this answer (3)', { exact: true }).click()
  await expect(page.getByRole('list', { name: 'Research sources' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const text = await readFile((await (await download).path())!, 'utf8')
  expect(text).toContain('Device repair passport')
  expect(text).toContain('₹500, excluding labour')
  expect(text).toContain('https://example.com/material')
  expect(text).not.toContain('OFFLINE PLANNING')
})

for (const [task, label, question] of [
  ['follow-up', 'Ask a follow-up', 'The external hose is clear. What does that change?'],
  ['comparison', 'Compare my options', 'I want to keep it for two more years.'],
  [
    'quote-review',
    'Review a repair quote',
    '₹1,800: part ₹900, labour ₹600, inspection ₹300. No warranty stated.',
  ],
  ['repair-brief', 'Prepare my shop brief', 'Please mention the E03 error code.'],
]) {
  test(`${label} calls the API with context and keeps one connected passport`, async ({ page }) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/research', (route) => {
      const input = route.request().postDataJSON()
      requests.push(input)
      return route.fulfill({
        json:
          input.task === 'assessment'
            ? report
            : {
                ...guidance,
                text: `Summary\nAPI follow-up for ${task}: here is the tailored explanation.`,
              },
      })
    })
    await fillDevice(page)
    await analyze(page)
    await page
      .locator('.ai-action-grid')
      .getByRole('button', { name: new RegExp(label) })
      .click()
    await page.locator('#ai-question').fill(question)
    await page.getByRole('button', { name: `${label} with AI`, exact: true }).click()
    const followUp = page.getByRole('region', { name: `${label} response` })
    await expect(followUp).toContainText(`API follow-up for ${task}`)
    await expect(page.locator('.research-answer').first()).toContainText('external drain path')
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({ task, question })
    expect(requests[1].previousAssessment).toContain('external drain path')
    expect(requests[1]).not.toHaveProperty('image')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const text = await readFile((await (await download).path())!, 'utf8')
    expect(text).toContain(question)
    expect(text).toContain(`API follow-up for ${task}`)
  })
}

test('unavailable search leaves honest unknown prices, quantities and shops without preset fallback', async ({
  page,
}) => {
  await page.route('**/api/research', (route) => route.fulfill({ json: guidance }))
  await fillDevice(page)
  await analyze(page)
  await expect(page.getByText('AI GUIDANCE · NO WEB CHECK', { exact: true })).toBeVisible()
  await expect(page.locator('.research-answer')).toContainText('Quote needed')
  await expect(page.locator('.research-answer')).toContainText(
    'Material quantities and scrap value are not established',
  )
  await expect(page.getByRole('link', { name: 'Open shop in Google Maps' })).toHaveCount(0)
  await expect(page.locator('.research-answer')).not.toContainText('₹')
  await expect(page.locator('.planning-details, .repair-cost, .material-list')).toHaveCount(0)
})

for (const code of [
  'not_configured',
  'provider_quota_exceeded',
  'api_key_invalid',
  'model_unavailable',
  'research_timeout',
]) {
  test(`${code} is actionable and never produces an offline assessment`, async ({ page }) => {
    let count = 0
    await page.route('**/api/research', (route) => {
      count++
      return route.fulfill({
        status: code === 'provider_quota_exceeded' ? 429 : 503,
        json: {
          error: {
            code,
            details: {
              provider: 'groq',
              model: 'qwen/qwen3.8-27b',
              upstreamStatus: 429,
              key: 'private-fixture-secret',
            },
          },
        },
      })
    })
    await fillDevice(page)
    await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
    await expect(page.locator('.research-message')).toBeVisible()
    await expect(page.locator('.research-answer, .repair-cost')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
    await page.getByText('Connection details', { exact: true }).click()
    await expect(page.locator('.research-error-details')).toContainText('Groq')
    await expect(page.locator('body')).not.toContainText('private-fixture-secret')
    await page.getByText('Open a direct web search', { exact: true }).click()
    await expect(page.getByRole('link', { name: 'Search Google', exact: true })).toBeVisible()
    expect(count).toBe(1)
  })
}

test('a failed follow-up keeps the original answer and does not retry automatically', async ({
  page,
}) => {
  let count = 0
  await page.route('**/api/research', (route) => {
    count++
    return count === 1
      ? route.fulfill({ json: report })
      : route.fulfill({ status: 429, json: { error: { code: 'provider_quota_exceeded' } } })
  })
  await fillDevice(page)
  await analyze(page)
  await page.locator('#ai-question').fill('The hose is clear')
  await page.getByRole('button', { name: 'Ask a follow-up with AI', exact: true }).click()
  await expect(page.locator('.research-message')).toContainText('quota')
  await expect(page.locator('.research-answer')).toContainText('external drain path')
  expect(count).toBe(2)
})

test('photo consent controls the main request and follow-ups do not resend the photo', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    const input = route.request().postDataJSON()
    requests.push(input)
    return route.fulfill({ json: { ...report, photoIncluded: Boolean(input.image) } })
  })
  await fillDevice(page)
  await page.getByLabel('Add a photo').setInputFiles({
    name: 'washer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByRole('checkbox', { name: /Include this photo/ })).not.toBeChecked()
  await analyze(page)
  expect(requests[0]).not.toHaveProperty('image')
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByRole('checkbox', { name: /Include this photo/ }).check()
  await analyze(page)
  expect(requests[1].image).toMatchObject({ mimeType: 'image/jpeg' })
  await page.locator('#ai-question').fill('What should I tell the shop?')
  await page.getByRole('button', { name: 'Ask a follow-up with AI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Ask a follow-up response' })).toBeVisible()
  expect(requests[2]).not.toHaveProperty('image')
})

test('Other devices use their own identity and never inherit washer prices', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({
      json: {
        ...guidance,
        text: 'Summary\nThe coffee grinder may have an obstruction. The cause is unconfirmed.',
        repairService: 'coffee grinder repair',
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Other devices', exact: true }).click()
  await page.getByLabel('Device type or name').fill('Coffee grinder')
  await page
    .getByLabel('Describe its condition and problem')
    .fill('Motor hums but the grinder does not rotate.')
  await analyze(page)
  expect(sent[0]).toMatchObject({ appliance: 'other', deviceName: 'Coffee grinder' })
  await expect(page.locator('.research-answer')).toContainText('coffee grinder')
  await expect(page.locator('.research-answer')).not.toContainText('₹')
})

test('saved details retain location but never recompute a preset estimate or automatically call AI', async ({
  page,
}) => {
  let count = 0
  await page.route('**/api/research', (route) => {
    count++
    return route.fulfill({ json: report })
  })
  await fillDevice(page)
  await analyze(page)
  await page.getByRole('button', { name: 'Save estimate', exact: true }).click()
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('second-life-estimates-v1')!),
  )
  expect(saved[0]).toMatchObject({ brandModel: 'Example Washer 100', location: 'Chennai 600073' })
  expect(JSON.stringify(saved)).not.toContain('external drain path')
  await page.reload()
  await navigate(page, 'Saved estimates')
  await expect(page.locator('.saved-list')).not.toContainText('₹')
  await page.getByRole('button', { name: 'View estimate' }).click()
  await expect(page.getByRole('button', { name: 'Research this repair' })).toBeVisible()
  expect(count).toBe(1)
  await expect(page.locator('.research-scope')).toContainText('Chennai 600073')
  await navigate(page, 'Saved estimates')
  await page.getByRole('button', { name: 'Delete Washing machine estimate' }).click()
  await expect(page.locator('.saved-card')).toHaveCount(0)
})

test('editing details clears prior results and follow-ups before another API call', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: requests.length === 1 ? report : guidance })
  })
  await fillDevice(page)
  await analyze(page)
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('Brand and model').fill('Different device model')
  await analyze(page)
  await expect(page.locator('.research-answer')).not.toContainText('₹500')
  await expect(page.locator('.ai-conversation')).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1]).not.toHaveProperty('previousAssessment')
})

test('hazard alert is immediate even if the AI provider is unavailable', async ({ page }) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } }),
  )
  await fillDevice(page)
  await page
    .getByLabel('What seems to be the problem?')
    .fill('Smoke and sparks come from the power cable.')
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.safety-message')).toContainText('Stop using')
  await expect(page.locator('.research-answer')).toHaveCount(0)
})

for (const [caseIndex, bad] of [
  { ...report, citations: [{ ...report.citations[0], url: 'javascript:alert(1)' }] },
  { ...guidance, materials: report.materials },
  { ...guidance, shops: report.shops },
  { ...guidance, priceCheck: { status: 'checked', items: report.priceCheck!.items } },
].entries()) {
  test(`invalid evidence fails closed: case ${caseIndex}`, async ({ page }) => {
    await page.route('**/api/research', (route) => route.fulfill({ json: bad }))
    await fillDevice(page)
    await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
    await expect(page.locator('.research-message')).toContainText('couldn’t be verified')
    await expect(page.locator('.research-answer')).toHaveCount(0)
  })
}

test('opening examples and resources never spends API quota or supplies a fake diagnosis', async ({
  page,
}) => {
  let count = 0
  await page.route('**/api/research', (route) => {
    count++
    return route.fulfill({ json: report })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Explore a washing machine example/ }).click()
  await expect(page.getByLabel('What seems to be the problem?')).toHaveValue(/won’t drain/)
  await expect(page.locator('.research-answer')).toHaveCount(0)
  await navigate(page, 'Repair resources')
  await expect(page.getByRole('link', { name: 'Explore iFixit guides' })).toHaveAttribute(
    'href',
    'https://www.ifixit.com/Guide',
  )
  expect(count).toBe(0)
})
