# Challenge 04: model and approach research

Status: 7 Nov 2026, evening. Based on **open data only**. The partner files
(TTF Data Space, members only) were not available to this research; every
claim about them is marked as *to verify*. Reproduce the numbers below with:

```bash
python3 data/fetch_open_data.py TR53
```

```bash
python3 models/probe_open_forecast.py
```

## 0. TL;DR recommendation

Build a small, interpretable stack, not one big model. Each layer answers one
challenge question and can show its evidence.

```
                 open monthly TR53 (1999–2026)    partner daily (PY / FC / ACT, beds)
                          │                                   │
  [1] Baselines ──────────┼──── PY aligned by weekday+holiday, avg-2y, official FC
                          │                                   │
  [2] Deviation  ACT − FC ─► decomposition waterfall:  calendar shift │ source-market
      explainer                holidays │ events │ snow/weather │ weekday mix │ data gap │ unexplained
                          │       (ridge/Poisson GLM on log-ratio; LightGBM+SHAP as cross-check)
                          │
  [3] Early      booking lead-time classes ─► pickup/YoY intake index ─► EWMA/CUSUM alarm
      warning    + utilisation (stays / beds) ─► tight / idle day flags
                          │
  [4] Reliability  rolling-origin backtest ─► split-conformal intervals per horizon
                   + data-quality flags ─► confidence grade A/B/C per finding
                          │
  [5] Actions    gap × addressable market × lead time × feasibility × confidence ─► ranked list
```

Rationale: we have ~2 seasons of daily partner data (actual + previous-year
column), 26 years of monthly data, and a 2-minute pitch. Rich models (TFT,
N-BEATS, DeepAR) would overfit and can't explain themselves. Simple, additive
components give both accuracy at this data size and the "why" the jury asks
for.

## 1. What the official forecast actually is (verified)

Source: https://github.com/kan-jr/Naechtigungsprognose (README + code) and the
API https://naechtigungen.pol.joanneum.at. TR53 = repo region `R54 "Paznaun -
Ischgl"`.

| Fact | Evidence | Consequence for us |
|---|---|---|
| Monthly API values are **actuals up to 2026-08** (integers), forecast from 2026-09 (decimals) | `/v1/forecast/month/?region=TR53` | We get Statistik Austria monthly actuals for free; backtest target. |
| Monthly model: STL detrend → ETS on trend + random forest (rangerts, extratrees, 15k trees) on remainder; lags, month, Easter position, AT/DE/"rest" holidays, Bavarian winter holidays, big events, COVID dummies. TR53 params: method `normal`, `long_time` sample, lag 12 | `data/region_method_rmse.csv` | Calendar effects at **month** level only. No snow, no weather, no source-market mix beyond DE/BY. |
| Daily = monthly total disaggregated by an adaptive LASSO fitted on a **mobile-phone proxy 2022–2025** (weekday, month, calendar-week `kw1..kw52`, holidays, events) | README §Disaggregation | Daily shape is a *typical calendar-week profile*, not this season's lift opening, events or bookings. Daily deviations are often shape errors, not demand errors. |
| After the linear prediction the code does `f - min(min(f), 0)`, so the **lowest day of the year is set to exactly 0** | code; API shows zeros on **2025-11-10 and 2026-11-09** | Explains "forecast is 0 on a few days" in the partner file → treat as artefact, never as a real forecast of 0. |
| Per-month proportional scaling capped at a fixed bed maximum (**22,078** for Paznaun-Ischgl) | `adjust_month_simple`, `bettenkapazität.csv` | Re-scaling after the cap can push days back over it: 4 forecast days in winter 26/27 exceed 22,078 (max **24,072 on 2027-01-01**). 24 days ≥ 90 %. Static cap ≠ daily partner beds. |
| Scope is **hotels and holiday apartments** (Statistik Austria categories) | README intro | Feratel actuals may cover more categories → possible systematic level gap. *To verify.* |

