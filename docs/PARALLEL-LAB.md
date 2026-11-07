# PARALLEL — Explore the Futures of Your Destination

An interactive, client-side tourism digital twin concept for Salzburger Sportwelt. Built with React, TypeScript, Vite, Tailwind CSS, Motion, Recharts and Lucide.

## Start locally

Requires Node.js 20.19+ (or 22+).

```bash
cd /workspace/tourism-technology-2026
npm install
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173).

```bash
npm run build  # TypeScript check and production bundle in dist/
npm test       # deterministic simulation regression checks
```

## Presentation walkthrough

1. Select Wagrain–Kleinarl and click **Explore Possible Futures**.
2. Explore the monthly timeline, weather selector, map markers and Layers menu.
3. Use **Autumn Revival** and click **Simulate This Future**. A 3.4-second sequence reveals the centerpiece: cyan Universe A versus amber Universe B, with animated weekly visitor totals, occupancy bars and spending. Pause on the large difference band to explain additional visitors, incremental spending and net local economic benefit. The outcome matrix and visible cost calculation support the story.
4. Review the evening transport warning. Click **Adjust evening transport** to add the shuttle. In its configuration choose **23:00** for last departure, then simulate again. The warning resolves and demand/accessibility increase.
5. Click **Build the business case**. Edit the scenario title and use **Export Business Case** → Save as PDF in the browser print dialog.
6. Return to the editor to try **Rainy Week Rescue** or **Sustainable Growth**, configure scale/duration, toggle interventions, add alternatives, or remove them.

## Model and source

- `src/data/mock.ts`: four pilot destinations, seasonality, intervention assumptions, presets, illustrative points of interest.
- `src/simulation/engine.ts`: deterministic visitor demand, accommodation capacity limits, transport dependency, weather modifiers and investment economics.
- `src/simulation/engine.test.ts`: reproducibility, transport timing, accommodation constraints, rain, seasonality, activation and economic reconciliation checks.
- `src/components/Comparison.tsx`: presentation centerpiece with paired universe maps, relative activity visualization, animated visitor totals, prominent outcome deltas, full comparison matrix, investment economics and actionable dependency warnings.
- `src/components/Terrain.tsx`: self-contained interactive SVG terrain with animated flow lines, point details, zoom and layer filters.
- `src/App.tsx`: five-stage user journey, intervention controls, comparisons and printable report.
- `src/style.css`: dark visual system, responsive layout and print styles.

Net local economic benefit = 64% of incremental visitor spending minus intervention cost. Average spend = €142 per visitor. Overnight share = 80%. Baseline open beds = 24% of destination guest beds. Intervention lifts scale by intensity and duration. Visitor growth is bounded by available bed-nights. The displayed ±12% range is an illustrative assumption, not a statistical confidence interval.

## Limitations

All population, capacity, activity, location and projection data are mock assumptions. This is not a validated forecasting tool. Terrain is original schematic SVG artwork, not a geographic basemap, and the shared illustrative point layout represents the Wagrain–Kleinarl pilot; other destinations change the population/capacity/demand model. Comparison maps are static companion views rather than synchronized GIS maps. Month controls represent illustrative weeks, not exact calendar dates. Configuration is held in memory and resets on reload. No backend, authentication, live APIs, analytics collection or external AI calls. Target market uses a small predefined demand adjustment, not audience-level modelling.

Build and model regression checks pass. Automated browser and visual QA were not available through the supported browser tooling in this environment. No hosted deployment was created because the Sites source workflow helper is absent. The local source and production build are included.

## PARALLEL LAB — three concepts

The persistent navigation opens three local routes. `/` redirects to `/parallel`; Vite supports direct links to each module. For production static hosting, configure an SPA fallback to `index.html` for `/parallel`, `/integrity` and `/chaos`.

### Parallel Universes — `/parallel`

The original simulator and its comparison centerpiece are preserved. Its state stays mounted when switching to another concept. The global module strip adds a full reset button.

### Data Integrity Lab — `/integrity`

Start with a healthy 98/100 score, four sources and 12,480 illustrative records. Open the daily dataset or hover over the expected/observed chart. Choose **Inject Data Anomaly** and execute one of four scenarios: sudden corruption, gradual poisoning, replay or capacity contradiction. The two-second sequence highlights affected points and source status.

Choose **Investigate** to inspect the immutable original/anomalous snapshot, triggered rules, confidence assumption and detection time. **Inspect Records** expands the full 14-day snapshot. Quarantine isolates suspicious records from the trusted working set; restore activates the original demo dataset; dismiss acknowledges the alert without repairing the underlying data. The business impact screen compares predefined unvalidated and validated decisions and their illustrative commitment costs. Reset clears the incident and restores the healthy state.

### Chaos Engine — `/chaos`

Explore the four service nodes and the Berger family itinerary. Contwise is represented as a read-only information source, separate from the three transactional providers. Open **Start Chaos Experiment**, then inject timeout, stale availability, lost confirmation, duplicate request or provider outage. The 2.4-second sequence reveals the unprotected/protected guest journeys and synthetic event timeline.

Unknown confirmation outcomes remain pending or uncertain. Unaffected bookings remain confirmed. Only the duplicate-request scenario has a confirmed original result and a suppressed second request. Open the resilience report to review affected systems, detection time, recovery, duplicate prevention, guest impact and recommended improvements. Export uses browser print-to-PDF. Run another experiment or reset the environment to replay.

### Additional source and checks

- `src/Lab.tsx`: global navigation and History API routes.
- `src/modules/Integrity.tsx`: monitoring, injection, investigation and decision-impact flow.
- `src/modules/Chaos.tsx`: network, fault control room, guest comparison and report.
- `src/modules/LabUI.tsx`: shared module components.
- `src/data/lab.ts`: centralized deterministic anomaly records, impact assumptions, providers and fault fixtures.
- `src/data/lab.test.tsx`: fixture consistency, trusted evidence preservation, restoration, capacity rules, provider roles, unknown booking outcomes and server-render smoke checks.
- `src/lab.css`: shared lab shell and distinct forensic/resilience visual styles.

Both new modules are local demonstrations. No real validation, scanning, provider requests, payments, bookings or attacks occur. New module state resets on leaving its tab; Parallel state is retained. Detection timestamps use Europe/Vienna; experiment timings and confidence/resilience scores are predefined illustrative assumptions. Browser visual QA and hosted publication remain unavailable through the supported environment tools. Production build, existing model tests and new fixture/render checks pass.
