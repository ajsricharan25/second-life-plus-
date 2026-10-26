import { describe, expect, it } from 'vitest'
import { extractPriceOutput, validatePublishedPrices } from './pricing'
import type { ResearchRequest, ResearchResult } from '../src/lib/research-types'

const request: ResearchRequest = {
  appliance: 'washing-machine',
  age: 4,
  currency: 'INR',
  brandModel: 'Example Washer 100',
  symptoms: 'Not draining',
  location: 'Bengaluru',
  service: 'washing machine drain pump repair',
}
const excerpt = 'Example Washer 100 spare part: ₹500, parts-only, excluding labour.'
const text = `${excerpt} [1]`
const research: ResearchResult = {
  status: 'ok',
  text,
  checkedAt: '2026-10-20T00:00:00Z',
  citations: [
    {
      start: text.indexOf('[1]'),
      end: text.length,
      url: 'https://www.example.com/pump',
      title: 'Test fixture: component listing',
    },
  ],
}
const entry = {
  kind: 'part',
  low: 500,
  high: 500,
  currency: 'INR',
  modelMatch: 'exact',
  excerpt,
  citationIndex: 0,
}

describe('published price support checks', () => {
  it('preserves a cited ₹500 part price without inventing a ₹1,500 total repair', () => {
    expect(validatePublishedPrices({ items: [entry] }, research, request)).toEqual([
      {
        kind: 'part',
        low: 500,
        high: 500,
        currency: 'INR',
        modelMatch: 'exact',
        excerpt,
        sourceUrl: research.citations[0].url,
        sourceTitle: research.citations[0].title,
      },
    ])
  })
  it.each([
    { low: 1500, high: 1500 },
    { kind: 'total-repair' },
    { kind: 'labor' },
    { currency: 'USD' },
    { citationIndex: 1 },
    { excerpt: 'The full repair costs ₹500.' },
    { high: -10 },
    { low: NaN },
  ])('discards unsupported or miscategorized extraction: %j', (change) => {
    expect(
      validatePublishedPrices({ items: [{ ...entry, ...change }] }, research, request),
    ).toEqual([])
  })
  it('does not label a price as exact-model without that model in the cited passage', () => {
    expect(
      validatePublishedPrices({ items: [entry] }, research, {
        ...request,
        brandModel: 'Another model',
      })[0].modelMatch,
    ).toBe('general')
  })
  it('rejects a price associated with a different citation', () => {
    const otherText = `${excerpt} unrelated claim about a newer product that does not contain a price at all. [1]`
    const other = {
      ...research,
      text: otherText,
      citations: [
        { ...research.citations[0], start: otherText.indexOf('[1]'), end: otherText.length },
      ],
    }
    expect(validatePublishedPrices({ items: [entry] }, other, request)).toEqual([])
  })
  it('accepts a cited full repair range and keeps it separate from a new-device price', () => {
    const quote = 'Total repair including parts and labour: INR 1,200–3,500.'
    const answer = `${quote} [1]`
    const total = {
      ...research,
      text: answer,
      citations: [{ ...research.citations[0], start: answer.indexOf('[1]'), end: answer.length }],
    }
    expect(
      validatePublishedPrices(
        { items: [{ ...entry, kind: 'total-repair', low: 1200, high: 3500, excerpt: quote }] },
        total,
        request,
      )[0],
    ).toMatchObject({
      kind: 'total-repair',
      low: 1200,
      high: 3500,
      modelMatch: 'general',
    })
  })
  it('returns no prices when the sources do not establish any', () => {
    expect(validatePublishedPrices({ items: [] }, research, request)).toEqual([])
  })
  it('does not combine a part price and labour fee into an invented price range', () => {
    const quote = 'Spare part: ₹500; labour fee: ₹1,500.'
    const answer = `${quote} [1]`
    const evidence = {
      ...research,
      text: answer,
      citations: [{ ...research.citations[0], start: answer.indexOf('[1]'), end: answer.length }],
    }
    expect(
      validatePublishedPrices(
        { items: [{ ...entry, low: 500, high: 1500, excerpt: quote }] },
        evidence,
        request,
      ),
    ).toEqual([])
  })
  it('requires a completed structured extraction', () => {
    expect(() => extractPriceOutput({ status: 'incomplete', output: [] })).toThrow()
    expect(() => extractPriceOutput({ status: 'completed', output: [] })).toThrow()
  })
})
