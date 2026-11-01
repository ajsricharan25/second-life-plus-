import { describe, expect, it } from 'vitest'
import { extractCostEstimates, isCostEstimates } from './cost-estimates'
import { parseResearchResult } from './research-client'

const repair = {
  item: 'Battery replacement',
  kind: 'total-repair',
  low: 1800,
  high: 3200,
  currency: 'INR',
  assumptions: 'Compatible battery and fitting; excludes taxes and home collection.',
}
const recycling = {
  item: 'Whole phone',
  kind: 'device-scrap',
  low: 80,
  high: 250,
  currency: 'INR',
  assumptions: 'Unmeasured composition; assumes an intact unit accepted by a recycler.',
}
const modelOnly = {
  status: 'ok',
  text: 'Summary\nBattery wear is possible, but not confirmed.',
  checkedAt: '2026-11-01T00:00:00Z',
  provider: 'groq',
  evidence: 'model-only',
  citations: [],
  priceCheck: { status: 'unavailable', items: [] },
}

describe('AI planning ranges stay separate from published prices', () => {
  it('accepts estimated costs without promoting them to source-backed evidence', () => {
    const costEstimates = { repair: [repair], recycling: [recycling] }
    const result = parseResearchResult({ ...modelOnly, costEstimates })
    expect(result.costEstimates).toEqual(costEstimates)
    expect(result.priceCheck?.items).toEqual([])
    expect(result.evidence).toBe('model-only')
    expect(result.citations).toEqual([])
  })
  it.each([
    { low: -1 },
    { high: 1000 },
    { high: Infinity },
    { low: NaN },
    { high: '3200' },
    { currency: 'EUR' },
    { assumptions: '' },
    { kind: 'device-scrap' },
    { item: '<script>bad</script>' },
    { item: 'x'.repeat(101) },
  ])('drops an invalid repair estimate on the server and rejects it on the client: %j', (patch) => {
    const value = { repair: [{ ...repair, ...patch }], recycling: [recycling] }
    expect(extractCostEstimates(value, 'INR')).toEqual({ repair: [], recycling: [recycling] })
    expect(() => parseResearchResult({ ...modelOnly, costEstimates: value })).toThrow(
      'Invalid AI cost estimates',
    )
  })
  it('does not convert foreign currencies or fill absent API rows with preset amounts', () => {
    expect(extractCostEstimates({ repair: [repair], recycling: [recycling] }, 'USD')).toEqual({
      repair: [],
      recycling: [],
    })
    expect(extractCostEstimates(undefined, 'INR')).toEqual({ repair: [], recycling: [] })
    expect(isCostEstimates({ repair: [repair] })).toBe(false)
  })
  it('keeps a no-charge range valid and caps both arrays', () => {
    const free = { ...repair, item: 'Software settings check', low: 0, high: 0 }
    expect(extractCostEstimates({ repair: [free], recycling: [] }, 'INR').repair).toEqual([free])
    expect(isCostEstimates({ repair: Array(7).fill(repair), recycling: [] })).toBe(false)
  })
})
