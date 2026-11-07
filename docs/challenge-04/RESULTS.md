# Challenge 04: results so far (open data only)

Status: 7 Nov 2026, night. Partner data not yet loaded; everything below runs
on open data and is reproducible. When the partner files are in
`data/raw/partner/`, the same scripts switch to them (see "Partner mode").

## How to reproduce

```bash
pip install pandas pyarrow scikit-learn statsmodels lightgbm
```

```bash
python3 data/fetch_open_data.py TR53 && python3 data/fetch_drivers.py && python3 data/build_features.py
```

```bash
cd models && python3 daily_shape_backtest.py && python3 reliability.py && python3 explain.py && python3 anchor.py && python3 forecast_winter.py
```

## 1. Data built

| Piece | File | Notes |
|---|---|---|
| Feature table 2022-01 → 2027-08 | `data/processed/features_daily.parquet` | 47 columns: calendar, Easter/Christmas/carnival windows, school-holiday intensity for 13 markets, season phase, events, SNOWGRID snow depth, official daily forecast, monthly actuals |
| Market holidays | OpenHolidays (11 countries) + `data/static/school_holidays_dk_gb.csv` | DE weighted by Land population; others by share of subdivisions on holiday |
| Season dates | `data/static/season_dates.csv` | 2023/24 start corrected to 23 Nov from the ramp in the data; 2026/27 start 26 Nov (press) |
| Pseudo-daily actual | `pseudo_actual` column | open daily index 2022–2025 (Feratel + mobile-network combination, z-scored) rescaled to Statistik Austria monthly actuals. Ends 2025-12-31 |

Caveat on the pseudo-daily actual: the official daily model was fitted on the
same index, so the official forecast is **in-sample** in every comparison
below. Partly calendar-built, so calendar models may look slightly better
than they will on real Feratel data.

## 2. Daily shape backtest (`models/daily_shape_backtest.py`)

All models get the true monthly totals; only how each month spreads over its
days is scored (wMAPE, in-season months, lower is better).

| Model | winter 23/24 | winter 24/25 | Nov–Dec 2025 |
|---|---|---|---|
| flat (month / days) | 0.248 | 0.223 | 0.517 |
| previous year, same weekday (t−364) | 0.134 | 0.190 | 0.126 |
| **previous year, holiday-aligned** | 0.125 | 0.157 | **0.125** |
| official TR53 daily (in-sample!) | 0.140 | **0.113** | 0.226 |
| Poisson GLM | 0.273 | 0.181 | 0.195 |
| LightGBM (Poisson) | 0.139 | 0.151 | 0.213 |
| holiday-aligned PY × YoY-delta ridge | 0.280 | 0.157 | 0.137 |
| **ensemble: holiday-aligned PY + LightGBM** | **0.110** | 0.131 | 0.146 |

Peak periods only (Christmas/New Year, February half-terms, Easter):
ensemble 0.107 / 0.124, holiday-aligned PY 0.115 / 0.106, official 0.113 /
0.080 (in-sample).

Findings:

1. **Holiday-aligned previous year is the baseline to beat.** Aligning
   Christmas by date and Easter by Easter offset cuts the t−364 error by 17 %
   in 24/25.
2. **The 50/50 ensemble of holiday-aligned PY and LightGBM is the best
   out-of-sample model** on both full winters (−12 % and −17 % error vs the
   baseline). It loses in the season-opening period (Nov–Dec 2025), where
   the previous year aligned by date is better, which points to a missing
   "opening date" effect in the trees.
3. Pure GLMs underperform with 1–2 seasons of history (the 23/24 split trains
   on a single, COVID-affected 2022). The YoY-delta model fails for the same
   reason in 23/24. Keep GLMs for explanation, not for forecasting.
4. The official daily forecast misses the season opening by a wide margin:
   week 25 Nov–1 Dec 2024 forecast 16.7k vs 40.9k (pseudo-actual). Its
   daily pattern comes from calendar weeks, not the actual opening date.

## 3. Reliability (`models/reliability.py`)

Split-conformal 80 % intervals on daily stays (multiplicative half-widths per
bucket):

