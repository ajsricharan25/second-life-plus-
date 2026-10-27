import { describe, expect, it } from 'vitest'
import { extractMaterials, extractShops } from './assessment-evidence'
import type { ResearchRequest } from '../src/lib/research-types'

const input: ResearchRequest = {
  appliance: 'washing-machine',
  age: 4,
  brandModel: 'Example Washer 100',
  symptoms: 'Not draining',
  location: 'Chennai 600073',
  currency: 'INR',
  service: 'washer pump repair',
  task: 'assessment',
}
const source = (content: string) => [
  { id: 1, content, title: 'Published evidence', url: 'https://example.com/evidence' },
]
const material = {
  name: 'Copper',
  weightKg: 2,
  ratePerKg: 500,
  currency: 'INR',
  sourceId: 1,
  excerpt: 'Example Washer 100 contains Copper: 2 kg. Copper scrap rate: INR 500 per kg.',
}
const shop = { name: 'Example Repair Centre', address: '12 Lake Road, Chennai 600073', sourceId: 1 }

describe('material and local shop evidence', () => {
  it('retains an exact model material weight and a literal per-kg rate from the API snippet', () => {
    expect(extractMaterials([material], source(material.excerpt), input)).toEqual([
      {
        name: 'Copper',
        weightKg: 2,
        ratePerKg: 500,
        currency: 'INR',
        excerpt: material.excerpt,
        sourceUrl: 'https://example.com/evidence',
        sourceTitle: 'Published evidence',
      },
    ])
  })
  it.each([
    { weightKg: 4 },
    { weightKg: -1 },
    { ratePerKg: 1500 },
    { currency: 'USD' },
    { excerpt: 'Invented material price: Copper 2 kg for INR 500 per kg.' },
    { sourceId: 4 },
    { name: 'Aluminium' },
    { weightKg: null },
    { ratePerKg: null },
  ])('drops unsupported material details: %j', (patch) => {
    expect(extractMaterials([{ ...material, ...patch }], source(material.excerpt), input)).toEqual(
      [],
    )
  })
  it('never assigns a generic material mass to a model with no matching source', () => {
    expect(
      extractMaterials([material], source(material.excerpt), {
        ...input,
        brandModel: 'Different Washer',
      }),
    ).toEqual([])
    expect(
      extractMaterials([material], source(material.excerpt), { ...input, brandModel: '' }),
    ).toEqual([])
  })
  it.each([
    'Example Washer 100 net weight 2 kg; contains Copper. INR 500 per kg.',
    'Example Washer 100 contains Copper; plastic 2 kg. INR 500 per kg.',
    'Example Washer 100 contains Copper and plastic 2 kg. Copper INR 500 per kg.',
    'Example Washer 100 contains Copper: 2 kg. Steel scrap rate INR 500/kg.',
  ])('does not confuse total appliance or other-material weight with copper: %s', (excerpt) => {
    expect(extractMaterials([{ ...material, excerpt }], source(excerpt), input)).toEqual([])
  })
  it('keeps quantities unknown when only qualitative material evidence exists', () => {
    const excerpt = 'Example Washer 100 contains Copper in the motor windings.'
    expect(
      extractMaterials(
        [{ ...material, excerpt, weightKg: null, ratePerKg: null }],
        source(excerpt),
        input,
      )[0],
    ).toMatchObject({ weightKg: null, ratePerKg: null })
  })
  it('does not infer weight from a market scrap-rate listing', () => {
    const excerpt = 'Copper scrap rate in Chennai: INR 500/kg.'
    expect(
      extractMaterials([{ ...material, excerpt, weightKg: null }], source(excerpt), input)[0],
    ).toMatchObject({ weightKg: null, ratePerKg: 500 })
  })
  it('requires published name, address and location match before returning a shop', () => {
    expect(
      extractShops([shop], source(`${shop.name}: ${shop.address}. Appliance repairs.`), input),
    ).toEqual([
      {
        name: shop.name,
        address: shop.address,
        sourceUrl: 'https://example.com/evidence',
        sourceTitle: 'Published evidence',
      },
    ])
    expect(extractShops([shop], source(shop.name), input)).toEqual([])
    expect(
      extractShops([shop], source(`${shop.name}: ${shop.address}`), {
        ...input,
        location: 'Mumbai',
      }),
    ).toEqual([])
    expect(
      extractShops([shop], source(`${shop.name}: ${shop.address}`), { ...input, location: '' }),
    ).toEqual([])
  })
  it('rejects an invented address even if the business name is real in the snippet', () => {
    expect(
      extractShops(
        [{ ...shop, address: '99 Invented Road, Chennai 600073' }],
        source(`${shop.name}: ${shop.address}`),
        input,
      ),
    ).toEqual([])
  })
})
