import type { ResearchResult } from './research-types'

export function parseResearchResult(value: unknown): ResearchResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid research response')
  const data = value as Partial<ResearchResult>
  if (
    data.status !== 'ok' ||
    typeof data.text !== 'string' ||
    !data.text.trim() ||
    data.text.length > 50_000 ||
    typeof data.checkedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.citations) ||
    data.citations.length === 0 ||
    data.citations.length > 50
  )
    throw new Error('Invalid research response')
  let previousEnd = 0
  for (const citation of data.citations) {
    if (
      !citation ||
      typeof citation.url !== 'string' ||
      typeof citation.title !== 'string' ||
      !Number.isInteger(citation.start) ||
      !Number.isInteger(citation.end) ||
      citation.start < previousEnd ||
      citation.end <= citation.start ||
      citation.end > data.text.length
    )
      throw new Error('Invalid research citations')
    const url = new URL(citation.url)
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Invalid source URL')
    previousEnd = citation.end
  }
  if (data.priceCheck !== undefined) {
    const check = data.priceCheck
    if (
      !check ||
      !['checked', 'unavailable'].includes(check.status) ||
      !Array.isArray(check.items) ||
      check.items.length > 6 ||
      (check.status === 'unavailable' && check.items.length > 0)
    )
      throw new Error('Invalid price check')
    for (const item of check.items) {
      if (
        !item ||
        !['part', 'labor', 'total-repair', 'replacement'].includes(item.kind) ||
        !['INR', 'USD'].includes(item.currency) ||
        !['exact', 'general'].includes(item.modelMatch) ||
        typeof item.low !== 'number' ||
        !Number.isFinite(item.low) ||
        item.low < 0 ||
        typeof item.high !== 'number' ||
        !Number.isFinite(item.high) ||
        item.high < item.low ||
        item.high > 100_000_000 ||
        typeof item.excerpt !== 'string' ||
        !item.excerpt.trim() ||
        item.excerpt.length > 1000 ||
        !data.text.includes(item.excerpt) ||
        !data.citations.some(
          (citation) => citation.url === item.sourceUrl && citation.title === item.sourceTitle,
        )
      )
        throw new Error('Invalid published price')
    }
  }
  return data as ResearchResult
}
