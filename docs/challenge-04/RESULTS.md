# Challenge 04: results

Status: 8 Nov 2026, after loading the TVB data. **Section A uses the real TVB
Paznaun-Ischgl data** (feratel, TTF Data Space; raw files git-ignored, only
aggregates here; attribution: TVB Paznaun-Ischgl). Section B keeps the earlier
open-data work, which the real data confirmed.

# A. Results on the real TVB data

Reproduce (needs the TTF Space key in the environment):

```bash
python3 data/fetch_partner.py && python3 data/build_features.py
```

```bash
cd models && python3 real_backtest.py && python3 explain.py && python3 early_warning.py && python3 forecast_winter.py
```

## A1. What the data is (verified, see DATA-PROFILE.md)

- Daily actual stays 4 Nov 2025 – 31 Oct 2026; `previous_year` is exactly the
  actual 365 days earlier, so **real daily history runs from 4 Nov 2024**.
- The TVB `forecast` is **not** the official TR53 forecast (zeros on other
  days, monthly ratio 0.72–1.31). Origin and vintage unknown.
- `available_beds` are **free (still bookable) beds**, not capacity: about
  1,100 in February while stays peak, correlation with stays −0.45.
  Capacity ≈ stays + free beds (median about 20,000 in winter).
- Booking lead-time rows are **arrival weeks**: all classes peak Dec–Apr.
- Open data check: the open daily index (scaled) matches the real daily
  actuals with correlation 0.993 and 5.7 % daily error in winter 24/25, so the
  open-data results in section B hold.

## A2. Is the TVB forecast systematically wrong? Yes, mostly too high

| Month | Actual | TVB forecast | Error |
|---|---|---|---|
| Nov 2025 | 47,561 | 56,688 | **+19 %** |
| Dec 2025 | 436,595 | 421,235 | −4 % |
| Jan 2026 | 551,235 | 564,683 | +2 % |
| Feb 2026 | 573,238 | 589,907 | +3 % |
| Mar 2026 | 486,421 | 519,917 | **+7 %** |
| Apr 2026 | 232,368 | 237,401 | +2 % |
| May–Sep 2026 | 416,174 | 461,331 | **+8 to +23 %** |
| Oct 2026 | 11,460 | 17,147 | **+50 %** |

- Theil decomposition: bias share 14 % in winter, 29 % in summer. The monthly
  tracking signal is beyond ±17 in December–March and in every summer month
  (April −7; |TS| > 4 is the usual alarm level): **a systematic bias, not
  noise**. Every month except December was over-forecast.
- Data gaps: the forecast is 0 on 11 days (Nov 2025, May 2026) that had 754
  actual stays.
- Within the winter, daily accuracy is high (5.5 % daily error, 3.8 % on the
  daily pattern), better than any model with information only up to
  31 Oct 2025. The TVB forecast likely uses booking information or was made
  late. **Ask the TVB how and when it is produced.**

## A3. Why: graded drivers of actual − TVB forecast (`explain.py`)

Winter season (in-season days, R² 0.27), grade A = 80 % CI excludes 0 and
LightGBM SHAP agrees:

| Driver | Effect (stays, season) | Grade | Reading |
|---|---|---|---|
| snow depth < 30 cm (ski area) | +51.7k | A* | actual **above** forecast on low-snow days, i.e. low snow did not hurt. *Confounded with December (the only under-forecast month, 17 cm mean snow); one season cannot separate them |
| Fri/Sat nights | −23.1k | A | forecast too high on weekends |
| German school holidays | +12.9k | A | forecast too low in German holiday weeks |
| other TVB event days | −6.9k | A | forecast too high on smaller event days |
| early season (first 3 weeks) | +11.2k | B | |
| Polish/Czech holidays | −20.8k | B | |

Summer (R² 0.07): the over-forecast is mainly a **level shift** (about −10k
stays per peak-summer week). Polish/Czech holidays +61k (grade A) coincide with
the summer peak and are confounded with it. Explanations are weak in summer:
we say so instead of inventing reasons.

