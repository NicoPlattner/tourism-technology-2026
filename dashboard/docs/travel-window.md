# Recommended travel window

The Overview keeps the selected **analysis period** for the country heatmap. The Campaign Planner separately displays **Recommended travel dates**: a supported future 3-, 5- or 7-day opportunity span inside that period. Dates are inclusive calendar spans, not quoted reservation lengths or inferred modal booking durations.

## Data and scope

The existing API is documented in `api/c04/README.md` and `docs/challenge-04/C04-RESULTS-README.md`.

- `/query` supplies selected-origin demand, average stay, arrival-period median lead time, methods and reasoning. It is queried again for the chosen shorter window. Planner metrics and AI evidence then refer to that window; the map still shows the full analysis period.
- `/forecast?start=&end=` supplies **destination-wide** daily guest-night forecasts, estimated capacity and an official reference forecast. Daily forecasts by origin are not exposed. We never present the regional occupancy as the selected country's occupancy.
- `/actions?start=&end=&limit=500` supplies market/region marketing-opportunity scores. The frontend filters the selected country: NL→25, BE→62; Germany includes the documented German origin regions; Austria includes Austrian states. Different origin rows are not mixed. If a country aggregate exists, it takes precedence over its constituent regions.
- Capacity is estimated using stays plus free beds on the equivalent prior-year weekday. It is not confirmed open inventory. Relevant closure notes remain in detailed reasoning. Daily actual historical demand and daily TVB target figures are not publicly exposed by this endpoint; no historical or target gap is fabricated. A positive gap against the available official reference forecast is a secondary signal, not an observed booking shortfall.

The current daily forecast covers 1 Nov 2026–30 Apr 2027. A broader analysis can still yield a window inside its supported portion. When daily forecast/capacity cannot yield a window, the planner now shows **Suggested travel dates**, explicitly marked **Suggested — could not be extracted from the data.** A future span is chosen by a simple mean-stay-guided heuristic within the analysis bounds. Its separate country query supplies timing and AI context where available; no occupancy or available-capacity claim is made.

## Ranking

`src/campaigns/opportunity/ranking.ts` is a pure, tested calculation:

1. Enumerate contiguous inclusive 3-, 5- and 7-day spans, wholly inside the analysis range.
2. Exclude starts before today's date in **Europe/Vienna**. Every day must have finite forecast nights, positive estimated capacity and positive estimated spare capacity. Missing days and unknown capacity cannot imply low occupancy.
3. Compute capacity-weighted destination occupancy, spare bed-nights, per-day selected-country action opportunity, and positive reference-forecast gap.
4. Rank by a transparent planning heuristic: 65% vacancy ratio, 15% normalized country action score per day, 10% normalized spare bed-nights per day, 5% proximity to the origin's mean stay and 5% normalized positive reference-forecast gap. Country action scores already include the backend’s capped holiday/baseline contributions and current bookability; they are used without a second holiday boost. Their totals are spread over the calendar span, since the API’s `days` can count only eligible observations inside a merged block. They are not daily country guest-night forecasts. No claim of a proven optimum is made.
5. Prefer candidates whose provisional arrival-period booking median is not yet past. This screening uses the analysis query's median. The chosen window is queried again, and the final flag/timing uses that narrower window's median. Ties are deterministic: earlier start, then shorter duration.

Missing optional action scores do not block regional capacity ranking. The explanation states when no matching country scores are available. Missing forecast/capacity or no eligible future span yields an explicit unsupported state, never an invented optimal window.

## Campaign timing and AI

For recommended arrival `R`, window-specific booking-lead median `L` and awareness buffer `B`:

```
median booking date = R − L days
campaign end        = median booking date
campaign start      = campaign end − B days
```

Proposed posts fall at the start, midpoint and end of the awareness period, using correct Vienna DST offsets. A zero-day buffer produces one distinct proposed date. A past booking median is flagged **Booking lead-time opportunity has passed**; an awareness period already underway is also identified. Dates are not silently clamped to today. Local demo scheduling still allows human editing and review.

The public build setting `VITE_CAMPAIGN_AWARENESS_DAYS` configures 0–30 days, default 7. Invalid values fall back to 7. The deployment workflow passes repository Actions variable `CAMPAIGN_AWARENESS_DAYS` into that build setting. Changes require rebuilding/redeploying.

The chosen dates, analysis bounds, occupancy, spare-capacity estimate, availability of country action evidence, buffer and passed-opportunity flag are included in `opportunityEvidence` alongside window-specific `tourismContext`. The caption endpoint validates their bounds and alignment. The image/season follows the recommended arrival date. AI caches include this evidence; late forecast or AI results cannot replace another context.

