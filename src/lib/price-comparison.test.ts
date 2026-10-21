import { describe, expect, it } from 'vitest'
import { comparePublishedPrices } from './price-comparison'
import type { PublishedPrice, ResearchResult } from './research-types'

function price(
  kind: PublishedPrice['kind'],
  low: number,
  high = low,
  patch: Partial<PublishedPrice> = {},
): PublishedPrice {
  return {
    kind,
    low,
    high,
    currency: 'INR',
    modelMatch: 'general',
    excerpt: 'Price example',
    sourceUrl: 'https://example.com/prices',
    sourceTitle: 'Prices',
    ...patch,
  }
}
function result(items: PublishedPrice[]): ResearchResult {
  return {
    status: 'ok',
    text: 'Price example',
    checkedAt: '2026-10-21T00:00:00Z',
    citations: [],
    priceCheck: { status: 'checked', items },
  }
}

describe('source-based cost comparison', () => {
  it('does not turn a ₹500 component plus unrelated labour into a full repair', () => {
    expect(
      comparePublishedPrices(
        result([price('part', 500), price('labor', 1000), price('replacement', 28000)]),
        'INR',
      ).status,
    ).toBe('missing-repair')
  })
  it('calculates interval bounds from published full repair and new-device amounts', () => {
    expect(
      comparePublishedPrices(
        result([price('total-repair', 1500, 3000), price('replacement', 20000, 30000)]),
        'INR',
      ),
    ).toMatchObject({ status: 'ready', percentage: { low: 5, high: 15 }, generalExample: true })
  })
  it('prefers exact-model evidence and uses the entered budget explicitly', () => {
    const repair = price('total-repair', 1000, 2000, { modelMatch: 'exact' })
    expect(
      comparePublishedPrices(
        result([price('total-repair', 9000), repair, price('replacement', 20000)]),
        'INR',
        10000,
      ),
    ).toMatchObject({
      status: 'ready',
      repair,
      replacement: { low: 10000, high: 10000 },
      replacementSource: null,
      percentage: { low: 10, high: 20 },
      generalExample: false,
    })
  })
  it('does not mix currencies or treat a USD repair as an INR amount', () => {
    expect(
      comparePublishedPrices(
        result([price('total-repair', 50, 50, { currency: 'USD' }), price('replacement', 28000)]),
        'INR',
      ).status,
    ).toBe('missing-repair')
    expect(
      comparePublishedPrices(
        result([price('total-repair', 1000), price('replacement', 500, 500, { currency: 'USD' })]),
        'INR',
      ).status,
    ).toBe('missing-replacement')
  })
  it.each([undefined, 0, -1, NaN, Infinity])(
    'requires a positive replacement price or budget: %s',
    (budget) => {
      expect(
        comparePublishedPrices(result([price('total-repair', 1000)]), 'INR', budget).status,
      ).toBe('missing-replacement')
    },
  )
  it('avoids division by zero and ignores unavailable extraction', () => {
    expect(
      comparePublishedPrices(result([price('total-repair', 1000), price('replacement', 0)]), 'INR')
        .status,
    ).toBe('missing-replacement')
    const unavailable = result([price('total-repair', 1000)])
    unavailable.priceCheck!.status = 'unavailable'
    expect(comparePublishedPrices(unavailable, 'INR', 28000).status).toBe('missing-repair')
  })
})
