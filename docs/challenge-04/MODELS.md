# Challenge 04: models

What we tested, what the real TVB data says about it, and the model mix we
build from here. Numbers come from [RESULTS.md](RESULTS.md); scripts are in
`models/`.

## 1. What the data allows

```
daily real actuals   4 Nov 2024 ─────────────── 31 Oct 2026     (2 winters, 1 summer)
daily open index     2022 ───────── 2025                       (corr 0.993 with real; 3 more winters)
monthly TR53         1999 ─────────────────────── Aug 2026     (26 years, COVID 2020–22)
TVB forecast         Nov 2025 ──────────────────────── Apr 2027 (1 year to judge it)
free beds            Feb 2025 ─────────────── 7 Nov 2026
booking lead time    Oct 2023 ──────────────── Oct 2026 (arrival weeks)
```

Consequences:
- **Level** (how many stays per month or season) has 26 years: classic time
  series methods and calendar corrections work. Winter totals are very stable
  (sd of season growth 2.8 %).
- **Daily pattern** (which days) has 2 real winters plus 3 open-index
  winters: enough for calendar models with few features and for pooling
  across regions, too little for deep models.
- **The TVB forecast** can be judged on one year only: bias corrections must
  be shrunk.

## 2. What we tested (evidence)

| Method | Role | Result | Verdict |
|---|---|---|---|
| Seasonal naive, 2-season average, ETS (TR53 monthly, rolling origin) | level | 2-season average best at 4–12 months (≈5 % monthly) | keep: level member |
| Easter regression (April share of Mar+Apr on Easter day, 25 seasons, r 0.75) | level correction | moves ~15k stays between Mar and Apr 2027 | keep |
| Chronos-2 zero-shot, Easter covariate | level | best at 1–3 months (5.5 % vs 7.5 %), weak beyond | keep for short horizons |
| Previous year, date-aligned (TVB column) | baseline | 14.3 % daily error winter 25/26 | baseline only |
| Previous year, holiday-aligned (weekday, Christmas by date, Easter by offset) | daily pattern | 10.8 %; removes 25 % of the day-level deviation vs the TVB previous-year column | keep |
| LightGBM (Poisson) on calendar, market holidays, season phase, events, snow | daily pattern | 14.1 % alone, strong in combination | keep |
| Average of holiday-aligned previous year and LightGBM, × level | main ex-ante model | **9.5 % daily (10.5 % before the holiday-data rebuild), 3.7 % monthly, bias −1.2 %** (winter 25/26); summer bias +2.6 % vs TVB +11.9 % | current main model |
| TVB forecast | benchmark / member | 5.5 % daily in winter (likely booking-informed), +2.7 % winter and **+11.9 % summer bias**, too high in 11 of 12 months | use its daily pattern, correct its level |
| Official TR53 daily | baseline | in-sample, misses the season opening (16.7k vs 40.9k in one week) | baseline only |
| Poisson GLM, ridge "year-over-year delta" model | daily pattern | worse than baselines with this little history | explanation only |
| Split-conformal intervals | uncertainty | 80 % band covered 77 % of days in 25/26 (calibrated on 24/25) | keep, recalibrate per horizon |
| Ridge + LightGBM SHAP + week-block bootstrap, graded A/B/C | explanation | finds weekend over-forecast, German-holiday under-forecast, event-day over-forecast (grade A) | keep |
| Theil decomposition + tracking signal | systematic error | bias share 14 % winter / 29 % summer; tracking signal beyond ±17 | keep |
| Macro regressors (confidence, inflation, FX, geopolitical risk, uncertainty) | level | no significant correlation; leave-one-out error worse than mean growth (2.69 vs 2.24 pp) | scenarios only |
| Snow at season level | level / explanation | +0.45 pp per +10 cm vs last season (r 0.50) | scenario band and explanation |
| Wikipedia pageviews | leading indicator | coincident, not leading | rejected |
| Deep sequence models (TFT, N-BEATS, DeepAR), Prophet | – | not enough history; no explanations | not used |

## 3. The model mix from here

No single model wins everywhere: the TVB forecast has the best daily pattern
in winter but a biased level; our level is unbiased but its daily pattern is
weaker; Chronos-2 is best only at short horizons. Forecast combination is
the standard answer (M4/M5 competitions: combinations beat single models;
simple, constrained weights beat freely fitted ones on short histories).

```
            LEVEL per month                         DAILY PATTERN within the month
  L1  2-season average + Easter            S1  previous year, holiday-aligned
  L2  ETS on 26 years (log)                S2  LightGBM: calendar, market holidays,
  L3  Chronos-2 + Easter covariate             events, season phase, snow
  L4  TVB forecast x shrunk bias           S3  TVB forecast pattern
      correction per month type            S4  official TR53 daily pattern
         │                                          │
   weights by horizon from backtest          non-negative weights summing to 1,
   errors, shrunk to equal weights           fitted on winter 24/25, tested on 25/26
         └──────────────┬───────────────────────────┘
                        ▼
      RECONCILE: days add up to the month level; check against capacity
                 (stays + free beds, same weekday last year)
                        ▼
      UNCERTAINTY: conformal 80 % band per horizon and day type
                   + snow scenario (±1 SD snow ≈ ±1.4 % season)
                        ▼
      EXPLAIN: calendar alignment → graded drivers (ridge + SHAP + bootstrap)
               → Theil / tracking signal → data gaps (forecast zeros)
                        ▼
      ACT: gap x market holiday overlap x booking lead time x feasibility x grade
```

