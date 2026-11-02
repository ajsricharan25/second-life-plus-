import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSavedEstimates, writeSavedEstimates, type SavedEstimate } from './storage'
import { guidance, report } from '../../tests/unified-fixture'

const key = 'second-life-estimates-v1'
const entry: SavedEstimate = {
  id: 'fixture',
  createdAt: '2026-11-02T00:00:00Z',
  input: { appliance: 'washing-machine', age: 4, currency: 'INR', symptoms: 'Not draining' },
  brandModel: 'Example Washer 100',
  location: 'Chennai',
  report: {
    result: report,
    history: [{ title: 'Ask a follow-up', question: 'It shows E1.', result: guidance }],
  },
}
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('saved API reports', () => {
  it('round-trips sources, estimate assumptions and follow-ups without recomputing them', () => {
    writeSavedEstimates([entry])
    expect(JSON.parse(JSON.stringify(readSavedEstimates()))).toEqual([entry])
  })
  it('writes only approved fields, excluding photos, session tokens and usage metadata', () => {
    const polluted = {
      ...entry,
      token: 'private-session',
      image: { data: 'private-image' },
      input: { ...entry.input, image: 'private-image' },
      report: {
        result: {
          ...report,
          usage: { used: 1 },
          accessToken: 'private-session',
          citations: report.citations.map((item) => ({ ...item, secret: 'private-secret' })),
        },
        history: [{ ...entry.report!.history[0], auth: 'private-session' }],
      },
    }
    writeSavedEstimates([polluted])
    const serialized = storage.get(key)!
    expect(serialized).not.toMatch(/private-|accessToken|"usage"|"image"/)
    expect(readSavedEstimates()[0].report?.result.text).toBe(report.text)
  })
  it('retains legacy device records and rejects malformed report citations', () => {
    const { report: _report, ...legacy } = entry
    storage.set(
      key,
      JSON.stringify([
        legacy,
        {
          ...entry,
          id: 'bad',
          report: {
            result: {
              ...report,
              citations: [{ ...report.citations[0], url: 'javascript:alert(1)' }],
            },
            history: [],
          },
        },
      ]),
    )
    expect(readSavedEstimates()).toEqual([legacy])
  })
  it('keeps the existing saved copy intact when the report budget is exceeded', () => {
    writeSavedEstimates([entry])
    const before = storage.get(key)
    const large = { ...guidance, text: 'x'.repeat(50_000) }
    const records = Array.from({ length: 6 }, (_, i) => ({
      ...entry,
      id: String(i),
      report: {
        result: large,
        history: Array.from({ length: 6 }, () => ({ title: 'Follow-up', result: large })),
      },
    }))
    expect(() => writeSavedEstimates(records)).toThrow('Saved reports are full')
    expect(storage.get(key)).toBe(before)
  })
  it('does not hide a browser storage write failure', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('Quota exceeded')
      },
    })
    expect(() => writeSavedEstimates([entry])).toThrow('Quota exceeded')
  })
})
