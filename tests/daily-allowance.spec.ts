import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { coachedReport as report, coach } from './unified-fixture'

const domain = 'second-life-test.auth0.com'
const clientId = 'fixture-public-client'
const accessToken = 'fixture-access-token'
function usage(used: number) {
  return {
    limit: 3,
    used,
    remaining: Math.max(0, 3 - used),
    resetsAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    timeZone: 'Asia/Kolkata',
  }
}
async function mockSignIn(context: BrowserContext, initialUsed = 0, failLast = false) {
  let used = initialUsed
  let nonce = ''
  let calls = 0
  await context.route(`https://${domain}/**`, async (route) => {
    const url = new URL(route.request().url())
    const cors = {
      'access-control-allow-origin': 'http://127.0.0.1:5173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, auth0-client',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/v2/logout')
      return route.fulfill({ status: 302, headers: { location: 'http://127.0.0.1:5173/' } })
    if (url.pathname === '/authorize') {
      nonce = url.searchParams.get('nonce') || ''
      const response = {
        type: 'authorization_response',
        response: { code: 'fixture-code', state: url.searchParams.get('state') },
      }
      return route.fulfill({
        contentType: 'text/html',
        body: `<script>window.opener ? window.opener.postMessage(${JSON.stringify(response)}, 'http://127.0.0.1:5173') : window.parent.postMessage(${JSON.stringify(response)}, 'http://127.0.0.1:5173')</script>`,
      })
    }
    if (url.pathname === '/oauth/token') {
      const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url')
      const seconds = Math.floor(Date.now() / 1000)
      // Fixture OIDC response: server signature verification is tested separately with real RSA keys.
      const idToken = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: `https://${domain}/`, aud: clientId, sub: 'auth0|fixture-person', iat: seconds, exp: seconds + 3600, nonce, name: 'Test Visitor' })}.fixture`
      return route.fulfill({
        headers: cors,
        json: {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: idToken,
          scope: 'openid profile email',
        },
      })
    }
    return route.abort()
  })
  await context.route('**/api/access', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        auth: { domain, clientId, audience: 'https://second-life-api' },
        ...(route.request().headers().authorization === `Bearer ${accessToken}`
          ? { usage: usage(used) }
          : {}),
      },
    }),
  )
  await context.route('**/api/research', (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`)
    calls++
    if (used >= 3)
      return route.fulfill({
        status: 429,
        json: { error: { code: 'daily_limit_reached' }, usage: usage(used) },
      })
    used++
    return route.fulfill({
      status: failLast && used === 3 ? 502 : 200,
      json:
        failLast && used === 3
          ? { error: { code: 'provider_unavailable' }, usage: usage(used) }
          : { ...report, usage: usage(used) },
    })
  })
  return { calls: () => calls }
}
async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in for AI', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Analyze with AI', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Sign in for AI', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByLabel('Daily AI allowance')).not.toContainText('Checking your access')
}

test('sign-in protects AI actions and the third request disables new calls while keeping the report', async ({
  context,
  page,
}) => {
  const requests = await mockSignIn(context)
  await signIn(page)
  await expect(page.getByLabel('Daily AI allowance')).toContainText('3 of 3 AI requests left today')
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
  await expect(page.getByLabel('Daily AI allowance')).toContainText('2 of 3')
  await page
    .locator('.ai-action-grid')
    .getByRole('button', { name: /Estimate repair & recycling/ })
    .click()
  await page
    .getByRole('button', { name: 'Estimate repair & recycling with AI', exact: true })
    .click()
  await expect(page.getByLabel('Daily AI allowance')).toContainText('1 of 3')
  await page.getByLabel(coach.questions[0].question, { exact: true }).fill('I saw E1.')
  await page.getByRole('button', { name: 'Refine with my observations' }).click()
  await expect(page.getByLabel('Daily AI allowance')).toContainText('0 of 3')
  await expect(page.getByRole('button', { name: 'Refresh assessment', exact: true })).toBeDisabled()
  await page.getByLabel(coach.questions[0].question, { exact: true }).fill('I saw it again.')
  await expect(page.getByRole('button', { name: 'Refine with my observations' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /with AI$/, exact: false })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
  await expect(page.getByText('Open a direct web search', { exact: true })).toBeVisible()
  expect(requests.calls()).toBe(3)
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in for AI', exact: true })).toBeVisible()
  await signIn(page)
  await expect(page.getByLabel('Daily AI allowance')).toContainText('0 of 3')
  await expect(page.getByRole('button', { name: 'Analyze with AI', exact: true })).toBeDisabled()
  expect(requests.calls()).toBe(3)
})

test('a returning account at its daily limit cannot start another request', async ({
  context,
  page,
}) => {
  const requests = await mockSignIn(context, 3)
  await signIn(page)
  await expect(page.getByLabel('Daily AI allowance')).toContainText('0 of 3 AI requests left today')
  await expect(page.getByRole('button', { name: 'Analyze with AI', exact: true })).toBeDisabled()
  expect(requests.calls()).toBe(0)
})

test('a provider error still updates the remaining allowance without erasing a report', async ({
  context,
  page,
}) => {
  await mockSignIn(context, 1, true)
  await signIn(page)
  await page.getByRole('button', { name: 'Not draining', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze with AI', exact: true }).click()
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh assessment', exact: true }).click()
  await expect(page.getByLabel('Daily AI allowance')).toContainText('0 of 3')
  await expect(page.locator('.research-message')).toContainText('temporarily unavailable')
  await expect(page.getByRole('article', { name: 'AI device report' })).toBeVisible()
})

test('quota setup errors keep AI disabled without exposing secrets', async ({ page }) => {
  await page.route('**/api/access', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: 'daily_limit_unavailable', message: 'fixture-secret-must-not-render' },
      },
    }),
  )
  await page.goto('/')
  await expect(page.getByLabel('Daily AI allowance')).toContainText('finish daily-limit setup')
  await expect(page.getByRole('button', { name: 'Analyze with AI', exact: true })).toBeDisabled()
  await expect(page.locator('body')).not.toContainText('fixture-secret-must-not-render')
})
