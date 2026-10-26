import { describe, expect, it } from 'vitest'
import { parseResearchResult } from './research-client'

const response = {
  status: 'ok',
  text: 'A sourced answer [1]',
  checkedAt: '2026-10-21T00:00:00Z',
  citations: [{ start: 17, end: 20, title: 'Source', url: 'https://example.com/manual' }],
}

const modelOnly = {
  status: 'ok',
  text: 'Summary\nThe drain path may be obstructed. Inspect the accessible external hose.',
  checkedAt: '2026-10-25T00:00:00Z',
  provider: 'groq',
  model: 'qwen/qwen3.8-27b',
  evidence: 'model-only',
  citations: [],
  photoIncluded: false,
  webSearch: { provider: 'tavily', status: 'not-configured' },
  priceCheck: { status: 'unavailable', items: [] },
}

describe('AI response metadata validation', () => {
  it('accepts the existing response contract without optional provider fields', () => {
    expect(parseResearchResult(response)).toEqual(response)
  })
  it.each([
    { provider: 'unknown' },
    { model: {} },
    { photoIncluded: 'yes' },
    { provider: 'openai', searchSuggestionsHtml: '<div>Not a Google entrypoint</div>' },
    { provider: 'gemini', searchSuggestionsHtml: 'x'.repeat(32001) },
  ])('rejects malformed or incompatible metadata', (patch) => {
    expect(() => parseResearchResult({ ...response, ...patch })).toThrow()
  })
  it('accepts bounded Gemini attribution for sandboxed rendering', () => {
    expect(
      parseResearchResult({
        ...response,
        provider: 'gemini',
        model: 'test-model',
        photoIncluded: false,
        searchSuggestionsHtml: '<div>Google Search</div>',
      }).provider,
    ).toBe('gemini')
  })

  it('accepts Groq guidance that explicitly has no web check and no verified prices', () => {
    expect(parseResearchResult(modelOnly)).toEqual(modelOnly)
    expect(
      parseResearchResult({
        ...modelOnly,
        webSearch: { provider: 'tavily', status: 'unavailable' },
      }).evidence,
    ).toBe('model-only')
  })

  it.each([
    { provider: 'gemini' },
    { provider: 'openai' },
    { provider: undefined },
    { evidence: undefined },
    { evidence: 'web' },
    { evidence: 'trusted' },
    { priceCheck: undefined },
    { priceCheck: { status: 'checked', items: [] } },
    { priceCheck: { status: 'unavailable', items: [{ low: 500, high: 1500 }] } },
    { citations: response.citations },
    { searchSuggestionsHtml: '<div>Unverified attribution</div>' },
    { webSearch: { provider: 'tavily', status: 'used' } },
  ])('cannot use model-only metadata to bypass web evidence or invent prices: %j', (patch) => {
    expect(() => parseResearchResult({ ...modelOnly, ...patch })).toThrow()
  })

  it('accepts Groq web research with actual citations', () => {
    const sourced = {
      ...response,
      provider: 'groq',
      evidence: 'web',
      webSearch: { provider: 'tavily', status: 'used' },
    }
    expect(parseResearchResult(sourced)).toEqual(sourced)
    expect(() => parseResearchResult({ ...sourced, citations: [] })).toThrow()
    expect(() =>
      parseResearchResult({
        ...sourced,
        citations: [{ ...response.citations[0], url: 'javascript:alert(1)' }],
      }),
    ).toThrow()
  })

  it.each([
    null,
    { provider: 'unknown', status: 'used' },
    { provider: 'tavily', status: 'unknown' },
    { provider: 'tavily', status: 'not-configured' },
    { provider: 'tavily', status: 'unavailable' },
  ])('rejects inconsistent web search metadata on a web-checked answer: %j', (webSearch) => {
    expect(() =>
      parseResearchResult({ ...response, provider: 'groq', evidence: 'web', webSearch }),
    ).toThrow()
  })

  it('does not attribute Tavily research to another provider', () => {
    expect(() =>
      parseResearchResult({
        ...response,
        provider: 'gemini',
        webSearch: { provider: 'tavily', status: 'used' },
      }),
    ).toThrow()
  })
})
