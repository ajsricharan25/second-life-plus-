# Second Life — AI Repair vs. Recycle Assistant

Describe a broken appliance, optionally share a photo, and get a web-sourced assessment from **Google Gemini or OpenAI**. The app explains likely causes, safe checks, repair options, and repair-versus-replacement trade-offs. A separate calculator compares supported prices without inventing missing charges.

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

## Connect Gemini or OpenAI

Set these variables in `.env.local` for development or **Vercel → Project → Settings → Environment Variables** for deployment. Keys stay on the server: never commit them, put them in a `VITE_` variable, or paste them into the app.

| Provider      | Required variables                                       | Optional model                     |
| ------------- | -------------------------------------------------------- | ---------------------------------- |
| Google Gemini | `REPAIR_AI_PROVIDER=gemini`, `GEMINI_API_KEY=<your key>` | `GEMINI_MODEL=gemini-flash-latest` |
| OpenAI        | `REPAIR_AI_PROVIDER=openai`, `OPENAI_API_KEY=<your key>` | `REPAIR_AI_MODEL=gpt-4.1`          |

An existing `REPAIR_AI_API_KEY` is also accepted as an OpenAI key and takes precedence over `OPENAI_API_KEY`. If the provider is omitted, an OpenAI key selects OpenAI; otherwise a Gemini key selects Gemini. Explicit selection is recommended when both keys exist. Failure never silently sends the request to the other provider.

Use a model available to your account that supports images, its provider's web search, and structured output. Gemini uses the native `generateContent` API with Google Search grounding; OpenAI uses the Responses API with `web_search`. Both integrations use two bounded calls:

1. Research symptoms, optional photo, manufacturer guidance, repair prices, and replacement prices. Return a 500–800 word assessment with source citations.
2. Extract prices from that cited answer into a strict schema, with no tools and no photo. Code validates amounts, currencies, price categories, quoted evidence, and citation proximity before displaying them.

The server requires a completed answer and usable web-search evidence. It does not turn an uncited model answer into a sourced diagnosis. If price extraction fails, the cited assessment remains available and the calculator reports the missing prices.

