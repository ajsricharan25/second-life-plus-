import { describe, expect, it } from 'vitest'
import { classifyProviderError } from './research-error'
import { researchErrorMessage } from '../src/lib/research-errors'

describe('safe, actionable provider errors', () => {
  it.each([
    {
      status: 400,
      message: 'API key not valid. Please pass a valid API key.',
      code: 'api_key_invalid',
    },
    { status: 401, message: 'sensitive authentication details', code: 'api_key_invalid' },
    {
      status: 403,
      message: 'Your API key was reported as leaked. Please use another API key.',
      code: 'api_key_blocked',
    },
    { status: 403, message: 'The API is not enabled', code: 'api_access_denied' },
    {
      status: 400,
      message: 'User location is not supported for the API use.',
      code: 'provider_region_unsupported',
    },
    {
      status: 400,
      message: 'Please enable billing for this project',
      code: 'provider_billing_required',
    },
    {
      status: 429,
      message: 'Quota exceeded for requests per day',
      code: 'provider_quota_exceeded',
    },
    {
      status: 404,
      message: 'models/example-model is not found for API version v1beta',
      code: 'model_unavailable',
    },
    {
      status: 400,
      message: 'Tool use with this model is unsupported',
      code: 'provider_request_rejected',
    },
    { status: 503, message: 'Upstream internal information', code: 'provider_unavailable' },
  ])(
    'classifies $status as $code without returning raw provider content',
    ({ status, message, code }) => {
      const result = classifyProviderError(
        status,
        { error: { message: `${message} secret-provider-value` } },
        'gemini',
      )
      expect(result.code).toBe(code)
      expect(result.status).toBe(code === 'provider_quota_exceeded' ? 429 : 502)
      expect(result.message).not.toContain('secret-provider-value')
      expect(researchErrorMessage(result.code, result.status)).toBe(result.message)
    },
  )
  it('uses structured Google reasons, not just human-readable messages', () => {
    const result = classifyProviderError(
      400,
      {
        error: {
          details: [
            { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
          ],
        },
      },
      'gemini',
    )
    expect(result.code).toBe('api_key_invalid')
  })
  it('distinguishes OpenAI account credit exhaustion from short rate limits', () => {
    expect(
      classifyProviderError(429, { error: { code: 'insufficient_quota' } }, 'openai').code,
    ).toBe('provider_billing_required')
    expect(
      classifyProviderError(429, { error: { code: 'rate_limit_exceeded' } }, 'openai').code,
    ).toBe('provider_quota_exceeded')
  })
  it('handles unstructured and missing provider errors safely', () => {
    expect(classifyProviderError(403, undefined, 'gemini').code).toBe('api_access_denied')
    expect(classifyProviderError(502, '<html>secret</html>', 'openai').code).toBe(
      'provider_unavailable',
    )
    expect(
      classifyProviderError(400, { error: { message: { unusual: true } } }, 'gemini').code,
    ).toBe('provider_request_rejected')
  })
  it('distinguishes app throttling, provider quota, gateway timeout and a missing API route', () => {
    expect(researchErrorMessage('rate_limited', 429)).toContain('wait a minute')
    expect(researchErrorMessage('provider_quota_exceeded', 429)).toContain('provider’s quota')
    expect(researchErrorMessage(undefined, 504)).toContain('timed out')
    expect(researchErrorMessage(undefined, 404)).toContain('server function')
    expect(researchErrorMessage('__proto__', 502)).toContain('temporarily unavailable')
  })
})
