# Architecture

## Components

```
                        ┌──────────────────────────── Kubernetes (Helm release) ───────────────────────────┐
 browser ── Pangolin ──►│ ingress                                                                          │
                        │  ├─ <path>/            nginx: Demand Radar app (static build)                    │
                        │  │                      └─ sidecar: caption service (OpenAI-compatible or n8n)    │
                        │  ├─ <path>/api          Node: Google Analytics connection, analytics API /api/v1  │
                        │  │                      (refresh tokens AES-GCM encrypted on a PVC)               │
                        │  └─ <path>/c04-api      FastAPI: demand data API (tables baked into the image)    │
                        │                          reads /work/snapshots/current when the pipeline ran      │
                        │  CronJobs c04-fast / c04-full (suspended)  ──► volume c04-data (root release)    │
                        └──────────────────────────────────────────────────────────────────────────────────┘
```

| Part | Code | Notes |
|---|---|---|
| Web app | [`dashboard/src`](../dashboard/src) | React 18 + TypeScript + Vite. Views: Overview (campaign recommendation, source-market map, AI post preview), Data (season, deviations, beds, model comparison), Actions (campaign management and publishing calendar), Integrations (Google Analytics, sources). |
| App API | [`dashboard/server/server.mjs`](../dashboard/server/server.mjs) | No dependencies. Google OAuth (authorization code), GA4 Data and Admin API, recorded realtime history, `/api/v1` with OpenAPI. |
| Caption service | [`dashboard/server/index.ts`](../dashboard/server/index.ts) | One structured model call per request, validated output, cache; providers: OpenAI-compatible or an n8n webhook. |
| Data API | [`c04/api/app.py`](../c04/api/app.py) | Read-only; every value `{value, is_estimate, method, grade}`; actions and warnings re-dated to the request day. |
| Data and models | [`c04/data`](../c04/data), [`c04/models`](../c04/models) | Python 3.13, pandas, LightGBM, scikit-learn, statsmodels. |
| Refresh pipeline | [`c04/models/refresh.py`](../c04/models/refresh.py) | `fast`: snow and weather only. `full`: all sources, models re-run only when their inputs changed (input hashes). Validates and publishes a snapshot atomically; keeps the last good one on failure. |

## Data flow of the data product

```
fetch (c04/data/fetch_*.py)                 open data and TTF Data Space ──► c04/data/raw (git-ignored)
build (build_features, market_mix,          ──► c04/data/processed (git-ignored)
       build_origin_panel, build_tirol_daily)
models (m1_origin, m3_daily, m4_leadtime,   ──► c04/out (git-ignored)
        gui_outputs, gui_api, forecast_winter,
        explain, market_split)
exports (export_gui + export_reasons,       ──► c04/results/gui, c04/results/c04 (tracked, served)
         export_challenge)
evaluation (real_backtest, explain, m1)     ──► c04/evaluation (tracked)
```

## Integration between the parts

- The web app calls the data API with relative URLs (`c04-api/query`, `c04-api/meta`, …), so it works
  under any release path.
- The model comparison in the app is exported from `c04/evaluation/real_backtest.csv` by
  [`dashboard/scripts/export-model-performance.py`](../dashboard/scripts/export-model-performance.py).
- The Data Space products point to the same API through an API source in TTF Space
  ([data-space.md](data-space.md)).

## CI/CD

| Workflow | Trigger | Does |
|---|---|---|
| [deploy.yaml](../.github/workflows/deploy.yaml) | manual | build app, Helm upgrade, verify, optional data refresh |
| [c04-api-image.yaml](../.github/workflows/c04-api-image.yaml) | push to `main` touching `c04/` | API tests, both images, container smoke tests, push to GHCR |

Deployment details: [deployment.md](deployment.md).
