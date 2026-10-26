import {
  parseFailureDetails,
  type QuotaLimit,
  type ResearchFailureDetails,
} from '../src/lib/research-failure-details.ts'
import type { ResearchProvider } from '../src/lib/research-types.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function providerDiagnostics(
  body: unknown,
  provider: ResearchProvider,
  model: string,
  upstreamStatus?: number,
): ResearchFailureDetails {
  const limits: QuotaLimit[] = []
  let retryAfterSeconds: number | undefined
  const error = record(body) && record(body.error) ? body.error : {}
  const details =
    provider === 'gemini' && Array.isArray(error.details) ? error.details.slice(0, 30) : []
  for (const detail of details) {
    if (!record(detail)) continue
    if (
      detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' &&
      Array.isArray(detail.violations)
    ) {
      for (const violation of detail.violations.slice(0, 8)) {
        if (!record(violation)) continue
        const label = [violation.quotaMetric, violation.quotaId]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .slice(0, 800)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        const resource: QuotaLimit['resource'] = /search|ground/.test(label)
          ? 'search'
          : /token/.test(label)
            ? 'tokens'
            : /request/.test(label)
              ? 'requests'
              : 'unknown'
        const period: QuotaLimit['period'] = /perday|daily/.test(label)
          ? 'day'
          : /perminute/.test(label)
            ? 'minute'
            : 'unknown'
        const value = violation.quotaValue
        const allowance =
          typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\d{1,10}$/.test(value)
              ? Number(value)
              : undefined
        limits.push({ resource, period, ...(allowance !== undefined ? { allowance } : {}) })
      }
    }
    if (
      detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' &&
      typeof detail.retryDelay === 'string' &&
      /^\d{1,5}(?:\.\d{1,9})?s$/.test(detail.retryDelay)
    )
      retryAfterSeconds = Math.max(
        retryAfterSeconds ?? 0,
        Math.ceil(Number.parseFloat(detail.retryDelay)),
      )
  }
  return parseFailureDetails({ provider, model, upstreamStatus, limits, retryAfterSeconds })!
}
