# tourism-technology-2026

## Demand Radar — Paznaun-Ischgl (TTF Hackathon 2026, challenge 04)

**“Overnight data without explanation”** — TVB Paznaun-Ischgl and Feratel provide
244 days of overnight stays (summer 2026 → winter 2026/27: actual, forecast,
previous year) and 88 days of bed capacity for the early winter. They are reported
side by side and rarely analysed together. The Demand Radar
(`dashboard/`, React + TypeScript + Vite) puts them together, explains the gaps
and turns them into next steps, in plain language and in the Paznaun-Ischgl look.

| View | Shows |
| --- | --- |
| Overview | 4 KPIs, season chart, top 3 next steps |
| Season | Actual, forecast, last year, beds (+ open model) per day; NL/BE school holidays, weather and events underneath |
| Deviations | Stretches >10% off the forecast with the most likely reason (weather, NL/BE holidays, events, data gaps) and confidence |
| Beds | Month calendar of expected bed occupancy, paged by month |
| Actions | Ranked next steps (what, when, where, why), CSV / print |
| Integrations | Google Analytics connection kept by the server (24/7, all devices), live website data, sources |

Partner markets: **Netherlands and Belgium** (holidays, explanations and actions focus on them).

**Data.** Forecast, weather, holidays and events are **real open data**: the open
overnight-stay forecast for region TR53 Paznaun-Ischgl (JOANNEUM RESEARCH /
TU Wien / Uni Klagenfurt / Austria Tourism), Open-Meteo for Ischgl, the
OpenHolidays API for the partner markets NL and BE. The partner data (stays,
beds) is a **sample in the shape of the challenge data**, calibrated to the
official monthly totals, until the TTF Data Space export is connected. `npm run data:open` refreshes the open-data snapshots;
`npm run data:sample` rebuilds the sample. The app also refreshes the forecast
and weather live when it loads.

