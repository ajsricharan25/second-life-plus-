import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AccessContext,
  AccessError,
  empty,
  useResearchAccess,
} from '../lib/research-access-context'
import type { AuthConfig } from '../lib/research-access-context'
export { AccessError, useResearchAccess } from '../lib/research-access-context'
const AccountAccess = lazy(() => import('./AccountAccess'))
const loadingView = (
  <p className="access-loading" role="status">
    Preparing your workspace…
  </p>
)

export function ResearchAccessProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | false | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 10_000)
    void fetch('/api/access', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!active) return
        if (!response.ok) throw new Error('Configuration unavailable')
        if (data.enabled === false) {
          setConfig(false)
          return
        }
        if (
          data.enabled !== true ||
          !data.auth ||
          typeof data.auth.domain !== 'string' ||
          !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(data.auth.domain) ||
          typeof data.auth.clientId !== 'string' ||
          typeof data.auth.audience !== 'string'
        )
          throw new Error('Invalid configuration')
        setConfig(data.auth)
      })
      .catch(() => {
        if (active)
          setError(
            'AI access settings could not be loaded. Please reload later; the app owner may need to finish daily-limit setup.',
          )
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])
  if (config === null && !error) return loadingView
  if (config)
    return (
      <Suspense fallback={loadingView}>
        <AccountAccess config={config}>{children}</AccountAccess>
      </Suspense>
    )
  const value =
    config === false
      ? empty
      : {
          ...empty,
          enabled: true,
          loading: !error,
          error,
          getHeaders: async () => {
            throw new AccessError(error || 'AI access is still loading. Please wait a moment.')
          },
        }
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function DailyAllowance() {
  const access = useResearchAccess()
  if (!access.enabled) return null
  const reset = access.usage
    ? new Date(access.usage.resetsAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null
  return (
    <aside className="daily-allowance" aria-label="Daily AI allowance">
      <div aria-live="polite">
        <strong>
          {access.usage
            ? `${access.usage.remaining} of ${access.usage.limit} AI requests left today`
            : 'Your daily AI allowance'}
        </strong>
        <p>
          {access.loading
            ? 'Checking your access…'
            : access.authenticated
              ? `Assessments and follow-ups share this allowance. ${reset ? `Resets ${reset} IST.` : 'Resets at midnight India time.'} Started requests count even if the AI provider fails.`
              : 'Sign in to keep your daily allowance across browsers and devices.'}
        </p>
        {access.error && <p role="status">{access.error}</p>}
        {access.usage?.remaining === 0 && (
          <p>
            Your allowance is used up for today. Your report, downloads and direct web searches
            remain available.
          </p>
        )}
      </div>
      {access.login && !access.authenticated && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void access.login!()}
          disabled={access.loading}
        >
          Sign in for AI
        </button>
      )}
      {access.refresh && access.authenticated && access.error && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void access.refresh!()}
          disabled={access.loading}
        >
          Check allowance
        </button>
      )}
      {access.logout && access.authenticated && (
        <button type="button" className="button button-secondary" onClick={access.logout}>
          Sign out
        </button>
      )}
    </aside>
  )
}
