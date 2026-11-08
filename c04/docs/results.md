# Challenge 04: results

Status: 8 Nov 2026, after loading the TVB data. **Section A uses the real TVB
Paznaun-Ischgl data** (feratel, TTF Data Space; raw files git-ignored, only
aggregates here; attribution: TVB Paznaun-Ischgl). Section B collects supporting
results from the 26-year monthly history and open data.

# A. Results on the real TVB data

Reproduce (needs the TTF Space key in the environment):

```bash
python3 c04/data/fetch_partner.py && python3 c04/data/build_features.py
```

```bash
cd c04/models && python3 real_backtest.py && python3 explain.py && python3 early_warning.py && python3 forecast_winter.py
```

## A1. What the data is (verified, see [partner-data-profile.md](partner-data-profile.md))

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
| snow depth < 30 cm (ski area) | +48.0k | A* | actual **above** forecast on low-snow days, i.e. low snow did not hurt. *Confounded with December (the only under-forecast month, 17 cm mean snow); one season cannot separate them |
| Fri/Sat nights | −22.0k | A | forecast too high on weekends |
| German school holidays | +11.0k | A | forecast too low in German holiday weeks |
| early season (first 3 weeks) | +12.3k | B | |
| Polish/Czech school holidays | +8.4k | B | sign changed after the holiday-data fix (was −20.8k with unweighted, incomplete calendars) |
| other TVB event days | −5.0k | B | forecast too high on smaller event days |
| long weekends / bridge days (source markets) | −3.4k / −0.9k | C | no clear winter effect |

Updated 8 Nov after the holiday-data rebuild (section A7).

Summer (R² 0.08): the over-forecast is mainly a **level shift** (about −10k
stays per peak-summer week). Polish/Czech holidays +41k (grade A) coincide with
the summer peak and are confounded with it. **Bridge-day long weekends** in
the source markets (Ascension, Corpus Christi): forecast too high, −1.1k
(grade A, small). Explanations are weak in summer:
we say so instead of inventing reasons.

## A4. Our forecast vs TVB forecast and baselines (`real_backtest.py`)

Ex ante as of 31 Oct 2025 (our models) vs the TVB columns:

| Model | Winter 25/26 daily error | Monthly error | Bias | May–Oct 2026 daily | Bias |
|---|---|---|---|---|---|
| TVB forecast (vintage unknown) | **5.5 %** | 6.1 % | +2.7 % | 15.4 % | **+11.9 %** |
| TVB previous-year column | 14.3 % | 6.3 % | −1.2 % | 20.6 % | +6.6 % |
| previous year, holiday-aligned | 10.8 % | 5.9 % | −3.5 % | **15.4 %** | +4.0 % |
| official TR53 × level (in-sample) | 10.4 % | 0.8 % | +0.8 % | 24.5 % | +2.3 % |
| **ours (ensemble; winter: + push–pull member)** | **8.5 %** | **3.7 %** | −1.2 % | 18.4 % | **+2.6 %** |

- Ours has the lowest monthly error and bias of all ex-ante methods and the
  best ex-ante daily error in winter. It beats the TVB previous-year column
  clearly (9.5 % vs 14.3 % daily). In summer its bias is +2.6 % vs +11.9 %
  for the TVB forecast.
- Use: TVB forecast for daily patterns inside the winter; **our model as an
  independent check of the level**, especially Nov, Mar and summer.
- Conformal 80 % band, calibrated on real winter 24/25: coverage **0.79** on
  25/26; half-width ×/÷1.67 normal days, ×/÷1.28 peak days.

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

## A6. Winter 26/27 (`forecast_winter.py` → `c04/out/c04_forecast.json`)

| Month | Ours | TVB forecast | TVB vs ours | Note |
|---|---|---|---|---|
| Nov 2026 | 44.0k | 54.3k | **+24 %** | TVB was +19 % too high in Nov 2025 |
| Dec 2026 | 419.9k | 409.7k | −2 % | |
| Jan 2027 | 548.1k | 567.0k | +3 % | |
| Feb 2027 | 565.1k | 581.2k | +3 % | |
| Mar 2027 | 518.0k | 571.8k | **+10 %** | TVB was +7 % too high in Mar 2026; Easter 28 Mar is inside March |
| 1–4 Apr 2027 | 52.3k | 49.2k | −6 % | TVB file ends 4 Apr |

(after the holiday-data rebuild; monthly totals unchanged, daily pattern updated)

