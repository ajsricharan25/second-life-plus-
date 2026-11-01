import { beforeAll, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createDailyQuota, DAILY_QUOTA_SCRIPT, quotaDay } from './daily-quota'
import { createResearchHandler } from './research'
import { createAccessHandler } from './research-access'
import { createIdentityVerifier } from './research-identity'
import { parseDailyUsage } from '../src/lib/daily-usage'

const env = {
  DAILY_QUOTA_ENABLED: 'true',
  DAILY_AI_LIMIT: '3',
  AUTH0_DOMAIN: 'second-life-test.auth0.com',
  AUTH0_CLIENT_ID: 'public-client-id',
  AUTH0_AUDIENCE: 'https://second-life-api',
  UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'fixture-redis-secret',
  REPAIR_AI_PROVIDER: 'groq',
  GROQ_API_KEY: 'fixture-ai-secret',
}
let now = Date.parse('2026-11-01T12:00:00Z')
let privateKey: CryptoKey
let jwks: unknown
beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'fixture-key', alg: 'RS256', use: 'sig' }],
  }
})
function token(sub = 'auth0|person-a', patch: Record<string, unknown> = {}) {
  return new SignJWT({
    sub,
    iss: `https://${env.AUTH0_DOMAIN}/`,
    aud: env.AUTH0_AUDIENCE,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
    ...patch,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .sign(privateKey)
}
const identityFetcher = () =>
  vi.fn<typeof fetch>().mockImplementation(async () => Response.json(jwks))
function redisFixture() {
  const counts = new Map<string, number>()
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const [command, script, keys, key, limit, expiry, consume] = JSON.parse(init!.body as string)
    expect([command, script, keys]).toEqual(['EVAL', DAILY_QUOTA_SCRIPT, '1'])
    expect(Number(expiry)).toBeGreaterThan(0)
    let used = counts.get(key) ?? 0
    const allowed = used < Number(limit)
    if (allowed && consume === '1') {
      used++
      counts.set(key, used)
    }
    return Response.json({ result: [allowed ? 1 : 0, used] })
  })
  return { counts, fetcher }
}
const input = {
  appliance: 'smartphone',
  age: 1,
  symptoms: 'Battery drains quickly',
  currency: 'INR',
  brandModel: 'Example Phone',
  location: 'Chennai',
  service: 'battery repair',
  task: 'assessment',
}
function providerFixture() {
  return vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              sections: [
                {
                  heading: 'Summary',
                  text: 'Battery wear or background activity may explain this.',
                  sourceIds: [],
                },
              ],
              prices: [],
            }),
          },
        },
      ],
    }),
  )
}
async function http(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  options: {
    token?: string
    body?: unknown
    method?: string
    extraHeaders?: Record<string, string>
  } = {},
) {
  const req = Readable.from([]) as IncomingMessage & { body: unknown }
  req.method = options.method ?? 'POST'
  req.headers = {
    host: 'localhost:5173',
    'content-type': 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...options.extraHeaders,
  }
  req.body = options.body ?? input
  Object.defineProperty(req, 'socket', { value: { remoteAddress: '127.0.0.1' } })
  const headers: Record<string, unknown> = {}
  let body = ''
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: (key: string, value: unknown) => {
      headers[key] = value
    },
    end: (value: string) => {
      body = value
    },
  }) as unknown as ServerResponse
  await handler(req, res)
  return { status: res.statusCode, headers, body: JSON.parse(body) }
}

