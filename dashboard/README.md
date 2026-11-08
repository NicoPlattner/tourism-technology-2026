# Demand Radar (web app)

React 18 + TypeScript + Vite app for TVB Paznaun-Ischgl, in the Paznaun-Ischgl look, with a small Node API for
Google Analytics and a caption service for AI-written social posts.

| View | Shows |
|---|---|
| Overview | campaign recommendation for a source market and travel window: demand map of the source markets, recommended travel dates, booking lead time, AI-written post with a seasonal image, reasoning |
| Data | season (actual, forecast, last year, beds), deviations with likely reasons, bed occupancy calendar, our model vs the TVB forecast, data page with origin demand |
| Actions | managed campaigns: review, approval, publishing calendar (local, per browser) |
| Integrations | Google Analytics connection (24/7, all devices), live website data, analytics API, data sources |

Feature notes: [caption assistant](docs/caption-assistant.md), [creative director](docs/creative-director.md),
[travel window](docs/travel-window.md), [seasonal assets](docs/seasonal-assets.md),
[data page](docs/data-insights.md), [model comparison](docs/model-performance.md),
[campaign data](src/campaigns/README.md), [campaign management](src/campaigns/management/README.md),
[n8n workflow template](docs/n8n-caption-workflow.json).

## Data

- **Demand by origin, forecast, actions:** the data API (`c04-api/…`, relative to the app path); see
  [../c04](../c04).
- **Open data snapshots** in `src/data/open/`: the open overnight-stay forecast for Paznaun-Ischgl (TR53),
  Open-Meteo weather, OpenHolidays for the partner markets, events. `npm run data:open` refreshes them; the app
  also refreshes forecast and weather when it loads.
- **Partner sample** in `src/data/partner/`: a sample in the shape of the challenge data, calibrated to the
  official monthly totals (`npm run data:sample`). The real TVB data is only used in [../c04](../c04), as
  aggregates.
- **Model comparison:** exported from `c04/evaluation/real_backtest.csv` with
  `python3 dashboard/scripts/export-model-performance.py`.
- **Adding a source:** adapters in `src/data/sources.ts` fill one day-by-day model (`Day`); the analyses in
  `src/analysis/insights.ts` read only that model.

## Google Analytics and the analytics API

*Connect Google Analytics* opens Google's sign-in popup (authorization code flow, `openid email
analytics.readonly`). The API (`server/server.mjs`, no dependencies) exchanges the code for a refresh token,
stores it AES-GCM encrypted under `/data` (a PersistentVolumeClaim in the cluster) and refreshes access hourly,
so the connection stays up and is the same on every device until someone disconnects it. Several accounts and
properties can be added; properties are picked explicitly.

Setup: an OAuth web client with the app origins as authorised JavaScript origins (no redirect URIs), Analytics
Admin and Data APIs enabled, consent screen published (in "Testing" Google expires refresh tokens after 7
days). Repository: variable `GOOGLE_CLIENT_ID`, secret `GOOGLE_CLIENT_SECRET`.

Other tools read the connected GA4 properties through `<path>/api/v1/…` with
`Authorization: Bearer <ANALYTICS_API_TOKEN>`, switched on under *Integrations → Google Analytics → Analytics
API* (off by default). `GET /api/v1` lists the endpoints; `/api/v1/openapi.json` and `/api/v1/docs` describe
them.

| Endpoint | Data |
|---|---|
| `GET properties/{id}/realtime` | last 30 min: active users, per-minute trend, country, city, device, pages, events |
| `GET properties/{id}/history?days=7` | realtime data recorded every 10 min while the API is on (kept 180 days) |
| `GET properties/{id}/insights?startDate=28daysAgo&endDate=today` | standard reports: overview, trend, demographics, geography, devices, acquisition, pages, events, highlights, next steps |
| `GET properties/{id}/metadata` | dimensions and metrics of the property |
| `POST properties/{id}/report`, `POST properties/{id}/realtime` | any GA4 query |

Rows are flat objects; each section has a `status` (`ok`, `empty`, `error`) and a `note`. Demographics need
Google signals and are withheld below GA's privacy thresholds. Responses are cached (realtime 30 s, insights
10 min; `?fresh=1` skips the cache).

## Development

```bash
npm ci && npm run dev          # app with the caption service; npm run server for the GA API
```

```bash
npm run typecheck && npm run test:unit && npm run test:server
```

```bash
npm test                       # Playwright browser tests
```

```bash
npm run build                  # builds into ../helm/tourism-technology (site, API, caption service)
```

Configuration: [.env.example](.env.example) (server-only values, never `VITE_` prefixed credentials).
`.env` holds only the public OAuth client ID.
