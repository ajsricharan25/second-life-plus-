import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { ResearchRequest } from '../src/lib/research-types'
import { createResearchHandler, extractResearchResult, parseResearchRequest } from './research'

const input: ResearchRequest = {
  appliance: 'washing-machine',
  age: 4,
  symptoms: 'Not draining',
  currency: 'INR',
  brandModel: 'Example washer 100',
  location: 'Bengaluru',
  service: 'washing machine drain pump repair',
}

function citedPart(text = 'Check the external hose. [1]', url = 'https://www.example.com/service') {
  return {
    type: 'output_text',
    text,
    annotations: [
      {
        type: 'url_citation',
        start_index: text.indexOf('[1]'),
        end_index: text.indexOf('[1]') + 3,
        url,
        title: 'Manufacturer service guide',
      },
    ],
  }
}

function providerResult(parts = [citedPart()]) {
  return {
    status: 'completed',
    output: [
      { type: 'web_search_call', status: 'completed' },
      { type: 'message', role: 'assistant', status: 'completed', content: parts },
    ],
  }
}

type HttpOptions = {
  method?: string
  headers?: Record<string, string>
  raw?: string
  preParsed?: unknown
  remoteAddress?: string
}

async function callHandler(
  handler: ReturnType<typeof createResearchHandler>,
  options: HttpOptions = {},
) {
  const request = Readable.from(
    options.raw === undefined ? [] : [options.raw],
  ) as IncomingMessage & { body?: unknown }
  request.method = options.method ?? 'POST'
  request.headers = {
    host: 'localhost:5173',
    'content-type': 'application/json',
    ...options.headers,
  }
  Object.defineProperty(request, 'socket', {
    value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
  })
  if (options.raw === undefined)
    request.body = options.preParsed === undefined ? input : options.preParsed
  const headers: Record<string, string | number> = {}
  let body = ''
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader(name: string, value: string | number) {
      headers[name.toLowerCase()] = value
    },
    end(value: string) {
      body = value
    },
  }) as unknown as ServerResponse
  await handler(request, response)
  return {
    status: response.statusCode,
    headers,
    body: JSON.parse(body) as Record<string, unknown>,
    rawBody: body,
  }
}

function successfulFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, options) =>
    Response.json(
      JSON.parse(options!.body as string).text
        ? {
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: '{"items":[]}' }],
              },
            ],
          }
        : providerResult(),
    ),
  )
}

describe('research input validation', () => {
  it('keeps only bounded, supported research fields', () => {
    expect(
      parseResearchRequest({ ...input, location: ' Bengaluru ', arbitraryField: 'ignored' }),
    ).toEqual(input)
  })

  it.each([
    null,
    [],
    { ...input, appliance: '__proto__' },
    { ...input, age: '4' },
    { ...input, currency: 'EUR' },
    { ...input, symptoms: '' },
    { ...input, symptoms: 'x'.repeat(2001) },
    { ...input, brandModel: 'x'.repeat(121) },
    { ...input, location: 'x'.repeat(121) },
    { ...input, service: 'x'.repeat(121) },
  ])('rejects invalid research input: %j', (value) => {
    expect(() => parseResearchRequest(value)).toThrow()
  })
})

describe('source-backed research output', () => {
  it('preserves source offsets across separate output text blocks', () => {
    const first = citedPart('The manual gives a check. [1]')
    const second = citedPart(
      'Published labor is not listed. [1]',
      'https://repairs.example.com/prices',
    )
    const result = extractResearchResult(
      providerResult([first, second]),
      '2026-10-20T00:00:00.000Z',
    )
    expect(result.text).toBe(`${first.text}\n\n${second.text}`)
    expect(result.citations[0].start).toBe(first.text.indexOf('[1]'))
    expect(result.citations[1].start).toBe(first.text.length + 2 + second.text.indexOf('[1]'))
    expect(result.citations[1].url).toBe('https://repairs.example.com/prices')
    expect(result.checkedAt).toBe('2026-10-20T00:00:00.000Z')
  })

  it.each([
    'http://www.example.com/service',
    'javascript:alert(1)',
    'https://localhost/service',
    'https://127.0.0.1/service',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/service',
    'https://service.internal/details',
    'https://user:secret@example.com/service',
    'https://example.com:444/service',
  ])('does not return unsafe source link %s', (url) => {
    expect(() => extractResearchResult(providerResult([citedPart(undefined, url)]), '')).toThrow()
  })

  it('requires a completed search and completed response', () => {
    const noSearch = providerResult()
    noSearch.output.shift()
    expect(() => extractResearchResult(noSearch, '')).toThrow()
    expect(() => extractResearchResult({ ...providerResult(), status: 'incomplete' }, '')).toThrow()
  })

  it('requires citations rather than trusting plausible model text', () => {
    const part = citedPart()
    part.annotations = []
    expect(() => extractResearchResult(providerResult([part]), '')).toThrow()
  })

  it.each([
    { start_index: -1 },
    { start_index: 1.5 },
    { end_index: 99999 },
    { end_index: 0 },
    { title: '' },
  ])('rejects invalid citation metadata: %j', (patch) => {
    const part = citedPart()
    Object.assign(part.annotations[0], patch)
    expect(() => extractResearchResult(providerResult([part]), '')).toThrow()
  })

  it('rejects overlapping citation spans', () => {
    const part = citedPart()
    part.annotations.push({ ...part.annotations[0] })
    expect(() => extractResearchResult(providerResult([part]), '')).toThrow()
  })
})

