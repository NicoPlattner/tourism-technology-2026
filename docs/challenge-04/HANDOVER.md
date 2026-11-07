# Challenge 04 handover: Overnight Data Without Explanation

Read this first. It is the single entry point for work on Challenge 04 in this
repository. Facts were collected on Saturday 7 November 2026 (about 17:00 CET)
from https://buildbar.at/ttf-2026, its agent feed
https://buildbar.at/ttf-2026/claude.md, the TTF Data Space catalogue and the
public forecast API.

## 1. Team decision and your role

- The team chose **Challenge 04** (TVB Paznaun-Ischgl). Ignore the other five
  challenges.
- The person you work for owns **data acquisition, data engineering, research
  on models and approaches, prediction model training and prediction testing**.
- **First task: research which models and approaches to use** (see section 6
  for starting points). Don't build UI unless asked.

## 2. Deadlines and judging

- **Submission: Sunday 8 November 2026, 13:00 CET.** Pitch at 14:00, 2 minutes
  per team.
- Jury: presentation, creativity, impact = 65 %. Challenge partners rank teams
  = 35 %.
- A technical jury visits teams Sunday 09:00–12:00 and checks that the work was
  built during the hackathon. Keep commits frequent and honest.
- Prizes: 3,000 / 2,000 / 1,000 EUR overall. Extra awards include
  **Best Data Product** (nexyo and Austria Tourism; publish a data product in
  the TTF Data Space) and the UnternehmerTUM Special Award.
- Partner contact on site both days: Raphael Tonitz (TVB Paznaun-Ischgl).
- Event news: Discord https://discord.gg/bmAAvQdsd

## 3. The challenge (verbatim)

> Destinations track overnight stays, forecasts and available beds, but
> deviations often remain unexplained. How can teams identify meaningful
> patterns, understand differences between forecasts and actual demand, and
> recognise changes early enough to make better decisions?

Paznaun-Ischgl has the numbers: daily overnight stays for the previous year, a
forecast for the coming months, the actual figures and the available bed
capacity. For this challenge the TVB and Feratel provide 244 days of overnight
data, from summer 2026 through the 2026/27 winter season, and 88 days of bed
capacity for the early winter.

These datasets are reported side by side and rarely analysed together. A
deviation between forecast and actual stays is visible, but the reason stays
unclear: weather, holidays in a source market, an event, a systematic error in
the forecast, or a gap in the data. Whether demand approaches capacity on
certain weekends usually becomes clear afterwards. By then the team can no
longer steer demand or adjust its planning.

**The challenge:**

1. Where does demand fall behind the forecast or previous year, where is
   capacity tight or unused, and why?
2. Which concrete marketing actions follow (what, when, where, for which
   market), and which comes first, ranked by effect, lead time, feasibility and
   confidence?
3. How can each recommendation show what it is based on and how reliable it
   is, given gaps, zero values and limited data history?

Note: the published datasets (section 4) cover more than the text's
"244 / 88 days". Trust the files and check what they actually contain.

## 4. Data sources

### 4a. Partner data in the TTF Data Space (members only, Challenge 04)

Access: the team registers at https://portal.ttf.nexyo.io/ ("Join TTF",
choose challenge 04). After approval, sign in to TTF Space. Files appear under
Data products ▸ Contracted after "Request access". For agents: Settings ▸ API
keys and Settings ▸ MCP. **The person sets up keys and MCP themselves. Never put
a key in the repo or the chat.** Licence: "TVB Paznaun-Ischgl TTF 2026 data
licence" (use, derive and share are allowed with attribution to TVB
Paznaun-Ischgl). Help: https://portal.ttf.nexyo.io/help

| Product | Content | Period | Link |
|---|---|---|---|
| Overnight stays Paznaun-Ischgl, Nov 2025 – Apr 2027 (complete) | Daily: previous-year figure, forecast, actual stays (Ischgl, Galtür, Kappl, See). Actuals empty for future days; forecast is 0 on a few days. CSV, 13 KB | 2025-11-04 – 2027-04-04 | https://portal.ttf.nexyo.io/products?id=264dc170-6f1d-4105-8a02-e5169617c822 |
| Overnight stays: previous year, forecast and actuals (series) | Same data as monthly editions | 2025-11 – ongoing | https://portal.ttf.nexyo.io/products?id=ffdabf2d-62b9-4aeb-bac6-e3fdf88a08a6 |
| Available beds Paznaun-Ischgl (complete) | Daily available beds, for demand-vs-capacity. CSV, 10 KB | 2025-02-06 – 2026-11-07 | https://portal.ttf.nexyo.io/products?id=736f1187-a922-450a-b9ba-4f7e2bf8eb3e |
| Available beds Paznaun-Ischgl (series) | Same data as monthly editions | 2025-02 – ongoing | https://portal.ttf.nexyo.io/products?id=92087a99-1bdd-4f79-85e8-63bd04dbed31 |
| Booking lead time Paznaun-Ischgl 2023–2026 | **Weekly bookings by lead-time class (0, 8, 31, 61, 90, 180 days before arrival).** Empty = no bookings. Leading indicator for nowcasting. CSV, 4.3 KB | 2023-10-30 – 2026-10-26 | https://portal.ttf.nexyo.io/products?id=892e2449-89da-4df3-b5dc-469a0061ec5a |
| Event calendar Paznaun-Ischgl 2026–2027 | One row per event day: concerts, sports and freeride events, markets, season openings and closings, public holidays. CSV, 5 KB | 2026-01 – 2027-12 | https://portal.ttf.nexyo.io/products?id=146a8548-31df-4c25-88f5-0a4a59a3b7a3 |
| Contwise tourism content API | POIs, events, tours for the Paznaun valley. Docs: general-solutions.eu/php/api_dokumentation,22992.html | live | https://portal.ttf.nexyo.io/products?id=c1c2740f-89f9-47d1-87af-9ac2098543cb |

