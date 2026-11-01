import type { IncomingMessage, ServerResponse } from 'node:http'
import { authSettings, createIdentityVerifier } from './research-identity.ts'
import { createDailyQuota, dailyQuotaEnabled } from './daily-quota.ts'
import { ResearchError } from './research-error.ts'

interface Options {
  env?: Record<string, string | undefined>
  quotaFetcher?: typeof fetch
  identityFetcher?: typeof fetch
  now?: () => number
}

export function createAccessHandler(options: Options = {}) {
  let verify: ReturnType<typeof createIdentityVerifier> | undefined
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET')
        throw new ResearchError(405, 'method_not_allowed', 'Use GET to check the daily allowance.')
      }
      const env = options.env ?? process.env
      if (!dailyQuotaEnabled(env)) {
        response.end(JSON.stringify({ enabled: false }))
        return
      }
      const auth = authSettings(env)
      const quota = createDailyQuota({ env, fetcher: options.quotaFetcher, now: options.now })
      const result: Record<string, unknown> = { enabled: true, auth }
      if (request.headers.authorization) {
        verify ??= createIdentityVerifier({
          env,
          fetcher: options.identityFetcher,
          now: options.now,
        })
        const identity = await verify(request)
        result.usage = (await quota(identity, false)).usage
      }
      response.end(JSON.stringify(result))
    } catch (error) {
      const failure =
        error instanceof ResearchError
          ? error
          : new ResearchError(
              503,
              'daily_limit_unavailable',
              'The daily allowance could not be checked.',
            )
      response.statusCode = failure.status
      response.end(JSON.stringify({ error: { code: failure.code, message: failure.message } }))
    }
  }
}

export const accessHandler = createAccessHandler()
