# Challenge 04: plan (data and models)

Rewritten Sun 8 Nov 2026, morning, with the real TVB data loaded. Submission
**13:00**, technical jury **09:00–12:00**. Background: [MODELS.md](MODELS.md),
[DATA.md](DATA.md), numbers: [RESULTS.md](RESULTS.md).

## 1. The story the numbers support

> "Paznaun-Ischgl's forecast is precise day by day in winter, but too high in
> 11 of 12 months, worst in November, March and summer. We show where demand
> deviates, why (graded evidence), where capacity is tight or idle, and what
> to do next, with a confidence for every claim."

Proven so far (real data):
1. Systematic over-forecast: Nov +19 %, Mar +7 %, summer +8 to +23 %, Oct
   +50 %; tracking signal far beyond alarm levels.
2. 25 % of the day-level deviation against the TVB previous-year column is
   pure calendar shift (date vs weekday and holiday alignment).
3. Graded drivers: weekend over-forecast, German-holiday under-forecast,
   event-day over-forecast (grade A).
4. Capacity: 23 days ≥ 95 % (February), 14 in-season March days < 80 %.
5. Booking behaviour: winter books earlier every year, summer became
   last-minute (64 %).
6. Winter 26/27 watch list: November (TVB +24 % above our forecast) and
   March 2027 (+10 %).

## 2. Work packages

The full list of tests, data sources and blind spots with priorities is in
[RESEARCH-PLAN.md](RESEARCH-PLAN.md) (§4 gives the order). The packages below
are the submission-critical subset.

| # | Package | Output | Done when | Priority |
|---|---|---|---|---|
| 1 | **Level combination** L1–L4 (MODELS §3), weights by horizon from rolling backtests (TR53 monthly 2010–2026 and real 24/25→25/26), shrunk TVB bias correction per month type | `models/level.py`, backtest table | combination beats every member's monthly error | P1 |
| 2 | **Daily pattern stacking** S1–S4, non-negative weights fitted on 24/25, tested on 25/26; weekday correction for 0–14 days | `models/shape.py` | beats the 9.5 % ensemble on winter 25/26 | P1 |
| 3 | **Actions engine**: candidate actions per gap or idle window with market (holiday overlap), lead time (booking mix), feasibility, grade, evidence links | `models/actions.py` → `out/c04_actions.json` | top 5 actions with numbers and grades | P1 |
| 4 | Export for the UI: forecast, intervals, capacity, drivers, actions | `out/c04_*.json` | format agreed with the UI owner | P1 |
| 5 | Snow scenario band (season level ±1 SD) | field in forecast JSON | | P2 |
| 6 | LightGBM pooled across the 100 regions of the open daily index | better S2 | | P2 |
| 7 | Chronos-2 inside the level combination for 1–3 months | member L3 | | P2 |
| 8 | Macro stress scenario (e.g. 2022-like drop in DE confidence) for the pitch | one slide number | | P3 |
| 9 | Publish "Paznaun-Ischgl daily demand drivers" in the TTF Data Space (open sources only; Best Data Product award) | data product | | P3 |

## 3. Timeline

| Time | Work |
|---|---|
| until 09:00 | WP 1–3 |
| 09:00–12:00 | technical jury walkthrough (commit history, backtest tables, one explained week); WP 4 with the UI owner; WP 5–7 if time |
| 11:30 | freeze `out/c04_*.json` |
| 12:00–13:00 | pitch numbers and sources slide, submission |

## 4. Data requests

- Done: Paznaun market mix per season and municipality from Landesstatistik
  Tirol (free); Tirol monthly mix from Statistik Austria open data.
- Open: monthly or weekly nights by origin for Paznaun (TVB, asked by mail);
  STATcube municipality tables need a paid subscription.

## 4b. Questions for the TVB (Raphael Tonitz, by mail)

1. How and when is the `forecast` column made (booking-based? which date)?
2. Are the lead-time rows arrival weeks? Class boundaries?
3. Guest nationality, even monthly top markets?
4. Do actuals include all accommodation categories?

## 5. Risks

| Risk | Mitigation |
|---|---|
| One year of TVB forecast history | shrink corrections to 50 %, show grade C where only one year supports a claim |
| Explanations confounded (snow vs December, Polish holidays vs summer peak) | say so in the grade text; no causal claims |
| Partner data leaks into git | raw and derived tables git-ignored; check `git status` before each commit |

## 6. Next test (planned, not run): push–pull as extra features

Goal: use the push–pull structure to improve the forecast without losing the
detail of the current ensemble (winter 25/26: 9.4 % daily error).

1. Features: from a push–pull fit on the training window only (no look-ahead),
   add per day (a) expected guests per market group (DE, Benelux, Nordics/UK,
   neighbours, East) = share × holiday response × within-month spread, and
   (b) the pull factor. Keep all existing holiday columns.
