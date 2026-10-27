import { validateDeviceInput, type DeviceInput } from './device'

export interface SavedEstimate {
  id: string
  createdAt: string
  input: DeviceInput
  brandModel?: string
  location?: string
}

const storageKey = 'second-life-estimates-v1'

export function readSavedEstimates(): SavedEstimate[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(data)) return []
    return data
      .filter((entry): entry is SavedEstimate => {
        try {
          if (
            !entry ||
            typeof entry.id !== 'string' ||
            typeof entry.createdAt !== 'string' ||
            !Number.isFinite(Date.parse(entry.createdAt)) ||
            (entry.brandModel !== undefined &&
              (typeof entry.brandModel !== 'string' || entry.brandModel.length > 120)) ||
            (entry.location !== undefined &&
              (typeof entry.location !== 'string' || entry.location.length > 120))
          )
            return false
          validateDeviceInput(entry.input)
          return true
        } catch {
          return false
        }
      })
      .slice(0, 30)
  } catch {
    return []
  }
}

export function writeSavedEstimates(entries: SavedEstimate[]) {
  localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 30)))
}
