# Challenge 04: candidate data sources

Status 7 Nov 2026. Every "verified" entry was fetched from this environment
on that day. Priority = value for the three challenge questions ÷ effort before
Sunday 13:00.

Legend: **P1** = build now, **P2** = build if time allows, **P3** = mention in
the pitch / roadmap only, **ASK** = request from the TVB (Raphael Tonitz is on site).

## 1. Partner data (TTF Data Space, members only, never commit)

| Data | Use | Priority |
|---|---|---|
| Daily stays PY / forecast / actual per municipality | target, residuals | P1 |
| Daily available beds | utilisation, capacity flags | P1 |
| Weekly bookings by lead-time class 2023–2026 | early-warning intake index | P1 |
| Event calendar 2026–27 | event features, attribution | P1 |
| Contwise API (POIs, events) | extra events, event metadata | P2 |

## 2. Ask the TVB on site (biggest upgrade per minute spent)

These turn "demand is behind" into "demand **from market X** is behind", which
challenge question 2 needs.

| Ask | Why | What it unlocks |
|---|---|---|
| **Stays by guest nationality** (daily or monthly, Feratel registration data) | Each guest is registered with nationality | Per-market deviations; links holidays to markets directly |
| **On-the-books by stay date** (bookings already held for each future night, snapshot today and same day last year) | Classic pickup forecasting needs this; the weekly lead-time file is aggregated by booking week | Additive/multiplicative pickup nowcast, strongest short-term signal in the hotel RM literature |
| **Website / booking-engine sessions by country** (GA4, Deskline search requests) | Search requests are demand before booking | Leading indicator per market (Google Analytics data improved arrival forecasts in published studies) |
| Old vintages of the forecast column | Backtest the official forecast itself | Honest "official vs ours" error table |
| Lift ticket / skier days (Silvretta Seilbahn) | Day visitors vs overnight guests | Out of scope unless offered |

## 3. Open data: verified

| Source | Access (verified) | Content | Value | Priority |
|---|---|---|---|---|
| Nächtigungsprognose API | `naechtigungen.pol.joanneum.at/v1`, no key | monthly actuals 1999–2026-08, daily forecast 2023–2027-08, per region | baseline, monthly actuals, pooling | P1 (done: `data/fetch_open_data.py`) |
| Nächtigungsprognose repo data | github.com/kan-jr/Naechtigungsprognose `data/` | daily proxy index 2022–2025 for 107 regions, holiday matrix, event G/K/M flags, bed caps, model params | pooled daily calendar effects, synthetic-control donors | P1 |
| **GeoSphere SNOWGRID 1 km** | `dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km?parameters=snow_depth&lat_lon=46.985,10.315` | daily modelled snow depth, any point, **data to yesterday** | snow features (ski area vs village) | P1 |
| GeoSphere station data (Ischgl-Idalpe 17005, Galtür 17002) | metadata OK, `klima-v2-1d` returned **no values** for snow parameters | – | skip, SNOWGRID covers it | – |
| Open-Meteo forecast / ensemble / seasonal | `api.`, `ensemble-api.`, `seasonal-api.open-meteo.com` all 200; archive gave HTTP 429 once | snowfall and temperature forecasts up to ~46 days (seasonal longer) | "snow forecast → late-booking campaign" trigger | P2 |
| OpenHolidays API | `openholidaysapi.org`, no key | school + public holidays DE (per Land), NL, BE, CH, CZ, PL, SE, FR, … | market-holiday features | P1 |
| DK, GB school holidays | not in OpenHolidays | – | hand-made table from official ministry pages | P1 (≈1 h) |
| ECB exchange rates | `data-api.ecb.europa.eu` 200 | daily CHF, GBP, DKK, SEK, PLN, CZK, USD | price competitiveness per market; season-level only | P3 |
| Eurostat consumer confidence | `ec.europa.eu/eurostat/api/.../ei_bsco_m` 200 | monthly per country | season trend per market; too slow for daily | P3 |
| Wikipedia pageviews "Ischgl" | Wikimedia REST, no key | daily views per language | **tested: not leading** (see below) | P3 |
| Season dates & events (web) | tirol.at, paznaun-ischgl.com, snow-online | first ski day **26 Nov 2026**, Top of the Mountain opening concert (Westlife) **28 Nov 2026**; austria.info lists 4 Dec for full operation (conflict, verify) | season-opening feature, event attribution | P1 (manual) |
| Austria Tourism API | `api.austria.info` 200 | POIs, events | competing events in neighbour regions | P3 |

### Tested and rejected as a leading indicator: Wikipedia pageviews

`models/probe_wikipedia.py`: monthly log-correlation with TR53 stays
de/nl/en = 0.83 / 0.88 / 0.75 at lag 0, falling to 0.11 / 0.13 / 0.30 at
lag 2. German Oct–Mar views dropped from 37k (23/24) to 22k (25/26) while
stays rose. **Coincident, not leading, with a downward drift** (probably
fewer people visiting Wikipedia since AI search answers). Only useful as a
spike detector for news events.

## 4. Open data: not reachable here or needs registration

| Source | Status | Use | Priority |
|---|---|---|---|
| Statistik Austria STATcube: stays per municipality × country of origin × month | needs a (free) STATcube login; OGD endpoint did not answer here | **market mix of Ischgl, Galtür, Kappl, See** by month since 2000s, best public substitute for the nationality ASK | P1 if the TVB can't deliver nationality data |
| Land Tirol tourism reports | PDFs (winter reports with municipality × origin tables) | same, seasonal | P2 (manual extraction) |
| Google Trends "Ischgl" per country | `trends.google.com` API refused (400) from here; manual CSV download in a browser works | weekly search interest DE/NL/BE/DK/GB; literature: weekly search data in MIDAS models beats monthly-only | P2 (download by hand, 5 min) |
| Traffic counts B188 Paznaun (Land Tirol) | portal page 404 | arrival-day proxy (Saturday peaks) | P3 |
| Airport / flight data (INN, MUC, ZRH) | 403 / no open daily data | source-market access | P3 |
| Mobile phone data (Invenium, A1, Drei) | commercial | what the official model used | P3 |
| OTA prices / availability scraping | ToS risk | competitor pricing | do not use |

## 5. Licences to cite

Österreich Werbung / JOANNEUM RESEARCH / TU Wien / AAU (CC BY 4.0), TVB
Paznaun-Ischgl (TTF 2026 data licence), GeoSphere Austria (CC BY 4.0),
Open-Meteo (CC BY 4.0), OpenHolidays (ODbL), ECB and Eurostat (reuse with
attribution), Wikimedia pageviews (CC0).
