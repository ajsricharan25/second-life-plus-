export interface DailyUsage {
  limit: number
  used: number
  remaining: number
  resetsAt: string
  timeZone: 'Asia/Kolkata'
}

export function parseDailyUsage(value: unknown): DailyUsage | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<DailyUsage>
  if (
    !Number.isSafeInteger(data.limit) ||
    data.limit! < 1 ||
    data.limit! > 100 ||
    !Number.isSafeInteger(data.used) ||
    data.used! < 0 ||
    data.used! > 100_000 ||
    data.remaining !== Math.max(0, data.limit! - data.used!) ||
    typeof data.resetsAt !== 'string' ||
    !Number.isFinite(Date.parse(data.resetsAt)) ||
    data.timeZone !== 'Asia/Kolkata'
  )
    return null
  return data as DailyUsage
}
