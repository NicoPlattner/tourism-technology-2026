# Challenge 04: execution plan (data, models, testing)

Owner of this plan: data acquisition, data engineering, model research,
training and testing. Written Sat 7 Nov 2026 evening. Submission **Sun 8 Nov
13:00**, technical jury **Sun 09:00–12:00**. Evidence for each decision is in
[RESEARCH.md](RESEARCH.md); the data catalogue is in
[DATA-SOURCES.md](DATA-SOURCES.md).

## Status (7 Nov, night)

Done on open data: fetchers, feature table, daily-shape backtest, conformal
intervals, deviation explainer, Easter-corrected anchor, winter 26/27 JSON
export, partner loader/profiler. Results: [RESULTS.md](RESULTS.md). Blocked
on partner files: real-actual backtest, lead-time early warning, bed
utilisation, action scoring.

## 1. What we deliver (the story the numbers must support)

> "Paznaun-Ischgl's forecast is accurate per month but wrong per day and per
> market. We show **where** demand deviates, **why** (with evidence), **what
> to do now**, and **how sure** we are."

Three demo-able outputs, each backed by a backtest:

1. **Deviation explainer**: for any week, a waterfall from forecast to
   actual: calendar shift, market holidays, events, snow, data gap,
   unexplained.
2. **Early warning**: winter 26/27 days and markets flagged as behind,
   tight (≥ 90 % beds) or idle, with lead time left to act.
3. **Ranked actions**: what / when / which market / expected effect /
   confidence grade A–C / evidence.

Headline examples already found in open data (to confirm with partner data):
the official daily series contains artefact zeros and breaches its own bed cap;
the official forecast may put ~15k too many stays into April 2027
(Easter 28 March; low confidence, see RESULTS.md).

## 2. Architecture

```
data/fetch_*.py ──► data/raw/{open,partner}/  (git-ignored)
                          │
data/build_features.py ──► data/processed/features_daily.parquet (git-ignored if it holds partner data)
   calendar · market holidays (OpenHolidays + DK/GB table) · events · season dates
   · SNOWGRID snow depth · lead-time intake index · beds · data-quality flags
                          │
models/
  baselines.py      M0  PY-aligned, avg-2y, official forecast
  glm.py            M1  Poisson/log ridge, pooled calendar priors      ◄── main
  gbm.py            M2  LightGBM quantile + SHAP                         challenger / explanation check
  chronos.py        M3  Chronos-2 + covariates, zero-shot                short-horizon ensemble member
  backtest.py       rolling origin, MASE · wMAPE · pinball · coverage
  explain.py        DQ rules → calendar alignment → GLM contributions → SHAP agreement → Theil
  warn.py           intake index, EWMA/CUSUM, utilisation flags, snow trigger
  conformal.py      split conformal per horizon bucket (+ adaptive if time)
  actions.py        scoring → ranked list with grade
                          │
out/c04_*.json  ──► UI / pitch  (only aggregated, licence-attributed output)
```

## 3. Model decisions

| Layer | Decision | Fallback if it fails the backtest |
|---|---|---|
| Baselines | PY aligned by weekday and holiday phase; avg-2y monthly; official forecast | – (must exist) |
| Main forecast | Monthly anchor (avg-2y + Easter adjustment) × daily shape from ridge GLM on log stays; calendar coefficients pooled from the open 107-region daily index 2022–2025, Paznaun intercept/scale from partner data; capacity-aware reconciliation | Official forecast re-shaped with corrected season-opening and Easter |
| Challenger | LightGBM quantile (same features) | Drop; keep SHAP only if GLM and GBM agree |
| Short horizon | Chronos-2 + covariates, averaged with M1 for h ≤ 3 months if it wins the backtest (it did on monthly TR53: 5.5 % vs 7.5 %) | M1 alone |
| Explanation | Additive waterfall; driver reported only if GLM and SHAP agree on sign | GLM contributions with bootstrap CIs |
| Systematic error | Theil decomposition + tracking signal on partner forecast vs actual | Mean signed error per month / weekday |
| Early warning | Lead-time intake index (YoY per class) + EWMA/CUSUM on log(ACT/FC) + utilisation | Utilisation flags only |
| Intervals | Split conformal on backtest residuals, per horizon bucket, 80 % | Empirical residual quantiles |
| Snow | Feature only for early season and short-lead bookings | Report "no snow effect detected" |

Not used, with reason: deep sequence models (too little history), Prophet
(no gain over GLM), Wikipedia pageviews (tested, not leading).

## 4. Backtest design (prediction testing)