// The Redis protocol fixture is shared across fresh handler instances to model separate Vercel workers.
describe('persistent account allowance', () => {
  it('allows only three simultaneous attempts across fresh handlers, then survives reload/token renewal', async () => {
    const redis = redisFixture()
    const ai = providerFixture()
    const jwt = await token()
    const handler = () =>
      createResearchHandler({
        env,
        fetcher: ai,
        quotaFetcher: redis.fetcher,
        identityFetcher: identityFetcher(),
        now: () => now,
      })
    const results = await Promise.all(
      Array.from({ length: 8 }, () => http(handler(), { token: jwt })),
    )
    expect(results.filter((result) => result.status === 200)).toHaveLength(3)
    expect(
      results.filter((result) => result.body.error?.code === 'daily_limit_reached'),
    ).toHaveLength(5)
    expect(ai).toHaveBeenCalledTimes(3)
    const blocked = await http(handler(), { token: await token() })
    expect(blocked.status).toBe(429)
    expect(blocked.body.usage).toMatchObject({
      used: 3,
      limit: 3,
      remaining: 0,
      resetsAt: '2026-11-01T18:30:00.000Z',
    })
    expect(blocked.headers['Retry-After']).toBeGreaterThan(0)
    expect(parseDailyUsage(blocked.body.usage)).not.toBeNull()
    const another = await http(handler(), { token: await token('auth0|person-b') })
    expect(another.status).toBe(200)
    expect(another.body.usage.remaining).toBe(2)
    expect([...redis.counts.keys()].join(' ')).not.toMatch(/person-a|person-b|Phone|Chennai/)
  })
  it('counts all AI actions together, including a provider failure after reservation', async () => {
    const redis = redisFixture()
    const ai = providerFixture()
    const jwt = await token()
    const handler = createResearchHandler({
      env,
      fetcher: ai,
      quotaFetcher: redis.fetcher,
      identityFetcher: identityFetcher(),
      now: () => now,
    })
    expect((await http(handler, { token: jwt })).body.usage.remaining).toBe(2)
    ai.mockResolvedValueOnce(Response.json({ error: { message: 'rate limit' } }, { status: 429 }))
    const failed = await http(handler, {
      token: jwt,
      body: {
        ...input,
        task: 'follow-up',
        question: 'What else can I check?',
        previousAssessment: 'Battery wear is possible.',
      },
    })
    expect(failed.body.error.code).toBe('provider_quota_exceeded')
    expect(failed.body.usage.remaining).toBe(1)
    expect(
      (
        await http(handler, {
          token: jwt,
          body: {
            ...input,
            task: 'cost-estimate',
            previousAssessment: 'Battery wear is possible.',
          },
        })
      ).body.usage.remaining,
    ).toBe(0)
    expect(
      (
        await http(handler, {
          token: jwt,
          body: { ...input, task: 'repair-brief', previousAssessment: 'Battery wear is possible.' },
        })
      ).body.error.code,
    ).toBe('daily_limit_reached')
    expect(ai).toHaveBeenCalledTimes(3)
  })
  it('never trusts browser identity fields or consumes quota for invalid/unsigned requests', async () => {
    const redis = redisFixture()
    const ai = providerFixture()
    const handler = createResearchHandler({
      env,
      fetcher: ai,
      quotaFetcher: redis.fetcher,
      identityFetcher: identityFetcher(),
      now: () => now,
    })
    expect(
      (
        await http(handler, {
          body: { ...input, userId: 'person-a' },
          extraHeaders: { 'x-user-id': 'person-a' },
        })
      ).status,
    ).toBe(401)
    expect((await http(handler, { token: 'forged.jwt.signature' })).status).toBe(401)
    expect(
      (await http(handler, { token: await token(), body: { ...input, symptoms: '' } })).status,
    ).toBe(400)
    expect(redis.fetcher).not.toHaveBeenCalled()
    expect(ai).not.toHaveBeenCalled()
  })
  it('blocks without model/search calls when storage fails; it never grants a local fallback', async () => {
    const quotaFetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private-storage-details'))
    const ai = providerFixture()
    const handler = createResearchHandler({
      env: { ...env, TAVILY_API_KEY: 'fixture-search' },
      fetcher: ai,
      quotaFetcher,
      identityFetcher: identityFetcher(),
      now: () => now,
    })
    const result = await http(handler, { token: await token() })
    expect(result.status).toBe(503)
    expect(result.body.error.code).toBe('daily_limit_unavailable')
    expect(JSON.stringify(result.body)).not.toMatch(/private-storage|fixture-redis|fixture-ai/)
    expect(ai).not.toHaveBeenCalled()
    expect(quotaFetcher).toHaveBeenCalledTimes(1)
  })
  it('resets at midnight India time without losing other same-day counts', async () => {
    const redis = redisFixture()
    let clock = Date.parse('2026-11-01T18:29:59Z')
    const quota = createDailyQuota({ env, fetcher: redis.fetcher, now: () => clock })
    for (let i = 0; i < 3; i++) expect((await quota('account-a', true)).allowed).toBe(true)
    expect((await quota('account-a', true)).allowed).toBe(false)
    clock = Date.parse('2026-11-01T18:30:00Z')
    expect((await quota('account-a', true)).usage).toMatchObject({
      used: 1,
      remaining: 2,
      resetsAt: '2026-11-02T18:30:00.000Z',
    })
    expect(quotaDay(clock).day).toBe('2026-11-02')
  })
  it.each([
    { UPSTASH_REDIS_REST_TOKEN: '' },
    { UPSTASH_REDIS_REST_URL: 'http://test.upstash.io' },
    { UPSTASH_REDIS_REST_URL: 'https://test.upstash.io@attacker.invalid' },
    { DAILY_AI_LIMIT: '0' },
    { DAILY_AI_LIMIT: 'unlimited' },
    { DAILY_QUOTA_NAMESPACE: '../invalid' },
  ])('rejects incomplete or invalid enabled quota configuration: %j', (patch) => {
    expect(() => createDailyQuota({ env: { ...env, ...patch } })).toThrow()
  })
  it.each([
    { result: [1, -1] },
    { result: [1, '2'] },
    { result: [7, 2] },
    { error: 'private error' },
  ])('rejects invalid Redis responses without a retry: %j', async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
    await expect(createDailyQuota({ env, fetcher })('account-a', true)).rejects.toMatchObject({
      code: 'daily_limit_unavailable',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('verified identity and read-only usage', () => {
  it('rejects an otherwise valid token signed by another key', async () => {
    const other = await generateKeyPair('RS256')
    const jwt = await new SignJWT({ sub: 'auth0|person-a' })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
      .setIssuer(`https://${env.AUTH0_DOMAIN}/`)
      .setAudience(env.AUTH0_AUDIENCE)
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(Math.floor(now / 1000) + 3600)
      .sign(other.privateKey)
    const verify = createIdentityVerifier({ env, fetcher: identityFetcher(), now: () => now })
    await expect(
      verify({ headers: { authorization: `Bearer ${jwt}` } } as IncomingMessage),
    ).rejects.toMatchObject({ code: 'sign_in_required' })
  })
  it.each([{ iss: 'https://attacker.invalid/' }, { aud: 'wrong-api' }, { exp: 1 }, { sub: '' }])(
    'rejects a signed token with invalid claims: %j',
    async (patch) => {
      const verify = createIdentityVerifier({ env, fetcher: identityFetcher(), now: () => now })
      const req = {
        headers: { authorization: `Bearer ${await token('auth0|person-a', patch)}` },
      } as IncomingMessage
      await expect(verify(req)).rejects.toMatchObject({ code: 'sign_in_required' })
    },
  )
  it('returns only public Auth0 settings to anonymous visitors and never increments on usage reads', async () => {
    const redis = redisFixture()
    const handler = createAccessHandler({
      env,
      quotaFetcher: redis.fetcher,
      identityFetcher: identityFetcher(),
      now: () => now,
    })
    const publicConfig = await http(handler, { method: 'GET' })
    expect(publicConfig.body).toMatchObject({ enabled: true, auth: { domain: env.AUTH0_DOMAIN } })
    expect(JSON.stringify(publicConfig)).not.toContain('fixture-redis-secret')
    expect(redis.fetcher).not.toHaveBeenCalled()
    const jwt = await token()
    for (let i = 0; i < 3; i++) {
      const result = await http(handler, { method: 'GET', token: jwt })
      expect(result.body.usage).toMatchObject({ used: 0, remaining: 3 })
      expect(result.headers['Cache-Control']).toBe('private, no-store')
    }
    expect(redis.counts.size).toBe(0)
  })
  it('preserves the existing app until daily limits are explicitly configured and enabled', async () => {
    const ai = providerFixture()
    const quotaFetcher = vi.fn<typeof fetch>()
    const handler = createResearchHandler({
      env: { GROQ_API_KEY: 'fixture-key' },
      fetcher: ai,
      quotaFetcher,
    })
    expect((await http(handler)).status).toBe(200)
    expect(quotaFetcher).not.toHaveBeenCalled()
    expect((await http(createAccessHandler({ env: {} }), { method: 'GET' })).body).toEqual({
      enabled: false,
    })
  })
})
