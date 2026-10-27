import type { ResearchMaterial, ResearchRequest, ResearchShop } from '../src/lib/research-types.ts'
import { buildShopMapsUrl } from '../src/lib/service-search.ts'

export type EvidenceSource = { id: number; url: string; title: string; content: string }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const normalize = (value: string) =>
  value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

export function extractShops(
  value: unknown,
  sources: EvidenceSource[],
  input: ResearchRequest,
): ResearchShop[] {
  if (!Array.isArray(value) || !input.location.trim()) return []
  const shops: ResearchShop[] = []
  for (const item of value.slice(0, 4)) {
    if (
      !record(item) ||
      typeof item.name !== 'string' ||
      typeof item.address !== 'string' ||
      item.name.length < 3 ||
      item.name.length > 120 ||
      item.address.length < 8 ||
      item.address.length > 240
    )
      continue
    const source = sources.find((source) => source.id === item.sourceId)
    if (!source) continue
    const content = normalize(source.content)
    if (!content.includes(normalize(item.name)) || !content.includes(normalize(item.address)))
      continue
    // At least one city/postcode term must occur in the published address.
    const area = normalize(input.location)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3)
    if (!area.length || !area.some((term) => normalize(item.address as string).includes(term)))
      continue
    try {
      buildShopMapsUrl(item.name, item.address)
    } catch {
      continue
    }
    if (!shops.some((shop) => normalize(shop.name) === normalize(item.name as string)))
      shops.push({
        name: item.name,
        address: item.address,
        sourceUrl: source.url,
        sourceTitle: source.title,
      })
  }
  return shops
}

export function extractMaterials(
  value: unknown,
  sources: EvidenceSource[],
  input: ResearchRequest,
): ResearchMaterial[] {
  if (!Array.isArray(value)) return []
  const materials: ResearchMaterial[] = []
  for (const item of value.slice(0, 6)) {
    if (
      !record(item) ||
      typeof item.name !== 'string' ||
      item.name.length < 2 ||
      item.name.length > 60 ||
      typeof item.excerpt !== 'string' ||
      !item.excerpt.trim() ||
      item.excerpt.length > 700 ||
      (item.currency !== 'INR' && item.currency !== 'USD')
    )
      continue
    const source = sources.find((source) => source.id === item.sourceId)
    if (
      !source ||
      !source.content.includes(item.excerpt) ||
      !normalize(item.excerpt).includes(normalize(item.name))
    )
      continue
    const exactModel =
      input.brandModel.trim().length >= 4 &&
      normalize(item.excerpt).includes(normalize(input.brandModel))
    let weightKg: number | null = null
    let ratePerKg: number | null = null
    if (item.weightKg !== null && item.weightKg !== undefined) {
      if (
        typeof item.weightKg !== 'number' ||
        !Number.isFinite(item.weightKg) ||
        item.weightKg <= 0 ||
        item.weightKg > 10000 ||
        !exactModel
      )
        continue
      const weights = [...item.excerpt.matchAll(/(\d+(?:\.\d+)?)\s*kg\b/gi)].map((match) =>
        Number(match[1]),
      )
      if (!weights.includes(item.weightKg)) continue
      // Total appliance weight must never become the recoverable weight of a material.
      if (
        /total\s+(?:device\s+|appliance\s+|net\s+)?weight|net\s+weight|gross\s+weight/i.test(
          item.excerpt,
        )
      )
        continue
      const escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const quantity = String(item.weightKg).replace('.', '\\.')
      if (
        !new RegExp(
          `(?:${escapedName}\\s*(?:weight|mass|content)?\\s*(?::|=|is)?\\s*${quantity}\\s*kg|\\b${quantity}\\s*kg\\s+(?:of\\s+)?${escapedName})`,
          'i',
        ).test(item.excerpt)
      )
        continue
      weightKg = item.weightKg
    }
    if (item.ratePerKg !== null && item.ratePerKg !== undefined) {
      if (
        typeof item.ratePerKg !== 'number' ||
        !Number.isFinite(item.ratePerKg) ||
        item.ratePerKg <= 0 ||
        item.ratePerKg > 100000000
      )
        continue
      const symbol = item.currency === 'INR' ? '(?:₹|INR|Rs\\.?)' : '(?:US\\$|USD|\\$)'
      const rateEvidence = item.excerpt
        .split(/[;\n]|(?<=\.)\s+/)
        .filter((clause) => normalize(clause).includes(normalize(item.name as string)))
        .join('\n')
      const rates = [
        ...rateEvidence.matchAll(
          new RegExp(`${symbol}\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:/|per)\\s*kg\\b`, 'gi'),
        ),
      ].map((match) => Number(match[1].replaceAll(',', '')))
      if (!rates.includes(item.ratePerKg)) continue
      ratePerKg = item.ratePerKg
    }
    // Unquantified claims must not carry numeric quantities that bypass these checks.
    if (weightKg === null && /\d[\d.,]*\s*(?:kg|grams?|tonnes?|%)\b/i.test(item.excerpt)) continue
    if (ratePerKg === null && /[₹$]|\b(?:INR|USD|Rs\.?)[\s\d]/i.test(item.excerpt)) continue
    if (!materials.some((material) => normalize(material.name) === normalize(item.name as string)))
      materials.push({
        name: item.name,
        excerpt: item.excerpt,
        weightKg,
        ratePerKg,
        currency: item.currency,
        sourceUrl: source.url,
        sourceTitle: source.title,
      })
  }
  return materials
}