- **Daily, partner data**: the PY column gives winter 24/25, actuals give
  25/26 (to verify). Train on 24/25 + open pooled data, forecast 25/26 from
  weekly origins (1 Nov 2025 → 1 Mar 2026) at horizons 7 / 14 / 28 / 56 / 90
  days. Compare M0–M3 and the partner forecast.
- Caveat: the partner forecast column is probably the **current** vintage,
  made after part of 25/26 was known. Label it "official (in-sample)" and do
  not claim we beat it unless vintages are confirmed.
- **Monthly, open data**: rolling origin 2023-10 → 2025-08 (done in
  `models/probe_open_forecast.py`, `models/probe_chronos2.py`).
- Metrics: MASE (seasonal naive scale), wMAPE, pinball loss at 10/50/90 %,
  80 % interval coverage. Report per horizon bucket and for peak weeks
  (Christmas, February half-term, Easter) separately.
- Gate: a model enters the UI only if it beats PY-aligned on wMAPE at its
  horizon. Otherwise the UI shows the baseline and says so.

## 5. Timeline

| Time (CET) | Block | Done when |
|---|---|---|
| Sat 18–19 | Partner data download; profile; answer the 7 checks in RESEARCH §6; ask TVB (§6 below) | `docs/challenge-04/DATA-PROFILE.md` committed (no raw values from partner files beyond aggregates) |
| Sat 19–21 | Fetchers + feature table: holidays (incl. DK/GB), SNOWGRID, events, season dates, DQ flags | `features_daily` builds from one command |
| Sat 21–23 | Baselines + backtest harness + Theil on partner forecast | First error table committed |
| Sat 23–01 | M1 GLM + explanation waterfall + conformal | Worked example week explained end to end |
| Sun 07–09 | Early warning (intake index, utilisation, alarms) + M3 Chronos-2 + M2 if time | Winter 26/27 flags + backtest table final |
| Sun 09–12 | Technical jury walkthrough; action scoring; export JSON for UI | `out/c04_*.json` frozen at 11:30 |
| Sun 12–13 | Pitch numbers + sources slide; submission | – |

Commit after every block (the technical jury checks the history).

## 6. Questions for the TVB (Raphael Tonitz, on site)

1. Can we get **stays by guest nationality** (daily or monthly) for 24/25 and
   25/26? Even top 6 markets per month is enough.
2. Do you have **on-the-books per stay date** (snapshot today vs same day
   last year)?
3. **Website / booking-engine sessions by country** (weekly)?
4. Which forecast vintage is in the file, and is it the Austria Tourism
   (TR53) forecast scaled to the four municipalities?
5. Lead-time file: bookings *made* per week, or *arrivals* per week?
6. Season dates 26/27: first ski day 26 Nov (confirmed in press), full
   operation 4 Dec (austria.info)? Closing date?

## 7. Output contract for the UI (draft)

```json
{
  "meta": {"generated": "...", "sources": ["TVB Paznaun-Ischgl", "Österreich Werbung (CC BY 4.0)", "GeoSphere Austria (CC BY 4.0)", "OpenHolidays (ODbL)"]},
  "daily": [{"date": "2026-12-27", "forecast_official": 0, "forecast_ours": 0, "p10": 0, "p90": 0,
             "actual": null, "py_aligned": 0, "beds": 0, "utilisation": 0.0,
             "flags": ["tight", "official_zero_artifact"]}],
  "drivers": [{"week": "2026-W52", "component": "market_holidays_NL", "stays": 0, "grade": "B"}],
  "actions": [{"rank": 1, "what": "...", "when": "2027-01-10", "market": "NL",
               "expected_stays": [0, 0], "lead_time_days": 0, "grade": "C", "evidence": ["..."]}],
  "backtest": [{"model": "M1", "horizon": "h7-28", "wmape": 0.0, "coverage80": 0.0}]
}
```

## 8. Data product for the "Best Data Product" award (P2)

Publish in the TTF Data Space: **"Paznaun-Ischgl daily demand drivers
2024–2027"**: calendar, market school holidays (incl. DK/GB), events,
SNOWGRID snow depth, season dates, and data-quality flags per day. Built from
open sources only (plus derived flags), so it can be shared under CC BY 4.0 /
ODbL with attribution. Other destinations can reuse it.

## 9. Risks

| Risk | Mitigation |
|---|---|
| No partner data access in time | Everything runs on TR53 open data (monthly actuals + official daily); partner data swaps in via the same feature table |
| Too little daily history for GLM | Pooled priors from 107 regions; strong ridge penalty; fall back to baseline + explanation only |
| Explanations look arbitrary | Grade A only when two methods agree; show "unexplained" honestly |
| Partner data leaks into git | Raw files only in `data/raw/` (git-ignored); outputs aggregated; check `git status` before every commit |
| Keys | Never in repo or chat; MCP / API keys set up by the owner locally |
