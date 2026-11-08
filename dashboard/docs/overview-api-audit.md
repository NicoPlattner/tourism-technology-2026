# Overview API integration and verification

Branch: `feature/overview-live-data`, based on `main` at `89c7cb1`. Audit date: 8 November 2026.

## Requirement verification

| Requirement | Result | Concrete evidence |
|---|---|---|
| Overview reads the actual backend | PASS | `demand/client.ts` calls the branch-relative `c04-api/query`; real deployed queries and a browser using the real FastAPI service over tracked tables were verified. |
| Correct origin, destination and dates | PASS | `contracts.ts` maps Germany→DE, Netherlands→25, Belgium→62, Austria→AT and validates the echoed Paznaun destination and exact dates. `demand.test.ts` rejects mismatched responses. |
| Demand metrics and heatmap use API values | PASS | `SourceMarketMap.tsx` colors the four supported origins by `nights.value`. The legend uses fixed absolute bands, independent of selection or period. Unsupported countries are background geography; missing data is gray, not zero. |
| Date and origin selection remain synchronized | PASS | `overview-demand.spec.ts` changes both filters, checks totals, colors, timing, stay and outgoing AI evidence. Delayed older demand and AI responses cannot overwrite the newer selection. |
| API lead time drives recommendations | PASS | `recommendation.ts` uses `booking_lead_time.value.median_days_ahead`, weighted by arrival months. It recomputes the promotion window and all three proposed post timestamps, including Vienna DST. |
| Most common booking duration | BLOCKED | The API exposes no booking-duration histogram or modal duration. It exposes `length_of_stay = nights / guests`, an average, which is not a most-common booking duration. No such statistic has been fabricated. |
| Available duration statistic is correctly used | PASS | UI labels **Average stay**, in nights. The structured LLM context carries `averageStayNights` and its method/grade, explicitly distinguishing it from lead time and modal booking duration. |
| Backend reasoning reaches the model | PASS | Holiday overlap, listed events, season-calendar information and the historical-snow caveat are reduced to bounded evidence in `tourismContext`. Actual upstream-model responses referred to the selected dates, proxy lead and average stay. |
| Reasoning is genuinely AI generated | PASS, on Regenerate | `server/prompt.ts`, schema and validation require `campaignReasoning` with API evidence. The UI shows **Data summary** before generation and **AI reasoning** only after a valid live response. No automatic LLM request on a filter change. |
| Concise explanations | PASS | Prompt targets 200–420 characters; validation accepts 160–420. Live examples were about 300 characters, comparable to the earlier explanation. |
| Personalized captions | PASS | Age, platform, language, visual, exact dates, lead time, average stay, demand and bounded reasons reach the model. The prompt requires the selected month and destination in the caption. A live Dutch July caption explicitly included “juli” and “Paznaun”; German winter and Dutch summer outputs differed. |
| Loading, missing data, failure | PASS | No mock metrics are shown while loading or after failure. Data-dependent regeneration and Review & Schedule are disabled. Retry is available. Partial missing markets and zero-demand results have separate handling. |
| LLM failure | PASS | Existing caption-assistant failure tests preserve the previous valid image-caption pair. Failed generation does not create an AI explanation. |
| Existing design and other pages | PASS | Existing responsive Overview and Integrations tests pass. Nico’s Integrations page and analytics service files are unchanged. |

## Data flow

`travel dates → useDemand → DemandClient → /c04-api/query` (four origins)

Each validated response feeds both the map and the selected-market campaign overlay. The latter replaces mock timing with the API median, preserves the chosen age/platform/image direction, adds the mean stay and demand summary, and retains source/method caveats in expanded reasoning.

`selected campaign → creativeRequest → tourismContext → normalizeMetadata → /api/marketing/generate-caption → configured provider → validated caption + campaignReasoning → same-context UI/cache`

The cache identity includes origin, dates, age, platform, tone, image direction and tourism evidence. The demand cache is bounded, keyed by origin and exact dates, and expires after five minutes. Returning to an unchanged context can reuse matching data and creative results.

The API’s date horizon is 2024–2027. Its implementation clips partially overlapping queries, so the client rejects a partially unsupported range rather than presenting a partial total as a full-period result.

## Issues found and fixes

- The previous Overview used scenario lead times and fixed selected-country colors. Added a validated API adapter, date-keyed request lifecycle and numeric heat shading.
- Timing and explanation were fictional despite an existing backend. Replaced displayed timing with the API median and connected backend reasoning to both the immediate summary and optional live AI reasoning.
- A most-common duration cannot be computed from the API mean. Used the accurate **Average stay** label and explicitly documented the missing statistic in detailed reasoning and model instructions.
- Changing filters could otherwise leave an old response visible. The hook immediately masks the previous context, ignores late requests and retains creative results only under their exact metadata identity.
- API failure could otherwise look like successful demo statistics. Missing metrics display dashes; actions requiring data remain disabled.
- Browser fetch needs its global binding. The adapter binds the default fetch function; browser tests verified actual requests rather than relying only on Node tests.
- A local custom development port was rejected by the caption origin check. The development launcher now respects `CAPTION_ALLOWED_ORIGINS`; production origin checking remains intact.
- The example n8n response mapping would drop the new reasoning field. It now preserves `campaignReasoning` when tourism evidence is provided. The configured OpenAI-compatible provider was exercised live; n8n was not deployed or live-tested.

## Test results