2. Variants: LightGBM + (a); LightGBM + (a) + (b); ensemble with each.
3. Evaluation: origins 31 Oct 2024 and 31 Oct 2025, same monthly anchor,
   daily and peak-day error, conformal coverage; summer May–Oct 2026 as a check.
4. Decision rule: adopt only if the ensemble improves in both winters and
   summer does not get worse; otherwise keep push–pull for explanation and the
   market split only.
5. If adopted: re-run `forecast_winter.py`, `market_split.py`, update RESULTS.

## 7. Model suite for the GUI (planned, not run)

The GUI asks: destination (Tirol for now) × time frame × origin (e.g. Bavaria) →
guests, nights, length of stay, booking lead time, age, distribution over the
time frame. No single model answers all of this; each output gets its own
model and only the data it needs.

```
GUI input: destination=Tirol, origin=Bavaria, time frame=15 Jan-15 Mar 2027
   |
   +-- M1 guests + nights per origin per month ---- Statistik Austria Tirol x origin x month (1973-2026)
   +-- M2 length of stay per origin per month ----- same data (nights / arrivals)
   +-- M3 daily distribution in the time frame ---- origin holidays (push) x Tirol daily pattern (pull)
   +-- M4 booking lead time per arrival month ----- TVB lead-time classes (Paznaun, 2023-2026)
   +-- M5 age profile per origin ------------------- Salzburg guest cards (age x origin), T-MONA reports
   |
   +-- existing Paznaun models (daily forecast, deviations, capacity) stay for destination = Paznaun
```

| Model | Predicts | Data | Method | Validation | Confidence |
|---|---|---|---|---|---|
| **M1** | arrivals (guests) and nights per origin and month, 12 months ahead, with interval | Statistik Austria OGD `touextsai` HKL: Tirol × 70 origins (Germany in 7 regions, Austria by state) × month, monthly update | global LightGBM across all origins (lags 12/24, month, Easter, **origin's own holiday days in that month**, origin trend) + seasonal-naive / 2-season-average baselines + ETS per large origin; combination; split-conformal per horizon | rolling origin 2010–2026 without COVID seasons, per origin and horizon, MASE / wMAPE | high for large origins (DE regions, NL, BE, GB, CH), lower for small ones |
| **M2** | average nights per guest (length of stay) per origin and month | same | smoothed history (last 3 seasons, same month) + trend; ratio of M1 nights / M1 arrivals as cross-check | same backtest | high (stable series) |
| **M3** | distribution of guests over the days / weeks of the selected time frame | origin holiday calendar (school + public + long weekends; population-weighted states, e.g. Bavarian holidays for "Bavaria"), Tirol daily pattern from the open daily index of the Tirol regions 2022–2025 (aggregated), Paznaun real data as a check | push–pull disaggregation: M1 monthly total → days ∝ (1 + γ_origin · holidays_origin) × Tirol daily pull; γ from the push–pull fit and mobile-data priors | Paznaun real daily data (market-split sums), held-out weeks | medium |
| **M4** | share of bookings 0 / 8 / 31 / 61 / 90 / 180+ days before arrival, per arrival month; "advertise by" date | TVB booking lead time (arrival weeks, 2023–2026, Paznaun, no origin split) | multinomial shares per arrival month + linear trend per class (winter books earlier, summer later) | leave-one-season-out | medium for Paznaun as proxy for Tirol; **no origin split** in any available data (shown as "all markets") |
| **M5** (optional) | age bands, median age per origin | Salzburg guest-card usage (age band × origin, 7 winters, comparable ski region); T-MONA Tirol reports (state level) | empirical distribution per origin and season, shrunk to the all-origin distribution for small origins | stability across seasons | low (proxy region) |

Data each model does **not** need: M1/M2 need no TVB data; M4 needs no holidays
or market mix; M5 needs neither. The Paznaun forecast (sections 1–6) keeps
using everything.

Derived GUI outputs:
- **Advertising window** for an origin and time frame = arrival weeks of
  the origin's holidays (M3) minus the lead-time distribution (M4): "for
  Bavarian guests arriving 15–21 Feb, 50 % of bookings are made by …".
- **Potential** = M1 forecast vs last year and vs trend, plus the origin's
  share growth (e.g. Bavaria's share of Tirol nights over 5 seasons).
- Every number carries its source and grade.

Data contract (precomputed, the GUI only reads): one table per model,
`out/gui/m1_origin_month.parquet` (destination, origin, month, arrivals, nights,
p10, p90), `m2_los.parquet`, `m3_daily_share.parquet` (origin, date, share of
month), `m4_leadtime.parquet` (arrival month, class, share, trend),
`m5_age.parquet` (origin, age band, share). Tirol data is open (CC BY 4.0,
credit Statistik Austria); TVB lead-time shares are aggregates (TVB licence:
derive and share with attribution).

Order of work: M1 → M2 (same data, fastest value) → M4 → M3 → M5.
Missing for later: lead time by origin (no source), Tirol-wide lead time
(Paznaun used as proxy), daily Tirol actuals after 2025 (open index ends 2025).