Open question from HANDOVER §7 (is the partner forecast the TR53 forecast?):
test by correlating the partner `forecast` column with `/v1/forecast/day/`
(sum per month, zero days on 2025-11-10 / 2026-11-09 are a fingerprint). The
partner file covers four municipalities (Ischgl, Galtür, Kappl, See); TR53 is
the whole tourism region, so expect a scale factor, not identity.

## 2. Findings from open data

### 2a. Monthly baselines (TR53, winter months Dec–Apr)

Rolling origin, monthly origins 2023-10 … 2025-08, horizon 1–12, median
absolute % error:

| Model | h1–3 | h4–6 | h7–12 |
|---|---|---|---|
| seasonal naive (last year) | 9.0 % | 9.0 % | 5.7 % |
| last year × trailing YoY ratio | 8.1 % | 7.5 % | 6.7 % |
| mean of last 2 years | 7.5 % | **4.9 %** | **4.9 %** |
| ETS (log, additive season) | 8.5 % | 6.5 % | **4.7 %** |

Takeaways:

- Simple averaging already reaches ~5 % at month level. Winter totals are very
  stable (Nov–Apr ≈ 2.14–2.25 M since 2022/23). **The story is not "we predict
  better", it is "we explain where and why days and markets deviate".**
- We can't backtest the official forecast itself: the API only serves the
  current vintage. Ask the TVB or Austria Tourism for old vintages, or
  archive the partner file's forecast column each month from now on.
- Errors are largest at h1–3 for monthly baselines because Easter and holiday
  shifts move volume between March and April. Calendar alignment matters more
  than model class.

### 2b. Easter is the largest calendar driver in spring

April share of March+April stays:

```
Easter late March  (2016-03-27, 2024-03-31)        → 0.26, 0.26
Easter early April (2015, 2018, 2026)              → 0.32–0.34
Easter mid/late April (2017, 2019, 2022, 2023, 2025)→ 0.33–0.39
2027: Easter 2027-03-28, official forecast         → 0.30
```

Hypothesis, **revised 7 Nov night** (`models/anchor.py`): a regression of the
April share on Easter day-of-year over 25 seasons (corr 0.75, residual SD
0.034) predicts **0.287** for 2027, i.e. April ~**15k below** the official
218k (anchor 203k) and March correspondingly higher. The first estimate
(~30k, from the two analogue years alone) was too strong. 15k is within one
residual SD (~24k), so confidence is **low (grade C)**. Still a useful,
checkable example of a calendar-driven forecast error and an early action
(push April 2027 late-season offers from January). Validate with the partner
daily file once March/April 2026 actuals are visible and with the daily open
index 2022–2025 (2024 had a late-March Easter).

### 2c. Capacity

Official daily forecast for winter 26/27 has 24 days at ≥ 90 % of the static
22,078 beds (Christmas/New Year, early February, late-February half-term).
Real tightness has to be computed against the **daily partner bed file**,
which ends 2026-11-07. Beds for the forecast window must therefore be
projected (previous-season bed curve aligned by weekday, or the latest value
held). Mark that as an assumption on every capacity statement.

### 2d. Driver data availability (checked)

| Driver | Source | Status |
|---|---|---|
| School holidays DE (per Land), NL, BE, CH, CZ, PL, SE | OpenHolidays API | OK (DE 51, CH 60, NL 4 periods Nov–Apr) |
| School holidays **DK, GB** | OpenHolidays has no DK/GB | Missing → hand-curated table (few periods, ~1 h) |
| Weather / snow history and forecast | Open-Meteo archive + forecast (point 47.01 N, 10.29 E, ~1,350 m) | OK; archive rate-limits (HTTP 429 seen), cache locally |
| Snow / station data | GeoSphere Data Hub | Reachable, 240 req/h |
| Events | partner event calendar (members), open G/K/M event flags in the Nächtigungsprognose repo | partner *to fetch* |
| Daily regional index 2022–2025, 100 regions | open Data Space product / repo `proxy_data_daily.csv` | OK, z-scored per region |

## 3. Approach per challenge question

### Q1a. Forecasting: what to build

Target: daily stays per municipality and total, Nov 2026 – Apr 2027.

