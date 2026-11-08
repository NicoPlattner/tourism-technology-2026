# Challenge 04 data product

Data, models and the data API behind the Demand Radar: where demand falls behind the forecast or last year,
why, where beds are tight or unused, and which marketing action comes first, each with its evidence grade.

## Contents

| Folder | Content |
|---|---|
| [`data/`](data/) | fetch scripts (open data, TTF Data Space), feature and panel builders, holiday corrections, static inputs |
| [`models/`](models/) | production models, exports to `results/`, the refresh pipeline (`refresh.py`) |
| [`research/`](research/) | experiments that shaped the model choice (Chronos-2, macro drivers, mobile data, model variants) |
| [`evaluation/`](evaluation/) | backtests and evaluation tables written by the models and experiments |
| [`results/`](results/) | published tables: `gui/` (demand by origin) and `c04/` (Paznaun outlook); no raw data |
| [`api/`](api/) | FastAPI service over `results/` ([README](api/README.md)) |
| [`pipeline/`](pipeline/) | image of the refresh job, seed outputs for runs without partner data |
| [`dataspace/`](dataspace/) | publishing the API on the TTF Data Space ([docs/data-space.md](../docs/data-space.md)) |
| [`docs/`](docs/) | [data sources](docs/data-sources.md), [models](docs/models.md), [results](docs/results.md), table schemas ([gui](docs/tables-gui.md), [c04](docs/tables-c04.md)), [partner data profile](docs/partner-data-profile.md) |

## Models

| Model | Question | Method | Quality (real data) |
|---|---|---|---|
| Paznaun forecast | stays per day, winter 2026/27 | monthly anchor (two seasons, Easter-corrected) × daily shape (holiday-aligned previous year + LightGBM, push-pull member in winter); split-conformal 80 % band | 8.5 % daily, 3.7 % monthly error (winter 25/26) |
| Deviation drivers | why actual differed from the TVB forecast | ridge on interpretable drivers, SHAP sign check, week-block bootstrap, grades A–C; Theil and tracking signal | low snow, Fri/Sat nights, German holidays: grade A |
| M1/M2 | guests, nights, stay per origin and month | LightGBM pooled over the nine states on Statistik Austria 2004–2025 | 10.2 % monthly error per origin |
| M3 | daily split within a time frame | destination pattern × origin holiday push | improves 7 of 8 markets on mobile data |
| M4 | booking lead time, "book by" | same as last season per arrival month | 1.5 pp class share error (winter) |
| M5 | age profile | guest cards of a comparable region | grade C (proxy) |
| Actions | which market, when | spare beds × market share × holiday push in free-day blocks, capped gains, bookable share | – |

## Run

Python 3.13 with the packages in [`pipeline/requirements.txt`](pipeline/requirements.txt). Raw and
intermediate data go to `data/raw`, `data/processed` and `out/` (git-ignored). Partner data needs a TTF Data
Space key with challenge 04 contracts in `TTF_SPACE_API_KEY`.

The refresh pipeline runs everything in order, re-runs only the models whose inputs changed, validates the
tables with the API tests and publishes a snapshot:

```bash
WORK_DIR=/tmp/c04-work python3 c04/models/refresh.py full
```

```bash
WORK_DIR=/tmp/c04-work python3 c04/models/refresh.py fast
```

Single steps, e.g. to reproduce the evaluation:

```bash
python3 c04/data/fetch_partner.py && python3 c04/data/build_features.py
```

```bash
python3 c04/models/real_backtest.py && python3 c04/models/explain.py && python3 c04/models/forecast_winter.py
```

```bash
python3 c04/models/export_gui.py && python3 c04/models/export_challenge.py
```

## Licences

Raw partner data (TVB Paznaun-Ischgl with feratel, Salzburger Sportwelt, Hutchison Drei) is never committed.
`results/`, `evaluation/` and `pipeline/seed/` hold derived aggregates only, which the TTF 2026 data licences
allow with attribution. Open sources and their licences: [docs/data-sources.md](docs/data-sources.md).
