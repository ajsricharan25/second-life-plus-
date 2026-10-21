import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, BookOpen, Info, LoaderCircle, Search } from 'lucide-react'
import { parseResearchResult } from '../lib/research-client'
import { researchErrorMessage } from '../lib/research-errors'
import type { ResearchRequest, ResearchResult } from '../lib/research-types'
import { buildIssueSearchUrl } from '../lib/service-search'
import ResearchAlternatives from './ResearchAlternatives'
import PublishedPrices from './PublishedPrices'

class ResearchError extends Error {}

export default function WebResearchPanel({
  request,
  autoStartToken = 0,
  onAutoStart,
  onResult,
}: {
  request: ResearchRequest
  autoStartToken?: number
  onAutoStart?: () => void
  onResult?: (result: ResearchResult | null) => void
}) {
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  const requestKey = JSON.stringify(request)

  useEffect(() => {
    controller.current?.abort()
    setResult(null)
    setStatus('idle')
    setMessage('')
    onResult?.(null)
    return () => controller.current?.abort()
  }, [requestKey])

  useEffect(() => {
    if (!autoStartToken) return
    // Schedule after mount so StrictMode cleanup cancels its first setup.
    // Scope edits clear the answer but do not silently send a new paid request.
    const timer = window.setTimeout(() => {
      onAutoStart?.()
      void research()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStartToken])

  const ready = Boolean(request.service.trim())
  let searchUrl: string | null = null
  try {
    if (ready) searchUrl = buildIssueSearchUrl(request, 'google')
  } catch {
    /* Invalid search inputs are handled before a request. */
  }

  async function research() {
    if (!ready) {
      setMessage('Enter the repair service in the nearby-services panel first.')
      return
    }
    if (!searchUrl) {
      setMessage('Check the service, model, and location for invalid characters.')
      return
    }
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setStatus('loading')
    setMessage('')
    setResult(null)
    onResult?.(null)
    const timeout = window.setTimeout(() => active.abort('timeout'), 65_000)
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: active.signal,
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const errorCode = (data as { error?: { code?: string } } | null)?.error?.code
        throw new ResearchError(researchErrorMessage(errorCode, response.status))
      }
      const parsed = parseResearchResult(data)
      if (controller.current === active && !active.signal.aborted) {
        setResult(parsed)
        onResult?.(parsed)
        setStatus('idle')
      }
    } catch (error) {
      if (
        controller.current !== active ||
        (active.signal.aborted && active.signal.reason !== 'timeout')
      )
        return
      setStatus('error')
      setMessage(
        active.signal.reason === 'timeout'
          ? 'Research took too long. Try again or search the web directly below.'
          : error instanceof ResearchError
            ? error.message
            : 'The research response couldn’t be verified. Try again or search the web directly below.',
      )
    } finally {
      window.clearTimeout(timeout)
    }
  }

  return (
    <section className="web-research" aria-labelledby="web-research-title">
      <div className="research-heading">
        <span>
          <BookOpen size={18} />
        </span>
        <div>
          <h4 id="web-research-title">Your AI repair assessment</h4>
          <p>
            A clear summary, likely causes, practical checks, repair options, and source-backed
            prices.
          </p>
        </div>
      </div>
      <p className="research-scope">
        <strong>Researching:</strong>{' '}
        {[request.brandModel, request.service, request.location].filter(Boolean).join(' · ')}
      </p>
      <button
        className="button button-secondary research-button"
        onClick={() => void research()}
        disabled={status === 'loading'}
      >
        <span>
          {status === 'loading' ? (
            <LoaderCircle className="spinning" size={16} />
          ) : (
            <Search size={16} />
          )}
          {status === 'loading'
            ? 'Analyzing your issue and checking sources…'
            : result
              ? 'Refresh web research'
              : 'Research this repair'}
        </span>
        <ArrowUpRight size={16} />
      </button>
      <p className="research-consent">
        This sends your device details, symptoms, and search area to the configured AI provider
        (OpenAI or Google).{' '}
        {request.image ? 'You chose to include your photo.' : 'No photo is sent.'}
      </p>
      {status === 'loading' && (
        <p className="research-status" role="status">
          Searching published information, then checking price amounts and categories against the
          cited answer.
        </p>
      )}
      {message && (
        <p className="research-message" role="status">
          <Info size={15} />
          {message}
        </p>
      )}
      {result && (
        <div className="research-result" aria-live="polite">
          <div className="research-result-label">
            <span>WEB-SOURCED INFORMATION</span>
            <time dateTime={result.checkedAt}>
              Checked{' '}
              {new Date(result.checkedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </div>
          {result.provider && (
            <p className="ai-provider-label">
              {result.provider === 'gemini'
                ? 'Google Gemini + Google Search'
                : 'OpenAI + web search'}
              {result.photoIncluded ? ' · Photo included' : ' · Symptoms and device details'}
            </p>
          )}
          <CitedAnswer result={result} />
          {result.searchSuggestionsHtml && (
            <iframe
              className="search-suggestions"
              title="Google Search suggestions"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https://www.gstatic.com https://www.google.com data:; base-uri 'none'; form-action 'none'">${result.searchSuggestionsHtml}`}
            />
          )}
          <PublishedPrices result={result} request={request} />
          <p className="research-price-note">
            Published prices may be conditional or out of date. Confirm the model, parts, labor,
            taxes, and final price with the repairer. These sources do not change the illustrative
            offline planning estimates. The Download button includes this AI answer and its sources.
            Saved estimates currently keep device details only.
          </p>
        </div>
      )}
      <ResearchAlternatives request={request} />
    </section>
  )
}

function CitedAnswer({ result }: { result: ResearchResult }) {
  const sources = [
    ...new Map(result.citations.map((citation) => [citation.url, citation])).values(),
  ]
  const content: ReactNode[] = []
  let cursor = 0
  for (const [index, citation] of result.citations.entries()) {
    content.push(result.text.slice(cursor, citation.start))
    const sourceIndex = sources.findIndex((source) => source.url === citation.url) + 1
    content.push(
      <a
        key={index}
        className="inline-citation"
        href={citation.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Source ${sourceIndex}: ${citation.title}`}
      >
        [{sourceIndex}]
      </a>,
    )
    cursor = citation.end
  }
  content.push(result.text.slice(cursor))
  return (
    <>
      <div className="research-answer">{content}</div>
      <ol className="research-sources" aria-label="Research sources">
        {sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              <span>
                {source.title || new URL(source.url).hostname}
                <small>{new URL(source.url).hostname}</small>
              </span>
              <ArrowUpRight size={14} />
            </a>
          </li>
        ))}
      </ol>
    </>
  )
}
