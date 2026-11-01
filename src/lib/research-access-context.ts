import { createContext, useContext } from 'react'
import type { DailyUsage } from './daily-usage'

export type AuthConfig = { domain: string; clientId: string; audience: string }
interface Access {
  enabled: boolean
  loading: boolean
  authenticated: boolean
  error: string
  usage: DailyUsage | null
  getHeaders: () => Promise<Record<string, string>>
  recordUsage: (value: unknown) => void
  login?: () => Promise<void>
  logout?: () => void
  refresh?: () => Promise<void>
}
export class AccessError extends Error {}
export const empty: Access = {
  enabled: false,
  loading: false,
  authenticated: false,
  error: '',
  usage: null,
  getHeaders: async () => ({}),
  recordUsage: () => {},
}
export const AccessContext = createContext<Access>(empty)
export const useResearchAccess = () => useContext(AccessContext)
