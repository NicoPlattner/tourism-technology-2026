# Challenge 04: research plan (models, data, blind spots)

Sun 8 Nov 2026. Builds on what the real TVB data showed (RESULTS.md) and what
is already tested (MODELS.md, DATA.md). Every item below is a **hypothesis
with a test**, an effort estimate and a priority:

- **H** = before submission (13:00), cheap and decisive
- **M** = after the hackathon, first month of a real project
- **L** = later or only if a partner provides data

## 0. What we know that shapes the plan

```
winter totals stable (sd 2.8 %/season)  → level: little to gain from fancy models; combine & correct bias
daily pattern = calendar + holidays     → most value in the daily pattern and in explaining it
TVB forecast: precise shape, biased level (too high 11 of 12 months)
February sold out (23 days ≥ 95 %)      → observed stays are CAPPED on peak days (censored demand)
summer = last-minute market (64 %)      → long-horizon summer forecasts weak by nature
macro data: no signal on season totals  → look for signals with timing (daily/weekly), not macro levels
```

## 1. Models and approaches to test

### 1.1 Level: how many stays per month or season (1–12 months ahead)

| # | Approach | Hypothesis | Test | Effort | Prio |
|---|---|---|---|---|---|
| L1 | 2-season average + Easter regression (have) | robust baseline | done: 3.7 % monthly winter 25/26 | – | – |
| L2 | ETS / SARIMA / Theta on log TR53 monthly | Theta (M3 winner) and ETS add diversity to a combination | rolling origin 2005–2026 excl. COVID, horizons 1–12, MASE | 1 h | H |
| L3 | Temporal hierarchies (THieF / MAPA): forecast month, quarter, season, then reconcile | aggregate levels are smoother; reconciliation improves monthly error (Athanasopoulos et al. 2017) | same backtest | 2 h | M |
| L4 | **Global model across all 100 regions** (LightGBM on monthly region panel: lags, month, Easter, region features such as altitude and winter share) | global models beat one-series models on short or noisy series (Montero-Manso & Hyndman 2021; M5) | leave-years-out on TR53 and its neighbours | 2 h | H |
| L5 | Bayesian hierarchical model across regions (partial pooling of Easter, snow and trend effects; PyMC) | gives honest credible intervals and per-region snow sensitivity by altitude | posterior predictive checks, coverage | 1 day | M |
| L6 | Foundation models: Chronos-2 (have), TimesFM 2.5, Moirai, TabPFN-TS with known covariates | zero-shot strong at short horizons | same rolling backtest | 1 h each | M |
| L7 | TVB forecast × bias correction (empirical Bayes shrinkage per month type) | its level bias is stable (Nov, Mar, summer) | one year only: test on 26/27 as it arrives; until then grade C | 30 min | H |
| L8 | **Forecast combination**: equal weights → inverse-MSE → constrained stacking | combination beats the best single member | compare on the same origins | 1 h | H |
| L9 | Scenario layer: snow quantiles (+0.45 pp per 10 cm), macro stress | turns uncertainty into stories the TVB can act on | sanity check vs worst/best seasons | 1 h | H |

### 1.2 Daily pattern: which days (inside the month)

| # | Approach | Hypothesis | Test | Effort | Prio |
|---|---|---|---|---|---|
| D1 | Holiday-aligned previous year, LightGBM, TVB pattern, official pattern (have) | members of a stack | done | – | – |
| D2 | **Stacking with non-negative weights** (fit 24/25, test 25/26) | beats the 10.5 % ensemble | wMAPE, peak-day error | 1 h | H |
| D3 | **GAM** (smooth day-of-season, holiday intensity per market, weekday × season interactions; pyGAM) | as accurate as LightGBM on small data, but each effect is a readable curve for the pitch | same backtest + partial-effect plots | 2 h | H |
| D4 | Global daily LightGBM across 100 regions (open index 2022–2025) + Paznaun fine-tuning | 100× more rows → better holiday and event effects | same backtest | 2 h | M |
| D5 | Distributional models: LightGBM quantile, NGBoost, conformal per horizon (have) | calibrated bands per day type | coverage, pinball loss | 1 h | M |
| D6 | **Censored-demand ("unconstraining") model**: treat days ≥ 95 % occupancy as censored (Tobit / expectation-maximisation, standard in revenue management) | true February demand is higher than observed stays; ignoring it biases forecasts and hides price potential | share of censored days, estimated unconstrained demand on peak days | 2 h | H |
| D7 | Dynamic harmonic regression (Fourier + ARIMA errors) | benchmark for smooth seasonal patterns | backtest | 1 h | L |

### 1.3 Short term and early warning (0–8 weeks)

