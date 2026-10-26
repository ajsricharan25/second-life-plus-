# Second Life — AI Repair vs. Recycle Assistant

Describe a broken appliance, optionally share a photo, and get repair guidance from **Groq, Google Gemini, or OpenAI**. The app explains likely causes, safe checks, repair options, and repair-versus-replacement trade-offs. Web-enabled assessments include citations, and a separate calculator compares supported prices without inventing missing charges. Groq also works without a search key, with clear **AI guidance — no web check** labels and quote-needed prices.

## Run locally

Requires Node.js 24 and npm:

```sh
npm ci
cp .env.example .env.local
# Set one provider's server-side key in .env.local, then:
npm run dev
```

Vite serves the app and `/api/research` on port 5173. `npm run build` produces `dist`; `npm run preview` serves the production frontend and local API middleware on port 4173. In a cloud environment with a read-only home directory, use `npm ci --cache /workspace/.npm-cache`.

The offline estimator, Google/Bing searches, AI companion prompt, and component-specific Maps searches also work without an app API key. Missing credentials show a clear unavailable message when AI analysis is requested.

## Connect an AI provider

Set these variables in `.env.local` for development or **Vercel → Project → Settings → Environment Variables** for deployment. Keys stay on the server: never commit them, put them in a `VITE_` variable, or paste them into the app.

| Provider      | Required variables                                       | Optional model                     |
| ------------- | -------------------------------------------------------- | ---------------------------------- |
| Google Gemini | `REPAIR_AI_PROVIDER=gemini`, `GEMINI_API_KEY=<your key>` | `GEMINI_MODEL=gemini-flash-latest` |
| OpenAI        | `REPAIR_AI_PROVIDER=openai`, `OPENAI_API_KEY=<your key>` | `REPAIR_AI_MODEL=gpt-4.1`          |
| Groq          | `REPAIR_AI_PROVIDER=groq`, `GROQ_API_KEY=<your key>`     | `GROQ_MODEL=qwen/qwen3.8-27b`      |

An existing `REPAIR_AI_API_KEY` is also accepted as an OpenAI key and takes precedence over `OPENAI_API_KEY`. If the provider is omitted, configured keys select OpenAI first, then Gemini, then Groq. Set `REPAIR_AI_PROVIDER` explicitly when more than one provider's key is present. Failure never silently sends the request to another AI provider.

### Groq with optional web search

Use the same Vercel project and repository; creating another project is unnecessary:

1. Open **Vercel → your project → Environment Variables**.
2. Set `REPAIR_AI_PROVIDER` to `groq`, paste your Groq key into `GROQ_API_KEY`, and set `GROQ_MODEL` to `qwen/qwen3.8-27b`. Variable names are case-sensitive. Select the environments you use, including Production.
3. Optionally add `TAVILY_API_KEY` to enable in-app web research. Confirm that your search account's allowance and terms cover your use before adding its key.
4. Save, deploy the latest commit from `main`, and use **Visit** on the Ready deployment to test an assessment.

The selected Groq model must support image input and JSON output. The default matches the vision-capable model shown in the project's Groq account. Groq uses one bounded Chat Completions request, with at most 1,800 completion tokens, for a concise assessment and candidate prices. Code validates the returned structure; citations use only source URLs supplied by the search service. There is no model-driven tool loop, automatic retry, provider fallback, or automatic billing upgrade.

With `TAVILY_API_KEY`, the app makes at most one basic Tavily `/search` request before the Groq call. It explicitly disables automatic search-depth selection, extra answer generation, raw-content retrieval, and image retrieval. Only a bounded text query goes to Tavily; the optional appliance photo goes to Groq after consent. A maximum of four bounded source snippets provides the research context. Published price excerpts must appear verbatim in a retrieved snippet and pass the amount, currency, category, and citation checks before entering the calculator.

Without a search key, or if search fails or supplies no usable evidence, Groq can still provide model-only guidance. The interface and downloaded report clearly say that no web check was completed. That mode has no citations or published price entries; the calculator says **Quote needed**, and direct Google/Bing/Maps links remain available. A model-only result cannot bypass the web-evidence requirements of Gemini or OpenAI.

