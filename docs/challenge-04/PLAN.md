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
| 2 | **Daily pattern stacking** S1–S4, non-negative weights fitted on 24/25, tested on 25/26; weekday correction for 0–14 days | `models/shape.py` | beats the 10.5 % ensemble on winter 25/26 | P1 |
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

## 4. Questions for the TVB (Raphael Tonitz, on site)

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
