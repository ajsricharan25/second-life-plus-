import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import type { ResearchResult } from '../src/lib/research-types'

const guidance: ResearchResult = {
  status: 'ok',
  text: 'Summary\nA restricted drain path could explain the symptoms. Inspect the accessible external hose.\n\nLikely causes\nA kink or obstruction is possible; the internal pump has not been tested.\n\nSafe checks\nStop using the machine if there is leaking, burning, or exposed wiring.\n\nRepair options\nA visible hose kink may be corrected without opening the cabinet. Quote needed for internal repairs.\n\nWhat would narrow it down\nWhat error code appears?',
  citations: [],
  checkedAt: '2026-10-25T00:00:00Z',
  provider: 'groq',
  model: 'qwen/qwen3.8-27b',
  evidence: 'model-only',
  photoIncluded: false,
  webSearch: { provider: 'tavily', status: 'not-configured' },
  priceCheck: { status: 'unavailable', items: [] },
}

test('Groq guidance without web evidence is useful, clearly labelled, and downloaded without a sourced claim', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/research', (route) => {
    requests++
    return route.fulfill({ status: 200, json: guidance })
  })
  await page.goto('/')
  await page.getByLabel('Brand and model').fill('Example Washer 100')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText('AI GUIDANCE · NO WEB CHECK', { exact: true })).toBeVisible()
  await expect(page.getByText('Groq · AI guidance', { exact: false })).toBeVisible()
  await expect(page.locator('.research-answer')).toContainText('What error code appears?')
  await expect(
    page.getByText(/no current repair or replacement price has been verified/),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Price check — no web evidence' })).toContainText(
    'Quote needed.',
  )
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Research sources' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Search Google' })).toBeVisible()
  await expect(page.locator('.repair-cost')).not.toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const report = await readFile((await (await downloaded).path())!, 'utf8')
  expect(report).toContain('AI REPAIR GUIDANCE — NO WEB CHECK')
  expect(report).toContain('Provider: Groq')
  expect(report).toContain('Photo shared for analysis: No')
  expect(report).toContain('No current repair or replacement price has been verified.')
  expect(report).not.toContain('Sources checked:')
  expect(report).not.toContain('\nSOURCES\n')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByLabel('City or postcode').fill('Chennai')
  await expect(page.locator('.research-answer')).toHaveCount(0)
  await expect(page.getByText('AI GUIDANCE · NO WEB CHECK')).toHaveCount(0)
  expect(requests).toBe(1)
})

test('Groq receives a photo only after explicit consent', async ({ page }) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/research', (route) => {
    const input = route.request().postDataJSON()
    requests.push(input)
    return route.fulfill({
      status: 200,
      json: { ...guidance, photoIncluded: Boolean(input.image) },
    })
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
  await expect(page.getByRole('checkbox', { name: /Include this photo/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.locator('.research-answer')).toBeVisible()
  expect(requests[0]).not.toHaveProperty('image')
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByRole('checkbox', { name: /Include this photo/ }).check()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText(/Groq.*Photo included/)).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1].image).toMatchObject({ mimeType: 'image/jpeg' })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  expect(await readFile((await (await downloaded).path())!, 'utf8')).toContain(
    'Photo shared for analysis: Yes',
  )
})

test('Groq with Tavily sources keeps a published part price separate from the full repair cost', async ({
  page,
}) => {
  const excerpt = 'Example Washer 100 spare part in India: ₹500, excluding labour.'
  const text = `${excerpt} [1]`
  const citation = {
    start: text.indexOf('[1]'),
    end: text.length,
    url: 'https://example.com/parts',
    title: 'Fixture parts supplier',
  }
  const result: ResearchResult = {
    ...guidance,
    text,
    evidence: 'web',
    citations: [citation],
    webSearch: { provider: 'tavily', status: 'used' },
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
          sourceUrl: citation.url,
          sourceTitle: citation.title,
        },
      ],
    },
  }
  await page.route('**/api/research', (route) => route.fulfill({ status: 200, json: result }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText('Groq + Tavily web search', { exact: false })).toBeVisible()
  await expect(page.getByText('WEB-SOURCED INFORMATION')).toBeVisible()
  const prices = page.getByRole('region', { name: 'Source-backed price check' })
  await expect(prices.getByText('₹500', { exact: true })).toBeVisible()
  await expect(prices.getByText('Component / spare part only')).toBeVisible()
  await expect(prices.getByText(/Full repair quote needed/)).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Source 1: Fixture parts supplier' }),
  ).toHaveAttribute('href', citation.url)
  await expect(page.getByText('AI GUIDANCE · NO WEB CHECK')).toHaveCount(0)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const report = await readFile((await (await downloaded).path())!, 'utf8')
  expect(report).toContain('Provider: Groq')
  expect(report).toContain('Sources checked:')
  expect(report).toContain(citation.url)
  expect(report).not.toContain('AI REPAIR GUIDANCE — NO WEB CHECK')
})

test('a failed optional search preserves clearly labelled guidance and direct search links', async ({
  page,
}) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...guidance,
        webSearch: { provider: 'tavily', status: 'unavailable' },
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText(/Web search was unavailable for this assessment/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Search Google' })).toBeVisible()
  await expect(page.getByText('AI GUIDANCE · NO WEB CHECK')).toBeVisible()
})

test('model-only results cannot display prices as checked', async ({ page }) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...guidance,
        priceCheck: { status: 'checked', items: [] },
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByText(/The research response couldn’t be verified/)).toBeVisible()
  await expect(page.locator('.research-answer')).toHaveCount(0)
})