Groq's account limits shown during setup were **30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day** for `qwen/qwen3.8-27b`. These are that account's displayed limits, not universal or permanent guarantees. One Groq assessment uses one model request, but its instructions, source snippets, image, and generated answer also consume tokens. Measure actual usage during a small pilot; the daily token allowance can bind long before the request allowance. This integration does not bypass provider limits or enable paid billing.

Successful Groq calls log bounded input/output token totals under `[repair-research-usage]` in the Vercel function logs, without prompts, photos, or keys. Use those totals to estimate how many assessments the account can support.

[Tavily's official SDK README](https://github.com/tavily-ai/tavily-python#cost) advertises up to 1,000 free credits per month for personal use. Verify current credit costs and eligibility for a public app; a search key is not a guarantee of unlimited or free public usage. Search remains optional, so a missing or exhausted search allowance does not require invented prices or an automatic paid upgrade.

Verified API references: [Groq's generated Chat Completions parameters](https://github.com/groq/groq-python/blob/main/src/groq/types/chat/completion_create_params.py), [Groq image-input format](https://github.com/groq/groq-python/blob/main/src/groq/types/chat/chat_completion_content_part_image_param.py), and [Tavily's search client](https://github.com/tavily-ai/tavily-python/blob/master/tavily/tavily.py). Groq's `json_object` mode requires an explicit JSON instruction; schema and evidence validation remain the application's responsibility.

### Gemini and OpenAI web research

Use a model available to your account that supports images, its provider's web search, and structured output. Gemini uses the native `generateContent` API with Google Search grounding; OpenAI uses the Responses API with `web_search`. These two integrations use two bounded calls:

1. Research symptoms, optional photo, manufacturer guidance, repair prices, and replacement prices. Return a 500–800 word assessment with source citations.
2. Extract prices from that cited answer into a strict schema, with no tools and no photo. Code validates amounts, currencies, price categories, quoted evidence, and citation proximity before displaying them.

Gemini and OpenAI require a completed answer and usable web-search evidence. The app does not turn an uncited model answer into a sourced diagnosis. If price extraction fails, the cited assessment remains available and the calculator reports the missing prices.

The default Gemini model is `gemini-flash-latest`, the Flash alias used in [Google's native `generateContent` quickstart](https://github.com/googleapis/js-genai#quickstart). Google can update the model behind this alias. Set `GEMINI_MODEL` to a supported model ID to pin a version; an existing override takes precedence over the default. Model and Google Search availability still depend on your API account.

Official references: [OpenAI web search](https://platform.openai.com/docs/guides/tools-web-search), [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), and [Google's grounding examples](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Grounding.ipynb).

## User flow

- Choose washer, refrigerator, laptop, smartphone, TV, microwave, or **Other devices**. For Other devices, enter the device type or name (such as an air purifier, printer, coffee machine, or game console). Describe its condition and symptoms, enter its age, and optionally add brand/model, city/postcode, and a replacement budget in INR or USD.
- **Analyze with AI** starts the assessment for every device type. It requests a direct summary, ranked likely causes, safe checks and what their results mean, remedies and how to recognize success, stopping conditions, repair options and prices, repair versus replacement, and up to two questions to narrow the issue down. Gemini/OpenAI target 500–800 words; Groq uses a shorter bounded response to conserve its free-account token allowance.
- Photos are optional and require an unchecked-by-default **Include this photo in AI analysis** consent box. The browser decodes JPEG/PNG/WebP uploads up to 8 MB, resizes to at most 1280 pixels, removes EXIF through re-encoding, and sends a JPEG no larger than 1 MB. Without consent, no photo is sent.
- Published prices appear as **component only**, **labour/diagnostic fee**, **total repair**, or **new whole-device replacement**, with source links and quoted evidence.
- The calculator uses a cited total repair and a cited replacement price, or the user's explicitly entered new-device budget. It computes the percentage range in code, prioritizes prices naming the submitted model, and never mixes currencies or adds unrelated parts and labour listings.
- A ₹500 component stays ₹500. If labour or a complete repair price is missing, the app says what is missing instead of inventing a ₹1,500 bill. General examples remain labelled as such.
- Google Maps searches use an editable component-specific service and city/postcode. There is no live shop quote or booking integration.
- **Download** includes the current AI answer, provider, evidence mode, check time, citations when available, and clearly labelled offline estimates. Model-only guidance is identified as having no web check. **Save** stores up to 30 sets of device details in this browser; it does not retain photos or AI answers. Reopening saved details does not automatically make an AI request.
- Editing the research service or location clears stale AI results and requires a new research action. Google/Bing searches, replacement-price searches, and a detailed question to copy into ChatGPT, Gemini, or Perplexity remain available. Custom device names are used in all these searches.

## Prices and uncertainty

AI can suggest plausible causes from symptoms and visible evidence; it cannot confirm an internal component failure from an exterior photo. The assessment should give useful checks and remedies, while identifying the particular tests or hazardous internal work that need professional handling. Known danger symptoms also produce an immediate local safety alert.

For Gemini/OpenAI, price checks establish support **within the cited search answer**. Groq additionally requires an exact excerpt from a retrieved search snippet. Neither check establishes the truth of every page or a final payable shop quote. The app does not independently fetch arbitrary source pages. Prices can be regional, conditional, outdated, or for a different model. Check the linked evidence for labour, taxes, availability, and compatibility. Model-only guidance supplies no published prices.

**Other devices** uses AI research without assigning a preset fault, replacement price, lifespan, material weight, or recycling payout. Its device name is retained in saved details, downloaded reports, and repair/shop searches. If AI is unavailable, direct search and companion options remain usable; no generic appliance estimate is substituted.

For the six preset categories, **Explore my options** runs the original offline symptom checklist. Those cost, service-life, material-weight, and recovery assumptions remain explicitly unverified. In AI mode they are collapsed under **Offline planning estimate and material assumptions**; they never overwrite the sourced calculator. Recycling values remain illustrative because neither a photo nor a language model can measure the device's recoverable metals or establish a recycler's payout. Batteries, refrigerant recovery, collection fees, and processing fees are not included.

The offline rules suggest repair below 40% of replacement cost with at least two assumed years remaining, and consider recycling above 60%, or above 25% with at most one assumed year remaining. Unknown, conflicting, and dangerous symptoms require further assessment. These thresholds are planning assumptions, not instructions to discard equipment.

## Vercel deployment

The current repository is [ajsricharan25/second-life-plus-](https://github.com/ajsricharan25/second-life-plus-).

| Setting   | Value           |
| --------- | --------------- |
| Framework | Vite            |
| Node.js   | 24.x            |
| Install   | `npm ci`        |
| Build     | `npm run build` |
| Output    | `dist`          |

1. Import this repository, or keep the existing Vercel project connected to its `main` branch.
2. Add one provider's variables above to the environments you use, including Production.
3. Deploy the latest commit. Environment-variable changes require a new deployment.
4. On the deployed site, enter a specific model and symptom and select **Analyze with AI**. Confirm the selected provider, substantive answer, and evidence label. In web mode, check citations and price categories; try a case with only a part listing and verify that no full bill is invented. With only a Groq key, confirm the no-web-check label and quote-needed prices. Live testing requires an active API account with access to the configured model and, when used, search service.

`api/research.ts` runs as a Node.js Function with a 60-second Vercel limit and a shared 45-second provider timeout. A static upload of `dist` alone cannot serve the AI endpoint. Vite also exposes the API during local development and preview.

Requests and provider responses are size-limited; errors are sanitized. Keys never enter the client bundle. A Groq assessment uses one model call plus at most one optional Tavily search; Gemini/OpenAI assessments can use two model calls plus the provider's search charges. The built-in six-requests-per-minute guard is process-local, not a distributed quota across Vercel instances. Use deployment-level rate limits and provider spending limits for a public deployment. Origin checking is a browser check, not authentication.

### Troubleshoot AI research

An API key being present does not establish that its provider accepted the request. Research failures show a specific message instead of reporting every failure as “no reliable answer.”

| Error                             | What to check                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI connection is not configured   | Set the selected provider's key and `REPAIR_AI_PROVIDER` for Production, then redeploy. For Groq, use `GROQ_API_KEY` and `REPAIR_AI_PROVIDER=groq`.          |
| Key rejected or access denied     | Check the key's project, restrictions, and API access in the selected provider's dashboard.                                                                  |
| Google reports the key as exposed | Create a replacement key, update the Vercel variable, and redeploy.                                                                                          |
| Model unavailable                 | Check the selected provider's model override (`GROQ_MODEL`, `GEMINI_MODEL`, or `REPAIR_AI_MODEL`) against the account's available models, then redeploy.     |
| Provider quota / billing          | Check the provider's usage, quota, and billing dashboard. This differs from the app's one-minute burst limit.                                                |
| No usable citations               | Add the exact model and a concrete symptom. The provider replied, but the app could not validate search citations; it does not substitute an invented price. |
| Incomplete answer / timeout       | Retry with a focused description. If persistent, check model availability and the function's execution limit.                                                |

Failed AI requests include expandable **Connection details** showing the provider, requested model, and upstream HTTP status when available. Structured Google quota diagnostics distinguish requests, tokens, and search grounding, and per-minute versus daily limits. Allowances and retry delays appear only when supplied by the provider; unknown limits stay unknown. A reported retry delay is a minimum, not a promise that every quota will have reset. There are no automatic retries or provider switches. These details also appear in `[repair-research]` Vercel function logs alongside the fixed error code. Raw provider errors, project identifiers, API keys, photos, and device details are excluded. To inspect the live app, use its public URL from **Visit** or **Domains**; a `prj_...` project ID is not a website address.

If Vercel reports **Ready**, the deployment completed. An `npm warn Unknown env config "cache-dir"` line is a configuration warning, not an AI provider failure. This repository does not set that option. Check the final build status before changing build commands; use runtime logs or the app's Connection details to investigate `/api/research` failures.

Gemini `429` / `RESOURCE_EXHAUSTED` responses can say “check your plan and billing” even when the immediate failure is a rate or quota limit. The app treats these as quota failures unless Google explicitly identifies a billing failure. In Google AI Studio, select the project associated with the key and check that model's usage and rate limits. An exhausted allowance may reset; an allowance of zero requires an eligible model or account configuration. A new key in the same project does not provide a separate quota. Only enable paid billing after checking your project's requirements and pricing.

## Validation

```sh
npm test
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

To reuse this cloud environment's system browser:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Unit tests cover custom-device validation and saved data compatibility, all provider contracts, grounded citation offsets including ₹ and emoji, Groq model-only and web modes, snippet-backed prices, source-based arithmetic, unsupported prices, optional image validation, failures, timeouts, and input bounds. Desktop/mobile browser tests cover Groq evidence labels and downloaded reports, custom devices through photo analysis, sourced comparison, saved/reopened details, Maps links and unavailable-AI fallback, plus automatic AI analysis, consent, stale-answer clearing, source rendering, accessible layouts, offline fallback, and Maps searches. Provider responses and external searches are fixtures in automated tests; passing them does not prove live model accuracy, current prices, or shop availability. GitHub Actions runs formatting, unit tests, build, and browser tests on pushes and pull requests.

## Project structure

```text
src/App.tsx                         Device input, optional photo, reports and saved details
src/components/WebResearchPanel.tsx AI assessment, sources and provider status
src/components/PublishedPrices.tsx  Sourced prices and comparison display
src/lib/price-comparison.ts         Deterministic arithmetic using cited prices
src/lib/photo.ts                    Client-side photo resizing and re-encoding
src/lib/estimator.ts                Offline symptom and material assumptions
src/lib/device.ts                   Custom-device identity and shared input validation
src/lib/service-search.ts           Component-specific Maps/web searches
server/research.ts                  Provider selection and bounded assessment workflow
server/gemini.ts                    Gemini grounded response adapter
server/groq.ts                      Groq guidance and optional Tavily search workflow
server/pricing.ts                   Structured extraction and evidence validation
api/research.ts                     Vercel Function entry point
tests/ai-assessment.spec.ts         Primary AI user flows (mocked providers)
```
