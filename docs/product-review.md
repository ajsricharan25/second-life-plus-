# Product and implementation review

Reviewed for the public-beta decision: device input → API research → repair/recycling cost tables → follow-up → saved report → technician handoff. This is a product and correctness review, not a claim of perfect diagnosis or a full security audit.

## Product assessment

The strongest purpose is helping someone take a specific device problem from symptoms to a repair discussion. Search is excellent for discovering pages; Second Life can connect the user's observations, conditional explanations, costs, sources and next action in one reusable record. That usefulness needs to be measured with real users. There is no evidence here that the app is more accurate than Google or a qualified technician.

The existing foundation is useful: one report, API-generated estimates with assumptions, separate labels for published evidence, source links, safe handling for hazardous symptoms, local listings only when supported, and visible failures rather than invented fallback answers. The review found gaps in acting on and keeping that report.

## Findings and changes

| Finding                                                                                                  | Impact                                                                                                                      | Change                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The next action was buried in a long report.                                                             | Users had to interpret the whole answer before acting.                                                                      | A compact API-generated next-step card with a conditional rationale appears first. Missing/invalid optional output does not create a preset recommendation.                                            |
| Follow-up required users to formulate their own question.                                                | Useful observations could be missed or spread over multiple requests.                                                       | Up to three API-generated observation questions, submitted together through one existing follow-up request. Only already-known external observations are requested; blanks are allowed.                |
| Save retained device details but discarded the AI answer. Navigation could also clear an unsaved answer. | Returning users needed fresh research to recover their findings, spending quota and potentially getting a different answer. | Explicitly saved reports now retain the original answer, citations, cost tables and submitted follow-ups. Navigation preserves the current report in memory. Reopening never starts a new API request. |
| Text download was the only technician handoff.                                                           | Tables and references were harder to read outside the app.                                                                  | A print/PDF passport preserves tables, observations, generation dates, uncertainty labels and full reference URLs.                                                                                     |
| Repeated follow-up cost tables had identical landmark labels.                                            | Screen-reader navigation could not distinguish the report sections.                                                         | Accessible labels include the assessment/follow-up context and sequence.                                                                                                                               |

## Cost and data handling

The next-step fields use the existing completion, not another AI call. They add some tokens to that request; existing output limits stay in place. Submitting guided observations uses one AI action and at most one basic search, subject to the same server-side daily account allowance as other actions. Saving, opening and printing use no model or search requests. No automatic retries, background research or new paid services were added.

Saved reports are local to the browser profile, not the signed-in account. They are written only on explicit Save/Update. The schema validates restored reports, accepts legacy device-only records, and whitelists persisted fields. No photo bytes, auth credentials or quota metadata are saved. Text may contain observations derived from a photo. Stored generation dates remain visible and reopening is labelled; it does not imply current prices. Storage is bounded and a failed write leaves the previous saved copy intact.

## Release limits and next evidence to collect

1. **Confirm the live daily limit before broad sharing.** The implementation is optional until the Auth0/Redis configuration is enabled. The deployed app should require sign-in, show the shared per-account balance across sessions, and reject the fourth action. Follow [daily-limit setup](daily-limits-setup.md). Local mocked tests do not establish that the deployed environment has this configuration.
2. **Free-provider capacity remains shared.** A per-account daily limit does not reserve monthly Tavily credits for each person. Use a small beta first and watch the real provider dashboards; publish the app's availability honestly. This release adds no automatic paid fallback or app-wide monthly budget controller.
3. **Validate usefulness and model output with real cases.** Start with several distinct devices, including a software-only problem, an ambiguous fault, a hazardous symptom, an uncommon device, and a location with weak search evidence. Compare the suggested next action and repair ranges with a technician's assessment or actual quote. Record unsupported claims, useful vs unnecessary questions, source relevance, and whether users can identify their next step without assistance. Do not publish unsupported accuracy percentages.
4. **Preserve evidence boundaries.** An exact snippet match proves that the retrieved text contains a claim; it does not prove the source is correct, current, compatible with the device, or locally available. AI ranges and material composition remain estimates/unconfirmed where labelled. A photo cannot establish an internal fault or measured recovery weight.

The current release's differentiator is a guided, reusable repair passport. The next useful investment after a small beta is feedback from actual repair outcomes, rather than more automatic AI calls.

## Validation scope

Automated checks cover bounded optional guidance, citation offsets after inserting the next step, batching observations within the request limit, daily-limit enforcement, legacy and current saved records, storage failures and field exclusions, reopening without API calls, report navigation, accessible follow-up tables, printing, and desktop/mobile flows. Production build and formatting checks are also run. Browser fixtures mock AI, search and account services; they do not measure live model accuracy, real shop availability or deployed quota configuration.

Review validation: **493 unit/API tests and 64 desktop/mobile browser tests passed**, along with the production build, formatting and diff checks. The generated A4 passport and next-step card were also visually inspected. No live provider credits were used for this validation.
