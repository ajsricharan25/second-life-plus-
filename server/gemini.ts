import type { ResearchCitation, ResearchResult } from '../src/lib/research-types.ts'
import { safeSourceUrl } from './source-url.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidate(value: unknown) {
  if (!record(value) || !Array.isArray(value.candidates)) throw new Error('Invalid Gemini result')
  const item = value.candidates[0]
  if (
    !record(item) ||
    item.finishReason !== 'STOP' ||
    !record(item.content) ||
    !Array.isArray(item.content.parts)
  ) {
    throw new Error('Incomplete Gemini result')
  }
  return { item, parts: item.content.parts }
}

export function extractGeminiJson(value: unknown): unknown {
  const { parts } = candidate(value)
  const text = parts
    .filter((part) => record(part) && part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
  if (!text || text.length > 12_000) throw new Error('Invalid Gemini extraction')
  return JSON.parse(text) as unknown
}

export function extractGeminiResearch(value: unknown, checkedAt: string): ResearchResult {
  const { item, parts } = candidate(value)
  const grounding = item.groundingMetadata
  if (
    !record(grounding) ||
    !Array.isArray(grounding.groundingChunks) ||
    !Array.isArray(grounding.groundingSupports) ||
    !Array.isArray(grounding.webSearchQueries) ||
    !grounding.webSearchQueries.some((query) => typeof query === 'string' && query.trim())
  ) {
    throw new Error('Gemini did not return search evidence')
  }
  const offsets = new Map<number, { text: string; offset: number }>()
  let original = ''
  parts.forEach((part, index) => {
    if (!record(part) || part.thought === true || typeof part.text !== 'string') return
    if (original) original += '\n\n'
    offsets.set(index, { text: part.text, offset: original.length })
    original += part.text
  })
  if (!original.trim() || original.length > 16_000) throw new Error('Invalid Gemini answer')
  const insertions: { position: number; url: string; title: string }[] = []
  for (const support of grounding.groundingSupports) {
    if (
      !record(support) ||
      !record(support.segment) ||
      !Array.isArray(support.groundingChunkIndices)
    )
      continue
    const segment = support.segment
    const part = offsets.get(typeof segment.partIndex === 'number' ? segment.partIndex : 0)
    const start = segment.startIndex ?? 0
    const end = segment.endIndex
    if (
      !part ||
      typeof start !== 'number' ||
      !Number.isInteger(start) ||
      start < 0 ||
      typeof end !== 'number' ||
      !Number.isInteger(end) ||
      end <= start
    )
      throw new Error('Invalid grounding segment')
    // Gemini's documented offsets are UTF-8 bytes; the browser uses UTF-16 positions.
    const bytes = Buffer.from(part.text, 'utf8')
    if (end > bytes.length) throw new Error('Grounding segment outside answer')
    const prefix = bytes.subarray(0, end).toString('utf8')
    const quote = bytes.subarray(start, end).toString('utf8')
    if (
      Buffer.byteLength(bytes.subarray(0, start).toString('utf8')) !== start ||
      Buffer.byteLength(prefix) !== end ||
      (typeof segment.text === 'string' && segment.text !== quote)
    )
      throw new Error('Invalid grounding text')
    for (const index of support.groundingChunkIndices) {
      if (typeof index !== 'number' || !Number.isInteger(index)) continue
      const chunk = grounding.groundingChunks[index]
      if (!record(chunk) || !record(chunk.web)) continue
      const url = safeSourceUrl(chunk.web.uri)
      const title = chunk.web.title
      if (!url || typeof title !== 'string' || !title.trim() || title.length > 500) continue
      const position = part.offset + prefix.length
      if (!insertions.some((entry) => entry.position === position && entry.url === url)) {
        insertions.push({ position, url, title })
      }
      if (insertions.length > 40) throw new Error('Too many grounding citations')
    }
  }
  if (!insertions.length) throw new Error('No usable Gemini citations')
  insertions.sort((left, right) => left.position - right.position)
  let text = ''
  let cursor = 0
  const citations: ResearchCitation[] = []
  for (const insertion of insertions) {
    text += original.slice(cursor, insertion.position) + ' '
    const start = text.length
    text += `[${citations.length + 1}]`
    citations.push({ start, end: text.length, url: insertion.url, title: insertion.title })
    cursor = insertion.position
  }
  text += original.slice(cursor)
  const entryPoint = grounding.searchEntryPoint
  const html = record(entryPoint) ? entryPoint.renderedContent : undefined
  return {
    status: 'ok',
    text,
    citations,
    checkedAt,
    ...(typeof html === 'string' && html.length <= 32_000 ? { searchSuggestionsHtml: html } : {}),
  }
}
