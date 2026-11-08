# Demand Radar Paznaun-Ischgl

Team project from the **Tourism Technology Festival 2026 hackathon** (TTF, 7–8 November 2026),
challenge 04 **"Overnight data without explanation"** by TVB Paznaun-Ischgl and feratel.

> Destinations track overnight stays, forecasts and available beds, but deviations often remain
> unexplained. How can teams find meaningful patterns, understand the gaps between forecast and actual
> demand, and react early enough to make better decisions?

We answered with three connected parts:

| Part | What it does | Where |
|---|---|---|
| **Demand Radar** (web app) | Season view, deviations, beds, ranked campaigns per source market with AI-written social posts, Google Analytics integration | [`dashboard/`](dashboard/) |
| **Demand models and data API** | Forecast for Paznaun-Ischgl, explanation of past deviations, demand by origin market for every Austrian state, ranked marketing actions; every value graded by evidence | [`c04/`](c04/) |
| **Data products on the TTF Data Space** | The API published as two products for other teams (nexyo TTF Space) | [`docs/data-space.md`](docs/data-space.md) |

Live (while the hackathon cluster runs): <https://hackathon.daria-and-nico.com/>, data API at
<https://hackathon.daria-and-nico.com/c04-api/docs>.

## Results in short

Evaluated on the real TVB data (winter 2025/26, summer 2026), ex ante from 31 October 2025:

| | Daily error (winter) | Monthly error | Bias summer 2026 |
|---|---|---|---|
| TVB forecast | 5.5 % | 6.1 % | +11.9 % |
| previous year, holiday-aligned | 10.8 % | 5.9 % | +4.0 % |
| **our ensemble** | **8.5 %** | **3.7 %** | **+2.6 %** |

- **Why forecasts miss:** the TVB forecast was too high in 11 of 12 months (+50 % in October 2026); the
  graded drivers are low snow, Friday/Saturday nights and German school holidays (grade A).
- **Who comes when:** guests and nights per origin market and month for all nine Austrian states (pooled
  LightGBM, 10.2 % monthly error per origin), split to days with each market's holidays (validated on
  mobile network data), with booking lead time and age profiles.
- **What to do first:** marketing actions ranked by spare beds × market share × holiday push in free-day
  blocks, with launch dates from booking lead times. Winter 2026/27: the gap after the early Easter.

Details: [c04/docs/results.md](c04/docs/results.md).

## Architecture

```
 open data (Statistik Austria, forecast API, holidays, snow, weather)   TTF Data Space (TVB, guest cards)
                         │                                                        │
                         ▼                                                        ▼
               c04/data  fetch + build features ───► c04/models  train, forecast, explain, rank
                                                              │
                                                              ▼
                                         c04/results  published tables (CSV, graded, no raw data)
                                                              │
                     ┌────────────────────────────────────────┼─────────────────────────────┐
                     ▼                                        ▼                             ▼
          c04/api  FastAPI /c04-api            dashboard/  React app + Node API     TTF Data Space products
          (Docker image, Helm)                 (nginx, Helm)                         (c04/dataspace)
```

Kubernetes (Helm chart in [`helm/`](helm/tourism-technology)): nginx for the app, a Node service for Google
Analytics and AI captions, the data API, and an opt-in refresh pipeline that re-fetches the sources and
re-runs models only on request. See [docs/architecture.md](docs/architecture.md).

## Repository

```
dashboard/        Demand Radar web app (React, TypeScript, Vite) and its Node API
c04/              Challenge 04 data product (Python)
  data/             fetch and build scripts, static inputs (raw data is never committed)
  models/           production models, exports, refresh pipeline
  research/         experiments that informed the model choice
  evaluation/       backtest and evaluation results
  results/          published tables served by the API
  api/              FastAPI service (Dockerfile, tests)
  pipeline/         refresh job image
  dataspace/        publishing to the TTF Data Space
  docs/             data sources, models, results, table schemas
docs/             architecture, deployment, Data Space products
helm/             Helm chart for the whole deployment
.github/          deploy workflow, image builds
```

## Quick start

Web app:

```bash
cd dashboard && npm ci && npm run dev
```

Data API with the published tables:

```bash
pip install -r c04/api/requirements.txt && cd c04/api && uvicorn app:app --port 8080
```

Tests:

```bash
cd dashboard && npm run test:unit
```

```bash
pip install -r c04/api/requirements-dev.txt && pytest -q c04/api/tests
```

Rebuilding data and models needs the TTF Data Space key for the partner data: see
[c04/README.md](c04/README.md). Deployment: [docs/deployment.md](docs/deployment.md).

## Data and licences

Partner data (TVB Paznaun-Ischgl with feratel, Salzburger Sportwelt, Hutchison Drei) came through the TTF
Data Space under TTF 2026 data licences: raw files are never committed; the repository holds derived
aggregates only, with attribution. Open data: Statistik Austria, Österreich Werbung / Nächtigungsprognose,
GeoSphere Austria, Open-Meteo (CC BY 4.0), OpenHolidays (ODbL), Landesstatistik Tirol. Full list:
[c04/docs/data-sources.md](c04/docs/data-sources.md).