By horizon:

| Horizon | Level | Daily pattern | Why |
|---|---|---|---|
| 0–14 days | L4 (TVB, bias-corrected) | S3, weekday correction | TVB forecast is booking-informed; weekend over-forecast is a measured bias |
| 2–12 weeks | combination L1–L4 | stacked S1–S4 | each member wins somewhere |
| 3–12 months | L1, L2 (+L3 early) with Easter | S1, S2 | TVB forecast is least reliable far out; long history is the asset |

## 3b. Push and pull: how data sources are combined and weighted

Two kinds of drivers (the push–pull framework of tourism research):

```
PUSH: why people travel at time t, per source market m     PULL: why they choose Paznaun (same for all markets)
  school holidays, long weekends, bridge days of m           season open / phase, Christmas, Easter
  weight 1: m's share of Paznaun nights in that month        snow depth, fresh snow
  weight 2: how strongly m follows its own holidays          big concerts (TOM), weekday
           (gamma_m; prior from mobile data, NL x10 ...)      capacity (cap on full days)
  -> ADD across markets                                      -> MULTIPLY on top
```

How each data source enters (`data/`, `models/`):

| Data | Kind | How it is combined / weighted |
|---|---|---|
| School holidays, public holidays, long weekends, bridge days per market | push | per market; inside a country population-weighted by state / canton / community / voivodeship; German states by the origin of German guests in Tirol |
| Market shares | push weight | Paznaun season mix (Landesstatistik Tirol, 4 municipalities) × Tirol's month-by-month pattern (Statistik Austria); next season = last + ½ trend |
| Holiday response per market | push weight | prior from Salzburg mobile data (NL ×10, GB ×7, BE ×5 …), refitted on Paznaun data with shrinkage |
| Season phase, Christmas, Easter, weekday, snow, recurring concerts | pull | one multiplicative factor per day |
| Real TVB actuals vs open-index stand-in | sample weight | 1.0 vs 0.5 in training (LightGBM: winter 11.5 → 11.2 %, summer ensemble 18.9 → 18.4 %) |

What we tested (real winter 25/26, all scaled to the same monthly level):

| Model | Daily error 24/25 | 25/26 |
|---|---|---|
| ensemble (holiday-aligned previous year + LightGBM with per-market holiday features) | **14.0 %** | **9.1 %** |
| LightGBM, sample-weighted | 15.6 % | 10.3 % |
| push–pull model alone (structured, fitted) | 24.5 % | 16.5 % |
| LightGBM with pull features + one push index | 19.8 % | 11.6 % |
| 3-model ensemble incl. push–pull | 16.2 % | 9.1 % |

Push–pull outputs as *extra* LightGBM columns (existing holiday columns kept):
winter 25/26 9.0 → 8.2 %, winter 24/25 13.5 → 14.7 %: not adopted (must improve
both). At origin level, the holiday push is validated (M3, RESULTS section C).

Decision: **forecast** with the ensemble (per-market holiday features stay
separate; collapsing them into one push index loses information).
**Structure and explanation** with push–pull:
1. explanations are reported as push (source-market free time) vs pull
   (destination) vs level; winter 25/26 deviations of the TVB forecast: level
   −101k, pull +30k, push +11k stays;
2. `models/market_split.py` splits each day's stays into markets (push–pull
   parts raked to the daily actuals and to the Landesstatistik season totals),
   the only daily nationality view we can get (grade C). Winter 25/26 weekly
   peaks: NL 28 % in its spring-break week (22–28 Feb), DK 9 % in week 7,
   BE 21 % around Easter, DE dominant at Christmas and Easter.

## 4. Extra data: decision

| Data | Decision |
|---|---|
| Market school holidays, events, season dates, snow | inside the models (tested value) |
| Economy, inflation, currencies, geopolitical risk, policy uncertainty | **context and stress scenarios only**: tested, no predictive value for Paznaun winter totals; shocks (COVID, 2022) are regime breaks |
| Climate (long snow series) | season-level scenario band; explains good and bad seasons |
| Guest nationality (TVB or STATcube) | would turn holiday effects into market effects: ask |
| On-the-books by stay date | would enable a pickup nowcast for 0–8 weeks: ask |

## 5. Literature behind the choices

- Athanasopoulos, Hyndman, Song, Wu (2011), The tourism forecasting
  competition, IJF 27(3): simple methods are hard to beat on tourism data.
- Makridakis et al. (2020, 2022), M4 and M5 competitions: combinations and
  gradient boosting lead; equal or constrained weights are robust.
- Hyndman et al. (2011): hierarchical and temporal reconciliation.
- Töglhofer, Eigner, Prettenthaler (2011), Climate Research 46: snow effects of
  0.6–1.9 % per SD on Austrian overnight stays.
- Weatherford & Kimes (2003): pickup and regression methods for hotel
  forecasting.
- Ansari et al. (2025), Chronos-2, arXiv 2510.15821.
- Caldara & Iacoviello (2022), Measuring geopolitical risk, AER; Baker, Bloom,
  Davis (2016), Measuring economic policy uncertainty, QJE.
