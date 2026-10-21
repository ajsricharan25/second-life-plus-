import type { Currency } from './estimator'
import type { PublishedPrice, ResearchResult } from './research-types'

export function comparePublishedPrices(
  result: ResearchResult,
  currency: Currency,
  budget?: number,
) {
  const items = result.priceCheck?.status === 'checked' ? result.priceCheck.items : []
  const choose = (kind: PublishedPrice['kind']) => {
    const candidates = items.filter((item) => item.kind === kind && item.currency === currency)
    return candidates.find((item) => item.modelMatch === 'exact') ?? candidates[0]
  }
  // A cheap component is not a full repair. Never add unrelated part/labour listings.
  const repair = choose('total-repair')
  const replacement = choose('replacement')
  const entered = typeof budget === 'number' && Number.isFinite(budget) && budget > 0
  const newPrice = entered ? { low: budget, high: budget } : replacement
  if (!repair) return { status: 'missing-repair' as const }
  if (!newPrice || newPrice.low <= 0) return { status: 'missing-replacement' as const }
  const round = (number: number) => Math.round(number * 10) / 10
  return {
    status: 'ready' as const,
    repair,
    replacement: newPrice,
    replacementSource: entered ? null : replacement,
    currency,
    percentage: {
      low: round((repair.low / newPrice.high) * 100),
      high: round((repair.high / newPrice.low) * 100),
    },
    generalExample:
      repair.modelMatch !== 'exact' || (!entered && replacement?.modelMatch !== 'exact'),
  }
}
