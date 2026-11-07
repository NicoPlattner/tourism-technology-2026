# Challenge 04: data

Every source we use or tested: what it really contains (checked on the data,
not only on its description), access, licence, and whether it helps.

## 1. TVB Paznaun-Ischgl (TTF Data Space, challenge "04 Overnight data")

Licence "TVB Paznaun-Ischgl TTF 2026 data licence": use, derive, share
allowed, **attribute TVB Paznaun-Ischgl**. Access: TTF member with
challenge 04 → contract per product (auto-approved) → download
(`data/fetch_partner.py`). Raw files are git-ignored.

| Product | Columns | What the data shows (verified 8 Nov) |
|---|---|---|
| Overnight stays, 4 Nov 2025 – 4 Apr 2027 | `date, previous_year, forecast, actual` | One daily total for Ischgl, Galtür, Kappl, See. `actual` until 31 Oct 2026, no gaps or zeros. `previous_year` = `actual` exactly 365 days earlier (same calendar date, not weekday) → real daily history from 4 Nov 2024. `forecast` is **not** the official TR53 forecast (zeros on other days, monthly ratio 0.72–1.31); it is 0 on 17 days; origin and vintage unknown |
| Available beds, 6 Feb 2025 – 7 Nov 2026 | `date, available_beds` | **Free (still bookable) beds**, not capacity: about 1,100 in February when stays peak, max 11,113, correlation with stays −0.45. Capacity ≈ stays + free beds (winter median ≈ 20,000) |
| Booking lead time, weeks 30 Oct 2023 – 26 Oct 2026 | `week_start, bookings_{0,8,31,61,90,180}_days_ahead` | Rows behave like **arrival weeks** (all classes peak Dec–Apr). About 20,000 bookings per winter: a booking-platform sample, not all guests. Empty = 0 |
| Event calendar 2026–2027 | `date, weekday, event` | 146 event days, 53 in winter 26/27: first ski day 26 Nov, opening concert 28 Nov, Easter concert 28 Mar, spring concert 17 Apr, freeride and kids' events, public holidays |
| Monthly-edition series (stays, beds) | same | Month slices of the same files (checked: identical); no forecast vintages |
| Contwise content API | external API | POIs, events, tours; not used yet |

Level check: TVB actual = TR53 monthly actual × 1.02–1.08 (TR53 adds Pians
but counts only hotels and holiday flats).

## 2. Austria Tourism open data (official forecast, CC BY 4.0)

| Source | Content | Use |
|---|---|---|
| API naechtigungen.pol.joanneum.at, region **TR53** = Galtür, Ischgl, Kappl, Pians, See | Monthly stays since Nov 1999 (actuals to Aug 2026, then forecast), daily forecast since 2023 | 26-year monthly history, level anchor, official baseline |
| Repo kan-jr/Naechtigungsprognose `data/` | Daily index 2022–2025 for 100 regions (feratel + mobile data), calendar matrix, event flags, bed cap, model parameters | Daily history before Nov 2024 (matches real data: corr 0.993, 5.7 % error), pooling across regions |

What the official model does not contain: weather, snow, sentiment, the real
season-opening date. Its daily series sets the lowest day of the year to 0
and can exceed its own bed cap (22,078), which itself is not a real limit.

## 3. Explanatory drivers (open, fetched)

| Driver | Source | Tested value |
|---|---|---|
| School holidays per market (DE by Land, NL, BE, CH, AT, CZ, PL, FR, IT, LU) | OpenHolidays (ODbL) | Strong for daily pattern; German holidays: actual above TVB forecast (grade A) |
| DK and GB school holidays | hand-made `data/static/school_holidays_dk_gb.csv` (approximate) | Used grouped with other markets |
| Snow depth, ski area Idalpe and village, daily since 1999 | GeoSphere SNOWGRID 1 km (CC BY 4.0) | **Season level: +0.45 pp growth per +10 cm Dec–Mar mean snow vs last season (r = 0.50, 20 seasons)**; 1 SD (32 cm) ≈ ±1.4 %, in line with the literature (0.6–1.9 %). Known only during the season → explanation and scenario, not a point forecast |
| Weather forecast 16 days | Open-Meteo (CC BY 4.0) | Short-term trigger only |
| Events | TVB event calendar (2026–27 only) + forecast-repo flags (none for Paznaun) | Event days: actual below TVB forecast on smaller event days (grade A) |
| Season dates | press + TVB calendar, `data/static/season_dates.csv` | Opening ramp is the biggest error of the official daily forecast |

## 4. Economy, inflation, currencies, geopolitics (fetched and tested)

`data/fetch_macro.py` → `data/processed/macro_monthly.parquet`;
test `models/probe_macro.py`, 20 winter seasons 2001/02–2025/26 without COVID
years, drivers as change vs last year in Sep–Oct before the season.

| Driver | Source | Correlation with season growth |
|---|---|---|
| Consumer confidence DE, NL, BE, DK, PL, AT | Eurostat ei_bsco_m | −0.28 … +0.18 |
| Inflation Austria, all items and accommodation services | Eurostat prc_hicp_manr | +0.13 / −0.23 |
| Unemployment DE, NL | Eurostat une_rt_m | −0.12 |
| Exchange rates CHF, GBP, PLN, CZK, DKK, SEK, USD | ECB | −0.30 … +0.26 |
| Geopolitical risk (global; DE, NL, RU, UA) | Caldara & Iacoviello GPR | −0.11 |
| Economic policy uncertainty Europe, Germany | policyuncertainty.com | +0.18 |

None reaches significance (|r| > 0.45). Leave-one-season-out error of season
growth: mean growth 2.24 pp, ridge with all macro drivers 2.69 pp, top-3
2.45 pp. **Macro data makes the level forecast worse.** Winter demand in
Ischgl is very stable (sd of season growth 2.8 %). Large shocks (COVID 2020–22,
Ischgl's March 2020 outbreak, the 2022 war and energy crisis during recovery)
are regime breaks: handled as flags and scenarios, not as regressors.
Use: context in the pitch and stress scenarios ("what if DE confidence drops
like in 2022"), not inside the forecast.

## 5. Tested and rejected, or blocked

| Source | Result |
|---|---|
| Wikipedia pageviews "Ischgl" | Coincident, not leading (r 0.83 at lag 0, 0.11 at lag 2); German views falling while stays rise |
| Google Trends | API blocked from the cloud; manual download possible; literature mixed |
| GeoSphere station snow (Idalpe, Galtür) | No values returned; SNOWGRID used instead |
| FRED oil prices | Blocked |
| OTA price scraping | Not used (terms of service) |

## 6. Still missing (ask the TVB or Statistik Austria)

1. **Guest nationality** (monthly top markets): needed to say "which market"
   with confidence. Public substitute: Statistik Austria STATcube
   (municipality × country of origin × month, free login).
2. **How and when the TVB forecast is made** (booking-based? vintage?).
3. **On-the-books snapshots by stay date** (bookings already held for future
   nights): would enable a real pickup nowcast.
4. Confirmation that lead-time rows are arrival weeks.

## 7. Licences to cite

TVB Paznaun-Ischgl (TTF 2026 data licence) · Österreich Werbung / JOANNEUM
RESEARCH / TU Wien / AAU (CC BY 4.0) · GeoSphere Austria (CC BY 4.0) ·
Open-Meteo (CC BY 4.0) · OpenHolidays (ODbL) · Eurostat and ECB (reuse with
attribution) · GPR index (Caldara & Iacoviello) · EPU (Baker, Bloom & Davis).
