import type { IncomingMessage } from 'node:http'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import { ResearchError } from './research-error.ts'
import { quotaUnavailable } from './daily-quota.ts'

type Environment = Record<string, string | undefined>
export interface AuthSettings {
  domain: string
  clientId: string
  audience: string
}

export function authSettings(env: Environment): AuthSettings {
  const domain =
    env.AUTH0_DOMAIN?.trim()
      .replace(/^https:\/\//, '')
      .replace(/\/$/, '') || ''
  const clientId = env.AUTH0_CLIENT_ID?.trim() || ''
  const audience = env.AUTH0_AUDIENCE?.trim() || ''
  if (
    !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain) ||
    !/^[a-zA-Z0-9_-]{8,200}$/.test(clientId) ||
    !audience ||
    audience.length > 300 ||
    /[\s<>]/.test(audience) ||
    audience === clientId
  )
    throw quotaUnavailable()
  return { domain: domain.toLowerCase(), clientId, audience }
}

export function createIdentityVerifier(options: {
  env: Environment
  fetcher?: typeof fetch
  now?: () => number
}) {
  const settings = authSettings(options.env)
  const issuer = `https://${settings.domain}/`
  const keys = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), {
    timeoutDuration: 4000,
    cacheMaxAge: 600_000,
    cooldownDuration: 30_000,
    ...(options.fetcher ? { [customFetch]: options.fetcher } : {}),
  })
  return async (request: IncomingMessage): Promise<string> => {
    const authorization = request.headers.authorization
    if (
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization)
    )
      throw new ResearchError(401, 'sign_in_required', 'Sign in to use your daily AI allowance.')
    try {
      const { payload } = await jwtVerify(authorization.slice(7), keys, {
        issuer,
        audience: settings.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 5,
        currentDate: new Date((options.now ?? Date.now)()),
      })
      if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255)
        throw new Error('Missing account subject')
      return `${issuer}|${payload.sub}`
    } catch {
      // Do not expose tokens, account details or identity-provider diagnostics.
      throw new ResearchError(
        401,
        'sign_in_required',
        'Your sign-in could not be verified. Please sign in again.',
      )
    }
  }
}
