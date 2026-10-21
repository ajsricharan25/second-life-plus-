import { describe, expect, it } from 'vitest'
import { extractGeminiJson, extractGeminiResearch } from './gemini'
import { parseResearchResult } from '../src/lib/research-client'

const text = 'Summary 🧺\nThe spare part is ₹500, excluding labour.'
const source = { web: { uri: 'https://example.com/part', title: 'Parts catalogue' } }
function fixture() {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text }] },
        groundingMetadata: {
          webSearchQueries: ['washer part price India'],
          groundingChunks: [source],
          groundingSupports: [
            {
              segment: { startIndex: 0, endIndex: Buffer.byteLength(text), text },
              groundingChunkIndices: [0],
            },
          ],
        },
      },
    ],
  }
}

describe('Gemini grounded answer adapter', () => {
  it('converts UTF-8 grounding to browser-safe citations without corrupting rupees or emoji', () => {
    const result = extractGeminiResearch(fixture(), '2026-10-21T00:00:00Z')
    expect(result.text).toBe(`${text} [1]`)
    expect(result.citations).toEqual([
      {
        start: text.length + 1,
        end: text.length + 4,
        url: source.web.uri,
        title: source.web.title,
      },
    ])
    expect(parseResearchResult({ ...result, provider: 'gemini' })).toBeTruthy()
  })

  it('retains multiple sources for a claim and deduplicates repeated supports', () => {
    const value = fixture()
    const grounding = value.candidates[0].groundingMetadata
    grounding.groundingChunks.push({ web: { uri: 'https://example.com/manual', title: 'Manual' } })
    grounding.groundingSupports[0].groundingChunkIndices.push(1)
    grounding.groundingSupports.push(grounding.groundingSupports[0])
    const result = extractGeminiResearch(value, '')
    expect(result.text).toBe(`${text} [1] [2]`)
    expect(result.citations).toHaveLength(2)
  })

  it('uses part-local byte offsets and excludes hidden thoughts', () => {
    const value = fixture()
    const item = value.candidates[0]
    Object.assign(item.content, {
      parts: [{ text: 'hidden reasoning', thought: true }, { text: 'Summary' }, { text }],
    })
    Object.assign(item.groundingMetadata.groundingSupports[0].segment, { partIndex: 2 })
    const result = extractGeminiResearch(value, '')
    expect(result.text).toBe(`Summary\n\n${text} [1]`)
    expect(result.text.slice(result.citations[0].start, result.citations[0].end)).toBe('[1]')
    expect(result.text).not.toContain('hidden reasoning')
  })

  it.each(['MAX_TOKENS', 'SAFETY', ''])(
    'rejects unfinished or blocked result: %s',
    (finishReason) => {
      const value = fixture()
      value.candidates[0].finishReason = finishReason
      expect(() => extractGeminiResearch(value, '')).toThrow()
    },
  )

  it.each([
    { startIndex: -1 },
    { endIndex: 999 },
    { text: 'different claim' },
    { endIndex: Buffer.byteLength('Summary ') + 1 },
    { startIndex: Buffer.byteLength('Summary ') + 1, text: undefined },
  ])('rejects invalid grounding boundaries or mismatched text: %j', (patch) => {
    const value = fixture()
    Object.assign(value.candidates[0].groundingMetadata.groundingSupports[0].segment, patch)
    expect(() => extractGeminiResearch(value, '')).toThrow()
  })

  it.each(['webSearchQueries', 'groundingChunks', 'groundingSupports'] as const)(
    'requires %s',
    (field) => {
      const value = fixture()
      value.candidates[0].groundingMetadata[field] = []
      expect(() => extractGeminiResearch(value, '')).toThrow()
    },
  )

  it('rejects unsafe links and preserves bounded Google Search attribution', () => {
    const value = fixture()
    value.candidates[0].groundingMetadata.groundingChunks = [
      { web: { uri: 'javascript:alert(1)', title: 'Bad source' } },
    ]
    expect(() => extractGeminiResearch(value, '')).toThrow()
    const valid = fixture()
    Object.assign(valid.candidates[0].groundingMetadata, {
      searchEntryPoint: { renderedContent: '<div>Google Search suggestions</div>' },
    })
    expect(extractGeminiResearch(valid, '').searchSuggestionsHtml).toContain(
      'Google Search suggestions',
    )
  })

  it('extracts structured JSON only from completed visible output', () => {
    expect(
      extractGeminiJson({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: 'private', thought: true }, { text: '{"items":[]}' }] },
          },
        ],
      }),
    ).toEqual({ items: [] })
    expect(() => extractGeminiJson(fixture())).toThrow()
    expect(() => extractGeminiJson({ candidates: [] })).toThrow()
  })
})
