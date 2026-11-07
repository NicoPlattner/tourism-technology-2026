# Challenge 04 handover: Overnight Data Without Explanation

Single entry point for work on Challenge 04 (TVB Paznaun-Ischgl) on this
branch. **Rewritten 8 Nov 2026** from the primary sources; every fact below
was checked on that day:

- Organisers' agent feed https://buildbar.at/ttf-2026/claude.md (human
  version https://buildbar.at/ttf-2026), "final challenge texts as presented
  on 7 November 2026; data and tech details as of 6 November"
- Public TTF catalogue https://portal.ttf.nexyo.io/ (product pages,
  published JSON schemas, help page)
- Nächtigungsprognose page https://b2b.austria.info/de-at/wissen/statistiken-und-dashboards/naechtigungsprognose/,
  its API (`/v1/regions/`) and region list PDF

If something here conflicts with Discord or the partners on site, they win.

## 1. Branch and role

- Branch `c04-data-models` is reserved for one owner and their agent
  sessions: data acquisition, data engineering, model research, model
  training and prediction testing. Others work on their own branches (e.g.
  `paznaun-demand-radar` for the dashboard). Results go to `main` or new
  dedicated branches later via pull request.
- Follow `AGENTS.md` for deployments (path `/<branch-name>`, never the root
  unless explicitly asked).

## 2. Event facts

- Hackathon start Sat 7 Nov 13:00. **Submission Sun 8 Nov 13:00.** Pitches
  Sun 14:00, **2 minutes per team**. Awards 16:00.
- Technical jury visits teams **Sun 09:00–12:00**: checks that the work was
  built during the hackathon and lets teams show what the pitch cannot.
  Extra prizes exist for teams whose work does not fully come across in the
  pitch.
- Scoring: jury rates presentation, creativity and impact (65 %); challenge
  partners rank the teams (35 %).
- Prizes across all challenges: 3,000 / 2,000 / 1,000 EUR; extra: Community
  Award, **Best Data Product** (nexyo and Austria Tourism), UnternehmerTUM
  Special Award, six wine boxes.
- News: Discord https://discord.gg/bmAAvQdsd. Pitch training 1:1 Sun
  10:00–11:30: https://hub.ttf.buildbar.at/pitch

## 3. The challenge (verbatim, organisers' feed)

- Focus: Destination Planning & Demand Management
- Partner and contact: **TVB Paznaun-Ischgl (Raphael Tonitz)**,
  representatives on site both days

> Destinations track overnight stays, forecasts and available beds, but
> deviations often remain unexplained. How can teams identify meaningful
> patterns, understand differences between forecasts and actual demand, and
> recognise changes early enough to make better decisions?

> Paznaun-Ischgl has the numbers: daily overnight stays for the previous
> year, a forecast for the coming months, the actual figures and the
> available bed capacity. For this challenge the TVB and Feratel provide 244
> days of overnight data, from summer 2026 through the 2026/27 winter season,
> and 88 days of bed capacity for the early winter.
>
> These datasets are reported side by side and rarely analysed together. A
> deviation between forecast and actual stays is visible, but the reason
> stays unclear: weather, holidays in a source market, an event, a
> systematic error in the forecast, or a gap in the data. Whether demand
> approaches capacity on certain weekends usually becomes clear afterwards.
> By then the team can no longer steer demand or adjust its planning.

1. Where does demand fall behind the forecast or previous year, where is
   capacity tight or unused, and why?
2. Which concrete marketing actions follow (what, when, where, for which
   market), and which comes first, ranked by effect, lead time, feasibility
   and confidence?
3. How can each recommendation show what it is based on and how reliable it
   is, given gaps, zero values and limited data history?

"Data mentioned: The partners bring overnight stay data." "Data and tech in
detail: Overnight stay forecast." The published files cover more than the
text's 244 / 88 days (see §4a): trust the files.

## 4. Data

### 4a. TVB Paznaun-Ischgl products in the TTF Data Space (challenge "04 Overnight data")

