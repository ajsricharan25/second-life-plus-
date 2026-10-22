import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const sourceText = 'Published guidance recommends checking the accessible drain hose. [source]'
const researchFixture = {
  status: 'ok',
  text: sourceText,
  citations: [
    {
      start: sourceText.indexOf('[source]'),
      end: sourceText.length,
      url: 'https://www.example.com/repair-guide',
      title: 'Test fixture: drain troubleshooting',
    },
  ],
  checkedAt: '2026-10-20T10:00:00.000Z',
}

async function openEstimate(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Explore a washing machine example/ }).click()
  await expect(page.getByLabel('Service to look for')).toHaveValue(
    'washing machine drain pump repair',
  )
}

for (const failure of [
  { code: 'api_key_invalid', status: 502, message: /The AI provider rejected the API key/ },
  {
    code: 'provider_quota_exceeded',
    status: 429,
    message: /The AI provider’s quota or rate limit/,
  },
  { code: 'model_unavailable', status: 502, message: /The configured AI model is unavailable/ },
  {
    code: 'unverified_sources',
    status: 502,
    message: /The AI replied without usable search citations/,
  },
]) {
  test(`research explains ${failure.code} and keeps direct search available`, async ({ page }) => {
    let requests = 0
    await page.route('**/api/research', (route) => {
      requests++
      return route.fulfill({
        status: failure.status,
        json: { error: { code: failure.code, message: 'Raw provider details must not display' } },
      })
    })
    await openEstimate(page)
    await page.getByRole('button', { name: 'Research this repair' }).click()
    await expect(page.getByText(failure.message)).toBeVisible()
    await expect(page.getByText('Raw provider details must not display')).toHaveCount(0)
    await expect(page.getByText('WEB-SOURCED INFORMATION')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Source-backed price check' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Search Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Research this repair' })).toBeEnabled()
    expect(requests).toBe(1)
  })
}

test('non-JSON gateway timeout explains the failure without showing the gateway body', async ({
  page,
}) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 504,
      contentType: 'text/html',
      body: '<html>Private gateway diagnostics</html>',
    }),
  )
  await openEstimate(page)
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await expect(page.getByText(/The AI research timed out/)).toBeVisible()
  await expect(page.getByText('Private gateway diagnostics')).toHaveCount(0)
})

test('quota connection details show the requested model, hide private fields, and clear after editing', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.fulfill({
      status: 429,
      json: {
        error: {
          code: 'provider_quota_exceeded',
          message: 'private provider message',
          details: {
            provider: 'gemini',
            model: 'gemini-3.1-flash-lite',
            upstreamStatus: 429,
            limits: [{ resource: 'search', period: 'day', allowance: 0 }],
            retryAfterSeconds: 30,
            rawError: 'private provider message',
          },
        },
      },
    })
  })
  await openEstimate(page)
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await page.getByText('Connection details', { exact: true }).click()
  await expect(page.getByText('Model requested: gemini-3.1-flash-lite.')).toBeVisible()
  await expect(
    page.getByText('Reported limit: web search / grounding per day; allowance 0.'),
  ).toBeVisible()
  await expect(
    page.getByText(/Waiting alone may not make this model or feature available/),
  ).toBeVisible()
  await expect(page.getByText('private provider message')).toHaveCount(0)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await page.getByLabel('City or postcode').fill('Chennai')
  await expect(page.getByText('Connection details', { exact: true })).toHaveCount(0)
  expect(requests).toBe(1)
})

test('research and alternatives work without a location and offer a fallback without an API key', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } })
  })
  await openEstimate(page)
  await expect(page.getByRole('link', { name: 'Search Google' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Search Bing' })).toBeVisible()
  expect(requests).toBe(0)
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await expect(page.getByText(/Web research isn’t enabled yet/)).toBeVisible()
  expect(requests).toBe(1)
  await page.getByLabel('City or postcode').fill('Bengaluru 560001')
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await expect(page.getByText(/Web research isn’t enabled yet/)).toBeVisible()
  expect(requests).toBe(2)
  const link = page.getByRole('link', { name: 'Search Google' })
  const url = new URL((await link.getAttribute('href'))!)
  expect(url.searchParams.get('q')).toContain('The washing machine won’t drain.')
  expect(url.searchParams.get('q')).toContain('Bengaluru 560001')
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Find repair shops' })).toBeEnabled()
})

test('shows a sourced ₹500 part price separately from the unverified full-repair allowance', async ({
  page,
}) => {
  const excerpt = 'Example Washer 100 spare part: ₹500, parts-only, excluding labour.'
  const text = `${excerpt} [source]`
  const source = researchFixture.citations[0]
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...researchFixture,
        text,
        citations: [{ ...source, start: text.indexOf('[source]'), end: text.length }],
        priceCheck: {
          status: 'checked',
          items: [
            {
              kind: 'part',
              low: 500,
              high: 500,
              currency: 'INR',
              modelMatch: 'exact',
              excerpt,
              sourceUrl: source.url,
              sourceTitle: source.title,
            },
          ],
        },
      },
    }),
  )
  await openEstimate(page)
  await page.getByRole('button', { name: 'Research this repair' }).click()
  const check = page.getByRole('region', { name: 'Source-backed price check' })
  await expect(check.getByText('₹500', { exact: true })).toBeVisible()
  await expect(check.getByText('Component / spare part only')).toBeVisible()
  await expect(check.getByText(/Full repair quote needed/)).toBeVisible()
  await check.getByText('See the price evidence').click()
  await expect(check.getByRole('link')).toHaveAttribute('href', source.url)
  await expect(page.getByText('Unverified repair allowance')).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
})

