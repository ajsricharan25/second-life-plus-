import { createHash } from 'node:crypto'
import type { DailyUsage } from '../src/lib/daily-usage.ts'
import { ResearchError } from './research-error.ts'

type Environment = Record<string, string | undefined>
export const DAILY_QUOTA_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local used = tonumber(raw or '0')
local limit = tonumber(ARGV[1])
if not used or used < 0 or used ~= math.floor(used) then
  return redis.error_reply('Invalid counter')
end
local allowed = used < limit
if ARGV[3] == '1' and allowed then
  used = redis.call('INCR', KEYS[1])
  redis.call('EXPIREAT', KEYS[1], ARGV[2])
end
return {allowed and 1 or 0, used}
`

export function dailyQuotaEnabled(env: Environment): boolean {
  const value = env.DAILY_QUOTA_ENABLED?.trim()
  if (value && value !== 'true' && value !== 'false') throw quotaUnavailable()
  return value === 'true'
}

export function quotaUnavailable() {
  return new ResearchError(
    503,
    'daily_limit_unavailable',
    'The daily allowance could not be checked. No AI request was started.',
  )
}

export function quotaDay(now: number): { day: string; resetsAt: string } {
  // India has a fixed UTC+05:30 offset with no daylight-saving transitions.
  const offset = 330 * 60_000
  const midnight = Math.floor((now + offset) / 86_400_000) * 86_400_000
  return {
    day: new Date(midnight).toISOString().slice(0, 10),
    resetsAt: new Date(midnight + 86_400_000 - offset).toISOString(),
  }
}

export function createDailyQuota(options: {
  env: Environment
  fetcher?: typeof fetch
  now?: () => number
}) {
  const { env } = options
  const rawLimit = env.DAILY_AI_LIMIT?.trim() || '3'
  const namespace = env.DAILY_QUOTA_NAMESPACE?.trim() || 'second-life-plus'
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()
  let url: URL
  try {
    url = new URL(env.UPSTASH_REDIS_REST_URL?.trim() || '')
  } catch {
    throw quotaUnavailable()
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.upstash.io') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    url.pathname !== '/' ||
    !token ||
    !/^\d{1,3}$/.test(rawLimit) ||
    Number(rawLimit) < 1 ||
    Number(rawLimit) > 100 ||
    !/^[a-zA-Z0-9_-]{1,60}$/.test(namespace)
  )
    throw quotaUnavailable()
  const limit = Number(rawLimit)

  return async (
    identity: string,
    consume: boolean,
  ): Promise<{ allowed: boolean; usage: DailyUsage }> => {
    if (!identity || identity.length > 1000) throw quotaUnavailable()
    const { day, resetsAt } = quotaDay((options.now ?? Date.now)())
    // Store pseudonymous account identifiers only; no email, photo or device details.
    const account = createHash('sha256').update(`${namespace}\0${identity}`).digest('hex')
    const key = `daily-ai:${namespace}:${day}:${account}`
    try {
      const response = await (options.fetcher ?? fetch)(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
        redirect: 'error',
        body: JSON.stringify([
          'EVAL',
          DAILY_QUOTA_SCRIPT,
          '1',
          key,
          String(limit),
          String(Date.parse(resetsAt) / 1000),
          consume ? '1' : '0',
        ]),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw quotaUnavailable()
      }
      const text = await response.text()
      if (text.length > 4096) throw quotaUnavailable()
      const data: unknown = JSON.parse(text)
      const result = data && typeof data === 'object' && 'result' in data ? data.result : null
      if (
        !Array.isArray(result) ||
        result.length !== 2 ||
        ![0, 1].includes(result[0]) ||
        !Number.isSafeInteger(result[1]) ||
        result[1] < 0 ||
        result[1] > 100_000
      )
        throw quotaUnavailable()
      if (
        result[0] === 0
          ? result[1] < limit
          : consume
            ? result[1] < 1 || result[1] > limit
            : result[1] >= limit
      )
        throw quotaUnavailable()
      return {
        allowed: result[0] === 1,
        usage: {
          limit,
          used: result[1],
          remaining: Math.max(0, limit - result[1]),
          resetsAt,
          timeZone: 'Asia/Kolkata',
        },
      }
    } catch {
      // An ambiguous Redis write is never retried or replaced with an in-memory allowance.
      throw quotaUnavailable()
    }
  }
}