- 17 predicted tight days (≥ 95 % of last year's capacity): 29 Dec–2 Jan,
  February weekends and half-terms (5–6, 13–14, 18–20 Feb), early March
  weekends, Easter (25–26 Mar).
- 40 in-season days with spare capacity (< 80 %), 15 days where the TVB
  forecast lies outside our 80 % band, 6 TVB forecast zeros.
- Watch list for marketing: **November 2026 and March 2027** (TVB forecast
  much higher than ours and historically too high), spare in-season days in
  January and March.

## A7. Holiday data rebuild (8 Nov)

What changed (`c04/data/holiday_features.py`, `c04/data/make_static_holidays.py`):
- School holidays population-weighted per state / canton / language community
  / voivodeship; Belgian communities separated (the French-speaking community
  has a two-week Carnival break since the 2022 reform); French overseas
  calendars excluded.
- Gaps filled: Denmark, UK (England pattern) and Sweden (incl. sport holidays
  weeks 7–11) for 2021/22–2026/27; Italy summer 2026 and 2026/27; Poland
  Christmas, Easter and summer 2026/27; France summer 2027. Audit: every
  market now has ~115–250 holiday days per full year.
- New per market: public holidays (national + regional, e.g. Corpus Christi
  only in some German states, Swiss cantonal days), long weekends, bridge days
  and bridge-extended long weekends, all population-weighted and year-specific.

Effect on the real-data backtest (winter 25/26, ex ante):

| Model | before | after |
|---|---|---|
| LightGBM daily error | 14.1 % | **11.5 %** |
| ensemble daily error | 10.5 % | **9.5 %** |
| ensemble peak-day error | 8.4 % | **7.8 %** |
| conformal 80 % coverage | 0.77 | **0.79** |
| summer ensemble daily error | 17.7 % | 18.9 % |

Then market weights switched from the assumed mix to real data: first
Statistik Austria's monthly Tirol mix (German states weighted by guest
origin): ensemble 9.5 → 9.4 %, peak days 7.8 → 7.2 %; then Paznaun's own
season mix from Landesstatistik Tirol × Tirol's monthly pattern: ensemble
**9.5 %**, peak days **7.2 %**, coverage 0.78. The forecast is insensitive to
the exact weights; their value is in market-level explanations and actions.

Ablation: the gain comes from the corrected school-holiday data (LightGBM
11.6 % with school holidays only). Long weekends and bridge days add almost
nothing to winter forecasts (few public holidays in winter) and slightly hurt
summer forecasts; they stay in the explanation layer, where bridge-day
weekends show a small, significant summer over-forecast.

# C. GUI models (Tirol × origin × time frame)

Built 8 Nov from open data plus the TVB lead-time file.
Tables in `c04/out/gui/` (git-ignored; regenerate with the commands below); one
answer per request via `c04/models/gui_outputs.py: query(origin, start, end)`.

```bash
python3 c04/data/fetch_holidays_history.py && python3 c04/data/build_origin_panel.py && python3 c04/data/build_tirol_daily.py
```

```bash
cd c04/models && python3 m1_origin.py && python3 m4_leadtime.py && python3 m3_daily.py && python3 gui_outputs.py
```

| Model | Output | Data | Test | Result | Grade |
|---|---|---|---|---|---|
| M1 | guests and nights per origin and month, 12 months ahead, 80 % range | Statistik Austria Tirol × 45 origins × month (99 % of nights); per-origin holidays | yearly origins 2012–2018 and 2022–2025, 12 months each | monthly error per origin after COVID **10.2 %** (nights), 10.2 % (arrivals) vs 14.2 % last year, 13.6 % 2-year mean; Tirol total per month 5.6 %; without holiday features 12.8 %; 80 % range covers 75 % | A/B |
| M2 | length of stay | same | same | 2-year ratio 4.9 % error (beats dividing two forecasts, 5.6 %); arrivals = mean of direct and nights / length of stay | A |
| M3 | daily distribution inside the time frame | Tirol daily pattern (34 regions) × origin holiday push | pull: Tirol 2025 from earlier years; push: Salzburg mobile data by home country | pull: last year aligned 19.3 % daily error vs 26.6 % flat; push improves 7 of 8 countries (NL 65 → 49 %, GB 102 → 75 %, BE 99 → 81 %, DE 29 → 24 %; FR slightly worse) | B |
| M4 | booking lead time per arrival month, "book by" date | TVB lead-time classes (Paznaun as proxy) | predict a held-out season | "same as last season" best: 1.5 pp class-share error in winter, 3.2 pp summer; median lead time ±15 days. By-market split (derived) loses to the monthly average (3.3 vs 2.9 pp) → indicative only | B (all markets), C (by market) |
| M5 | age bands, median age band, share of children | Salzburger Sportwelt guest cards (proxy region) | stability last season vs earlier | winter profiles shift only 2–4 % (total variation) | C |

