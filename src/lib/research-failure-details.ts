import type { ResearchProvider } from './research-types.ts'

export type QuotaLimit = {
  resource: 'requests' | 'tokens' | 'search' | 'unknown'
  period: 'minute' | 'day' | 'unknown'
  allowance?: number
}

export type ResearchFailureDetails = {
  provider: ResearchProvider
  model?: string
  upstreamStatus?: number
  limits?: QuotaLimit[]
  retryAfterSeconds?: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Allow only bounded public diagnostics. Never display provider error text,
// project identifiers, arbitrary quota names, or unrecognized object fields.
export function parseFailureDetails(value: unknown): ResearchFailureDetails | null {
  if (
    !record(value) ||
    (value.provider !== 'gemini' && value.provider !== 'openai' && value.provider !== 'groq')
  )
    return null
  const result: ResearchFailureDetails = { provider: value.provider }
  if (
    typeof value.model === 'string' &&
    value.model.length <= 100 &&
    (/^(?:gemini-[a-z0-9._-]+|gpt-[a-z0-9._-]+|o[0-9][a-z0-9._-]*)$/.test(value.model) ||
      (value.provider === 'groq' &&
        /^(?:qwen|openai|meta-llama|moonshotai|groq)\/[a-z0-9][a-z0-9._-]*$/.test(value.model)))
  )
    result.model = value.model
  if (
    typeof value.upstreamStatus === 'number' &&
    Number.isInteger(value.upstreamStatus) &&
    value.upstreamStatus >= 400 &&
    value.upstreamStatus <= 599
  )
    result.upstreamStatus = value.upstreamStatus
  if (Array.isArray(value.limits)) {
    const limits: QuotaLimit[] = []
    for (const limit of value.limits.slice(0, 8)) {
      if (
        !record(limit) ||
        typeof limit.resource !== 'string' ||
        !['requests', 'tokens', 'search', 'unknown'].includes(limit.resource) ||
        typeof limit.period !== 'string' ||
        !['minute', 'day', 'unknown'].includes(limit.period)
      )
        continue
      const safe: QuotaLimit = {
        resource: limit.resource as QuotaLimit['resource'],
        period: limit.period as QuotaLimit['period'],
      }
      if (
        typeof limit.allowance === 'number' &&
        Number.isSafeInteger(limit.allowance) &&
        limit.allowance >= 0 &&
        limit.allowance <= 1_000_000_000
      )
        safe.allowance = limit.allowance
      if (!limits.some((item) => JSON.stringify(item) === JSON.stringify(safe))) limits.push(safe)
    }
    if (limits.length) result.limits = limits
  }
  if (
    typeof value.retryAfterSeconds === 'number' &&
    Number.isInteger(value.retryAfterSeconds) &&
    value.retryAfterSeconds >= 1 &&
    value.retryAfterSeconds <= 86400
  )
    result.retryAfterSeconds = value.retryAfterSeconds
  return result
}

export function failureDetailLines(value: unknown): string[] {
  const details = parseFailureDetails(value)
  if (!details) return []
  const lines = [
    `Provider: ${{ gemini: 'Google Gemini', openai: 'OpenAI', groq: 'Groq' }[details.provider]}.`,
  ]
  if (details.model) lines.push(`Model requested: ${details.model}.`)
  if (details.upstreamStatus) lines.push(`Provider HTTP status: ${details.upstreamStatus}.`)
  for (const limit of details.limits ?? []) {
    const resource = {
      requests: 'model requests',
      tokens: 'tokens',
      search: 'web search / grounding',
      unknown: 'unspecified resource',
    }[limit.resource]
    const period = { minute: 'per minute', day: 'per day', unknown: '(period not supplied)' }[
      limit.period
    ]
    lines.push(
      `Reported limit: ${resource} ${period}${limit.allowance !== undefined ? `; allowance ${limit.allowance}` : ''}.`,
    )
  }
  if (details.upstreamStatus === 429 && !details.limits?.length)
    lines.push(
      'The provider did not supply a specific quota type. Check this model’s limits in the provider dashboard.',
    )
  if (details.limits?.some((limit) => limit.allowance === 0))
    lines.push(
      'A reported allowance is zero. Waiting alone may not make this model or feature available.',
    )
  else if (details.limits?.some((limit) => limit.period === 'day'))
    lines.push('A daily allowance is affected. Check the provider dashboard for its reset time.')
  if (details.retryAfterSeconds)
    lines.push(
      `Minimum retry delay reported: ${details.retryAfterSeconds} seconds. Other limits may require a longer wait.`,
    )
  return lines
}