All Challenge 04 products: https://portal.ttf.nexyo.io/products?challenge=overnight-data

### 4b. Open data (no registration, CC BY 4.0, credit "Österreich Werbung")

**Official overnight stay forecast (Nächtigungsprognose)**: Austria Tourism with
JOANNEUM RESEARCH, TU Wien and University of Klagenfurt. This is very likely
the "forecast" the TVB compares against. Its method is the baseline to beat or
explain.

- API, no key: https://naechtigungen.pol.joanneum.at/docs (OpenAPI at `/openapi.json`)
  - **Paznaun-Ischgl = region `TR53`** (neighbours: TR52 Ötztal, TR55 Pitztal,
    TR71 Serfaus-Fiss-Ladis, TR74 St. Anton am Arlberg; list at `/v1/regions/`)
  - `GET /v1/forecast/month/?region=TR53&min_date=YYYY-MM-DD&max_date=…`: monthly
    stays since 1999-11, forecast through about 2027-08
  - `GET /v1/forecast/day/?region=TR53&…`: daily forecast (starts 2023-01-01)
  - `GET /v1/rawdata/`, `/v1/events/`, `/v1/coefficients/`: daily features,
    events, LASSO coefficients per region. All take `skip` and `limit` (paginate).
- Code and method (R, README in German): https://github.com/kan-jr/Naechtigungsprognose
  - Monthly: **STL decomposition, trend forecast with exponential smoothing,
    Random Forest (also with moving-block bootstrap) on the remainder**, with
    calendar features, holidays (incl. Bavarian school holidays) and lags.
    Parameters per region come from a grid search.
  - Daily: monthly forecast disaggregated with an **adaptive LASSO** on a
    mobile-network-based daily proxy (Drei, A1/Invenium 2022–2025), with
    weekday, month, holiday, calendar-week and event dummies.
- Same data as files in the Data Space (open, CSV with semicolons and decimal commas):
  - Monthly stays per region since 1999 + bed capacity + holidays + events +
    recommended parameters:
    https://portal.ttf.nexyo.io/products?id=839f5964-4d60-431e-a737-f070ffc06be2
  - Daily overnight index per region 2022–2025 + daily events (G/K/M) +
    calendar features + monthly scaling:
    https://portal.ttf.nexyo.io/products?id=bf1b3920-4b2b-42a0-b8bb-b7bb876d07ad
  - Overview page: https://b2b.austria.info/de-at/wissen/statistiken-und-dashboards/naechtigungsprognose/

**Explanatory drivers**

- School and public holidays per source market (DE, NL, BE, DK, UK, CH, …):
  OpenHolidays API https://www.openholidaysapi.org/en/ (no key, ODbL)
- Weather and snow: GeoSphere Austria Data Hub https://data.hub.geosphere.at/
  (no key, CC BY 4.0, max 240 requests/hour); Open-Meteo https://open-meteo.com/
  (forecast and history, no key for non-commercial use)
- POIs and events: Austria Tourism open data https://api.austria.info/
- Other: data.gv.at https://www.data.gv.at/, OpenStreetMap

## 5. Repository conventions

- Read `AGENTS.md`. Work on a feature branch. **This branch is
  `challenge-04`.** It deploys to `https://hackathon.daria-and-nico.com/challenge-04`
  through the manually dispatched "Deploy to Kubernetes" workflow. Never deploy
  to the root unless explicitly asked.
- The Helm chart on `main` is still a hello-world placeholder. Other agents
  work on other challenges in other branches (`claude/youthful-clarke-*`,
  `claude/hopeful-dijkstra-*`, `tourism-innovation-lab`). Don't change their
  branches.
- Suggested layout: `docs/challenge-04/` for research notes and decisions,
  `data/` for scripts that fetch data, `data/raw/` **git-ignored** (partner
  data is members-only, don't commit it), `models/` or `notebooks/` for
  training and backtests.
- Always state data sources and licences in outputs (Austria Tourism CC BY 4.0,
  TVB Paznaun-Ischgl attribution, ODbL for OpenHolidays and OSM).

## 6. Starting points for the model research (not decisions)

Research results and the recommended approach: [RESEARCH.md](RESEARCH.md).

- **Baselines first**: previous year aligned by weekday and holiday,
  seasonal-naive, and the official forecast (TR53 / partner file). Every model
  must beat these in a backtest.
- **Explaining deviations** (challenge question 1): residual = actual −
  forecast. Attribute it to Easter or holiday shifts, source-market school
  holidays, events, weather and snow, weekday mix, and data gaps (zeros).
  Candidate methods: regression on residuals, gradient boosting + SHAP, and
  structural time-series components.
- **Early recognition**: booking lead-time classes are a leading indicator, so
  look at nowcasting and pickup models. Check capacity utilisation
  (stays / available beds) for tight or idle days.
- **Little history** (one season of daily partner data): use pooled or
  hierarchical models across regions (open daily index 2022–2025 for 100
  regions), transfer from neighbour regions, and robust handling of zeros and
  gaps.
- **Reliability** (challenge question 3): prediction intervals (quantile
  regression, conformal prediction, bootstrap), rolling-origin backtests, and
  MAPE, sMAPE or MASE per horizon.
- The output must feed **ranked marketing actions** (what, when, which market)
  with confidence, so keep features interpretable.

## 7. Open questions to clarify early

- Is the partner "forecast" column the same model as the public TR53 forecast?
  Compare them.
- Does "actuals empty for future days" mean actuals stop around 7 Nov 2026?
- Has the team already registered in the TTF Data Space? Who holds the access?
