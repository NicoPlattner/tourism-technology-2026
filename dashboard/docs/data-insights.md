# Data page: tourism analysis

Branch: `feature/data-insights`. This change is local/branch-only; no deployment, refresh, training or live AI generation is needed.

## Outputs inspected

Read `api/c04/README.md`, `results/gui/README.md`, `results/c04/README.md`, the API implementation, and its actual responses before building the page. The read-only C04 endpoints do **not** need an API key. Caption/provider and Data Space credentials remain server-side and are not needed by this page.

The available November 2026 snapshot contains:

- Daily destination forecasts for 1 November 2026–30 April 2027, prediction intervals and estimated capacity. Capacity is derived from stays and free beds on comparable days last year, not live inventory.
- Origin demand queries through December 2027, with estimates, methods, grades, average stay, booking distributions, audience profiles and calendar reasons.
- Historical actual/TVB monthly comparisons and signed driver associations for winter 2025/26 and summer 2026.

In the inspected local snapshot, winter 2026/27 has 181 forecast days, about 2.304m guest nights and 77.1% capacity-weighted utilisation. The four selected markets contribute about 1.687m estimated nights, with Germany largest. These numbers are observations of that snapshot, **not constants in the application**. Future snapshots and date filters recalculate them.

## API-backed sections

- `/forecast?start=&end=`: forecast chart with optional 80% prediction band, capacity and official TR53 comparison; daily table; coverage, utilisation and spare bed-night metrics; capacity calendar with day inspection.
- Four `/query?destination=PAZNAUN&origin=&start=&end=` requests: Germany, Netherlands, Belgium, Austria. Country selection changes the focus metrics, lead-time distribution, proxy age profile and origin/destination calendar. The comparative bars refer only to these four markets, not all origins.
- `/deviations?season=`: historical actual-versus-TVB bars, net forecast bias, monthly weighted error, signed driver chart and confidence intervals. This historical selector has its own scope, independent of the analysis-date and market filters.
- `/meta`: shared snapshot hook detects refreshed served snapshots and invalidates analysis requests. Source attribution and methodology are in the page footer.

## Calculation rules

- Forecast nights are summed only across returned dates inside the selected inclusive range. Partial coverage is explicitly displayed, and gaps break the line rather than being interpolated.
- Utilisation = sum of forecast nights on days with positive capacity / sum of capacity on those same days. It is not a mean of daily percentages. Missing or zero capacity is unknown, not empty inventory.
- Spare bed-nights = sum of `max(capacity − forecast, 0)` on known-capacity days; excess demand on one day does not cancel spare beds on another. This is an estimated capacity gap, not guaranteed saleable stock.
- High-pressure days have utilisation >=95%; lower-utilisation days have utilisation <80%. These are descriptive thresholds, not automatically ranked optimal travel windows.
- Historical net forecast bias = (total TVB forecast − total actual) / total actual. Monthly weighted absolute error = sum of absolute monthly errors / total actual. Neither is presented as daily accuracy.
- Lead-time distributions use the API's arrival-month-weighted destination proxy, not measured country-specific booking behaviour. Age profiles use a comparable-region proxy. The API selects that profile's season using the query start month; the page says so.
- Driver contributions are modelled associations, not causal effects; signed contributions need not sum to the observed gap. Confidence grades and intervals remain visible.

## Interaction and failure handling

Date presets or an applied custom range reload forecast and market resources. Country selection uses the already-loaded country response. Historical season changes only the historical request. No key is embedded in the client, no new dependency is needed, and no API POST or heavy batch job is triggered.

Requests time out after 15 seconds, are cancelled on filter changes/unmount, and cannot replace newer results. Each resource has its own loading/error/retry state. A failed market does not erase the other markets or the historical section. Missing daily data leaves the origin estimates available; it never falls back to sample charts.

Old `#season`, `#capacity`, `#why` links and new `#markets` links open their sections on Data. Overview, Actions and Integrations are preserved.

## Validation

`npm run typecheck`, `npm run build`, `npm run test:unit`, and the existing Playwright suite. New coverage includes capacity-weighted metrics, unknown capacity, incomplete coverage, range boundaries, historical error formulas, origin validation, country/date filters, chart controls, calendar inspection, navigation, unavailable resources, retries and stale-response protection. Browser layout checks include 390px and desktop widths.