Example, Bavaria → Tirol, 15 Jan – 15 Mar 2027: 376k guests, 1.20 M nights
(80 % range 0.96–1.49 M; same period last year 1.18 M), 3.2 nights per stay;
median booking 75 days ahead (book by ~1 Nov 2026 to reach half of the
first arrivals; 44 % book ≥ 90 days ahead); median age band 25–34, 28 %
children (proxy). Bavarian school holidays 8–12 Feb 2027 roughly double the
daily nights of the surrounding days.

Destination Paznaun-Ischgl (`query(..., destination="Paznaun-Ischgl")`): M1 ×
Paznaun's share of Tirol nights per origin country and season kind (latest
season, Landesstatistik Tirol): winter DE 8.1 %, NL 8.8 %, BE 15 %, CH 12 %,
DK 20 %, GB 6.7 %, PL 8.2 %, AT 4.9 %, other origins 12 %. Bavaria → Paznaun,
15 Jan – 15 Mar 2027: ~97k nights (80 % range 78–121k; last year 95k). Grade B/C.

Data used per model (selection rule: only blocks that improved the backtest):
M1/M2 no TVB data; holiday features kept (12.8 → 10.4 %). M3 no market mix
(push uses the origin's own calendar). M4 no holidays. M5 none of these.

## C-update (8 Nov, review)

- M1 now trained on all 9 Austrian states: Tirol post-COVID monthly error
  9.9–10.1 % (62 origins incl. small ones and country groups; the origin code
  mapping was corrected against the official list); intervals use the 0.85
  quantile (84–85 % coverage).
- Complete GUI table `c04/out/gui/complete_origin_month.parquet`: 10 destinations
  (9 states + Paznaun-Ischgl) × 84 origins (incl. Germany and Austria totals
  and the 16 German states) × months 2024-01 … 2027-12 = 40,320 rows, **no
  empty cells**: 22,344 observed / model grade A, 3,900 model grade B, 14,076
  estimates grade C (2-year average for small origins, carried forward after
  the horizon, population split of German regions, Paznaun share).
- `c04/models/gui_api.py: query(destination, origin, start, end)` returns every
  field as `{value, is_estimate, method, grade, note}`. Examples in
  `c04/out/gui/example_*.json`, e.g. Tirol ← Hesse, Feb 2027: 186k nights,
  estimate (Central Germany split by population), grade C.

# B. Supporting results (long history and open data)

| Finding | Number | Script |
|---|---|---|
| Monthly baselines, TR53, winter months, rolling origin 2023-10 → 2025-08 | 2-season average 7.5 / 4.9 / 4.9 % median error at 1–3 / 4–6 / 7–12 months; ETS 8.5 / 6.5 / 4.7 %; seasonal naive 9.0 / 9.0 / 5.7 % | `probe_open_forecast.py` |
| Chronos-2 zero-shot, same test | with Easter covariate 5.5 / 11.6 / 8.1 %: best at 1–3 months only | `probe_chronos2.py` |
| Easter effect | April share of Mar+Apr = −0.062 + 0.0040 × Easter day-of-year (25 seasons, r 0.75); 2027: 0.287 → April about 15k below the official forecast (grade C) | `anchor.py` |
| Official daily forecast | lowest day of the year forced to 0 (2025-11-10, 2026-11-09); static bed cap 22,078 exceeded on 4 forecast days and by real demand around New Year; misses the season opening | `probe_open_forecast.py`, RESULTS A |
| Open daily index vs real actuals | corr 0.993, 5.7 % daily error (winter 24/25), level ×1.036 | `build_features.py` |
| Calendar shift | 25 % of the day-level deviation between actual and the TVB previous-year column disappears with weekday and holiday alignment (winter 25/26) | `real_backtest.py` helpers |
| Macro drivers vs season growth (20 seasons) | all \|r\| < 0.31; leave-one-out error 2.69 pp (ridge) vs 2.24 pp (mean growth) | `probe_macro.py` |
| Snow vs season growth | r 0.50; +0.45 pp per +10 cm Dec–Mar mean snow vs last season | `probe_macro.py` |
| Mobile network data (Drei, Salzburger Sportwelt) vs official stays | 47–49 % of official stays in winter, 30–36 % in summer; country shares biased by roaming (vs guest cards: share correlation 0.81) | `probe_mobile_guestcards.py` |
| Holiday response per market (mobile data, Feb–Apr 2026) | presence on own holiday days vs other days: NL ×10, GB ×7, BE ×5, LU ×3, DK ×2.8, FR ×2.6, SE ×2.3, DE ×0.9 | `probe_mobile_guestcards.py` |
