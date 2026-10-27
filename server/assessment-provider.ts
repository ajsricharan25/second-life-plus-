import type { ResearchProvider, ResearchRequest } from '../src/lib/research-types.ts'
import { aiError } from './research-error.ts'

export function assessmentCall(
  provider: ResearchProvider,
  model: string,
  key: string,
  instructions: string,
  prompt: string,
  input: ResearchRequest,
): { url: string; headers: Record<string, string>; body: unknown } {
  const maxTokens = input.task === 'assessment' ? 2800 : input.task ? 1800 : 1800
  if (provider === 'gemini')
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, ...(input.image ? [{ inlineData: input.image }] : [])],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: input.task === 'assessment' ? 8192 : 4096,
        },
      },
    }
  if (provider === 'openai')
    return {
      url: 'https://api.openai.com/v1/responses',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: {
        model,
        store: false,
        instructions,
        max_output_tokens: maxTokens,
        text: { format: { type: 'json_object' } },
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              ...(input.image
                ? [
                    {
                      type: 'input_image',
                      image_url: `data:${input.image.mimeType};base64,${input.image.data}`,
                      detail: 'auto',
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    }
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: {
      model,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      ...(model === 'qwen/qwen3.8-27b' ? { reasoning_effort: 'none' } : {}),
      messages: [
        { role: 'system', content: instructions },
        {
          role: 'user',
          content: input.image
            ? [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${input.image.mimeType};base64,${input.image.data}`,
                    detail: 'auto',
                  },
                },
              ]
            : prompt,
        },
      ],
    },
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function normalizeAssessmentCompletion(value: unknown, provider: ResearchProvider): unknown {
  if (provider === 'groq') return value
  if (!record(value)) throw aiError('invalid_response')
  let text = ''
  if (provider === 'gemini') {
    if (record(value.promptFeedback) && value.promptFeedback.blockReason)
      throw aiError('response_blocked')
    const candidate = Array.isArray(value.candidates) ? value.candidates[0] : undefined
    if (!record(candidate)) throw aiError('invalid_response')
    if (candidate.finishReason === 'MAX_TOKENS') throw aiError('incomplete_answer')
    if (candidate.finishReason !== 'STOP') throw aiError('response_blocked')
    if (!record(candidate.content) || !Array.isArray(candidate.content.parts))
      throw aiError('invalid_response')
    text = candidate.content.parts
      .filter(record)
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
  } else {
    if (value.status === 'incomplete') throw aiError('incomplete_answer')
    if (value.status !== 'completed' || !Array.isArray(value.output))
      throw aiError('invalid_response')
    for (const message of value.output) {
      if (!record(message) || message.type !== 'message' || message.role !== 'assistant') continue
      if (message.status !== 'completed' || !Array.isArray(message.content))
        throw aiError('invalid_response')
      for (const part of message.content) {
        if (!record(part)) throw aiError('invalid_response')
        if (part.type === 'refusal') throw aiError('response_blocked')
        if (part.type !== 'output_text' || typeof part.text !== 'string')
          throw aiError('invalid_response')
        text += part.text
      }
    }
  }
  return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }] }
}