| Model | calibrate → test | coverage | half-width normal / peak |
|---|---|---|---|
| ensemble | 23/24 → 24/25 | **0.85** | ×/÷1.35 / ×/÷1.29 |
| ensemble | 24/25 → 23/24 | 0.79 | ×/÷1.25 / ×/÷1.34 |
| holiday-aligned PY | 23/24 → 24/25 | 0.89 | ×/÷1.49 / ×/÷1.38 |
| LightGBM | 23/24 → 24/25 | 0.82 | ×/÷1.50 / ×/÷1.27 |

Intervals are honest but wide (about ±30 % per day). Weekly and monthly
aggregates will be much tighter; show those in the UI first.

## 4. Deviation explainer (`models/explain.py`)

Method: data-quality tags → ridge of log(actual/forecast) on 0..1 drivers
(grouped market holidays, Christmas/Easter/carnival windows, season phase,
weekends, snow) → contributions in stays → week-block bootstrap CI →
LightGBM SHAP sign check → grade A/B/C. Plus Theil decomposition and a
monthly tracking signal.

Demo (pseudo-actual vs official, winters 23/24 + 24/25, in-sample):

- Theil: bias share 0.6 %, variance 2.7 %, covariance 96.7 %. **No
  systematic level bias; the errors are in the daily pattern.** This is
  expected because the official daily series is forced to the monthly totals.
  With partner data the bias share will show whether the TVB's forecast is
  systematically high or low.
- Graded drivers (grade A = CI excludes 0 and SHAP agrees): official
  under-weights **Dutch/Belgian**, **Polish/Czech** and **Danish/UK holiday
  days** and **Fri/Sat nights**, and over-weights **Swiss/Austrian holiday
  days**. German holidays: positive, grade B.
- Weekly waterfall of the worst week (25 Nov–1 Dec 2024): forecast 16.7k →
  +7.4k season opening weekend → +0.9k weekend → −2.1k level → +18.0k
  unexplained → actual 40.9k. The large unexplained part says the opening
  driver needs better data (actual lift-opening and concert dates per year,
  which the partner event calendar provides).

Market drivers are grouped because single-market holidays overlap too much
to separate without nationality data (the top ask for the TVB).

## 5. Monthly anchor and Easter (`models/anchor.py`)

- April share of March+April = −0.062 + 0.0040 × Easter day-of-year (25
  seasons, corr 0.75, residual SD 0.034).
- 2027 (Easter 28 March): predicted share **0.287** → April anchor **203k vs
  official 218k (−15k)**, March +3k vs official. **Revised down from the
  earlier ~30k estimate**, which used only two analogue years. Grade C:
  within one residual SD.
- Other months, anchor vs official: Nov −10.7k (the official expects a
  stronger November), Dec +9.0k, Jan −3.3k, Feb −8.7k.

## 6. Winter 26/27 export (`models/forecast_winter.py` → `out/c04_forecast.json`)

Open mode, region level: monthly anchor × LightGBM daily shape, 80 %
conformal band, utilisation and flags, plus monthly comparison with the
official forecast. Format follows PLAN.md §7.

**Bed cap finding:** the official model's static cap of 22,078 beds is
**not a real limit**. The pseudo-daily actual exceeds it around New Year in
every winter (max 24,891 on 31 Dec 2022; 13 / 15 / 4 days per winter). So
we do not clip forecasts. "Tight" days (27 in winter 26/27 at ≥ 90 % of the
static cap) are indicative until the partner's daily beds are loaded.

## 7. Partner mode

- `python3 data/profile_partner.py --public` answers the seven open checks
  and writes `docs/challenge-04/DATA-PROFILE.md` without partner values.
  Without `--public` the full report stays in `data/processed/`. Tested on
  synthetic files only.
- `forecast_winter.py` uses partner actuals automatically (history +
  holiday-aligned PY → the backtested ensemble).
- `explain.py`: call `explain(actual, forecast, features)` with the partner
  columns.

## 8. Next steps

1. Load partner files, run the profiler, commit `DATA-PROFILE.md`.
2. Re-run the backtest on real daily actuals (partner act + PY column).
3. Add the partner event calendar and actual opening and concert dates.
   Expect the opening-week gap to shrink.
4. Lead-time intake index + EWMA alarm (needs partner file).
5. Action scoring → `out/c04_actions.json`.