**Google Analytics.** Two services per deployment: the static frontend (nginx)
and a small Node API (`dashboard/server/server.mjs`, no dependencies) that the
ingress routes `<path>/api` to. *Connect Google Analytics* opens Google's
sign-in popup (authorization code flow) for `openid email analytics.readonly`;
the API exchanges the code for a refresh token, stores it AES-GCM encrypted under
`/data` and refreshes access hourly, so the connection stays up 24/7 and is the
same on every device until someone disconnects it. **Storage:** `/data` is a PersistentVolumeClaim of the
`microk8s-retain-hostpath` class (the cluster has no default class), so the
connection survives restarts and redeploys. With
`api.persistence.enabled: false` it is an emptyDir instead and the dashboard
says the connection is temporary; it also warns if the store is not writable. Several
Google accounts and properties can be added; properties are always picked
explicitly. *Website data* shows the Realtime report (last 30 minutes —
Google's realtime limit), refreshed every minute.

Setup: OAuth web client with `https://hackathon.daria-and-nico.com` (and
`http://localhost:5173`) as authorised JavaScript origins — no redirect URIs
needed; Analytics Admin and Data APIs enabled; the consent screen **published
("In production")**, because in "Testing" Google expires refresh tokens after
7 days. Repository settings: Actions variable `GOOGLE_CLIENT_ID` and Actions
secret `GOOGLE_CLIENT_SECRET`; the deploy workflow turns them into a
Kubernetes secret for the API. Local dev: `npm run server` (with
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the environment) next to
`npm run dev`, which proxies `/api` (data in `dashboard/data/`).
`npm run test:server` tests the API against a fake Google.

**Analytics API (`/api/v1`).** Other tools can read the connected GA4
properties through `https://hackathon.daria-and-nico.com/<path>/api/v1/…` with
`Authorization: Bearer <ANALYTICS_API_TOKEN>`. It is switched on and off for
everyone under *Integrations → Google Analytics → Analytics API* (off by
default). `GET /api/v1` (public) lists the endpoints; use `default` or a
property id from `/api/v1/properties`:

| Endpoint | Data |
| --- | --- |
| `GET properties/{id}/realtime` | Last 30 min: active users (30 and 5 min), per-minute trend, country, city, device, platform, pages, events, audiences |
| `GET properties/{id}/history?days=7` | The realtime data, recorded by the server every 10 min while the API is on (kept 180 days): daily, hourly, by country, city, device, platform, page, event |
| `GET properties/{id}/insights?startDate=28daysAgo&endDate=today` | Standard reports: overview, daily trend, demographics (age, gender, age×gender, interests, language, new vs returning), geography (country, region, city), device/OS/browser, acquisition (channel, source/medium, campaign, first-user channel), landing pages, pages, events, weekday/hour/weekday×hour, `highlights` and `nextSteps` |
| `GET properties/{id}/metadata` | Every dimension and metric the property supports, incl. custom ones |
| `POST properties/{id}/report`, `POST properties/{id}/realtime` | Any GA4 query, e.g. `{"dimensions":["country","userAgeBracket"],"metrics":["activeUsers"],"startDate":"7daysAgo"}` |

Rows are flat objects (`{"country":"Netherlands","activeUsers":12,"share":0.4}`);
each section has a `status` (`ok`, `empty`, `error`) and a `note` saying why
data is missing. On a new property the standard reports fill in after 24–48 h,
so `realtime` and `history` carry the data until then. Demographics (age, gender,
interests) need **Google signals** on (GA Admin → Data collection; not
retroactive) and are withheld below GA's privacy thresholds (`thresholded: true`).
Responses are cached (realtime 30 s, insights 10 min; `?fresh=1` skips it), and
the API allows cross-origin requests, as it needs the token.

**Adding a source.** Sources are adapters in `dashboard/src/data/sources.ts`
that fill one day-by-day model (`Day`); analyses in `src/analysis/insights.ts`
read only that model. Mobile-network presence, guest nationality, prices and
lift counts are listed as next connectors.

```sh
cd dashboard && npm ci && npm run dev     # local development
npm run build                             # builds into helm/tourism-technology/site
```

## Deployment


The [deployment workflow](.github/workflows/deploy.yaml) deploys to the existing
`tourism-technology-2026` Kubernetes namespace through Pangolin. It uses the
GitHub → Authentik OIDC credential helper embedded in the supplied kubeconfig.
No permanent Kubernetes token is required.

The [Helm chart](helm/tourism-technology) runs two services: the built
dashboard on unprivileged nginx (files from a ConfigMap) and the Node API
(code from a ConfigMap; data on a PersistentVolumeClaim when
`api.persistence.enabled`, else an emptyDir); the workflow builds both first. Each branch gets an isolated Helm release and URL under
`https://hackathon.daria-and-nico.com/<branch-name>`.

## Repository setup

Set these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `KUBE_CONFIG` | Complete kubeconfig, including its embedded exec helper |
| `PANGOLIN_ID` | Pangolin machine client ID with access to the private Kubernetes API |
| `PANGOLIN_SECRET` | That machine client's secret |
| `PANGOLIN_ENDPOINT` | Pangolin dashboard URL |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret, used by the API service |
| `ANALYTICS_API_TOKEN` | Bearer token for the analytics API (`/api/v1`); without it the API answers 503 |

The workflow selects its `microk8s` context, and `id-token: write` lets the helper
request short-lived credentials. The namespace and its RBAC must already exist;
CI does not create them. Helm also needs permission to manage release secrets in
that namespace, and the API needs secrets (and PersistentVolumeClaims with
persistence on) there.

Optional Actions variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KUBECTL_VERSION` | `v1.31.14` | Matches the cluster version recorded in the reference repo; adjust if upgraded |

## Run the pipeline

After the workflow exists on the default branch, open **Actions → Deploy to
Kubernetes → Run workflow**, select the branch to deploy, and run it. Any branch
can be selected; deploying is manual so unfinished pushes are not published.
By default the branch is available at
`https://hackathon.daria-and-nico.com/<branch-name>`. Branch names containing
characters outside letters, digits, `.`, `_`, `-`, and `/` receive a generated,
hashed path instead; the run summary reports the exact URL. Branch deployments
have separate release and resource names and can coexist.

Select **Deploy to the domain root** only when the user explicitly requests a
root deployment. It updates a separate `tourism-root` release at
`https://hackathon.daria-and-nico.com/`; normal runs never update that release.

The job validates configuration, connects Pangolin with private DNS, installs
or upgrades the release, waits for rollout, verifies the Service, and checks the
public URL. It collects diagnostics on failure and attempts to disconnect and
delete its temporary kubeconfig. A failed HTTP check does not automatically
roll back an already applied deployment. Public verification requires DNS,
Pangolin, and its authentication policy to allow access from GitHub Actions.

The `pangolin-ci` concurrency group serializes this repository's connections.
GitHub does not share concurrency locks across repositories: use a separate
Pangolin machine client here if another repository may deploy simultaneously.
Existing releases and legacy resources are not automatically removed.

## Public access through Pangolin

Configure a Pangolin public HTTP/HTTPS resource on the existing site:

- Domain: `hackathon.daria-and-nico.com`.
- Target: `http://<ingress-controller-LAN-IP>:80`, using the reachable controller
  address and port from your existing deployment.
- Custom Host Header: `hackathon.daria-and-nico.com`; forward all paths unchanged.
- HTTPS: terminate TLS at Pangolin. Choose the desired Pangolin authentication policy.
- DNS: point the public hostname to your Pangolin server.

Requests then follow Pangolin → ingress controller → Service → application.
The workflow checks both the Service and the public route after deployment.

## Troubleshooting

With an authenticated cluster connection, inspect the release named in the run:

```sh
kubectl -n tourism-technology-2026 get deployments,pods,services,ingresses
helm -n tourism-technology-2026 list
helm -n tourism-technology-2026 history <release>
helm -n tourism-technology-2026 rollback <release> <revision>
```

Rollback requires an earlier Helm revision. Private DNS failures usually
require checking the machine client's access to `k8s.daria-and-nico.private`.
Authentication failures require checking the supplied kubeconfig and Authentik
trust for this repository. An ingress 404 requires checking the hostname and class;
a Pangolin 502 requires checking its target address and port.

Protocol references:
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc) and
[Pangolin machine clients](https://docs.pangolin.net/manage/clients/machine-clients).

## Development workflow

- Work on a feature branch, not directly on `main`. Use a short, URL-safe branch name (lowercase letters,
  digits, hyphens): it is also the deployment path.
- When a change is ready, deploy its branch to `https://hackathon.daria-and-nico.com/<branch-name>`. Branch
  deployments are isolated and never overwrite other branches or the root.
- Deploy to the domain root `https://hackathon.daria-and-nico.com/` only on explicit request. Finishing or
  merging a feature does not by itself mean a root deployment.
- Check the deployed URL and share the branch, URL and result. If the deployment or the public check is
  blocked, say so instead of announcing the deployment.
