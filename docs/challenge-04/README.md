# Challenge 04: Overnight Data Without Explanation (TVB Paznaun-Ischgl)

Entry point for the data and modelling work on branch `c04-data-models`.
State: Sun 8 Nov 2026, morning. All facts were checked against the primary
sources listed at the end.

| File | Content |
|---|---|
| [PLAN.md](PLAN.md) | What we build until submission, model architecture, tasks |
| [DATA.md](DATA.md) | Every data source: verified meaning, access, licence, tested value |
| [MODELS.md](MODELS.md) | Model research: what we tested, what works, why |
| [RESEARCH-PLAN.md](RESEARCH-PLAN.md) | Deeper plan: models and approaches to test, data sources and access, blind spots |
| [RESULTS.md](RESULTS.md) | Numbers: real-data backtests, explanations, winter 26/27 forecast |
| [DATA-PROFILE.md](DATA-PROFILE.md) | Generated structure check of the TVB files (no row values) |

## Branch rules

- `c04-data-models` belongs to one owner: data
  acquisition, data engineering, model research, training and prediction
  testing. Other team members work on their own branches (e.g.
  `paznaun-demand-radar` for the dashboard). Results go to `main` or
  dedicated branches later via pull request.
- Raw TVB files only in `data/raw/partner/`, derived tables in
  `data/processed/` and `out/`: all git-ignored. Commit aggregates only.
- Never commit keys. The TTF Space key lives in the cloud environment's
  network secrets (injected by the proxy) or in a local environment variable.
- Deployments use the deploy workflow (path `/<branch>`, the root only on request).

## The challenge (organisers' text, 7 Nov 2026)

> Destinations track overnight stays, forecasts and available beds, but
> deviations often remain unexplained. How can teams identify meaningful
> patterns, understand differences between forecasts and actual demand, and
> recognise changes early enough to make better decisions?

1. Where does demand fall behind the forecast or previous year, where is
   capacity tight or unused, and why?
2. Which concrete marketing actions follow (what, when, where, for which
   market), and which comes first, ranked by effect, lead time, feasibility
   and confidence?
3. How can each recommendation show what it is based on and how reliable it
   is, given gaps, zero values and limited data history?

Partner and contact: TVB Paznaun-Ischgl, Raphael Tonitz (on site both days).

## Event facts

- Submission **Sun 8 Nov 13:00**; pitches from 14:00, **2 minutes per team**.
- Technical jury visits teams Sun 09:00–12:00 (checks the work was built
  during the hackathon; extra prizes for work the pitch cannot show).
- Scoring: jury 65 % (presentation, creativity, impact), challenge partners
  35 % (ranking).
- Prizes 3,000 / 2,000 / 1,000 EUR; extra: Best Data Product (nexyo and
  Austria Tourism), Community Award, UnternehmerTUM Special Award.
- News: Discord https://discord.gg/bmAAvQdsd. Open question: how the team
  submits (organisers' buildbar_ hub or our own deployment).

## Run everything

```bash
pip install pandas pyarrow scikit-learn statsmodels lightgbm xlrd openpyxl holidays
```

```bash
python3 data/fetch_open_data.py TR53 && python3 data/fetch_drivers.py && python3 data/fetch_macro.py && python3 data/fetch_tirol_stats.py && python3 data/market_mix.py
```

```bash
python3 data/fetch_partner.py && python3 data/build_features.py && python3 data/profile_partner.py --public
```

```bash
cd models && python3 real_backtest.py && python3 explain.py && python3 early_warning.py && python3 forecast_winter.py
```

`data/fetch_partner.py` needs TTF Space access for challenge 04 (key with
contract permission). Without it, `forecast_winter.py` and `explain.py` fall
back to open data.

## Code map

```
data/
  fetch_open_data.py   official forecast API (TR53 monthly + daily)
  fetch_drivers.py     forecast repo data, OpenHolidays, SNOWGRID, Open-Meteo
  fetch_tirol_stats.py Landesstatistik Tirol: Paznaun origin mix, beds, key figures per municipality/season
  market_mix.py        monthly market weights: Paznaun season mix x Tirol monthly pattern (Statistik Austria)
  holiday_features.py  school / public / regional holidays, long weekends, bridge days per market
  make_static_holidays.py  generates static/school_holidays_extra.csv (DK, GB, SE; IT/PL/FR gaps)
  fetch_macro.py       Eurostat, ECB, geopolitical risk, policy uncertainty, long snow series
  fetch_partner.py     TVB datasets via TTF Space (ttf_mcp.py = minimal MCP client)
  fetch_other.py       other challenges' Data Space products (mobile data, guest cards, TOURDATA)
  load_partner.py      loaders for the TVB files; profile_partner.py = data checks
  build_features.py    -> data/processed/features_daily.parquet (one row per day)
  static/              generated school-holiday supplement, season dates
models/
  common.py            feature matrix, metrics, helpers
  anchor.py            monthly level: 2-season average + Easter regression
  real_backtest.py     ex-ante backtest on real TVB actuals + conformal calibration
  explain.py           graded deviation drivers, Theil, tracking signal, waterfall
  early_warning.py     occupancy from free beds, booking lead-time mix
  push_pull.py         push (source-market free time) x pull (destination) model
  market_split.py      daily stays split by market (raked to season totals)
  backtest_v2.py       comparison: push-pull, compact LightGBM, sample weights, ensembles
  forecast_winter.py   winter 26/27 forecast -> out/c04_forecast.json
  probe_*.py           research probes (monthly baselines, Chronos-2, macro drivers, mobile data and guest cards)
```

## Primary sources

- Organisers: https://buildbar.at/ttf-2026
- TTF catalogue (TVB products, schemas, help): https://portal.ttf.nexyo.io/
- Official forecast: https://b2b.austria.info/de-at/wissen/statistiken-und-dashboards/naechtigungsprognose/,
  API https://naechtigungen.pol.joanneum.at/docs, code and data
  https://github.com/kan-jr/Naechtigungsprognose
