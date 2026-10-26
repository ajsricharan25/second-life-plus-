import { describe, expect, it } from 'vitest'
import { providerDiagnostics } from './provider-diagnostics'
import { failureDetailLines, parseFailureDetails } from '../src/lib/research-failure-details'

describe('bounded provider diagnostics', () => {
  it('reports a Groq model with a provider prefix without treating it as an OpenAI request', () => {
    const details = providerDiagnostics({}, 'groq', 'qwen/qwen3.8-27b', 429)
    expect(details).toEqual({ provider: 'groq', model: 'qwen/qwen3.8-27b', upstreamStatus: 429 })
    expect(failureDetailLines(details)).toContain('Provider: Groq.')
    expect(failureDetailLines(details)).toContain('Model requested: qwen/qwen3.8-27b.')
    expect(
      parseFailureDetails({ provider: 'gemini', model: 'qwen/qwen3.8-27b' }),
    ).not.toHaveProperty('model')
    expect(parseFailureDetails({ provider: 'groq', model: 'private-value' })).not.toHaveProperty(
      'model',
    )
  })
  it('distinguishes daily search and per-minute token limits using structured Google fields', () => {
    const details = providerDiagnostics(
      {
        error: {
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [
                {
                  quotaMetric: 'grounded_generate_content_requests',
                  quotaId: 'RequestsPerDay',
                  quotaValue: '0',
                },
                {
                  quotaMetric: 'generate_content_input_tokens',
                  quotaId: 'TokensPerMinute',
                  quotaValue: 250000,
                },
              ],
            },
          ],
        },
      },
      'gemini',
      'gemini-3.1-flash-lite',
      429,
    )
    expect(details.limits).toEqual([
      { resource: 'search', period: 'day', allowance: 0 },
      { resource: 'tokens', period: 'minute', allowance: 250000 },
    ])
    expect(failureDetailLines(details)).toContain(
      'Reported limit: web search / grounding per day; allowance 0.',
    )
    expect(failureDetailLines(details)).toContain(
      'A reported allowance is zero. Waiting alone may not make this model or feature available.',
    )
  })

  it('does not derive quota details from raw provider text or unrelated metadata', () => {
    const body = {
      error: {
        message: 'requests per day: 0; private-key',
        details: [
          {
            '@type': 'unrecognized-type',
            violations: [{ quotaMetric: 'search', quotaId: 'per_day' }],
            retryDelay: '2s',
          },
        ],
      },
    }
    expect(providerDiagnostics(body, 'gemini', 'gemini-flash-latest', 429)).toEqual({
      provider: 'gemini',
      model: 'gemini-flash-latest',
      upstreamStatus: 429,
    })
    expect(
      failureDetailLines(providerDiagnostics(body, 'gemini', 'gemini-flash-latest', 429)).join(' '),
    ).not.toContain('private-key')
  })

  it.each(['-1s', 'Infinitys', '90000s', 'tomorrow', '0s'])(
    'ignores invalid retry delay %s',
    (retryDelay) => {
      const details = providerDiagnostics(
        {
          error: {
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay,
              },
            ],
          },
        },
        'gemini',
        'gemini-flash-latest',
        429,
      )
      expect(details).not.toHaveProperty('retryAfterSeconds')
    },
  )

  it('retains unknown limit categories without guessing their period or allowance', () => {
    const details = providerDiagnostics(
      {
        error: {
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [{ quotaId: 'project-secret', quotaValue: '-10' }],
            },
          ],
        },
      },
      'gemini',
      'gemini-flash-latest',
      429,
    )
    expect(details.limits).toEqual([{ resource: 'unknown', period: 'unknown' }])
    expect(JSON.stringify(details)).not.toContain('project-secret')
  })

  it('validates diagnostics again in the browser and strips unrecognized fields', () => {
    expect(parseFailureDetails({ provider: 'other', model: 'private-key' })).toBeNull()
    expect(
      parseFailureDetails({
        provider: 'gemini',
        model: 'private-key',
        upstreamStatus: 200,
        retryAfterSeconds: -1,
        rawError: 'secret',
        limits: [
          { resource: { toString: 'invalid' }, period: 'day' },
          { resource: 'requests', period: 'day', allowance: -1, project: 'private-project' },
        ],
      }),
    ).toEqual({ provider: 'gemini', limits: [{ resource: 'requests', period: 'day' }] })
    expect(
      failureDetailLines({ provider: 'openai', model: 'gpt-4.1', upstreamStatus: 429 }),
    ).toContain(
      'The provider did not supply a specific quota type. Check this model’s limits in the provider dashboard.',
    )
  })

  it('bounds and deduplicates public quota lists', () => {
    const limit = { resource: 'requests', period: 'day', allowance: 500 }
    expect(
      parseFailureDetails({ provider: 'gemini', limits: Array(100).fill(limit) })?.limits,
    ).toEqual([limit])
  })
})