describe('research HTTP handler', () => {
  it('reports unavailable configuration without making an API call', async () => {
    const fetcher = successfulFetch()
    const result = await callHandler(createResearchHandler({ env: {}, fetcher }))
    expect(result.status).toBe(503)
    expect(result.body.error).toMatchObject({ code: 'not_configured' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('runs web research followed by a tool-free price extraction', async () => {
    const fetcher = successfulFetch()
    const handler = createResearchHandler({
      env: { REPAIR_AI_API_KEY: 'test-key' },
      fetcher,
      now: () => 0,
    })
    const result = await callHandler(handler, {
      raw: JSON.stringify(input),
      headers: { origin: 'http://localhost:5173' },
    })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ status: 'ok', checkedAt: '1970-01-01T00:00:00.000Z' })
    expect(result.headers['cache-control']).toBe('no-store')
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const sent = JSON.parse(options!.body as string)
    expect(sent).toMatchObject({
      model: 'gpt-4.1',
      store: false,
      max_output_tokens: 3000,
      tool_choice: 'required',
      parallel_tool_calls: false,
    })
    expect(sent.tools).toEqual([
      {
        type: 'web_search',
        external_web_access: true,
        search_context_size: 'low',
        user_location: { type: 'approximate', city: 'Bengaluru' },
      },
    ])
    expect(sent.input).toContain('Bengaluru')
    expect(sent.input).not.toContain('test-key')
    expect(result.rawBody).not.toContain('test-key')
    expect(result.body.priceCheck).toEqual({ status: 'checked', items: [] })
    const extraction = JSON.parse(fetcher.mock.calls[1][1]!.body as string)
    expect(extraction.text.format.type).toBe('json_schema')
    expect(extraction.tools).toBeUndefined()
    expect(extraction.store).toBe(false)
  })

  it('researches without a city without inventing a local search area', async () => {
    const fetcher = successfulFetch()
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
      { preParsed: { ...input, location: '' } },
    )
    expect(result.status).toBe(200)
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).tools[0]).not.toHaveProperty(
      'user_location',
    )
  })

  it('keeps the cited answer when price extraction is unavailable', async () => {
    const fetcher = successfulFetch()
      .mockResolvedValueOnce(Response.json(providerResult()))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(200)
    expect(result.body.priceCheck).toEqual({ status: 'unavailable', items: [] })
    expect(result.body.text).toContain('external hose')
  })

  it('returns the sourced component price without a fabricated total', async () => {
    const excerpt = 'Example washer 100 spare part: ₹500, parts-only, excluding labour.'
    const extraction = {
      items: [
        {
          kind: 'part',
          low: 500,
          high: 500,
          currency: 'INR',
          modelMatch: 'exact',
          excerpt,
          citationIndex: 0,
        },
      ],
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(providerResult([citedPart(`${excerpt} [1]`)])))
      .mockResolvedValueOnce(
        Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify(extraction) }],
            },
          ],
        }),
      )
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.body.priceCheck).toMatchObject({
      status: 'checked',
      items: [{ kind: 'part', low: 500, high: 500 }],
    })
  })

  it('can reuse an existing server key and configurable model', async () => {
    const fetcher = successfulFetch()
    const handler = createResearchHandler({
      env: { OPENAI_API_KEY: 'existing-test-key', REPAIR_AI_MODEL: 'configured-model' },
      fetcher,
    })
    await callHandler(handler)
    const options = fetcher.mock.calls[0][1]!
    expect(options.headers).toMatchObject({ Authorization: 'Bearer existing-test-key' })
    expect(JSON.parse(options.body as string).model).toBe('configured-model')
  })

  it.each(['https://another-site.example', 'null', 'not a url'])(
    'rejects cross-origin or invalid browser Origin %s',
    async (origin) => {
      const fetcher = successfulFetch()
      const result = await callHandler(
        createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
        { headers: { origin } },
      )
      expect(result.status).toBe(403)
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('accepts the matching deployed HTTPS origin', async () => {
    const result = await callHandler(createResearchHandler({ env: {} }), {
      headers: { host: 'second-life.vercel.app', origin: 'https://second-life.vercel.app' },
    })
    expect(result.status).toBe(503)
    expect(result.body.error).toMatchObject({ code: 'not_configured' })
  })

  it('rejects unsupported methods and media types', async () => {
    const handler = createResearchHandler({ env: {} })
    const get = await callHandler(handler, { method: 'GET' })
    expect(get.status).toBe(405)
    expect(get.headers.allow).toBe('POST')
    const text = await callHandler(handler, { headers: { 'content-type': 'text/plain' } })
    expect(text.status).toBe(415)
  })

  it('rejects malformed JSON', async () => {
    const result = await callHandler(createResearchHandler({ env: {} }), { raw: '{bad json' })
    expect(result.status).toBe(400)
  })

  it.each([
    { raw: 'x'.repeat(1500001) },
    { preParsed: { ...input, symptoms: 'x'.repeat(1500001) } },
    { headers: { 'content-length': '1500001' } },
  ])('rejects oversized requests before calling the provider', async (options) => {
    const fetcher = successfulFetch()
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
      options,
    )
    expect(result.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not relay provider errors or credentials to clients', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('internal details and credentials', { status: 401 }))
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(502)
    expect(result.body.error).toMatchObject({ code: 'provider_unavailable' })
    expect(result.rawBody).not.toContain('internal details')
    expect(result.rawBody).not.toContain('test-key')
  })

  it('handles provider network failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider network failed'))
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(502)
    expect(result.body.error).toMatchObject({ code: 'provider_unavailable' })
  })

  it('does not return uncited or incomplete provider answers as web evidence', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'completed', output: [] }))
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(502)
    expect(result.body.error).toMatchObject({ code: 'unverified_sources' })
  })

  it('limits the size of provider output', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(600000)))
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(502)
    expect(result.body.error).toMatchObject({ code: 'unverified_sources' })
  })

  it('aborts a stalled provider request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const result = await callHandler(
      createResearchHandler({ env: { REPAIR_AI_API_KEY: 'test-key' }, fetcher, timeoutMs: 10 }),
    )
    expect(result.status).toBe(504)
    expect(result.body.error).toMatchObject({ code: 'research_timeout' })
  })

  it('applies and expires the process-local burst limit', async () => {
    let timestamp = 1000
    const fetcher = successfulFetch()
    const handler = createResearchHandler({
      env: { REPAIR_AI_API_KEY: 'test-key' },
      fetcher,
      now: () => timestamp,
      rateLimit: { requests: 1, windowMs: 60_000 },
    })
    expect((await callHandler(handler)).status).toBe(200)
    const limited = await callHandler(handler)
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBe(60)
    expect(fetcher).toHaveBeenCalledTimes(2)
    timestamp += 60_000
    expect((await callHandler(handler)).status).toBe(200)
  })
})

