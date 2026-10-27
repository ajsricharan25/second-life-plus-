import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, BookOpen, Info, LoaderCircle, MapPin, Search, Send } from 'lucide-react'
import { parseResearchResult } from '../lib/research-client'
import { researchErrorMessage } from '../lib/research-errors'
import { failureDetailLines } from '../lib/research-failure-details'
import type { AssessmentTask, ResearchRequest, ResearchResult } from '../lib/research-types'
import { buildMapsSearchUrl, buildShopMapsUrl } from '../lib/service-search'
import ResearchAlternatives from './ResearchAlternatives'

type Activity = { title: string; question?: string; result: ResearchResult }
const actions = [
  {
    task: 'follow-up',
    title: 'Ask a follow-up',
    description: 'Explain a new observation or the result of a safe check.',
  },
  {
    task: 'comparison',
    title: 'Compare my options',
    description: 'Explore what would make repair, replacement or recycling the better choice.',
  },
  {
    task: 'quote-review',
    title: 'Review a repair quote',
    description:
      'Get an explanation of quoted charges, missing details and source-backed comparisons.',
  },
  {
    task: 'repair-brief',
    title: 'Prepare my shop brief',
    description: 'Create a message and tailored questions to take to a repair professional.',
  },
] as const

class ResearchError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message)
  }
}

