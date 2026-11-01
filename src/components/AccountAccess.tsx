import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { AccessContext, AccessError } from '../lib/research-access-context'
import type { AuthConfig } from '../lib/research-access-context'
import { parseDailyUsage } from '../lib/daily-usage'
import type { DailyUsage } from '../lib/daily-usage'

export default function AccountAccess({
  config,
  children,
}: {
  config: AuthConfig
  children: ReactNode
}) {
  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      authorizationParams={{
        audience: config.audience,
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      }}
      cacheLocation="memory"
    >
      <AccountSession>{children}</AccountSession>
    </Auth0Provider>
  )
}

function AccountSession({ children }: { children: ReactNode }) {
  const auth = useAuth0()
  const [usage, setUsage] = useState<DailyUsage | null>(null)
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [checking, setChecking] = useState(false)
  const subject = useRef(auth.user?.sub)
  subject.current = auth.user?.sub
  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!auth.isAuthenticated) throw new AccessError('Sign in to use your daily AI allowance.')
    try {
      return { Authorization: `Bearer ${await auth.getAccessTokenSilently()}` }
    } catch {
      throw new AccessError('Your sign-in could not be verified. Please sign in again.')
    }
  }, [auth.isAuthenticated, auth.getAccessTokenSilently])
  const recordUsage = useCallback(
    (value: unknown) => {
      const parsed = parseDailyUsage(value)
      if (parsed && subject.current === auth.user?.sub) {
        setUsage((current) =>
          current &&
          (Date.parse(current.resetsAt) > Date.parse(parsed.resetsAt) ||
            (current.resetsAt === parsed.resetsAt &&
              current.limit === parsed.limit &&
              current.used > parsed.used))
            ? current
            : parsed,
        )
        setError('')
      }
    },
    [auth.user?.sub],
  )
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!auth.isAuthenticated) return
      setChecking(true)
      const current = subject.current
      try {
        const headers = await getHeaders()
        const response = await fetch('/api/access', {
          headers,
          cache: 'no-store',
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
            : AbortSignal.timeout(10_000),
        })
        const data = await response.json()
        const parsed = parseDailyUsage(data.usage)
        if (!response.ok || !parsed) throw new Error('Allowance unavailable')
        if (!signal?.aborted && current === subject.current) {
          setUsage(parsed)
          setError('')
        }
      } catch {
        if (!signal?.aborted && current === subject.current)
          setError('Your daily allowance could not be checked. Please try again later.')
      } finally {
        if (!signal?.aborted) setChecking(false)
      }
    },
    [auth.isAuthenticated, getHeaders],
  )
  useEffect(() => {
    setUsage(null)
    setError('')
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh, auth.user?.sub])
  useEffect(() => {
    if (!usage) return
    const delay = Date.parse(usage.resetsAt) - Date.now()
    const timer = window.setTimeout(
      () => {
        void refresh()
      },
      delay < 0 ? 60_000 : Math.min(delay + 1000, 86_401_000),
    )
    return () => window.clearTimeout(timer)
  }, [usage, refresh])
  const login = async () => {
    setSigningIn(true)
    setError('')
    try {
      await auth.loginWithPopup()
    } catch {
      setError('Sign-in was cancelled or blocked. Allow the sign-in pop-up and try again.')
    } finally {
      setSigningIn(false)
    }
  }
  return (
    <AccessContext.Provider
      value={{
        enabled: true,
        loading: auth.isLoading || signingIn || (auth.isAuthenticated && checking),
        authenticated: auth.isAuthenticated,
        usage,
        getHeaders,
        recordUsage,
        login,
        error: error || (auth.error ? 'Sign-in could not be completed. Please try again.' : ''),
        logout: () => {
          void auth.logout({ logoutParams: { returnTo: window.location.origin } })
        },
        refresh: () => refresh(),
      }}
    >
      {children}
    </AccessContext.Provider>
  )
}
