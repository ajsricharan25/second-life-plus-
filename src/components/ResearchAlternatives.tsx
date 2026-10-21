import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import {
  buildCompanionPrompt,
  buildIssueSearchUrl,
  buildReplacementSearchUrl,
} from '../lib/service-search'
import type { ResearchRequest } from '../lib/research-types'

export default function ResearchAlternatives({ request }: { request: ResearchRequest }) {
  const [message, setMessage] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const promptField = useRef<HTMLTextAreaElement>(null)
  const requestKey = JSON.stringify(request)
  useEffect(() => {
    setMessage('')
  }, [requestKey])
  let prompt: string
  let google: string
  let bing: string
  let replacement: string
  try {
    prompt = buildCompanionPrompt(request)
    google = buildIssueSearchUrl(request, 'google')
    bing = buildIssueSearchUrl(request, 'bing')
    replacement = buildReplacementSearchUrl(
      request.appliance,
      request.brandModel,
      request.currency,
      request.deviceName,
    )
  } catch {
    return (
      <p className="research-location-hint">
        Check the service and device details to create search links.
      </p>
    )
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setMessage('Question copied. Open an AI companion and paste it there.')
    } catch {
      setShowPrompt(true)
      setMessage('Select and copy the question below, then paste it into your AI companion.')
      requestAnimationFrame(() => {
        promptField.current?.focus()
        promptField.current?.select()
      })
    }
  }

  return (
    <div className="research-alternatives">
      <h4>Other ways to find an answer</h4>
      <p>
        Use these even when in-app research is unavailable. Searches include your symptoms and
        model; adding a city is optional.
      </p>
      <div className="research-links">
        <a href={google} target="_blank" rel="noreferrer">
          Search Google <ExternalLink size={13} />
        </a>
        <a href={bing} target="_blank" rel="noreferrer">
          Search Bing <ExternalLink size={13} />
        </a>
        <a href={replacement} target="_blank" rel="noreferrer">
          Search replacement prices <ExternalLink size={13} />
        </a>
      </div>
      <details open={showPrompt} onToggle={(event) => setShowPrompt(event.currentTarget.open)}>
        <summary>Ask an AI search companion</summary>
        <p>
          Copy the prepared question, then paste it into ChatGPT, Gemini, or Perplexity. Their own
          access and usage limits apply. Your photo is not included.
        </p>
        <div className="research-links">
          <button type="button" onClick={() => void copyPrompt()}>
            <Copy size={14} /> Copy repair question
          </button>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
            Open ChatGPT <ExternalLink size={13} />
          </a>
          <a href="https://gemini.google.com/" target="_blank" rel="noreferrer">
            Open Gemini <ExternalLink size={13} />
          </a>
          <a href="https://www.perplexity.ai/" target="_blank" rel="noreferrer">
            Open Perplexity <ExternalLink size={13} />
          </a>
        </div>
        <label htmlFor="companion-question">Repair question to copy</label>
        <textarea id="companion-question" ref={promptField} readOnly value={prompt} rows={6} />
      </details>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
