// Public messages are selected by code; provider response bodies are never shown.
export const researchErrorMessages = {
  not_configured:
    'Web research isn’t enabled yet. The app owner needs to connect an AI provider. You can still search published information directly below.',
  configuration_error:
    'The AI connection settings need attention. The app owner needs to check the selected provider and model, then redeploy.',
  api_key_invalid:
    'The AI provider rejected the API key. The app owner needs to check or replace the configured key, then redeploy.',
  api_key_blocked:
    'Google blocked this API key because it was reported as exposed. The app owner needs to create a replacement key, update the app connection, and redeploy.',
  api_access_denied:
    'The AI provider denied access. The app owner needs to check the key restrictions and whether the API is enabled for its project.',
  provider_quota_exceeded:
    'The AI provider’s quota or rate limit has been reached. Try again later; the app owner can check available quota and billing in the provider dashboard.',
  provider_billing_required:
    'The AI provider requires billing or available API credits for this request. The app owner needs to check the provider’s billing settings.',
  provider_region_unsupported:
    'The AI provider does not support requests from this deployment’s region. The app owner needs to check supported regions or configure another provider.',
  model_unavailable:
    'The configured AI model is unavailable for this API key or endpoint. The app owner needs to select a supported model and redeploy.',
  provider_request_rejected:
    'The AI provider rejected this request. Try a smaller photo or retry without it. If it still fails, the app owner needs to check that the selected model supports images and web search.',
  provider_unavailable:
    'The AI provider could not be reached or is temporarily unavailable. Try again shortly or use the direct searches below.',
  unverified_sources:
    'The AI replied without usable search citations. Try adding the exact model and a specific symptom, or use the direct searches below. No sourced price has been established.',
  invalid_response:
    'The AI response could not be validated. Try a focused description or use the direct searches below.',
  incomplete_answer:
    'The AI response ended before it was complete. Try again with a focused description of the main problem.',
  response_blocked:
    'The AI provider did not return an answer because of its content controls. Describe the device and visible symptoms plainly, or use the direct searches below.',
  research_timeout:
    'The AI research timed out. Try again with a focused description, or use the direct searches below.',
  rate_limited: 'Too many research requests. Please wait a minute and try again.',
  invalid_input:
    'Some device details could not be accepted. Check the device name, symptoms, age, budget, and photo, then try again.',
  body_too_large: 'The photo or request is too large. Choose a smaller photo and try again.',
} as const

export type ResearchErrorCode = keyof typeof researchErrorMessages

export function researchErrorMessage(code: unknown, status: number): string {
  if (typeof code === 'string' && Object.hasOwn(researchErrorMessages, code)) {
    return researchErrorMessages[code as ResearchErrorCode]
  }
  if (status === 429) return researchErrorMessages.rate_limited
  if (status === 504) return researchErrorMessages.research_timeout
  if (status === 404 || status === 405)
    return 'The AI endpoint is unavailable in this deployment. The app owner needs to deploy the latest app with its server function.'
  return researchErrorMessages.provider_unavailable
}
