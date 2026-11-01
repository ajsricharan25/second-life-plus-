import type { CostEstimates, ResearchResult } from '../src/lib/research-types'
export const costEstimates: CostEstimates = {
  repair: [
    {
      item: 'Drain pump',
      kind: 'part',
      low: 450,
      high: 750,
      currency: 'INR',
      assumptions: 'Compatible pump if the internal fault is confirmed; original parts may differ.',
    },
    {
      item: 'Pump fitting',
      kind: 'labor',
      low: 300,
      high: 500,
      currency: 'INR',
      assumptions: 'Local workshop labour; excludes a home visit and taxes.',
    },
    {
      item: 'Pump repair total',
      kind: 'total-repair',
      low: 750,
      high: 1250,
      currency: 'INR',
      assumptions: 'Same pump and fitting scenario, excluding tax and home visit.',
    },
  ],
  recycling: [
    {
      item: 'Steel housing',
      kind: 'material',
      low: 200,
      high: 450,
      currency: 'INR',
      assumptions: 'Assumes recoverable steel, with no actual weight or recovery measured.',
    },
    {
      item: 'Whole washing machine',
      kind: 'device-scrap',
      low: 900,
      high: 1900,
      currency: 'INR',
      assumptions:
        'Possible recycler payment for the complete unit; composition and local rates are unconfirmed.',
    },
    {
      item: 'Collection',
      kind: 'recycling-fee',
      low: 0,
      high: 200,
      currency: 'INR',
      assumptions: 'Possible collection fee paid by the owner, not scrap income.',
    },
  ],
}
export const part = 'Example Washer 100 spare part in Chennai: ₹500, excluding labour.'
export const material = 'Example Washer 100 contains Copper: 2 kg. Copper scrap rate: INR 500/kg.'
export const shop = {
  name: 'Example Repair Centre',
  address: '12 Lake Road, Chennai 600073',
  sourceUrl: 'https://example.com/shop',
  sourceTitle: 'Fixture shop directory',
}
const text = `Summary\nThe external drain path may be obstructed; the internal pump is unconfirmed.\n\nWhy it may have occurred\nAn obstruction can develop over time.\n\nLikely causes\nA kink or blockage may restrict drainage.\n\nSafe checks\nSwitch off and unplug before looking at the accessible external hose. Stop if there is leakage near electrical parts.\n\nRepair options\nCorrect an accessible kink; internal pump testing needs appropriate professional handling.\n\nRepair costs\n${part} [1]\nPump repair total: ₹750–₹1,250. AI estimate — excludes tax and home visits.\n\nRepair or replace\nInvestigate the drain path before deciding to replace the whole appliance.\n\nRecycling plan\nUse an authorized recycler if repair is not practical.\n\nRecycling value\n${material} [2]\nWhole washing machine: ₹900–₹1,900. AI estimate — not a confirmed recycler payment.\n\nWhat would narrow it down\nWhat error code appears?\n\n${shop.name} — ${shop.address} [3]`
export const report: ResearchResult = {
  status: 'ok',
  text,
  provider: 'groq',
  evidence: 'web',
  model: 'qwen/qwen3.8-27b',
  checkedAt: '2026-10-27T10:00:00Z',
  photoIncluded: false,
  webSearch: { provider: 'tavily', status: 'used' },
  repairService: 'washing machine drain pump repair',
  citations: [
    {
      start: text.indexOf('[1]'),
      end: text.indexOf('[1]') + 3,
      url: 'https://example.com/part',
      title: 'Fixture spare part listing',
    },
    {
      start: text.indexOf('[2]'),
      end: text.indexOf('[2]') + 3,
      url: 'https://example.com/material',
      title: 'Fixture material declaration',
    },
    {
      start: text.indexOf('[3]'),
      end: text.indexOf('[3]') + 3,
      url: shop.sourceUrl,
      title: shop.sourceTitle,
    },
  ],
  priceCheck: {
    status: 'checked',
    items: [
      {
        kind: 'part',
        low: 500,
        high: 500,
        currency: 'INR',
        modelMatch: 'exact',
        excerpt: part,
        sourceUrl: 'https://example.com/part',
        sourceTitle: 'Fixture spare part listing',
      },
    ],
  },
  materials: [
    {
      name: 'Copper',
      weightKg: 2,
      ratePerKg: 500,
      currency: 'INR',
      excerpt: material,
      sourceUrl: 'https://example.com/material',
      sourceTitle: 'Fixture material declaration',
    },
  ],
  shops: [shop],
  costEstimates,
}
export const guidance: ResearchResult = {
  status: 'ok',
  text: 'Summary\nAn obstruction is possible, but there is no confirmed diagnosis.\n\nRepair costs\nNo current price is supported by web evidence.\n\nRecycling value\nMaterial quantities and scrap value are not established for this device.',
  provider: 'groq',
  evidence: 'model-only',
  model: 'qwen/qwen3.8-27b',
  checkedAt: report.checkedAt,
  photoIncluded: false,
  webSearch: { provider: 'tavily', status: 'unavailable' },
  priceCheck: { status: 'unavailable', items: [] },
  citations: [],
  materials: [],
  shops: [],
  repairService: 'washing machine repair',
}
