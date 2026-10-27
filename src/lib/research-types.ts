import type { Currency } from './estimator'
import type { DeviceId } from './device'

export type ResearchProvider = 'openai' | 'gemini' | 'groq'
export type AssessmentTask =
  'assessment' | 'follow-up' | 'comparison' | 'quote-review' | 'repair-brief'

export interface ResearchRequest {
  appliance: DeviceId
  deviceName?: string
  age: number
  symptoms: string
  currency: Currency
  brandModel: string
  location: string
  service: string
  image?: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  replacementCost?: number
  task?: AssessmentTask
  question?: string
  previousAssessment?: string
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
  provider?: ResearchProvider
  evidence?: 'web' | 'model-only'
  webSearch?: {
    provider: 'tavily'
    status: 'used' | 'not-configured' | 'unavailable'
  }
  model?: string
  photoIncluded?: boolean
  repairService?: string
  shops?: ResearchShop[]
  materials?: ResearchMaterial[]
  searchSuggestionsHtml?: string
  priceCheck?: {
    status: 'checked' | 'unavailable'
    items: PublishedPrice[]
  }
}

export interface ResearchShop {
  name: string
  address: string
  sourceUrl: string
  sourceTitle: string
}

export interface ResearchMaterial {
  name: string
  excerpt: string
  weightKg: number | null
  ratePerKg: number | null
  currency: Currency
  sourceUrl: string
  sourceTitle: string
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
