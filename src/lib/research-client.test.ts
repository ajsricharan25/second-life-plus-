import { describe, expect, it } from 'vitest'
import { parseResearchResult } from './research-client'

const response = {
  status: 'ok',
  text: 'A sourced answer [1]',
  checkedAt: '2026-10-21T00:00:00Z',
  citations: [{ start: 17, end: 20, title: 'Source', url: 'https://example.com/manual' }],
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
})