1. **Baselines (mandatory comparators)**
   - `PY_aligned`: previous-year value from the same weekday in the same
     holiday phase (shift by 364 days; for Christmas/Easter windows align on
     holiday offset instead). The partner file's previous-year column is
     probably date-aligned, so computing our own alignment is itself an
     explanation component ("calendar shift").
   - Official forecast (partner column / TR53 daily).
   - Average of last two seasons (best monthly baseline above).
2. **Main model: hierarchical "anchor × shape"**, mirroring the official
   structure but fixing its weak spots:
   - *Monthly / season anchor*: avg-2y or ETS, plus an Easter adjustment
     learned from 26 years of monthly data (regress April share on Easter
     day-of-year).
   - *Daily shape*: Poisson or log-linear ridge GLM with weekday, holiday
     phase per source market (count of key markets on holiday, weighted by
     market share), event flags with lead/lag, season-opening and closing
     dates (actual lift operation dates, not calendar weeks), snow depth.
     **Pool** across neighbour regions (TR52, TR55, TR71, TR74) using the
     open daily index 2022–2025 so coefficients are learned on ~4 × 365 × 5
     rows, then fit a region-specific intercept/scale on the partner series.
   - *Capacity-aware reconciliation*: scale to anchor, cap at projected beds,
     redistribute iteratively (fix the official overflow bug).
3. **Challenger: LightGBM** (same features, quantile objective) for
   accuracy comparison and SHAP. Keep it only if it beats the GLM in the
   backtest by a clear margin; otherwise use it only as an explanation
   cross-check.
4. **Zero-shot challenger: Chronos-2** (tested, see §7a). Good at short
   horizons, no explanations. Use as an ensemble member for h ≤ 3 months.

Not recommended for this data size: Prophet (too smooth around holiday
edges, adds little over the GLM), deep sequence models, per-municipality
models without pooling.

### Q1b. Deviation explanation

Explain `log(ACT / FC)` (and `log(ACT / PY)`) per day, aggregate to week and
month. Use an **additive waterfall** that a marketing person can read:

```
FC 10,000 ──► +calendar shift (Easter/weekday) ──► +source-market holidays ──►
            +events ──► +snow/weather ──► −data gap ──► residual ──► ACT 9,200
```

Method, in order of priority:

1. **Rule-based data-quality layer first**: forecast = 0 (known artefact),
   actual missing / 0, bed file gaps, municipality sums ≠ total. Tag those
   days and remove them from model fitting. This alone explains part of the
   "unexplained" deviations.
2. **Calendar shift**: compare PY date-aligned vs PY holiday-aligned. The
   difference is the pure calendar component.
3. **Driver regression**: ridge GLM of the residual on driver features
   (market holidays, events, snowfall/snow depth/temperature, weekday).
   Coefficients × feature values give per-day contributions that sum to the
   explained part. Use block bootstrap (weekly blocks) for coefficient
   intervals.
4. **Cross-check**: LightGBM + TreeSHAP on the same residual. Report a driver
   only if both methods agree on sign; that agreement feeds the confidence
   grade.
5. **Unexplained remainder**: flag weeks where |residual| > 2 σ as "needs
   human context" (e.g. the TVB knows of a hotel closure or a tour operator
   change).

With ~1–2 seasons, keep features ≤ ~15 and use strong regularisation; check
stability by refitting with one month left out.

### Q2. Early recognition

- **Booking lead-time classes** (partner, weekly, 2023-10 → 2026-10): build a
  YoY *intake index* per lead-time class (bookings this week ÷ same ISO week
  last year). The 61–90 and 90–180-day classes lead arrivals by 2–6 months.
  Fit a simple regression of later monthly ACT/PY on the earlier intake index
  (distributed lag); 3 winters of history give few points, so report it as a
  directional signal with intervals, not a point forecast. *Check what the
  file actually counts (bookings made in week w vs arrivals in week w)
  before modelling.*
- **Drift alarm**: EWMA or CUSUM on the daily log(ACT/FC) and on the intake
  index. An alarm on a market or period → candidate marketing action.
