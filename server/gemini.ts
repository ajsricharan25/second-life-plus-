import type { ResearchCitation, ResearchResult } from '../src/lib/research-types.ts'
import { safeSourceUrl } from './source-url.ts'
import { aiError } from './research-error.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidate(value: unknown) {
  if (!record(value)) throw new Error('Invalid Gemini result')
  if (
    record(value.promptFeedback) &&
    typeof value.promptFeedback.blockReason === 'string' &&
    value.promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED'
  )
    throw aiError('response_blocked')
  if (!Array.isArray(value.candidates)) throw new Error('Invalid Gemini result')
  const item = value.candidates[0]
  if (record(item) && item.finishReason === 'MAX_TOKENS') throw aiError('incomplete_answer')
  if (
    record(item) &&
    ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'].includes(
      String(item.finishReason),
    )
  )
    throw aiError('response_blocked')
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
    !Array.isArray(grounding.groundingSupports)
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
    // Prefer documented UTF-8 byte offsets. Allow character offsets only when
    // segment.text exactly confirms the cited span.
    const bytes = Buffer.from(part.text, 'utf8')
    if (end > bytes.length) throw new Error('Grounding segment outside answer')
    const prefix = bytes.subarray(0, end).toString('utf8')
    const quote = bytes.subarray(start, end).toString('utf8')
    let position: number | undefined
    if (
      Buffer.byteLength(bytes.subarray(0, start).toString('utf8')) === start &&
      Buffer.byteLength(prefix) === end &&
      (typeof segment.text !== 'string' || segment.text === quote)
    ) {
      position = part.offset + prefix.length
    } else if (typeof segment.text === 'string' && segment.text.trim()) {
      if (part.text.slice(start, end) === segment.text) position = part.offset + end
      else {
        const characters = Array.from(part.text)
        if (characters.slice(start, end).join('') === segment.text)
          position = part.offset + characters.slice(0, end).join('').length
      }
    }
    if (position === undefined) throw new Error('Invalid grounding text')
    for (const index of support.groundingChunkIndices) {
      if (typeof index !== 'number' || !Number.isInteger(index)) continue
      const chunk = grounding.groundingChunks[index]
      if (!record(chunk) || !record(chunk.web)) continue
      const url = safeSourceUrl(chunk.web.uri)
      if (!url) continue
      const title =
        typeof chunk.web.title === 'string' && chunk.web.title.trim()
          ? chunk.web.title.trim()
          : new URL(url).hostname
      if (title.length > 500) continue
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