test('AI companion question can be copied manually without invoking the API', async ({ page }) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.abort()
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Clipboard disabled')
        },
      },
    })
  })
  await openEstimate(page)
  await page.getByText('Ask an AI search companion', { exact: true }).click()
  await page.getByRole('button', { name: 'Copy repair question' }).click()
  await expect(page.getByText(/Select and copy the question below/)).toBeVisible()
  await expect(page.getByLabel('Repair question to copy')).toHaveValue(
    /The washing machine won’t drain/,
  )
  await expect(page.getByRole('link', { name: 'Open ChatGPT' })).toHaveAttribute(
    'href',
    'https://chatgpt.com/',
  )
  await expect(page.getByRole('link', { name: 'Open Perplexity' })).toHaveAttribute(
    'href',
    'https://www.perplexity.ai/',
  )
  expect(requests).toBe(0)
})

test('changing washer symptoms changes repair costs while the whole-device budget remains independent', async ({
  page,
}) => {
  await openEstimate(page)
  await expect(page.locator('.repair-cost')).toContainText('₹1,200')
  await expect(page.locator('.replacement-line')).toContainText('₹28,000')
  await expect(page.getByRole('region', { name: 'What to do now' })).toContainText(
    'Check the external drain hose',
  )
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('What seems to be the problem?').fill('Drum bearing is grinding')
  await page.getByLabel('Replacement budget', { exact: false }).fill('42000')
  await page.getByRole('button', { name: 'Explore my options' }).click()
  await expect(page.locator('.repair-cost')).toContainText('₹2,000')
  await expect(page.locator('.repair-cost')).toContainText('₹8,000')
  await expect(page.locator('.replacement-line')).toContainText('₹42,000')
  await expect(page.getByRole('region', { name: 'What to do now' })).toContainText(
    'Check stability',
  )
})

test('web research displays attributed sources, retains them between tabs, and clears them when scope changes', async ({
  page,
}) => {
  let sent: Record<string, unknown> = {}
  await page.route('**/api/research', (route) => {
    sent = route.request().postDataJSON()
    return route.fulfill({ status: 200, json: researchFixture })
  })
  await page.goto('/')
  await page.getByLabel('Brand and model').fill('Bosch WAN24209IN')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Explore my options' }).click()
  await page.getByLabel('City or postcode').fill('Bengaluru')
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toBeVisible()
  await expect(
    page.getByText('Published guidance recommends checking the accessible drain hose.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Source 1: Test fixture: drain troubleshooting' }),
  ).toHaveAttribute('href', researchFixture.citations[0].url)
  expect(sent).toMatchObject({
    brandModel: 'Bosch WAN24209IN',
    service: 'washing machine drain pump repair',
    location: 'Bengaluru',
    symptoms: 'Not draining',
  })
  expect(sent).not.toHaveProperty('photo')
  expect(sent).not.toHaveProperty('image')
  await page.getByRole('button', { name: 'Repair guidance', exact: true }).click()
  await page.getByRole('button', { name: 'Your estimate', exact: true }).click()
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toBeVisible()
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.getByLabel('City or postcode').fill('Chennai')
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Research this repair' })).toBeVisible()
})

test('unsafe source links never render as a research answer', async ({ page }) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...researchFixture,
        citations: [{ ...researchFixture.citations[0], url: 'javascript:alert(1)' }],
      },
    }),
  )
  await openEstimate(page)
  await page.getByLabel('City or postcode').fill('Bengaluru')
  await page.getByRole('button', { name: 'Research this repair' }).click()
  await expect(page.getByText(/The research response couldn’t be verified/)).toBeVisible()
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toHaveCount(0)
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
})

test('Maps search follows the editable repair service', async ({ page, context }) => {
  await openEstimate(page)
  await page.getByLabel('Service to look for').fill('Bosch washing machine control board repair')
  await page.getByLabel('City or postcode').fill('Hyderabad 500001')
  await context.route('https://www.google.com/maps/**', (route) =>
    route.fulfill({ status: 200, body: '<title>Maps test fixture</title>' }),
  )
  const opened = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Find repair shops' }).click()
  const maps = await opened
  await maps.waitForURL('https://www.google.com/maps/**')
  expect(new URL(maps.url()).searchParams.get('query')).toBe(
    'Bosch washing machine control board repair in Hyderabad 500001',
  )
  await maps.close()
})