## A4. Our forecast vs TVB forecast and baselines (`real_backtest.py`)

Ex ante as of 31 Oct 2025 (our models) vs the TVB columns:

| Model | Winter 25/26 daily error | Monthly error | Bias | May–Oct 2026 daily | Bias |
|---|---|---|---|---|---|
| TVB forecast (vintage unknown) | **5.5 %** | 6.1 % | +2.7 % | 15.4 % | **+11.9 %** |
| TVB previous-year column | 14.3 % | 6.3 % | −1.2 % | 20.6 % | +6.6 % |
| previous year, holiday-aligned | 10.8 % | 5.9 % | −3.5 % | **15.4 %** | +4.0 % |
| official TR53 × level (in-sample) | 10.4 % | 0.8 % | +0.8 % | 24.5 % | +2.3 % |
| **ours (ensemble)** | 10.5 % | **3.7 %** | −1.2 % | 17.7 % | **+2.6 %** |

- Ours has the lowest monthly error and bias of all ex-ante methods. It beats
  the TVB previous-year column clearly (10.5 % vs 14.3 % daily). In summer
  its bias is +2.6 % vs +11.9 % for the TVB forecast.
- Use: TVB forecast for daily patterns inside the winter; **our model as an
  independent check of the level**, especially Nov, Mar and summer.
- Conformal 80 % band, calibrated on real winter 24/25: coverage **0.77** on
  25/26; half-width ×/÷1.69 normal days, ×/÷1.22 peak days.

## A5. Capacity and booking behaviour (`early_warning.py`)

- Winter 25/26 occupancy (stays / (stays + free beds)): median 0.81; **23
  days ≥ 95 %** (Feb 14, Dec 5, Jan 4); **March had 14 in-season days below
  80 %**, the clearest spare capacity in peak season. Weekend nights are the
  fullest (Sat 0.93 vs Tue 0.87).
- Lead time (TVB booking data, by arrival period):

  | Period | Last-minute (classes 0 and 8 d) | 31 and 61 d | Early (90 and 180 d) |
  |---|---|---|---|
  | winter 23/24 | 38 % | 30 % | 32 % |
  | winter 24/25 | 36 % | 30 % | 35 % |
  | winter 25/26 | 35 % | 28 % | 36 % |
  | summer 24 | 45 % | 22 % | 33 % |
  | summer 25 | 62 % | 15 % | 23 % |
  | summer 26 | 64 % | 15 % | 21 % |

  Winter guests book earlier every year; **summer has become a last-minute
  market**. For summer, bookings on hand weeks ahead say little, which fits
  the TVB forecast's summer over-forecast.

## A6. Winter 26/27 (`forecast_winter.py` → `out/c04_forecast.json`)

| Month | Ours | TVB forecast | TVB vs ours | Note |
|---|---|---|---|---|
| Nov 2026 | 44.0k | 54.3k | **+24 %** | TVB was +19 % too high in Nov 2025 |
| Dec 2026 | 419.9k | 409.7k | −2 % | |
| Jan 2027 | 548.1k | 567.0k | +3 % | |
| Feb 2027 | 565.1k | 581.2k | +3 % | |
| Mar 2027 | 518.0k | 571.8k | **+10 %** | TVB was +7 % too high in Mar 2026; Easter 28 Mar is inside March |
| 1–4 Apr 2027 | 54.0k | 49.2k | −9 % | TVB file ends 4 Apr |

- 23 predicted tight days (≥ 95 % of last year's capacity): Christmas–3 Jan,
  February weekends and half-terms, early March, Good Friday.
- 43 in-season days with spare capacity (< 80 %), 17 days where the TVB
  forecast lies outside our 80 % band, 6 TVB forecast zeros.
- Watch list for marketing: **November 2026 and March 2027** (TVB forecast
  much higher than ours and historically too high), spare in-season days in
  January and March.

# B. Open-data results (7 Nov, confirmed by A)

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
