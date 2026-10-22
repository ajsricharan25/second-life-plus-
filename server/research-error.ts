import { researchErrorMessages, type ResearchErrorCode } from '../src/lib/research-errors.ts'
import type { ResearchFailureDetails } from '../src/lib/research-failure-details.ts'

export class ResearchError extends Error {
  details?: ResearchFailureDetails
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function aiError(code: ResearchErrorCode, status = 502): ResearchError {
  return new ResearchError(status, code, researchErrorMessages[code])
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function classifyProviderError(
  status: number,
  body: unknown,
  provider: 'gemini' | 'openai',
): ResearchError {
  const error = record(body) && record(body.error) ? body.error : {}
  const message = typeof error.message === 'string' ? error.message.slice(0, 8000) : ''
  const details = Array.isArray(error.details) ? error.details.slice(0, 30) : []
  const tags = [
    error.code,
    error.status,
    error.type,
    ...details.map((item) => (record(item) ? item.reason : '')),
  ]
    .filter((tag): tag is string => typeof tag === 'string')
    .join(' ')
    .toUpperCase()
  // Inspect provider diagnostics only to choose a fixed, non-sensitive message.
  if (provider === 'gemini' && /(?:API.?KEY|KEY).{0,80}(?:LEAKED|EXPOSED)/i.test(message))
    return aiError('api_key_blocked')
  if (
    /API_KEY_INVALID|INVALID_API_KEY|UNAUTHENTICATED/.test(tags) ||
    status === 401 ||
    /API key not valid|invalid API key|incorrect API key/i.test(message)
  )
    return aiError('api_key_invalid')
  if (
    /BILLING_DISABLED|BILLING_NOT_ACTIVE/.test(tags) ||
    (provider === 'openai' &&
      (/INSUFFICIENT_QUOTA/.test(tags) ||
        /exceeded your current quota, please check your plan and billing/i.test(message)))
  )
    return aiError('provider_billing_required')
  if (
    /user location is not supported|unsupported (?:country|region)|region.{0,40}not supported/i.test(
      message,
    )
  )
    return aiError('provider_region_unsupported')
  if (status === 429 || /RESOURCE_EXHAUSTED|RATE_LIMIT_EXCEEDED|QUOTA_EXCEEDED/.test(tags))
    return aiError('provider_quota_exceeded', 429)
  // Gemini quota messages can suggest checking or enabling billing. A quota
  // failure alone does not establish that billing is required for this request.
  if (
    /\b(?:enable|activate) billing\b|\bbilling (?:is |must be )?(?:required|disabled|not enabled|not active)\b|\bbilling account (?:is )?(?:disabled|closed|suspended)\b|\binsufficient (?:credits|balance)\b/i.test(
      message,
    )
  )
    return aiError('provider_billing_required')
  if (status === 403 || /PERMISSION_DENIED|SERVICE_DISABLED|API_KEY_.*BLOCKED/.test(tags))
    return aiError('api_access_denied')
  if (status === 404 || /MODEL_NOT_FOUND/.test(tags)) return aiError('model_unavailable')
  if (status === 400 || status === 422 || /INVALID_ARGUMENT|FAILED_PRECONDITION/.test(tags))
    return aiError('provider_request_rejected')
  return aiError('provider_unavailable')
}
