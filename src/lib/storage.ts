import { validateDeviceInput, type DeviceInput } from './device'
import { parseResearchResult } from './research-client'
import { extractRepairCoach } from './repair-coach'
import type { ResearchResult, SavedReport } from './research-types'

export interface SavedEstimate {
  id: string
  createdAt: string
  input: DeviceInput
  brandModel?: string
  location?: string
  updatedAt?: string
  report?: SavedReport
}

const storageKey = 'second-life-estimates-v1'
const maxStorageBytes = 3 * 1024 * 1024

/** Keep report fields only: never persist usage metadata, credentials or photo bytes. */
function reportResult(value: unknown): ResearchResult {
  const data = parseResearchResult(value)
  return {
    status: 'ok',
    text: data.text,
    checkedAt: data.checkedAt,
    citations: data.citations.map(({ start, end, url, title }) => ({ start, end, url, title })),
    provider: data.provider,
    evidence: data.evidence,
    model: data.model,
    photoIncluded: data.photoIncluded,
    repairService: data.repairService,
    webSearch: data.webSearch && {
      provider: data.webSearch.provider,
      status: data.webSearch.status,
    },
    coach: extractRepairCoach(data.coach),
    shops: data.shops?.map(({ name, address, sourceUrl, sourceTitle }) => ({
      name,
      address,
      sourceUrl,
      sourceTitle,
    })),
    materials: data.materials?.map(
      ({ name, excerpt, weightKg, ratePerKg, currency, sourceUrl, sourceTitle }) => ({
        name,
        excerpt,
        weightKg,
        ratePerKg,
        currency,
        sourceUrl,
        sourceTitle,
      }),
    ),
    costEstimates: data.costEstimates && {
      repair: data.costEstimates.repair.map(({ item, kind, low, high, currency, assumptions }) => ({
        item,
        kind,
        low,
        high,
        currency,
        assumptions,
      })),
      recycling: data.costEstimates.recycling.map(
        ({ item, kind, low, high, currency, assumptions }) => ({
          item,
          kind,
          low,
          high,
          currency,
          assumptions,
        }),
      ),
    },
    priceCheck: data.priceCheck && {
      status: data.priceCheck.status,
      items: data.priceCheck.items.map(
        ({ kind, low, high, currency, modelMatch, excerpt, sourceUrl, sourceTitle }) => ({
          kind,
          low,
          high,
          currency,
          modelMatch,
          excerpt,
          sourceUrl,
          sourceTitle,
        }),
      ),
    },
  }
}

function savedReport(value: unknown): SavedReport {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved report')
  const data = value as SavedReport
  if (!Array.isArray(data.history) || data.history.length > 6)
    throw new Error('Invalid report history')
  return {
    result: reportResult(data.result),
    history: data.history.map((item) => {
      if (
        !item ||
        typeof item.title !== 'string' ||
        item.title.length > 100 ||
        (item.question !== undefined &&
          (typeof item.question !== 'string' || item.question.length > 1200))
      )
        throw new Error('Invalid saved follow-up')
      return { title: item.title, question: item.question, result: reportResult(item.result) }
    }),
  }
}

function savedEntry(value: unknown): SavedEstimate {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved device')
  const entry = value as SavedEstimate
  if (
    typeof entry.id !== 'string' ||
    !entry.id ||
    entry.id.length > 100 ||
    typeof entry.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.createdAt)) ||
    (entry.updatedAt !== undefined &&
      (typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt)))) ||
    (entry.brandModel !== undefined &&
      (typeof entry.brandModel !== 'string' || entry.brandModel.length > 120)) ||
    (entry.location !== undefined &&
      (typeof entry.location !== 'string' || entry.location.length > 120))
  )
    throw new Error('Invalid saved device')
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    input: validateDeviceInput(entry.input),
    ...(entry.brandModel !== undefined ? { brandModel: entry.brandModel } : {}),
    ...(entry.location !== undefined ? { location: entry.location } : {}),
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
    ...(entry.report ? { report: savedReport(entry.report) } : {}),
  }
}

export function readSavedEstimates(): SavedEstimate[] {
  try {
    const stored = localStorage.getItem(storageKey) ?? '[]'
    if (stored.length * 2 > maxStorageBytes) return []
    const data: unknown = JSON.parse(stored)
    if (!Array.isArray(data)) return []
    return data.slice(0, 30).flatMap((entry): SavedEstimate[] => {
      try {
        return [savedEntry(entry)]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

export function writeSavedEstimates(entries: SavedEstimate[]) {
  const serialized = JSON.stringify(entries.slice(0, 30).map(savedEntry))
  if (serialized.length * 2 > maxStorageBytes)
    throw new Error('Saved reports are full. Download a copy or remove an older report.')
  localStorage.setItem(storageKey, serialized)
}