| # | Approach | Hypothesis | Test | Effort | Prio |
|---|---|---|---|---|---|
| S1 | TVB forecast with weekday and month-type correction | measured weekend over-forecast is stable | backtest on 25/26 days 0–14 | 30 min | H |
| S2 | **"Powder alarm"**: weekly last-minute bookings vs new snow in the previous 7 days (lead-time file + SNOWGRID) | fresh snow triggers short-notice bookings → action: snow-triggered campaigns | correlation and lag, winters 23/24–25/26 | 30 min | H |
| S3 | Pickup models (additive / multiplicative) | strongest short-term signal in hotel revenue management | needs on-the-books snapshots by stay date: start archiving daily free-bed snapshots now | setup 1 h, value after weeks | M |
| S4 | Search-interest nowcast (MIDAS: weekly search volume → monthly stays) | intent leads bookings by weeks | DataForSEO / Google Trends per country, 2021–2026 | 2 h | M |
| S5 | Change-point and drift alarms on log(actual / forecast): CUSUM (have), Bayesian online change-point detection | early, automatic alarm when a period runs off-forecast | simulate on 25/26: days until alarm vs month end | 1 h | M |

### 1.4 Explanation and causality

| # | Approach | Hypothesis | Test | Effort | Prio |
|---|---|---|---|---|---|
| E1 | Ridge + SHAP + bootstrap grades, Theil, tracking signal (have) | – | done | – | – |
| E2 | **Waterfall "previous year → actual"**: calendar shift → market holidays → events → snow → capacity cap → residual | the TVB compares with the previous year every day; 25 % of that gap is calendar | applied to winter 25/26 | 1 h | H |
| E3 | **Why the TVB forecast and ours differ** (decompose the difference by month and driver) | makes the watch list (Nov, Mar) explainable | applied to 26/27 | 1 h | H |
| E4 | Synthetic control for events (donors: other regions' daily index 2022–2025) | e.g. "the opening concert adds X ± Y stays" | placebo tests on non-event weekends | 3 h | M |
| E5 | **Interrupted time series / difference-in-differences across regions** for shocks: Ischgl's COVID outbreak (March 2020), Arlberg road tunnel closures (24 Apr–6 Oct 2023, 15 Apr–22 Nov 2024), Arlberg rail closure (6 Oct–2 Nov 2025) | shocks have measurable, region-specific effects that a single-series model mistakes for trend | TR53 vs neighbours (TR52, TR55, TR71, TR74) on 26 years of open monthly data | 2 h | H/M |
| E6 | GAM partial effects as explanation (with D3) | readable curves beat tables in a 2-minute pitch | – | with D3 | H |

### 1.5 From forecast to action

| # | Approach | Hypothesis | Test | Effort | Prio |
|---|---|---|---|---|---|
| A1 | Ranking: gap × market holiday overlap × lead time (booking mix) × feasibility × grade, with Monte Carlo over the forecast band | ranking stays stable under forecast uncertainty | rank stability across 1,000 draws | 2 h | H |
| A2 | Decision metrics for tight-day flags: precision and recall of predicted ≥ 95 % days, warning lead time | the TVB cares about correct flags, not about MAPE | backtest 25/26 | 1 h | H |
| A3 | Campaign effect priors (literature; TVB past campaign calendar if available) | without past campaign data, effects are assumptions: say so | – | – | L |

### 1.6 Evaluation rules (for all tests)

- Strictly ex ante: only information available at the forecast origin (snow
  depth during the season is ex post; school-holiday calendars are ex ante).
- Rolling origins, metrics per horizon: MASE, wMAPE, bias, pinball / CRPS,
  interval coverage, plus the decision metrics in A2.
- Model comparison with Diebold-Mariano or block-bootstrap tests; with one
  or two test seasons, report "no significant difference" honestly.
- Every claim in the UI carries a grade (A/B/C) from these tests.

## 2. Additional data sources: what, where, access

| Area | Source | Where / access | Cost | Value for the challenge | Prio |
|---|---|---|---|---|---|
| **Guest nationality** | TVB registration data (feratel Meldewesen) | ask the TVB (on site) | free | "which market" in question 2 becomes measurable | H |
| | Statistik Austria STATcube: stays per municipality × country of origin × month | statcube.at (account; access terms to check) | free / paid | public substitute, monthly since the 2000s | M |
| | Land Tirol tourism reports (municipality × origin tables) | tirol.gv.at statistics, PDF | free | seasonal market mix | M |
| | T-MONA guest survey (Tirol Werbung + Austria Tourism) | Tirol Werbung market research; other states publish PDFs | free / on request | booking behaviour, spending, travel mode per market | L |
| **Intent** | Search volume per keyword and country ("Ischgl", "Skiurlaub Tirol") | DataForSEO via the organisers' shared n8n credential "TTF DataForSEO"; Google Trends by hand | shared credits | leading indicator per market (S4) | H/M |
| | TVB website analytics, booking-engine searches (feratel Deskline) | ask the TVB | free | demand before booking, per country | M |
| | Flight searches and bookings (ForwardKeys, Kiwi.com), card spending (Mastercard Tourism Insights) | commercial; Mastercard is a hackathon partner (challenge 03) | paid | market intent and spending | L |
| **Supply and prices** | Free beds (have); bed stock per municipality and category | Statistik Austria (annual) | free | capacity changes, early-season ramp | M |
| | OTA prices and availability forecasts | LuxActive (in the Data Space for Salzburg regions; same product could cover Paznaun) | paid | price vs demand, competitor availability | M |
| | Hotel openings and closings, renovation, staff housing | TVB, Wirtschaftskammer | ask | explains capacity steps | M |
| | Tourism job vacancies, district Landeck | AMS open data | free | labour shortage → capacity limit | L |
| | Ski pass prices (Silvretta Arena) and competitor prices | public tariff pages per season | free | price competitiveness | L |
| **Access and mobility** | Arlberg road tunnel and rail closures (dates verified) | ASFINAG / ÖBB / press | free | shock dummies (E5) | H |
| | Road traffic counts (S16 Arlberg, B188 Paznaun) | Land Tirol traffic data service (~170 counters), ASFINAG data portal (registration) | free on request | arrival-day proxy, near-real-time actuals | M |
| | Airport passengers Innsbruck, Munich, Zurich (monthly) | airport statistics pages | free | flight access per market | L |
| | Avalanche bulletins and road closures | avalanche.report (CAAMLv6 XML per day, archive from 2011) | free | closures on peak days, safety image | M |
| | Public transport timetables | GTFS in the Data Space | free | car-free arrival | L |
| **Weather and climate** | SNOWGRID (have), weather forecasts (Open-Meteo, have) | GeoSphere, Open-Meteo | free | – | – |
| | **Snow and weather in the source markets and lowlands** (Munich, Amsterdam, Brussels, Austrian lowland ski areas) | SNOWGRID points, Open-Meteo archive, DWD | free | relative snow advantage (blind spot 9) | H |
| | Summer heat in source-market cities | Open-Meteo archive, DWD | free | summer demand driver | M |
| | Lift operating days, open slopes, snowmaking | Silvretta Seilbahn AG | ask | season length and quality | L |
| **Events and competition** | TVB calendar (have), Contwise API (have access) | Data Space | free | – | – |
| | Competitor resorts' openings, concerts, World Cup dates | austria.info winter openings, resort sites | free | competing weekends | M |
| **Media and reputation** | News volume and tone about Ischgl per country | GDELT 2.0 (open) | free | reputation shocks (COVID 2020), event buzz | M |
| | Review counts and ratings | Apify (organisers' shared n8n credential "TTF Apify"); platform terms apply | shared credits | quality perception | L |
| **Policy and calendars** | School calendar reforms (e.g. French-speaking Belgium since 2022: two-week Carnival break; staggered Polish winter breaks; Swedish sport holidays weeks 7–10) | ministries; OpenHolidays (most), hand tables | free | holiday effects per market | H |
| | Regulations (COVID rules 2020–22, après-ski rules, short-term rental rules in Tirol) | Land Tirol, press | free | regime flags | M |
| **Data from other challenges** | Hutchison Drei mobile visitors by home country, Salzburger Sportwelt 2026 | Data Space (members) | free | how market mix varies by week in a comparable ski region | M |
| | Guest cards and usage, Salzburger Sportwelt 2019–2026 | Data Space (members) | free | analogue for stay length and activity | L |
| | LuxActive prices and availability, five Salzburg regions | Data Space (external API) | free for the hackathon | price-demand relation in comparable regions | M |

## 3. Blind spots: drivers nobody has asked about yet

Each is a hypothesis with a test, roughly ordered by expected impact.

| # | Blind spot | Why it matters | How to test or get it |
|---|---|---|---|
| 1 | **Censored demand on full days** | In February stays cannot exceed beds. "Actual" understates demand, models learn the cap, and marketing would push days that are already full | D6; flag ≥ 95 % days as "sold out, demand unknown" |
| 2 | **Arrivals vs nights: length of stay** | Shorter stays mean more arrivals for the same nights; changeover days and weekend peaks shift | ask the TVB for arrivals; Statistik Austria publishes arrivals per municipality |
| 3 | **Registration lag** | Late guest registrations make the most recent actuals too low, so a fresh deviation can be an artefact | ask the TVB; compare edition snapshots over time |
| 4 | **Relative snow** | Ischgl is snow-sure: low snow elsewhere may help it (literature: high-altitude areas depend negatively on average Austrian snow) | SNOWGRID at lowland ski areas vs Ischgl growth, 26 seasons (H) |
| 5 | **Supply changes** | New hotels, closures, renovations, staff housing and hotels opening late in the season change capacity, not demand | free-bed trend, bed stock statistics, TVB knowledge |
| 6 | **Tour operator and group allotments** | UK/NL operators and ski clubs hold contingents and release them 4–8 weeks before arrival → sudden drops | ask the TVB; look for steps in free beds |
| 7 | **The destination's own marketing** | Campaigns change demand; without the campaign calendar, action effects cannot be measured | ask the TVB for 2–3 years of campaigns (dates, markets, spend) |
| 8 | **Access shocks** | Arlberg road tunnel closed in summer 2023 and 2024, rail in autumn 2025; Paznaun's main access from the west | E5 difference-in-differences (H/M) |
| 9 | **Reputation** | The March 2020 COVID outbreak made Ischgl internationally known in a negative way; après-ski rules changed since | E5 with GDELT media tone |
| 10 | **Market-mix shifts** | Stable totals can hide markets moving in opposite directions (e.g. Poland and Czechia up, Netherlands down) | nationality data; until then, holiday-intensity effects per market group |
| 11 | **School calendar reforms** | Belgium's reform moved and lengthened the Carnival break; Polish breaks rotate by region each year | check each market's calendar for 2023–2027 changes |
| 12 | **Day visitors and Samnaun** | Swiss duty-free Samnaun shares the ski area; day guests use lifts but not beds | lift data vs overnight stays (Silvretta Seilbahn) |
| 13 | **Cancellation behaviour** | Flexible cancellation since COVID makes bookings on hand less reliable | ask the TVB / feratel for cancellation rates by lead time |
| 14 | **Labour shortage** | Hotels close rooms or restaurant days when staff are missing | AMS vacancies, TVB knowledge |
| 15 | **Measurement scope** | TVB counts vs Statistik Austria (Pians, categories), second homes, private rooms | level ratio 1.02–1.08 already measured; ask the TVB for categories |
| 16 | **Event displacement** | Big events may shift guests between weekends rather than add guests | E4 synthetic control with placebo weekends |
| 17 | **Feedback loop of the forecast** | The TVB acts on its own forecast (staff, campaigns); a forecast that triggers action looks wrong afterwards | ask how the forecast is used; keep a forecast archive from now on |

## 4. Order of work

```
until 13:00   L2, L4, L7, L8, L9 · D2, D3, D6 · S1, S2 · E2, E3, E5 (Arlberg, COVID quick version)
              A1, A2 · blind spots 1, 4, 8, 11 (cheap, data in hand)
first month   L3, L5, L6 · D4, D5 · S3 (start snapshot archive now), S4, S5 · E4 · nationality,
              search volume, traffic counts, prices · blind spots 2, 3, 5, 6, 7, 9, 10, 13
later         L-priority items, commercial data (flights, card spending), campaign effect models
```

Asks for the TVB, in one list: guest nationality · arrivals (length of stay) ·
how and when the forecast is made · registration lag · allotment release
dates · campaign calendar · hotel openings and closings · lift data
(through Silvretta Seilbahn).

## 5. References

- Athanasopoulos, Hyndman, Kourentzes, Petropoulos (2017), Forecasting with
  temporal hierarchies, EJOR.
- Montero-Manso & Hyndman (2021), Principles and algorithms for forecasting
  groups of time series: locality and globality, IJF.
- Makridakis et al. (2022), M5 accuracy competition, IJF.
- Weatherford & Kimes (2003); Guo et al. (2012): demand unconstraining in
  revenue management.
- Abadie (2021), Using synthetic controls, JEL.
- Töglhofer, Eigner, Prettenthaler (2011), Climate Research 46.
- Arlberg closures: [vol.at](https://www.vol.at/arlbergtunnel-ab-21-april-wegen-sanierung-gesperrt/4297337),
  [salzburg24.at](https://www.salzburg24.at/news/oesterreich/durch-den-arlberg-fliesst-der-verkehr-wieder-art-282188),
  [Lech Zürs rail closure note](https://www.lechzuers.com/media/48895/download/Arlberg%20Tunnelsperre%20Bahn%20Oktober.pdf).
- Avalanche bulletins: https://avalanche.report (CAAMLv6).
- Mastercard Tourism Insights: https://www.mastercard.com/at/de/business/insights-intelligence/economic-market-insights/solutions/tourism-insights.html
- T-MONA: https://www.kaernten.at/b2b/mafo/t-mona
- Land Tirol traffic data service: https://www.tirol.gv.at/verkehr/mobilitaetsplanung/datenservice
