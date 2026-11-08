# Live data product on the TTF Data Space: plan and state

Goal: offer our data as a **live API product** on TTF Space (side prize "Best
Data Product"), refreshed by our own server instead of a one-off upload.
State: 8 Nov 2026, 08:50 CET. Submission 13:00.

## What we found

- TTF Space product types: Dataset, Data series, API (service). Access: Open,
  Members, Challenge, External. Publishing is done in the web UI (Data products ▸
  New data product); the MCP endpoint we use has consumer tools only.
- External APIs are listed with endpoint, documentation (OpenAPI or help page),
  landing page, contact, licence and audience, e.g. the official overnight-stays
  forecast API, LuxActive, nexyo's Off-Season Proof. Registration fields for
  teams are not documented: fill in the UI, ask the TTF help desk if needed.
- Award criteria are not published; the portal leaderboard counts re-use.
  Declaring the source products we use counts as re-use for them.
- TVB licence (`paznaun-ischgl-ttf-2026-v1`): distributing derived datasets,
  results and models is allowed with attribution to TVB Paznaun-Ischgl; raw
  data may not be distributed; no commercial use.
- Our API is not ready for listing yet: `/c04-api/openapi.json` and
  `/c04-api/docs` return 404 behind the prefix, there is no landing page, and
  the tables are baked into the image (no refresh).

## Architecture

```
                 ┌──────── CronJob "fast" (every 6 h, ~1 min) ───────┐
 Open-Meteo ─────┤ weather, snow, official forecast, "today"         │
 GeoSphere ──────┤   -> pull reasons, forecast flags, warnings,      │
 Nächtigungs- ───┤      actions (launch dates, still bookable)       │
 prognose API    └───────────────────────┬───────────────────────────┘
                 ┌──────── CronJob "full" (nightly, only on new data)┐
 OpenHolidays ───┤ holidays, Statistik Austria month, TVB editions   │
 Statistik AT ───┤   -> whole chain: features, M1-M5, forecast,      │
 TTF Space (TVB)─┤      deviations, reason tables, actions           │
                 └───────────────────────┬───────────────────────────┘
                                         ▼  validate (schema, no gaps, ranges, tests)
                        PVC c04-data: snapshots/<timestamp>/, current -> last good
                                         ▼  read-only
                     c04-api Deployment  /c04-api/*  + /openapi.json, /docs, landing page
                                         ▼
                     TTF Space product "API / external": endpoint, docs, licence, sources
```

A failed or invalid refresh never replaces the last good snapshot; `/meta`
then shows the data as stale. The tables baked into the image stay as a
fallback when the volume is empty.

## Sources and refresh

| Source | Feeds | Refresh | Licence of derived data |
|---|---|---|---|
| Open-Meteo forecast (16 days) | pull reasons, weather in `/query` | every 6 h | CC BY 4.0 |
| GeoSphere SNOWGRID | snow depth (observed and typical) | daily | CC BY 4.0 |
| Nächtigungsprognose API (Austria Tourism) | official forecast in `/forecast` | daily | CC BY 4.0 |
| "today" | still bookable, launch dates, warnings in the future only | every 6 h | – |
| OpenHolidays API (+ our corrections) | push reasons, daily shares | weekly | ODbL (share-alike for the holiday tables) |
| Statistik Austria OGD (month by origin) | M1/M2, monthly_origin | daily check, rebuild on a new month | CC BY 4.0 |
| TTF Space: TVB overnight stays, available beds (monthly editions) | Paznaun forecast, deviations, capacity, actions | daily check, rebuild on a new edition | TVB TTF licence: derived only, attribution, non-commercial |

## Work packages

**P1: make the API listable (about 1 h, before 13:00)**
1. OpenAPI and Swagger UI under the prefix (`/c04-api/openapi.json`, `/c04-api/docs`), landing page at `/c04-api/` (what, routes, examples, licence, attribution, freshness).
2. `/meta` with `data_as_of` per source, snapshot version, last and next refresh.
3. "Today" computed at request time, not fixed at 8 Nov (launch dates, still bookable).
4. Product texts for the TTF Space form (title, description, endpoint, docs, licence, access, declared sources).

**P2: live refresh of the open sources (about 1.5 h)**
1. Pipeline image `c04-pipeline` (models' dependencies), built by the image workflow.
2. Helm: PVC `c04-data`, CronJob `fast`, API mounts the volume read-only and reloads when `current` changes.
3. Validation gate before switching: schema, no empty cells, row counts, value ranges, the API tests against the new snapshot.

**P3: full nightly rebuild incl. TVB data (about 1.5 h, may run past 13:00)**
1. Kubernetes secret with a TTF Space key (from a GitHub Actions secret, like the Google secret today); the pipeline checks new editions via `list_editions`.
2. CronJob `full`: holidays, Statistik Austria, TVB, all models; keeps raw caches on the volume (never in git or in the API).
3. Snapshot history: `/c04-api/snapshots` lists versions, so consumers can see how the forecast changed.

## Decisions needed

1. **Key in the cluster:** someone with repo admin rights adds a GitHub secret `TTF_SPACE_API_KEY`. Without it, P3 runs on open sources only and the TVB parts stay at the last snapshot.
2. **Stable URL:** the product endpoint should not change. Option: keep `/c04-data-models/c04-api`, or a dedicated path (a root deploy only on explicit request).
3. **One or two products:** recommended two: (a) Austria and Tirol demand by origin (open sources, Open, ODbL/CC BY), (b) Paznaun answers with TVB-derived data (Members, TVB attribution, non-commercial).
4. **Registration:** a team member with a TTF Space login fills in the form; I prepare all texts and links.

## State (8 Nov, 09:40 CET)

- P1 done: API at `https://hackathon.daria-and-nico.com/demand-api/c04-api/` (release branch `demand-api`,
  deployed from `main`), with `/docs`, `/openapi.json`, landing page, `/meta` freshness, actions and warnings
  re-dated to today on every request. Form texts: `DATASPACE-PRODUCTS.md`.
- P2 + P3 built together: `models/refresh.py` (fast / full / auto), image `pipeline/c04/Dockerfile`
  (`ghcr.io/<owner>/c04-pipeline`), Helm `templates/c04-pipeline.yaml` (volume `c04-data`, bootstrap Job per
  deploy, CronJobs fast 05:23/11:23/17:23/23:23 and full 03:41 Europe/Vienna), API reads
  `/work/snapshots/current` read-only. The deploy workflow stores `TTF_SPACE_API_KEY` as Kubernetes secret
  `<release>-ttf`, mounted only into the pipeline.

### Change detection

| Step | Runs when |
|---|---|
| fetch snow, weather, official forecast | every run |
| fetch holidays, Statistik Austria, Landesstatistik Tirol, TVB, guest cards | full runs |
| build_features, forecast_winter, export_gui (reasons), export_challenge | every run (daily inputs) |
| M1 (origin x month) | origin panel changed (new Statistik Austria month or holidays) |
| M3 (daily shares) | Tirol daily pattern, holiday history or M1 changed |
| market split, M4 (lead time) | TVB data changed |
| M5 (age), GUI table | their inputs changed |

A run publishes a new snapshot only after validation: required tables present and non-empty, no columns
lost against the previous snapshot, no empty cells in `monthly_origin`, the API test suite passing on the
new tables. Otherwise the last good snapshot stays.

### Follow-ups (after the hackathon)

- Fixed date windows in fetch scripts end 2027-08 (`fetch_drivers.py`, `build_features.py`) and 2027-12
  (`build_origin_panel.py`, `fetch_holidays_history.py`); `build_tirol_daily.py` uses months up to
  2026-08. Make them relative to today before summer 2027.
- The challenge outputs cover winter 26/27; extend the horizon to the next season.
- API tests use fixed expectations (e.g. Bavarian holidays in Jan–Mar 2027): make them date-relative.
