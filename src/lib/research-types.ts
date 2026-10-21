import type { ApplianceId, Currency } from './estimator'

export interface ResearchRequest {
  appliance: ApplianceId
  age: number
  symptoms: string
  currency: Currency
  brandModel: string
  location: string
  service: string
  image?: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  replacementCost?: number
}

export interface ResearchCitation {
  start: number
  end: number
  url: string
  title: string
}

export interface ResearchResult {
  status: 'ok'
  text: string
  citations: ResearchCitation[]
  checkedAt: string
  provider?: 'openai' | 'gemini'
  model?: string
  photoIncluded?: boolean
  searchSuggestionsHtml?: string
  priceCheck?: {
    status: 'checked' | 'unavailable'
    items: PublishedPrice[]
  }
}

export interface PublishedPrice {
  kind: 'part' | 'labor' | 'total-repair' | 'replacement'
  low: number
  high: number
  currency: Currency
  modelMatch: 'exact' | 'general'
  excerpt: string
  sourceUrl: string
  sourceTitle: string
}
