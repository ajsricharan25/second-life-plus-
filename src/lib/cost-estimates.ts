import type { CostEstimate, CostEstimates } from './research-types.ts'
import type { Currency } from './estimator.ts'

const kinds = {
  repair: ['part', 'labor', 'inspection', 'total-repair'],
  recycling: ['material', 'device-scrap', 'recycling-fee'],
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const plainText = (value: unknown, min: number, max: number) =>
  typeof value === 'string' &&
  value.trim().length >= min &&
  value.length <= max &&
  !/[\u0000-\u001f<>]|https?:\/\//u.test(value)

export function isCostEstimate(
  value: unknown,
  category: keyof CostEstimates,
  currency?: Currency,
): value is CostEstimate {
  return (
    record(value) &&
    plainText(value.item, 3, 100) &&
    typeof value.kind === 'string' &&
    kinds[category].includes(value.kind) &&
    typeof value.low === 'number' &&
    Number.isFinite(value.low) &&
    value.low >= 0 &&
    typeof value.high === 'number' &&
    Number.isFinite(value.high) &&
    value.high >= value.low &&
    value.high <= 100_000_000 &&
    (value.currency === 'INR' || value.currency === 'USD') &&
    (!currency || value.currency === currency) &&
    plainText(value.assumptions, 10, 400)
  )
}

export function isCostEstimates(value: unknown): value is CostEstimates {
  return (
    record(value) &&
    ['repair', 'recycling'].every((category) => {
      const rows = value[category]
      return (
        Array.isArray(rows) &&
        rows.length <= 6 &&
        rows.every((row) => isCostEstimate(row, category as keyof CostEstimates))
      )
    })
  )
}

// Drop unusable model rows without replacing them with a built-in price.
export function extractCostEstimates(value: unknown, currency: Currency): CostEstimates {
  const result: CostEstimates = { repair: [], recycling: [] }
  if (!record(value)) return result
  for (const category of ['repair', 'recycling'] as const) {
    const rows = value[category]
    if (!Array.isArray(rows)) continue
    result[category] = rows
      .slice(0, 6)
      .filter((row): row is CostEstimate => isCostEstimate(row, category, currency))
      .map(({ item, kind, low, high, currency, assumptions }) => ({
        item: item.trim(),
        kind,
        low,
        high,
        currency,
        assumptions: assumptions.trim(),
      }))
  }
  return result
}