The default Gemini model is `gemini-flash-latest`, the Flash alias used in [Google's native `generateContent` quickstart](https://github.com/googleapis/js-genai#quickstart). Google can update the model behind this alias. Set `GEMINI_MODEL` to a supported model ID to pin a version; an existing override takes precedence over the default. Model and Google Search availability still depend on your API account.

Official references: [OpenAI web search](https://platform.openai.com/docs/guides/tools-web-search), [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), and [Google's grounding examples](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Grounding.ipynb).

## User flow

- Choose washer, refrigerator, laptop, smartphone, TV, microwave, or **Other devices**. For Other devices, enter the device type or name (such as an air purifier, printer, coffee machine, or game console). Describe its condition and symptoms, enter its age, and optionally add brand/model, city/postcode, and a replacement budget in INR or USD.
- **Analyze with AI** starts the assessment for every device type. It requests a detailed 500–800 word answer covering a direct summary, ranked likely causes, safe checks and what their results mean, remedies and how to recognize success, stopping conditions, repair options and prices, repair versus replacement, and up to two questions to narrow the issue down.
- Photos are optional and require an unchecked-by-default **Include this photo in AI analysis** consent box. The browser decodes JPEG/PNG/WebP uploads up to 8 MB, resizes to at most 1280 pixels, removes EXIF through re-encoding, and sends a JPEG no larger than 1 MB. Without consent, no photo is sent.
- Published prices appear as **component only**, **labour/diagnostic fee**, **total repair**, or **new whole-device replacement**, with source links and quoted evidence.
- The calculator uses a cited total repair and a cited replacement price, or the user's explicitly entered new-device budget. It computes the percentage range in code, prioritizes prices naming the submitted model, and never mixes currencies or adds unrelated parts and labour listings.
- A ₹500 component stays ₹500. If labour or a complete repair price is missing, the app says what is missing instead of inventing a ₹1,500 bill. General examples remain labelled as such.
- Google Maps searches use an editable component-specific service and city/postcode. There is no live shop quote or booking integration.
- **Download** includes the current AI answer, provider, check time, citations, and clearly labelled offline estimates. **Save** stores up to 30 sets of device details in this browser; it does not retain photos or AI answers. Reopening saved details does not automatically make a paid request.
- Editing the research service or location clears stale AI results and requires a new research action. Google/Bing searches, replacement-price searches, and a detailed question to copy into ChatGPT, Gemini, or Perplexity remain available. Custom device names are used in all these searches.

## Prices and uncertainty

AI can suggest plausible causes from symptoms and visible evidence; it cannot confirm an internal component failure from an exterior photo. The assessment should give useful checks and remedies, while identifying the particular tests or hazardous internal work that need professional handling. Known danger symptoms also produce an immediate local safety alert.

Price checks establish support **within the cited search answer**, not the truth of every page or a final payable shop quote. The app does not independently fetch arbitrary source pages. Prices can be regional, conditional, outdated, or for a different model. Check the linked evidence for labour, taxes, availability, and compatibility.

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
4. On the deployed site, enter a specific model and symptom and select **Analyze with AI**. Confirm the provider label, substantive answer, working citations, and price categories. Try a case with only a part listing and verify that no full bill is invented. Live testing requires an active API account with access to the configured model and search tool.

`api/research.ts` runs as a Node.js Function with a 60-second Vercel limit and a shared 45-second provider timeout. A static upload of `dist` alone cannot serve the AI endpoint. Vite also exposes the API during local development and preview.

Requests and provider responses are size-limited; errors are sanitized. Keys never enter the client bundle. Each assessment can incur two model calls plus the provider's search charges. The built-in six-requests-per-minute guard is process-local, not a distributed quota across Vercel instances. Use deployment-level rate limits and provider spending limits for a public deployment. Origin checking is a browser check, not authentication.

### Troubleshoot AI research

An API key being present does not establish that Google accepted the request. Research failures now show a specific message instead of reporting every failure as “no reliable answer.”

| Error                             | What to check                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI connection is not configured   | Set `GEMINI_API_KEY` and `REPAIR_AI_PROVIDER=gemini` for Production, then redeploy.                                                                          |
| Key rejected or access denied     | Check the key's project, restrictions, and Gemini API access in Google AI Studio / Google Cloud.                                                             |
| Google reports the key as exposed | Create a replacement key, update the Vercel variable, and redeploy.                                                                                          |
| Model unavailable                 | Remove an outdated `GEMINI_MODEL` override to use the default, or select a model your account supports; redeploy.                                            |
| Provider quota / billing          | Check the provider's usage, quota, and billing dashboard. This differs from the app's one-minute burst limit.                                                |
| No usable citations               | Add the exact model and a concrete symptom. The provider replied, but the app could not validate search citations; it does not substitute an invented price. |
| Incomplete answer / timeout       | Retry with a focused description. If persistent, check model availability and the function's execution limit.                                                |

Vercel function logs for provider rejections include `[repair-research]`, the provider, a fixed error code, and the upstream HTTP status. Citation/response failures include the provider and error code. Raw provider errors, API keys, photos, and device details are excluded. To inspect the live app, use its public URL from **Visit** or **Domains**; a `prj_...` project ID is not a website address.

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

Unit tests cover custom-device validation and saved data compatibility, both provider contracts, grounded citation offsets including ₹ and emoji, price extraction, source-based arithmetic, unsupported prices, optional image validation, failures, timeouts, and input bounds. Desktop/mobile browser tests cover custom devices through photo analysis, sourced comparison, reports, saved/reopened details, Maps links and unavailable-AI fallback, plus automatic AI analysis, consent, stale-answer clearing, downloads, source rendering, accessible layouts, offline fallback, and Maps searches. Provider responses and external searches are fixtures in automated tests; passing them does not prove live model accuracy, current prices, or shop availability. GitHub Actions runs formatting, unit tests, build, and browser tests on pushes and pull requests.

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
server/pricing.ts                   Structured extraction and evidence validation
api/research.ts                     Vercel Function entry point
tests/ai-assessment.spec.ts         Primary AI user flows (mocked providers)
```
