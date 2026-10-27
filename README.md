# Second Life Plus — one AI device report

Describe a device, add its brand/model and location, and optionally include a photo. The app asks an AI API for a connected assessment of likely causes, why the problem may have occurred, safe checks, repair options, costs, nearby repair listings, and responsible recycling.

**The current app has no offline diagnosis or preset repair-cost/material-weight fallback.** Missing evidence stays unknown. A photo and symptoms cannot confirm an internal fault or establish recoverable material mass. Source-backed findings are still conditional evidence, not a technician's confirmed diagnosis or final shop/recycler quote.

## Four AI features

All four actions make a new explicit API call using the device details, the current report and the user's observations. No button substitutes a canned answer.

1. **Ask a follow-up:** explain new symptoms or the result of a safe check and ask what changes.
2. **Compare my options:** ask what would make repair, replacement or recycling the better decision.
3. **Review a repair quote:** enter quoted line items and ask about missing details, compatibility, fees and supported comparisons. A user-entered quote remains an unverified user report.
4. **Prepare my shop brief:** generate a tailored message, diagnostic questions and relevant observations to take to a repairer. The app does not contact a shop.

The main report stays visible during follow-ups. Download exports a **device repair passport** containing the main report, follow-up questions and answers, evidence labels and source links. Up to six follow-ups are kept in the current session. Saving retains device details, brand/model and location locally; it does not retain photos or AI answers and reopening does not call an API automatically.

## Connect Groq + Tavily on Vercel

