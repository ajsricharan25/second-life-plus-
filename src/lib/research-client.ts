import type { ResearchResult } from './research-types'
import { buildShopMapsUrl } from './service-search'

export function parseResearchResult(value: unknown): ResearchResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid research response')
  const data = value as Partial<ResearchResult>
  const modelOnly = data.evidence === 'model-only'
  if (
    data.status !== 'ok' ||
    typeof data.text !== 'string' ||
    !data.text.trim() ||
    data.text.length > 50_000 ||
    typeof data.checkedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.citations) ||
    (!modelOnly && data.citations.length === 0) ||
    data.citations.length > 50
  )
    throw new Error('Invalid research response')
  if (
    (data.provider !== undefined && !['openai', 'gemini', 'groq'].includes(data.provider)) ||
    (data.evidence !== undefined && !['web', 'model-only'].includes(data.evidence)) ||
    (data.model !== undefined && (typeof data.model !== 'string' || data.model.length > 100)) ||
    (data.photoIncluded !== undefined && typeof data.photoIncluded !== 'boolean') ||
    (data.searchSuggestionsHtml !== undefined &&
      (data.provider !== 'gemini' ||
        typeof data.searchSuggestionsHtml !== 'string' ||
        data.searchSuggestionsHtml.length > 32_000))
  )
    throw new Error('Invalid provider metadata')
  if (
    modelOnly &&
    (!data.provider ||
      data.citations.length !== 0 ||
      data.priceCheck?.status !== 'unavailable' ||
      !Array.isArray(data.priceCheck.items) ||
      data.priceCheck.items.length !== 0)
  )
    throw new Error('Model-only guidance cannot contain verified sources or prices')
  if (
    data.webSearch !== undefined &&
    (!data.webSearch ||
      !data.provider ||
      data.webSearch.provider !== 'tavily' ||
      !['used', 'not-configured', 'unavailable'].includes(data.webSearch.status) ||
      (modelOnly ? data.webSearch.status === 'used' : data.webSearch.status !== 'used'))
  )
    throw new Error('Invalid web search metadata')
  if (
    data.repairService !== undefined &&
    (typeof data.repairService !== 'string' ||
      data.repairService.length < 3 ||
      data.repairService.length > 100 ||
      /[\u0000-\u001f<>]/u.test(data.repairService))
  )
    throw new Error('Invalid service suggestion')
  const hasSource = (item: { sourceUrl: string; sourceTitle: string }) =>
    data.citations!.some(
      (citation) => citation.url === item.sourceUrl && citation.title === item.sourceTitle,
    )
  if (data.shops !== undefined) {
    if (!Array.isArray(data.shops) || data.shops.length > 4 || (modelOnly && data.shops.length > 0))
      throw new Error('Invalid shop evidence')
    for (const shop of data.shops) {
      if (
        !shop ||
        typeof shop.name !== 'string' ||
        shop.name.length < 3 ||
        shop.name.length > 120 ||
        typeof shop.address !== 'string' ||
        shop.address.length < 8 ||
        shop.address.length > 240 ||
        !hasSource(shop) ||
        !data.text.includes(shop.name) ||
        !data.text.includes(shop.address)
      )
        throw new Error('Invalid shop listing')
      buildShopMapsUrl(shop.name, shop.address)
    }
  }
  if (data.materials !== undefined) {
    if (
      !Array.isArray(data.materials) ||
      data.materials.length > 6 ||
      (modelOnly && data.materials.length > 0)
    )
      throw new Error('Invalid material evidence')
    for (const material of data.materials)
      if (
        !material ||
        typeof material.name !== 'string' ||
        material.name.length < 2 ||
        material.name.length > 60 ||
        typeof material.excerpt !== 'string' ||
        material.excerpt.length > 700 ||
        !data.text.includes(material.excerpt) ||
        !['INR', 'USD'].includes(material.currency) ||
        !hasSource(material) ||
        [material.weightKg, material.ratePerKg].some(
          (value) =>
            value !== null &&
            (typeof value !== 'number' ||
              !Number.isFinite(value) ||
              value <= 0 ||
              value > 100000000),
        )
      )
        throw new Error('Invalid material details')
  }
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