export default function WebResearchPanel({
  request,
  autoStartToken = 0,
  onAutoStart,
  onResult,
  onHistory,
}: {
  request: ResearchRequest
  autoStartToken?: number
  onAutoStart?: () => void
  onResult?: (result: ResearchResult | null) => void
  onHistory?: (history: Activity[]) => void
}) {
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [history, setHistory] = useState<Activity[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [failureDetails, setFailureDetails] = useState<string[]>([])
  const [task, setTask] = useState<AssessmentTask>('follow-up')
  const [question, setQuestion] = useState('')
  const controller = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const requestKey = JSON.stringify(request)
  const modelOnly = result?.evidence === 'model-only'

  useEffect(() => {
    controller.current?.abort()
    controller.current = null
    busy.current = false
    setResult(null)
    setHistory([])
    setQuestion('')
    setStatus('idle')
    setMessage('')
    setFailureDetails([])
    onResult?.(null)
    onHistory?.([])
    return () => controller.current?.abort()
  }, [requestKey])

  useEffect(() => {
    if (!autoStartToken) return
    const timer = window.setTimeout(() => {
      onAutoStart?.()
      void research('assessment')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStartToken])

  async function research(nextTask: AssessmentTask) {
    if (busy.current) return
    if (nextTask !== 'assessment' && !result) return
    if (['follow-up', 'quote-review'].includes(nextTask) && !question.trim()) {
      setMessage(
        nextTask === 'quote-review'
          ? 'Enter the quoted amount, currency and what it includes.'
          : 'Add your question or new observations first.',
      )
      return
    }
    if (nextTask !== 'assessment' && history.length >= 6) {
      setMessage(
        'This report has six AI follow-ups. Download your passport or start a fresh assessment.',
      )
      return
    }
    const active = new AbortController()
    controller.current = active
    busy.current = true
    setStatus('loading')
    setMessage('')
    setFailureDetails([])
    const timeout = window.setTimeout(() => active.abort('timeout'), 65_000)
    const { image, ...textRequest } = request
    const payload: ResearchRequest =
      nextTask === 'assessment'
        ? { ...request, task: nextTask }
        : {
            ...textRequest,
            service: result?.repairService || textRequest.service,
            task: nextTask,
            ...(question.trim() ? { question: question.trim() } : {}),
            previousAssessment: [
              result!.text.slice(0, 8500),
              ...history
                .slice(-2)
                .map(
                  (item) =>
                    `${item.title}\n${item.question ?? ''}\n${item.result.text.slice(0, 1500)}`,
                ),
            ]
              .join('\n\n')
              .slice(0, 12000),
          }
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: active.signal,
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const failure = (data as { error?: { code?: unknown; details?: unknown } } | null)?.error
        throw new ResearchError(
          researchErrorMessage(failure?.code, response.status),
          failureDetailLines(failure?.details),
        )
      }
      const parsed = parseResearchResult(data)
      if (controller.current !== active || active.signal.aborted) return
      if (nextTask === 'assessment') {
        setResult(parsed)
        onResult?.(parsed)
        setHistory([])
        onHistory?.([])
      } else {
        const next = [
          ...history,
          {
            title: actions.find((action) => action.task === nextTask)!.title,
            question: question.trim(),
            result: parsed,
          },
        ]
        setHistory(next)
        onHistory?.(next)
        setQuestion('')
      }
      setStatus('idle')
    } catch (error) {
      if (
        controller.current !== active ||
        (active.signal.aborted && active.signal.reason !== 'timeout')
      )
        return
      setStatus('error')
      setFailureDetails(error instanceof ResearchError ? error.details : [])
      setMessage(
        active.signal.reason === 'timeout'
          ? 'The AI request took too long. Please try again later.'
          : error instanceof ResearchError
            ? error.message
            : 'The research response couldn’t be verified. Try again or use the direct searches below.',
      )
    } finally {
      window.clearTimeout(timeout)
      if (controller.current === active) busy.current = false
    }
  }

  const action = actions.find((action) => action.task === task)!
  let maps: string | null = null
  if (result?.repairService && request.location) {
    try {
      maps = buildMapsSearchUrl(result.repairService, request.location)
    } catch {
      /* Invalid location stays editable in device details. */
    }
  }
  return (
    <section className="web-research" aria-labelledby="web-research-title">
      <div className="research-heading">
        <span>
          <BookOpen size={18} />
        </span>
        <div>
          <h4 id="web-research-title">Your connected device report</h4>
          <p>
            Cause, repair, costs, local help and recycling — one assessment from your details and
            API evidence.
          </p>
        </div>
      </div>
      <p className="research-scope">
        <strong>Researching:</strong>{' '}
        {[request.brandModel, request.service, request.location].filter(Boolean).join(' · ')}
      </p>
      <button
        className="button button-secondary research-button"
        onClick={() => void research('assessment')}
        disabled={status === 'loading'}
      >
        <span>
          {status === 'loading' ? (
            <LoaderCircle className="spinning" size={16} />
          ) : (
            <Search size={16} />
          )}
          {status === 'loading'
            ? 'Preparing your AI answer…'
            : result
              ? 'Refresh assessment'
              : 'Research this repair'}
        </span>
        <ArrowUpRight size={16} />
      </button>
      <p className="research-consent">
        Your details go to the configured AI provider and text searches may go to Tavily.{' '}
        {request.image
          ? 'Your chosen photo is included in the main assessment only.'
          : 'No photo is sent.'}{' '}
        Follow-ups send your report and new observations. Each action uses API quota.
      </p>
      {status === 'loading' && (
        <p className="research-status" role="status">
          Preparing your answer and checking available evidence. No preset prices or material
          weights are used.
        </p>
      )}
      {message && (
        <p className="research-message" role="status">
          <Info size={15} />
          {message}
        </p>
      )}
      {message && failureDetails.length > 0 && (
        <details className="research-error-details">
          <summary>Connection details</summary>
          <ul>
            {failureDetails.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {result && (
        <article className="research-result unified-report" aria-label="AI device report">
          <div className="research-result-label">
            <span>
              {modelOnly ? 'AI GUIDANCE · NO WEB CHECK' : 'API RESEARCH · SOURCES INCLUDED'}
            </span>
            <time dateTime={result.checkedAt}>
              {new Date(result.checkedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </div>
          <p className="ai-provider-label">
            {{ groq: 'Groq', gemini: 'Google Gemini', openai: 'OpenAI' }[result.provider ?? 'groq']}
            {result.webSearch?.status === 'used' ? ' + Tavily web search' : ' · AI guidance'}
            {result.photoIncluded ? ' · Photo included' : ' · Symptoms and device details'}
          </p>
          {modelOnly && (
            <p className="research-price-note">
              {result.webSearch?.status === 'unavailable'
                ? 'Web search was unavailable for this assessment. '
                : 'This assessment has no web check. '}
              No current price, material quantity or shop listing has been established from sources.
              Likely causes remain unconfirmed.
            </p>
          )}
          <CitedAnswer result={result} />
          <div className="report-shops">
            <h5>
              <MapPin size={17} /> Nearby repair options
            </h5>
            {result.shops?.length ? (
              <>
                <p>
                  Published addresses matching your search area. Confirm the service, opening hours
                  and final quote with the shop.
                </p>
                <ul>
                  {result.shops.map((shop) => (
                    <li key={shop.sourceUrl + shop.name}>
                      <strong>{shop.name}</strong>
                      <span>{shop.address}</span>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={buildShopMapsUrl(shop.name, shop.address)}
                      >
                        Open shop in Google Maps <ArrowUpRight size={14} />
                      </a>
                      <a target="_blank" rel="noreferrer" href={shop.sourceUrl}>
                        Listing source
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                {request.location
                  ? 'No shop name and address could be established from the API search evidence.'
                  : 'Add a city or postcode in Edit details to research local shops.'}
              </p>
            )}
            {maps && (
              <a className="button button-secondary" href={maps} target="_blank" rel="noreferrer">
                Search Maps for {result.repairService} <ArrowUpRight size={15} />
              </a>
            )}
          </div>
          <p className="research-price-note">
            Published prices and material values are conditional evidence, not confirmed bills or
            recycler payouts. No preset diagnosis, repair cost or scrap weight is added to this
            report.
          </p>
          <section className="ai-next-actions" aria-labelledby="next-ai-title">
            <h5 id="next-ai-title">Make the answer work for you</h5>
            <p>Four ways to continue with AI. Your main assessment stays here.</p>
            <div className="ai-action-grid">
              {actions.map((item) => (
                <button
                  key={item.task}
                  type="button"
                  aria-pressed={task === item.task}
                  onClick={() => {
                    setTask(item.task)
                    setMessage('')
                  }}
                  disabled={status === 'loading'}
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void research(task)
              }}
            >
              <label htmlFor="ai-question">
                {task === 'quote-review'
                  ? 'Repair quote to review'
                  : task === 'follow-up'
                    ? 'Your question or new observation'
                    : 'Anything else AI should consider? (optional)'}
              </label>
              <textarea
                id="ai-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={1200}
                rows={3}
                required={task === 'quote-review' || task === 'follow-up'}
                placeholder={
                  task === 'quote-review'
                    ? 'e.g. ₹1,800: pump ₹900, labour ₹600, inspection ₹300. Warranty not mentioned.'
                    : 'Describe what changed, what you tried, or what matters most to you…'
                }
              />
              <button
                className="button button-primary"
                type="submit"
                disabled={status === 'loading' || history.length >= 6}
              >
                <Send size={15} />
                {action.title} with AI
              </button>
            </form>
          </section>
          {history.map((item, index) => (
            <section className="ai-conversation" key={index} aria-label={`${item.title} response`}>
              <h5>{item.title}</h5>
              {item.question && (
                <p className="user-observation">
                  <strong>Your input:</strong> {item.question}
                </p>
              )}
              <p className="ai-provider-label">
                {item.result.evidence === 'model-only'
                  ? 'AI guidance · no web check'
                  : 'API research · sources included'}
              </p>
              <CitedAnswer result={item.result} />
            </section>
          ))}
        </article>
      )}
      <details className="manual-search">
        <summary>Open a direct web search</summary>
        <ResearchAlternatives request={request} />
      </details>
    </section>
  )
}

function CitedAnswer({ result }: { result: ResearchResult }) {
  const sources = [
    ...new Map(result.citations.map((citation) => [citation.url, citation])).values(),
  ]
  const content: ReactNode[] = []
  const headings = new Set([
    'Summary',
    'Why it may have occurred',
    'Likely causes',
    'Safe checks',
    'Repair options',
    'Repair costs',
    'Repair or replace',
    'Recycling plan',
    'Recycling evidence',
    'What would narrow it down',
    'Quote review',
    'Repair brief',
  ])
  let offset = 0
  for (const [blockIndex, block] of result.text.split('\n\n').entries()) {
    const end = offset + block.length
    const newline = block.indexOf('\n')
    const heading =
      newline >= 0 && headings.has(block.slice(0, newline))
        ? block.slice(0, newline)
        : headings.has(block)
          ? block
          : null
    let cursor = offset + (heading ? heading.length + (newline >= 0 ? 1 : 0) : 0)
    const nodes: ReactNode[] = []
    for (const [index, citation] of result.citations.entries()) {
      if (citation.start < cursor || citation.end > end) continue
      nodes.push(result.text.slice(cursor, citation.start))
      const sourceIndex = sources.findIndex((source) => source.url === citation.url) + 1
      nodes.push(
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
    nodes.push(result.text.slice(cursor, end))
    content.push(
      <div key={blockIndex}>
        {heading && <h5>{heading}</h5>}
        {nodes.some((node) => node !== '') && <p>{nodes}</p>}
      </div>,
    )
    offset = end + 2
  }
  return (
    <>
      <div className="research-answer">{content}</div>
      {sources.length > 0 && (
        <details className="report-evidence">
          <summary>Sources used in this answer ({sources.length})</summary>
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
        </details>
      )}
    </>
  )
}