Use the existing project connected to [ajsricharan25/second-life-plus-](https://github.com/ajsricharan25/second-life-plus-), branch `main`.

1. Open the project's **Environment Variables**.
2. Set the following for **Production and Preview**. Names are case-sensitive:

| Name                 | Value                      |
| -------------------- | -------------------------- |
| `REPAIR_AI_PROVIDER` | `groq`                     |
| `GROQ_API_KEY`       | Your Groq API key          |
| `GROQ_MODEL`         | `qwen/qwen3.8-27b`         |
| `TAVILY_API_KEY`     | Your Tavily search API key |

3. Save and deploy the latest `main` commit.
4. Open **Visit** on the Ready deployment. Enter a specific device, symptom and city/postcode, then select **Analyze with AI**. Test a follow-up and inspect the linked evidence.

Keep keys on the server. Never commit them, use a `VITE_` prefix, or paste them into chat. No new GitHub repository, domain or Vercel project is needed.

An AI key alone can provide clearly labelled guidance. **Tavily is needed for the current report's web-evidence features**, including supported prices, material quantities and published shop addresses. If search has no useful evidence or is unavailable, those details stay unverified; no shops, weights or prices are fabricated.

### Free usage and bounded requests

Use eligible free-plan keys and do not enable paid billing. The code does not turn on billing, buy credits, retry automatically or switch providers. It cannot determine the billing plan associated with a key; provider account settings and allowances remain authoritative.

- Initial assessment: **one model call** and up to **three basic Tavily searches** (repair/prices, recycling/materials, and shops when a location is supplied).
- Follow-up, comparison, quote review or shop brief: **one model call** and at most **one basic search**.
- Each search explicitly disables automatic search-depth selection, generated search answers, raw-page retrieval and image retrieval. Search failure leaves general guidance available.
- At most eight bounded search excerpts enter the model prompt. Initial Groq output is capped at 2,800 completion tokens; follow-ups at 1,800. More detailed answers consume more of the free allowance.
- The Groq account shown during setup had 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD for the selected model. Those are account-specific limits, not guaranteed app capacity. Token limits can bind first.
- Bounded input/output token totals are logged as `[repair-research-usage]`; prompts, photos and credentials are excluded. Check actual usage during a pilot.
- Tavily's [SDK documentation](https://github.com/tavily-ai/tavily-python#cost) describes a limited free allowance for personal use. Confirm current terms, public-app eligibility and credit costs in your account. No unlimited free public usage is promised.

The endpoint has a process-local six-requests-per-minute burst guard and a shared 45-second deadline. It is not a distributed per-person quota across Vercel instances. Vercel functions allow 60 seconds. Provider quota errors are shown explicitly; exhaustion does not enable paid usage.

### Other supported AI providers

The current report workflow also supports Gemini and OpenAI with the same optional Tavily evidence step:

| Provider | Required variables                            | Default model                      |
| -------- | --------------------------------------------- | ---------------------------------- |
| Gemini   | `REPAIR_AI_PROVIDER=gemini`, `GEMINI_API_KEY` | `GEMINI_MODEL=gemini-flash-latest` |
| OpenAI   | `REPAIR_AI_PROVIDER=openai`, `OPENAI_API_KEY` | `REPAIR_AI_MODEL=gpt-4.1`          |

Choose a model that supports image input and JSON output. OpenAI is not offered here as a free API. Explicitly set the provider when retaining old keys. Without explicit selection, key precedence is OpenAI, Gemini, then Groq. `REPAIR_AI_API_KEY` remains an alias for an OpenAI key.

The UI always sends an explicit assessment task. Earlier taskless Gemini/OpenAI research requests remain compatible with their native grounded research handlers; they are not used by the current UI. Legacy estimator utilities remain for compatibility/tests but do not supply data to the current report, downloads, saved-device views or AI prompts.

## Evidence rules

- **Repair prices:** candidates come only from the AI response, must quote an exact retrieved snippet, and pass currency, amount, category and source checks. Component, labour, complete repair and new whole-device prices are distinct. A ₹500 component does not become an invented ₹1,500 repair bill.
- **Comparison:** when both full-repair and replacement prices exist, code performs arithmetic on those API-derived amounts. No default budget, lifespan or recommendation threshold is inserted. Missing full repair means quote needed.
- **Recycling:** material names must have quoted source evidence. Numeric material weight requires the submitted brand/model and the named material's literal kg quantity in the excerpt. Total appliance weight cannot become recoverable copper/plastic weight. A scrap rate must appear literally with its currency per kg. Unknown weights and rates stay null. A gross value is calculated only where both are supported, with losses/fees and payout uncertainty stated.
- **Nearby shops:** a name and address must occur in a retrieved snippet and match a supplied city/postcode term. Maps links are built from that address. No invented distances, ratings, opening hours or live quotations. The AI's component-specific service phrase can also open a Google Maps search; it is not a confirmed fault or verified business listing.
- **Photos:** JPEG/PNG/WebP uploads up to 8 MB are resized to a JPEG no larger than 1 MB, with metadata stripped. An unchecked consent box controls sending the photo to the model. Photos never go to Tavily and are not resent during follow-ups.
- **Safety:** a local hazard alert can appear immediately, including when the API is unavailable. AI instructions restrict checks to non-invasive actions and identify internal/hazardous work needing qualified handling. Static form labels, validation, direct search links and safety alerts are not AI diagnoses.

Search snippets may be incomplete, stale or inaccurate. These checks establish support in the retrieved evidence; they cannot independently certify a page or a shop. User inputs, prior answers, images and snippets are treated as untrusted data. HTML in generated text is not executed. Raw upstream errors and secrets are not returned to the browser.

## Run locally and validate

Requires Node.js 24.x:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Enter your keys into `.env.local`. Vite serves both the app and `/api/research` on port 5173. Vercel uses `npm ci`, `npm run build`, output `dist`, framework Vite. Deploy the whole repository; a static upload of `dist` cannot run the AI endpoint.

```sh
npm test
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

In the cloud workspace, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`.

Tests cover provider formats, evidence validation, unsupported weights/prices/shops, all AI actions and input bounds, API failures and aborts, photo consent, saved details, reports, mobile layouts and accessibility. Browser tests for the retired offline UI have been replaced with tests of the unified API-only report. External providers are mocked: passing tests does not establish live account access or model accuracy.

## Troubleshooting

- **Missing configuration:** verify uppercase variable names and `REPAIR_AI_PROVIDER`, then deploy again.
- **Quota/rate limit:** inspect the selected provider/model's allowance. The app does not automatically retry or enable billing.
- **No web check:** verify `TAVILY_API_KEY` and its allowance; an empty search can also leave evidence unavailable.
- **No material value or local listing:** provide the exact brand/model and city. Evidence may genuinely be absent; the app will not invent it.
- **Rejected/incomplete answer:** inspect the sanitized Connection details and Vercel runtime logs, then check model availability and supported JSON/image input.
- **Deployment Ready with npm warnings:** the deployment succeeded. Runtime API problems are separate from build warnings such as an environment-level `cache-dir` setting.

API references: [Groq Chat Completions parameters](https://github.com/groq/groq-python/blob/main/src/groq/types/chat/completion_create_params.py), [Groq image input](https://github.com/groq/groq-python/blob/main/src/groq/types/chat/chat_completion_content_part_image_param.py), [Tavily search client](https://github.com/tavily-ai/tavily-python/blob/master/tavily/tavily.py), [Gemini API SDK](https://github.com/googleapis/js-genai), [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses).
