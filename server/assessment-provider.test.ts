import { describe, expect, it, vi } from 'vitest'
import { assessmentCall, normalizeAssessmentCompletion } from './assessment-provider'
import { runGroqAssessment } from './groq'
import { parseResearchRequest } from './research'
import { parseResearchResult } from '../src/lib/research-client'
import type { ResearchProvider, ResearchRequest } from '../src/lib/research-types'

const input: ResearchRequest = {
  task: 'assessment',
  appliance: 'washing-machine',
  age: 4,
  brandModel: 'Example Washer 100',
  symptoms: 'Not draining',
  currency: 'INR',
  location: 'Chennai',
  service: 'washer pump repair',
}
const data = {
  sections: [
    {
      heading: 'Summary',
      text: 'A blocked external drain path may explain the symptoms. Check for a kink without opening the cabinet.',
      sourceIds: [],
    },
    {
      heading: 'Recycling plan',
      text: 'Ask an authorized recycler to assess the actual material composition. No mass has been measured.',
      sourceIds: [],
    },
  ],
  prices: [],
  materials: [],
  shops: [],
  repairService: 'washing machine drain pump repair',
}
const completion = (provider: ResearchProvider) =>
  provider === 'groq'
    ? {
        choices: [
          { finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(data) } },
        ],
      }
    : provider === 'gemini'
      ? {
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } },
          ],
        }
      : {
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify(data) }],
            },
          ],
        }

describe('unified provider workflow', () => {
  it.each(['groq', 'gemini', 'openai'] as const)(
    'uses one %s call for an API-only report with no canned costs or weights',
    async (provider) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(completion(provider)))
      const result = await runGroqAssessment({
        input,
        provider,
        model:
          provider === 'groq'
            ? 'qwen/qwen3.8-27b'
            : provider === 'gemini'
              ? 'gemini-flash-latest'
              : 'gpt-4.1',
        apiKey: 'fixture-key',
        fetcher,
        signal: new AbortController().signal,
        checkedAt: '2026-10-27T00:00:00Z',
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        provider,
        evidence: 'model-only',
        shops: [],
        materials: [],
        repairService: data.repairService,
        priceCheck: { status: 'unavailable', items: [] },
      })
      expect(result.text).toContain('No preset weights')
      expect(result.text).not.toMatch(/₹|\b\d+\s*kg/)
      expect(parseResearchResult(result)).toEqual(result)
    },
  )
  it('bounds main research to three basic search calls and one model call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes('tavily')
          ? Response.json({ results: [] })
          : Response.json(completion('groq')),
      )
    await runGroqAssessment({
      input,
      model: 'qwen/qwen3.8-27b',
      apiKey: 'fixture-key',
      tavilyApiKey: 'fixture-search',
      fetcher,
      signal: new AbortController().signal,
      checkedAt: '2026-10-27T00:00:00Z',
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
    const searches = fetcher.mock.calls
      .filter((call) => String(call[0]).includes('tavily'))
      .map((call) => JSON.parse(call[1]!.body as string))
    expect(
      searches.every(
        (call) =>
          call.search_depth === 'basic' &&
          call.auto_parameters === false &&
          call.include_raw_content === false,
      ),
    ).toBe(true)
    expect(searches.map((call) => call.query).join(' ')).toMatch(/material composition/)
    expect(searches.map((call) => call.query).join(' ')).toMatch(/shop address Chennai/)
  })
  it.each(['follow-up', 'comparison', 'quote-review', 'repair-brief'] as const)(
    'passes %s context to the API without retries or preset assessment data',
    async (task) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          String(url).includes('tavily')
            ? Response.json({ results: [] })
            : Response.json(completion('groq')),
        )
      await runGroqAssessment({
        input: {
          ...input,
          task,
          question: 'The hose is clear. The quote is INR 900 for labour.',
          previousAssessment: 'Earlier AI hypotheses remain unconfirmed.',
        },
        model: 'qwen/qwen3.8-27b',
        apiKey: 'fixture-key',
        tavilyApiKey: 'fixture-search',
        fetcher,
        signal: new AbortController().signal,
        checkedAt: '2026-10-27T00:00:00Z',
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).query).toContain(
        'The hose is clear',
      )
      const body = JSON.parse(fetcher.mock.calls[1][1]!.body as string)
      const prompt = JSON.parse(body.messages[1].content)
      expect(prompt.details).toMatchObject({
        task,
        question: 'The hose is clear. The quote is INR 900 for labour.',
      })
      expect(prompt).not.toHaveProperty('checklistHypothesis')
      expect(body.messages[0].content).toContain('untrusted data')
    },
  )
  it.each(['groq', 'gemini', 'openai'] as const)(
    'uses %s native JSON and photo input without sending the key in the prompt',
    (provider) => {
      const call = assessmentCall(
        provider,
        'test-model',
        'fixture-secret',
        'JSON instructions',
        'Device details',
        { ...input, image: { mimeType: 'image/png', data: 'fixture-photo' } },
      )
      expect(JSON.stringify(call.body)).toContain('fixture-photo')
      expect(JSON.stringify(call.body)).not.toContain('fixture-secret')
      if (provider === 'gemini') expect(call.headers['x-goog-api-key']).toBe('fixture-secret')
      else expect(call.headers.Authorization).toBe('Bearer fixture-secret')
    },
  )
  it.each([
    ['gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }],
    ['gemini', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['openai', { status: 'incomplete', output: [] }],
    [
      'openai',
      {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal' }],
          },
        ],
      },
    ],
  ] as const)('rejects incomplete or blocked %s output', (provider, output) => {
    expect(() => normalizeAssessmentCompletion(output, provider)).toThrow()
  })
  it.each([
    { task: 'unsupported' },
    { task: 'follow-up' },
    { task: 'quote-review', previousAssessment: 'Prior answer' },
    { task: 'comparison', previousAssessment: 'x'.repeat(12001) },
    { task: 'follow-up', previousAssessment: 'Prior answer', question: 'x'.repeat(1201) },
  ])('rejects invalid action context before any provider call: %j', (patch) => {
    expect(() => parseResearchRequest({ ...input, ...patch })).toThrow()
  })
})