const testPhoto = {
  mimeType: 'image/png' as const,
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6S8AAAAASUVORK5CYII=',
}

function geminiProviderResult() {
  const text = 'Example washer 100 spare part: ₹500, parts-only, excluding labour.'
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text }] },
        groundingMetadata: {
          webSearchQueries: ['washer spare part price'],
          groundingChunks: [
            { web: { uri: 'https://example.com/prices', title: 'Parts catalogue' } },
          ],
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

function successfulGeminiFetch() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(geminiProviderResult()))
    .mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      {
                        kind: 'part',
                        low: 500,
                        high: 500,
                        currency: 'INR',
                        modelMatch: 'exact',
                        excerpt: geminiProviderResult().candidates[0].content.parts[0].text,
                        citationIndex: 0,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    )
}

describe('AI providers and optional photos', () => {
  it('automatically selects Gemini when only its server key is configured', async () => {
    const fetcher = successfulGeminiFetch()
    const result = await callHandler(
      createResearchHandler({ env: { GEMINI_API_KEY: 'gemini-test-key' }, fetcher }),
      { preParsed: { ...input, image: testPhoto, replacementCost: 25000 } },
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      provider: 'gemini',
      photoIncluded: true,
      priceCheck: {
        status: 'checked',
        items: [{ kind: 'part', low: 500, high: 500, modelMatch: 'exact' }],
      },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    )
    expect(options!.headers).toMatchObject({ 'x-goog-api-key': 'gemini-test-key' })
    expect(options!.headers).not.toHaveProperty('Authorization')
    const first = JSON.parse(options!.body as string)
    expect(first.tools).toEqual([{ googleSearch: {} }])
    expect(first.contents[0].parts[1]).toEqual({ inlineData: testPhoto })
    expect(first.contents[0].parts[0].text).toContain('25000')
    expect(first.contents[0].parts[0].text).not.toContain(testPhoto.data)
    const extraction = JSON.parse(fetcher.mock.calls[1][1]!.body as string)
    expect(extraction.tools).toBeUndefined()
    expect(extraction.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
    })
    expect(JSON.stringify(extraction)).not.toContain(testPhoto.data)
    expect(result.rawBody).not.toContain('gemini-test-key')
    expect(result.rawBody).not.toContain(testPhoto.data)
  })

  it('supports OpenAI image input only on the assessment call', async () => {
    const fetcher = successfulFetch()
    const result = await callHandler(
      createResearchHandler({ env: { OPENAI_API_KEY: 'test-key' }, fetcher }),
      { preParsed: { ...input, image: testPhoto } },
    )
    expect(result.body).toMatchObject({ provider: 'openai', photoIncluded: true })
    const sent = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(sent.input[0].content[1]).toMatchObject({
      type: 'input_image',
      image_url: `data:image/png;base64,${testPhoto.data}`,
    })
    expect(fetcher.mock.calls[1][1]!.body).not.toContain(testPhoto.data)
  })

  it('respects the explicitly selected provider and model when both keys exist', async () => {
    const fetcher = successfulGeminiFetch()
    await callHandler(
      createResearchHandler({
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          GEMINI_API_KEY: 'gemini-test-key',
          REPAIR_AI_PROVIDER: 'gemini',
          GEMINI_MODEL: 'custom-gemini-model',
        },
        fetcher,
      }),
    )
    expect(fetcher.mock.calls[0][0]).toContain('/custom-gemini-model:generateContent')
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(body.contents[0].parts).toHaveLength(1)
  })

  it('does not send data to another provider after failure or missing selected credentials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('provider-secret', { status: 503 }))
    const result = await callHandler(
      createResearchHandler({
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          GEMINI_API_KEY: 'gemini-test-key',
          REPAIR_AI_PROVIDER: 'gemini',
        },
        fetcher,
      }),
    )
    expect(result.status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.rawBody).not.toContain('provider-secret')
    fetcher.mockClear()
    const missing = await callHandler(
      createResearchHandler({
        env: { OPENAI_API_KEY: 'openai-test-key', REPAIR_AI_PROVIDER: 'gemini' },
        fetcher,
      }),
    )
    expect(missing.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { REPAIR_AI_PROVIDER: 'other' },
    { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: '../bad-model' },
  ])('rejects invalid provider configuration', async (env) => {
    const fetcher = successfulFetch()
    const result = await callHandler(createResearchHandler({ env, fetcher }))
    expect(result.status).toBe(503)
    expect(result.body.error).toMatchObject({ code: 'configuration_error' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps the Gemini assessment if structured extraction fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(geminiProviderResult()))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }))
    const result = await callHandler(
      createResearchHandler({ env: { GEMINI_API_KEY: 'test-key' }, fetcher }),
    )
    expect(result.status).toBe(200)
    expect(result.body.priceCheck).toEqual({ status: 'unavailable', items: [] })
    expect(result.body.text).toContain('₹500')
  })

  it.each([
    { mimeType: 'image/svg+xml', data: testPhoto.data },
    { mimeType: 'image/jpeg', data: testPhoto.data },
    { mimeType: 'image/png', data: 'not base64' },
    { mimeType: 'image/png', data: Buffer.from('not an image').toString('base64') },
    { mimeType: 'image/png', data: `${testPhoto.data}AAAA` },
    {
      mimeType: 'image/png',
      data: Buffer.concat([
        Buffer.from(testPhoto.data, 'base64'),
        Buffer.alloc(1024 * 1024),
      ]).toString('base64'),
    },
  ])(
    'rejects unsupported, malformed, or oversized image input before calling a provider',
    async (image) => {
      const fetcher = successfulFetch()
      const result = await callHandler(
        createResearchHandler({ env: { OPENAI_API_KEY: 'test-key' }, fetcher }),
        { preParsed: { ...input, image } },
      )
      expect(result.status).toBe(400)
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
})