Automated checks run from the repository/app as appropriate:

- `npm run typecheck` — passed (also run by the production build).
- `npm run test:unit` — 55 passed, including API parsing, cache separation, fixed heat scale, lead/average mapping, evidence normalization, prompt/schema and AI validation.
- `npm run test:server` — 3 analytics server tests passed.
- `TEST_URL=http://127.0.0.1:5175/ npm test -- --workers=2` — 36 browser tests passed. Critical additions are in `tests/overview-demand.spec.ts`; existing tests use isolated API fixtures, not the deployed service.
- `/tmp/tourism-c04-venv/bin/python -m pytest -q api/c04/tests` — 11 passed; one upstream FastAPI/Starlette test-client deprecation warning.
- `npm run build` — passed, including TypeScript, Vite and both service build outputs.
- `helm lint helm/tourism-technology` — passed.
- `git diff --check` — passed.
- There is no lint script in this repository.

Live verification, distinct from mocked browser tests:

- `scripts/verify-overview-ai.ts`: two live HTTP caption-service calls using real deployed C04 query responses and the configured OpenAI-compatible model, with credentials loaded from the existing private environment file. Germany winter / Dutch summer returned valid localized image-caption pairs and grounded English reasoning. No credential values were printed.
- `node scripts/verify-overview-browser.mjs`: Chromium against the local app plus the actual FastAPI service reading the repository’s result tables; no demand or caption mocks. Verified Germany February → Netherlands July, live regeneration, the visible AI explanation and context isolation. Screenshot: `test-results/overview-real-api.png` (generated artifact).

Actual backend values checked:

| Selected context | Guest nights | Average stay | Median lead-time proxy |
|---|---:|---:|---:|
| Germany, 15–21 Feb 2027 | 61,143 | 4.65 nights | 135 days |
| Netherlands, 15–21 Feb 2027 | 41,208 | 5.83 nights | 135 days |
| Netherlands, 12–18 Jul 2027 | 3,430 | 3.83 nights | 19 days |

These are API estimates/proxies, not observed bookings for the selected age group. A 135-day lead can place a campaign window before today; that historical planning implication is retained and explained rather than silently clamped or replaced.

## Remaining limitations and intentional demo behavior

- A modal booking duration requires a new backend statistic or a booking-duration distribution. Average stay cannot answer it.
- The backend’s Paznaun market demand is an estimate using Tirol data and destination shares. The lead-time profile is a period-weighted proxy, not measured behavior of the selected audience. Sources, methods and grades remain available in detailed reasoning.
- The eight-day promotion window and three proposed posts remain planning heuristics around the API lead-time anchor, not backend-optimized scheduling.
- Initial creative assets/captions, age/platform heuristics and the local Actions workflow intentionally remain demo functionality. They are distinct from API metrics. No image generation or real publishing was added.
- Live AI reasoning is requested with Regenerate, not automatically on every filter change. The immediate explanation is an explicitly labeled deterministic data summary.
- Prompt grounding, schemas and length checks reduce errors but cannot prove every generated sentence. Live examples were reviewed against their supplied aggregates; human review remains required before publishing. Listed events and typical snow are never promises of current conditions.

## Final verdict

1. **Backend connection:** yes, for the documented demand, lead-time, mean-stay and reasoning fields; not a missing modal-duration field.
2. **Dynamic heatmap:** yes, verified against numeric API totals and filter changes, using one consistent scale.
3. **Lead time and duration:** lead time and mean stay are correctly mapped and passed. Most-common booking duration remains blocked by missing backend data.
4. **AI reasoning:** yes after explicit regeneration, using structured backend evidence. The initial data summary is clearly distinguished.
5. **Personalized captions:** yes; live localized outputs used destination and selected month alongside age/platform/visual context.
6. **Filter synchronization:** yes, including late data and AI responses and partial failures.
7. **Hackathon readiness:** ready for the supported 2024–2027 data and optional live regeneration, with the modal-duration limitation disclosed. Model availability and human review still apply.

## Reproduce locally

Run the C04 API with its documented Python requirements on port 8080. From `dashboard`, run `npm run dev` (normally port 5173), or specify `-- --host 127.0.0.1 --port 5175` with `CAPTION_ALLOWED_ORIGINS=http://127.0.0.1:5175` for the live browser script. `C04_API_URL` can override the Vite proxy target; it defaults to the local service. Keep caption credentials in private environment settings, never in source.

The two `verify-overview-*` scripts deliberately call the live model and are not part of routine automated tests. Set the actual service URL/environment before running them; the AI script requires `C04_API_URL` pointing to a deployed C04 API base URL.

## Caption reliability follow-up

A live 35–44 Instagram case returned 104–107 characters, below its 120–220 limit. Credentials and connectivity were working; validation rejected the completed model output. The OpenAI-compatible adapter now requests one correction with the actual character count and required bounds. Both attempts share the original deadline. A second invalid response is still rejected; no invalid caption is cached or displayed as AI output. Authentication, rate-limit and refusal errors are not retried.

Live reproduction confirmed the previously undersized German summer and Austrian winter cases now validate after correction. A real browser generation for Germany / July / 35–44 returned HTTP 200 and a 144-character caption. New regression tests cover correction feedback, the two-attempt limit, authentication errors and seasonal preview lengths. The generic 35–44 fallback was replaced with curated, image-specific previews for all four seasons in German, Dutch and French. These remain explicitly labeled demo previews.
