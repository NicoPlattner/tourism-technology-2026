# TTF Space: product form texts (copy and paste)

Register in TTF Space: **Data products ▸ New data product ▸ API (data service)**,
access **External** (own server). Endpoint and docs stay stable: they are
deployed from `main` to the root domain.

Base URL: `https://hackathon.daria-and-nico.com/c04-api/`

## Product 1: Tirol & Austria Demand by Origin (live API)

| Field | Value |
|---|---|
| Title | Tirol & Austria Demand by Origin (live API) |
| Type | API / data service (external) |
| Endpoint | https://hackathon.daria-and-nico.com/c04-api/ |
| Documentation | https://hackathon.daria-and-nico.com/c04-api/docs (OpenAPI: …/c04-api/openapi.json) |
| Landing page | https://hackathon.daria-and-nico.com/c04-api/ |
| Access | Open (everyone) |
| Licence | ODbL 1.0 (contains holiday data from OpenHolidays; other inputs CC BY 4.0) |
| Topics / challenge | 04 Overnight data; also useful for 01 Off-season |
| Update frequency | several times a day (weather, snow); on each new monthly release (Statistik Austria) |
| Declared sources | OpenHolidays API (Austria Tourism); Overnight stays forecast API per Austrian tourism region (Austria Tourism) |

Description:

> Who comes to which Austrian state, and when? For any Austrian state (or
> Paznaun-Ischgl) × origin market (countries, German regions and states, Austrian
> states) × time frame, the API returns guests, nights with an 80 % range, length
> of stay, weekly distribution, booking lead time and age profile, plus the
> reasons: school holidays, public holidays and long weekends at the origin
> (free-day blocks, population-weighted), and season, events, snow and the
> weather forecast at the destination. Every value carries is_estimate, method
> and an evidence grade (A observed … D rough), so no cell is empty and every
> gap is labelled. Models: pooled LightGBM per origin and month (about 10 %
> monthly error for large markets), daily split by destination pattern × origin
> holidays (validated on mobile network data). Live: the server re-fetches its
> sources and re-runs the models when a source publishes new data; /meta shows
> the date of each source. Sources: Statistik Austria, Österreich Werbung /
> Nächtigungsprognose, GeoSphere Austria, Open-Meteo (CC BY 4.0), OpenHolidays
> (ODbL), Landesstatistik Tirol; age profiles derived from Salzburger Sportwelt
> guest cards.

Example: `/c04-api/query?destination=Tirol&origin=80&start=2027-01-15&end=2027-03-15`

## Product 2: Paznaun-Ischgl Demand Outlook & Actions (live API)

| Field | Value |
|---|---|
| Title | Paznaun-Ischgl Demand Outlook & Actions (live API) |
| Type | API / data service (external) |
| Endpoint | https://hackathon.daria-and-nico.com/c04-api/ |
| Documentation | https://hackathon.daria-and-nico.com/c04-api/docs (section "Paznaun-Ischgl outlook & actions") |
| Landing page | https://hackathon.daria-and-nico.com/c04-api/ |
| Access | Members of the data space |
| Licence | Attribution (TTF); derived from TVB Paznaun-Ischgl data: name TVB Paznaun-Ischgl with feratel, non-commercial use |
| Topics / challenge | 04 Overnight data |
| Update frequency | daily check; models re-run when TVB publishes a new edition; dates and launch windows move every day |
| Declared sources | Overnight stays Paznaun-Ischgl: previous year, forecast and actuals (TVB); Available beds Paznaun-Ischgl (TVB); OpenHolidays API; Overnight stays forecast API (Austria Tourism) |

Description:

> Where will Paznaun-Ischgl have empty or tight beds this winter, why did
> past stays differ from the forecast, and which market should be addressed
> first? Daily forecast with 80 % band (8.5 % daily error in a real-data
> backtest), capacity from stays and free beds, warning windows (spare, tight,
> forecast disagreement), the drivers of last season's deviations with evidence
> grades, and ranked marketing actions: market, travel window, reason (holiday-
> or share-driven), launch date from the booking lead times, nights to win and
> the share still bookable. Actions are re-dated every day. Only derived values
> and monthly sums are published, no TVB raw data. Attribution: TVB
> Paznaun-Ischgl with feratel (TTF 2026 data licence).

Examples: `/c04-api/actions?limit=10`, `/c04-api/forecast`, `/c04-api/deviations?season=winter%2025/26`, `/c04-api/warnings?kind=spare_capacity`

## Published (8 Nov 2026)

Published with `data/publish_dataspace.py` (draft, publish) on the API source "Tirol & Austria Demand by
Origin (live APIs)" (`700ffe3d-82e3-4606-8ab8-ec223ea7f650`), access: members (contract).

| Product | Catalogue ID | Licence | Operations |
|---|---|---|---|
| Tirol & Austria Demand by Origin (live API) | `686b6ee9-b02a-425f-bc82-b46edcd0718d` | `odbl-1.0` (team licence) | query-demand, get-meta, list-tables, get-table, get-health |
| Paznaun-Ischgl Demand Outlook & Actions (live API) | `b22c8ce1-bd62-431e-bcd0-03a0fa90a1dc` | `c04-tvb-derived-nc-v1` (team licence) | get-actions, get-forecast, get-deviations, get-warnings, get-table, get-health |

"Everyone" (open) is not offered for connected APIs in TTF Space, so both are for members. TVB and Salzburger
Sportwelt products are named as linked sources: restricted TTF products cannot be formal sources of a product
under another licence.