- **Utilisation**: `stays / available beds` per day; flag ≥ 90 % (tight:
  raise price or stop discounting, shift demand to shoulder days) and ≤ 50 %
  in-season (idle: targeted campaigns).

### Q3. Reliability

- **Backtest protocol**: rolling origin on the partner daily series (weekly
  origins, horizons 7/14/28/56/90 days) and on 26 years of monthly TR53.
  Metrics: MASE (scaled by seasonal naive), wMAPE (robust to near-zero
  shoulder days, unlike MAPE), pinball loss and interval coverage.
- **Intervals**: split-conformal on backtest residuals per horizon bucket
  (distribution-free, works on any model, trivial to explain); LightGBM
  quantiles as alternative. Target 80 % intervals; report empirical coverage.
- **Confidence grade per finding/recommendation** (shown in the UI):

  | Grade | Rule (all must hold) |
  |---|---|
  | A | ≥ 2 independent signals agree (e.g. GLM + SHAP + lead-time index), no data-quality flag in window, interval excludes 0 |
  | B | 1 strong signal, interval excludes 0, or minor data gaps |
  | C | analogue-based (n ≤ 2 years), conflicting signals, or flagged data |

## 4. From deviations to ranked actions

Score each candidate action:

```
score = expected_gap_stays × addressable_share(market) × feasibility
        × confidence_weight(A=1, B=.6, C=.3)  ÷  lead_time_penalty
```

- `expected_gap_stays`: forecast gap or idle capacity in the target window.
- `addressable_share`: share of the gap attributable to a market whose
  school holidays overlap the window (from OpenHolidays + market mix).
- `lead_time_penalty`: action lead time (paid social ~1–2 weeks, partner
  newsletters ~4 weeks, tour operator / print ~8+ weeks) vs days to window;
  actions that can no longer act in time drop out.
- Output per action: *what* (channel/offer), *when* (start date), *where /
  which market*, *expected effect range*, *grade*, *evidence links*.

Example from open data alone: "April 2027 late-season push to DE/NL/BE
families, start January 2027, expected gap ~15k stays (±24k), grade C".

## 5. Plan until submission (Sun 13:00)

Superseded by [PLAN.md](PLAN.md).

## 6. Checks to run once partner data is in

1. Is the partner `forecast` = TR53 daily forecast scaled? (zero days, monthly sums)
2. Where do actuals stop? Any zero/blank actuals inside the observed period?
3. Does the previous-year column align by date or by weekday?
4. Do municipality columns sum to a total, and is the level comparable to TR53
   (hotels + apartments only vs all categories)?
5. Bed file: daily variation (openings/closings), last date, relation to
   22,078.
6. Lead-time file: does a row count bookings *made* in that week or
   *arriving*? Units?
7. Event calendar: which events fall in Nov 2026 – Apr 2027 (season opening
   concert, closing concert), and do past ones show in the residuals?

## 7. Extended research (round 2)

Additional data sources: [DATA-SOURCES.md](DATA-SOURCES.md). Execution plan:
[PLAN.md](PLAN.md).

### 7a. Foundation model check: Chronos-2 zero-shot (`models/probe_chronos2.py`)

Same backtest as §2a (TR53 monthly, winter months, median APE). Context
2010 → origin in log space, CPU, ~1 min.

| Model | h1–3 | h4–6 | h7–12 |
|---|---|---|---|
| best baseline (avg2y / ETS) | 7.5 % | 4.9 % | 4.7 % |
| Chronos-2 univariate | 7.7 % | 13.1 % | 9.0 % |
| Chronos-2 + Easter-month & COVID covariates | **5.5 %** | 11.6 % | 8.1 % |

Short horizons improve with a known-future covariate; longer horizons are
worse than averaging the last two years (the COVID hole in the context
probably hurts). Verdict: useful short-horizon ensemble member and a credible
"we tested state of the art" line, not the main model. TabPFN-TS is the
alternative for small data with simple covariate effects (a TSALM 2026
workshop study found it better at short horizons and simple covariate links,
Chronos-2 better univariately).