Publisher TVB Paznaun-Ischgl (with feratel), licence "TVB Paznaun-Ischgl TTF
2026 data licence": use, derive and share allowed, **attribute TVB
Paznaun-Ischgl**. Access "Members": join TTF with challenge 04, then Request
access (see 4d). Catalogue: https://portal.ttf.nexyo.io/participants?id=did%3Aweb%3Aidentity.ds.nexyo.io%3Atvb-paznaun-ischgl-205b

| Product | Period | Columns (published schema) | Link |
|---|---|---|---|
| Overnight stays, November 2025 – April 2027 (complete), CSV 13 KB | 2025-11-04 – 2027-04-04, daily | `date, actual, forecast, previous_year`. One total for Ischgl, Galtür, Kappl, See (no municipality columns). `actual` empty for days not yet reached; `forecast` 0 on some days; `previous_year` = same day of the previous year | [264dc170…](https://portal.ttf.nexyo.io/products?id=264dc170-6f1d-4105-8a02-e5169617c822) |
| Overnight stays: previous year, forecast and actuals (series, monthly editions) | 2025-11 – ongoing | same | [ffdabf2d…](https://portal.ttf.nexyo.io/products?id=ffdabf2d-62b9-4aeb-bac6-e3fdf88a08a6) |
| Available beds, February 2025 – November 2026 (complete), CSV 10 KB | 2025-02-06 – 2026-11-07, daily | `date, available_beds` | [736f1187…](https://portal.ttf.nexyo.io/products?id=736f1187-a922-450a-b9ba-4f7e2bf8eb3e) |
| Available beds (series, monthly editions) | 2025-02 – ongoing | same | [92087a99…](https://portal.ttf.nexyo.io/products?id=92087a99-1bdd-4f79-85e8-63bd04dbed31) |
| Booking lead time 2023–2026, CSV 4.3 KB | weeks 2023-10-30 – 2026-10-26 | `week_start` (Monday), `bookings_{0,8,31,61,90,180}_days_ahead`; empty = no bookings | [892e2449…](https://portal.ttf.nexyo.io/products?id=892e2449-89da-4df3-b5dc-469a0061ec5a) |
| Event calendar 2026–2027, CSV 5 KB | 2026-01 – 2027-12, one row per event day | `date, event, weekday`; concerts, sports and freeride events, markets, season openings and closings, public holidays | [146a8548…](https://portal.ttf.nexyo.io/products?id=146a8548-31df-4c25-88f5-0a4a59a3b7a3) |
| Contwise tourism content API (external API) | live | POIs, events, tours of the Paznaun valley; docs general-solutions.eu/php/api_dokumentation,22992.html | [c1c2740f…](https://portal.ttf.nexyo.io/products?id=c1c2740f-89f9-47d1-87af-9ac2098543cb) |

Not stated anywhere: where the `forecast` column comes from, and whether a
lead-time row counts bookings made in that week or arrivals in that week.
Ask the TVB (§7).

### 4b. Austria Tourism data named for all challenges

| Product | Access | Content |
|---|---|---|
| Overnight stay forecast (Nächtigungsprognose), API naechtigungen.pol.joanneum.at, code and data github.com/kan-jr/Naechtigungsprognose ([catalogue](https://portal.ttf.nexyo.io/products?id=04faddee-316e-465d-ac65-e89be4e36e95)) | open, no key, CC BY 4.0, credit Nächtigungsprognose project / Österreich Werbung | monthly stays per region since 1999-11 (actuals, then forecast up to 12 months ahead), daily forecast since 2023, regions, events, coefficients, raw data |
| Monthly overnight stays per region since 1999 ([839f5964…](https://portal.ttf.nexyo.io/products?id=839f5964-4d60-431e-a737-f070ffc06be2)) | open download | Statistik Austria monthly stays, bed capacity per region, holidays, events, model parameters |
| Daily overnight index per region 2022–2025 ([bf1b3920…](https://portal.ttf.nexyo.io/products?id=bf1b3920-4b2b-42a0-b8bb-b7bb876d07ad)) | open download | pseudonymised daily index from feratel and mobile network data (Drei, A1/Invenium), daily events G/K/M, calendar matrix, monthly scaling |
| Austrian Tourism Data / TOURDATA ([8cb7a62d…](https://portal.ttf.nexyo.io/products?id=8cb7a62d-3b99-4b61-86c6-4fc55328dc27)), also api.austria.info (CC BY 4.0) | members (API) / open exports | POIs, gastronomy, accommodation, events, tours |

Facts about the forecast (b2b page and API): hotels and holiday flats, all
categories, since Nov 1999; monthly random forest, then daily disaggregation
with mobile network data; no weather or current sentiment; "experimental
statistics"; updated monthly; horizon up to 12 months. Contact Holger
Sicking (Austria Tourism). **Paznaun-Ischgl = region `TR53`** (`/v1/regions/`),
consisting of **Galtür, Ischgl, Kappl, Pians, See** (region list PDF
https://a.storyblok.com/f/303949/x/917f72e45f/nachtigungsprognose_gliederung-tourismusregionen_2026.pdf).
Neighbours: TR52 Ötztal, TR55 Pitztal, TR71 Serfaus-Fiss-Ladis, TR74 St. Anton
am Arlberg.

### 4c. Other open sources named by the organisers

GeoSphere Austria Data Hub (weather, CC BY 4.0, max 240 requests/h),
Open-Meteo (CC BY 4.0), OpenHolidays API (ODbL), OpenStreetMap (ODbL),
data.gv.at, destination.one open data, Mobilitätsverbünde timetables,
mobilitydata.gv.at. Our verified use of them: [DATA-SOURCES.md](DATA-SOURCES.md).

### 4d. Getting partner access

Per the portal help: "Join TTF" (team, contact, email, challenge 04) →
approval → email "Your workspace invitation" (link valid 24 h) → set the
password → in TTF Space your challenge credential unlocks the challenge's
data → Dataspace ▸ Catalogue → Request access → download under Data products
▸ Contracted. For agents: Settings ▸ API keys and Settings ▸ MCP. **A team
member sets this up; keys never go into the repo or the chat.**

Teams can publish their own data products there (Data products ▸ New data
product), and declaring the products used counts as re-use. This is the route
to the Best Data Product award.

## 5. Organisers' optional buildbar_ setup

The organisers offer team repos (GitHub org buildbar-ttf), a shared n8n per
challenge, AI model credits and publishing to `<slug>.ttf.buildbar.at`. It
is "an offer, not a requirement". This repo uses its own setup (Kubernetes
deployment, see `AGENTS.md`). **Open:** confirm with the team how the project
is submitted at 13:00.

## 6. Repository rules for this work

- Raw partner files only in `data/raw/partner/` (git-ignored). Derived
  outputs in `data/processed/` and `out/` are git-ignored too.
- Never commit keys. Name sources and licences in every output (Österreich
  Werbung CC BY 4.0, TVB Paznaun-Ischgl attribution, GeoSphere CC BY 4.0,
  OpenHolidays ODbL).
- Research and results: [RESEARCH.md](RESEARCH.md),
  [DATA-SOURCES.md](DATA-SOURCES.md), [PLAN.md](PLAN.md),
  [RESULTS.md](RESULTS.md).

## 7. Open questions for the TVB (Raphael Tonitz)

1. Where does the `forecast` column come from (the Austria Tourism TR53
   forecast? which vintage?), and why is it 0 on some days?
2. Lead-time file: is `week_start` the booking week or the arrival week?
   Class boundaries (0–7, 8–30, …)?
3. Do actuals include all accommodation categories (TR53 counts hotels and
   holiday flats only)?
4. Is guest nationality available (even monthly top markets)? It is needed for
   "which market" in question 2.

## Changes against the first version of this file

The first version (written before the team chose Challenge 04) named the
branch `challenge-04` (now `c04-data-models`). It listed the Contwise API as
members-only (it is an external API) and missed two catalogue products (the
forecast API entry and Austrian Tourism Data). It did not give the published
file schemas. It also implied municipality-level overnight data, but the
file has one daily total.