When no daily window is supported, the request explicitly describes the dates as analysis-only creative context. It must not call them optimized or recommended dates. The existing immediate preview and optional Regenerate workflow are retained.

## Verification

- `npm run test:unit`: **66 passed**, including ranking, missing data, country/region filtering, date boundaries, booking opportunity flags, configurable buffers, year/leap-day transitions, Vienna DST, selected-window metadata and AI evidence validation.
- Browser suite: **39 passed** at 1440, 1920, 768 and 390px through the existing tests, including three new travel-window flows. Country changes produce different supported dates in controlled equal-occupancy fixtures; the test also verifies transfer to Actions uses the shorter window and recalculated publishing dates.
- Backend API tests: **11 passed** (one upstream test-client deprecation warning).
- Analytics server tests: **3 passed**.
- Production build/TypeScript and Helm lint passed; no lint script exists in the app.
- Real-data browser verification used the actual FastAPI service over the repository tables and the configured live AI service, without demand/forecast/AI mocks. A Dutch analysis of **1 Jan–30 Apr 2027** selected **18–22 Apr 2027**: a five-day window with approximately **25% estimated regional occupancy**, **50,465 spare bed-nights**, and campaign dates **23–30 Mar 2027** (19-day lead proxy plus seven-day awareness buffer). Summer without forecast coverage correctly produced no supported window. Generated artifact: `test-results/travel-window-real-api.png`.

These figures are model/capacity estimates, not live available rooms or guarantees. The selected age remains a marketing preference, not a measured demographic segment of the forecast.

## Compatibility with refreshed API snapshots

The updated main API (through `829fb38`) keeps `/query` and `/forecast` compatible. Its `/actions` now distinguishes `holiday-driven` and `share-driven` offers, models free-day blocks and travel reach, re-dates scores/launch status to today, and excludes finished action windows. These classifications and overdue-launch notes are retained in the selected-window reasoning and bounded AI context. A free-day-block/reach value is never presented as a required booking duration. The frontend still calculates its own shorter window’s campaign dates rather than substituting the backend’s clamped `launch_by`.

`/meta.freshness` identifies the **served** snapshot, generation time and backend date. The Overview checks it on mount, when the tab becomes visible and once per minute while visible. A changed identifier invalidates demand, forecast/action and AI cache identities. Metadata failures or an older API do not block otherwise supported data queries. There is no claim of a transactional multi-endpoint snapshot; a change is detected on the next metadata check. The source identifier is available in detailed reasoning, never in consumer copy.

Compatibility checks: 70 unit/API tests, 40 browser tests (including a live-snapshot change after AI generation), 15 updated backend tests and 3 analytics server tests passed, along with production build and Helm lint. The current branch incorporates main’s refreshed tables, prefixed API documentation and refresh-pipeline deployment configuration.

Holiday contributions from a merged action block are now restricted to dates supported by the selected origin’s analysis calendar. Outside those returned calendar intervals, only the backend’s weighted baseline contribution is retained. Block-level classification is labeled with its broader dates; it cannot establish a holiday overlap for every shorter subwindow. The selected-window query supplies an explicit calendar qualifier to AI, including when no qualifying overlap was returned. This avoids treating the corrected Dutch holiday calendar or a later holiday in a merged block as evidence for unrelated dates.

## User-requested suggested fallback

Unavailable forecast-derived windows now receive a clearly identified planning suggestion. The heuristic starts at the first future date inside the selected analysis period and uses the rounded available average stay to guide a 3–7-calendar-day span, clipped to the analysis end. This is not a measured booking duration or a data-extracted optimum. Entirely past analysis periods still cannot produce a future suggestion.

A separate country query for those dates supplies the lead-time proxy and mean-stay context. Campaign timing uses the same awareness-buffer rule and is labeled **Suggested campaign**. If timing data is unavailable, the suggested travel dates remain visible while campaign dates and data-dependent actions remain unavailable. The AI receives `windowSuggestion.basis = heuristic-not-extracted`, mutually exclusive with forecast `opportunityEvidence`, and must preserve this distinction in its explanation. Suggested campaigns retain their provenance when transferred to the local Actions workflow.

Verified by 72 unit/API and 44 browser tests, production build, and a real autumn-data/live-model browser flow. Example: the fixture’s 7 Sept–31 Oct 2027 analysis, 3.7-night mean and 3-day lead yield suggested travel 7–10 Sept and suggested campaign 28 Aug–4 Sept. No forecast occupancy is inferred.