### 7b. Snow: expect little effect on totals, test on short lead times

- Literature: Töglhofer et al. (185 Austrian ski areas, 1972–2007): 1 SD in
  snow conditions moves overnight stays by only 0.6–1.9 %, and **high-lying
  areas show no dependence on local snow**. A 28-resort dynamic panel finds
  2–3 % per SD, with domestic guests reacting more than foreign ones.
- Our check (SNOWGRID, Idalpe 2,300 m): December mean snow depth 16 / 90 /
  25 / 17 cm in 2022–2025, while December stays rose steadily
  337k → 356k → 391k → 424k. No visible snow effect on monthly totals.
- So: model snow only for early season (until mid-December) and short-lead
  bookings (lead-time class 0–7 days), and report "snow is **not** the reason"
  when the data says so. That is an explanation too.

### 7c. Methods added to the toolbox

| Need | Method | Why it fits | Priority |
|---|---|---|---|
| "Is the forecast systematically wrong?" | **Theil decomposition** of forecast MSE into bias / variance / covariance shares + tracking signal (cumulative error ÷ MAD) per month and weekday | Turns "systematic error" into a number with a standard test | P1 |
| Municipality and time consistency | **Hierarchical reconciliation (MinT)**: Ischgl + Galtür + Kappl + See = total; days add up to month | Coherent numbers across UI views, usually more accurate (Hyndman et al., tourism data) | P2 |
| Weekly signals → monthly target | **MIDAS / distributed lag** | Lead-time intake and Google Trends are weekly; MIDAS with weekly search data beat monthly-only models in published tourism studies | P2 |
| Short-term nowcast | **Pickup models** (additive is the usual benchmark, often best in studies) | Only with on-the-books by stay date (ASK) | P1 if data arrives |
| Event effects with uncertainty | **Synthetic control / Bayesian structural time series** (CausalImpact style): donors = other regions' daily index 2022–2025 | "The opening concert adds X ± Y stays" for past events | P2 |
| Drift-robust intervals | **Adaptive conformal inference** on top of split conformal | Keeps coverage when the season deviates | P2 |
| Change detection | EWMA / CUSUM (P1); Bayesian online change-point detection (P3) | Early alarm per market/period | P1 |
| Search interest | Google Trends per country (manual CSV) | Market-level leading signal; review papers warn it is noisy, so validate first | P2 |

Rejected: deep sequence models (TFT, N-BEATS, DeepAR) for lack of history;
Prophet (adds nothing over the GLM, blurs holiday edges); Wikipedia pageviews
as a leading indicator (tested, coincident only, see DATA-SOURCES.md).

### 7d. Literature used

- Athanasopoulos, Hyndman, Song, Wu (2011), *The tourism forecasting
  competition*, IJF 27(3).
- Hyndman, Ahmed, Athanasopoulos, Shang (2011), optimal combination for
  hierarchical time series (demonstrated on Australian tourism).
- Töglhofer, Eigner, Prettenthaler (2011), *Impacts of snow conditions on
  tourism demand in Austrian ski areas*, Climate Research 46.
- Weatherford & Kimes (2003); Ellero & Pellegrini (2014): pickup and
  regression methods for hotel forecasting; additive pickup as benchmark.
- Ansari et al. (2025), *Chronos-2: From Univariate to Universal
  Forecasting*, arXiv 2510.15821.
- Mikulić & Baumgärtner (2025), critical review of Google Trends / Baidu
  index use in tourism forecasting, Tourism Management.

## 8. Sources and licences

- Nächtigungsprognose API and code: Österreich Werbung with JOANNEUM
  RESEARCH, TU Wien, University of Klagenfurt, CC BY 4.0.
- Partner data: TVB Paznaun-Ischgl / Feratel, TTF 2026 data licence,
  attribution to TVB Paznaun-Ischgl. Not committed (members only).
- OpenHolidays API (ODbL), Open-Meteo (CC BY 4.0), GeoSphere Austria (CC BY 4.0).
