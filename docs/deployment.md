# Deployment

Everything runs in the Kubernetes namespace `tourism-technology-2026` (microk8s), reached through Pangolin, and
is deployed by the manually started GitHub Actions workflow
[Deploy to Kubernetes](../.github/workflows/deploy.yaml) with the [Helm chart](../helm/tourism-technology).

## What runs

| Component | Image / code | Route |
|---|---|---|
| Web app | `nginxinc/nginx-unprivileged`, built app from a ConfigMap | `<path>/` |
| App API (Google Analytics, analytics API) | `node`, `dashboard/server/server.mjs` from a ConfigMap; data on a PVC | `<path>/api` |
| Caption service (AI social posts) | `node` sidecar in the web pod, bundled `dashboard/server/index.ts`; nginx proxies to it | `<path>/api/marketing/generate-caption` |
| Data API | `ghcr.io/<owner>/c04-api` ([c04/api](../c04/api)) | `<path>/c04-api` |
| Refresh pipeline (root release only) | `ghcr.io/<owner>/c04-pipeline` ([c04/pipeline](../c04/pipeline)); volume `c04-data`; two CronJobs, suspended | – |

The two images are built by [c04-api-image.yaml](../.github/workflows/c04-api-image.yaml) on every push to
`main` that touches `c04/`: API tests, image build, a read-only container smoke test, then push to GHCR.

## How to deploy

1. Merge to `main`.
2. **Actions ▸ Deploy to Kubernetes ▸ Run workflow** on `main` with **Deploy to the domain root** on.
   Production is `https://hackathon.daria-and-nico.com/` (release `tourism-root`).
3. Inputs:
   - `c04_api` (default on): deploy the data API.
   - `c04_refresh`: `none` (default), `fast` (snow and weather, no training, about 10 s) or `full` (all
     sources, re-trains the models whose inputs changed). Root deploy only.

Branch deployments (`https://hackathon.daria-and-nico.com/<branch>`, own release and resources) are
possible for previews, but not the default: each one runs its own pods on the shared server. Names outside
letters, digits, `.`, `_`, `-` and `/` get a generated path, shown in the run summary.

The job validates the configuration, connects Pangolin with private DNS, installs or upgrades the release,
waits for the rollout, checks the services and the public URL, and collects diagnostics on failure. A failed
HTTP check does not roll back an applied release. The `pangolin-ci` concurrency group serialises
connections.

## Working on the repository

- Work on a feature branch; small, finished changes such as repository rules may go directly to `main`.
  Everything that should go live ends up on `main`. Merge the latest `main` before pushing, so a deploy never
  drops another team's work.
- Use short, URL-safe branch names (lowercase letters, digits, hyphens): a branch name becomes its path.
- Deploy a branch only where it helps (a larger feature tested in the cluster, a requested preview), not for
  every change.
- After a deploy, check the public URL and share the branch or commit, URL and result. If the deploy or the
  check is blocked, say so instead of announcing it.
- Raw partner data never goes into git; `c04/results`, `c04/evaluation` and `c04/pipeline/seed` hold derived
  aggregates only. Keys live in GitHub secrets and Kubernetes secrets, never in the repository.

## Shared server rules: no heavy jobs by default

- Nothing heavy runs on deploy. Model training, data refreshes and other batch jobs run only on request
  (`c04_refresh` on a root deploy) or when a schedule is explicitly switched on in the Helm values
  (`c04Pipeline.schedule.fast` / `.full`, both `false`).
- The refresh pipeline exists only in the root release; branch releases never get it.
- Every job has resource limits (refresh: 1 CPU, 3 GiB) and `backoffLimit: 0` unless retries are really
  needed. New jobs default to off, also in branch releases.

## Repository settings

Secrets (**Settings ▸ Secrets and variables ▸ Actions**):

| Secret | Purpose |
|---|---|
| `KUBE_CONFIG` | kubeconfig with its embedded exec helper (GitHub → Authentik OIDC; no permanent token) |
| `PANGOLIN_ID`, `PANGOLIN_SECRET`, `PANGOLIN_ENDPOINT` | Pangolin machine client with access to the private Kubernetes API |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client (app API) |
| `ANALYTICS_API_TOKEN` | bearer token of the analytics API (`/api/v1`); without it the API answers 503 |
| `OPENAI_API_KEY` or `CAPTION_API_KEY` | caption service provider key |
| `TTF_SPACE_API_KEY` | TTF Data Space key for the refresh pipeline (partner data); stored as a Kubernetes secret of the root release only |

Variables: `GOOGLE_CLIENT_ID` (public OAuth client), optional `KUBECTL_VERSION` (default `v1.31.14`) and the
`CAPTION_*` settings. The workflow selects the `microk8s` context; `id-token: write` lets the helper request
short-lived credentials. The namespace and its RBAC must exist; Helm needs to manage release secrets, the app
API needs secrets and PersistentVolumeClaims.

## Public access through Pangolin

A Pangolin public HTTP/HTTPS resource on the existing site:

- domain `hackathon.daria-and-nico.com`, target `http://<ingress-controller-LAN-IP>:80`
- custom host header `hackathon.daria-and-nico.com`, all paths forwarded unchanged
- TLS terminated at Pangolin, authentication policy as needed; DNS points to the Pangolin server

Requests then go Pangolin → ingress controller → service → pod.

## Troubleshooting

```sh
kubectl -n tourism-technology-2026 get deployments,pods,services,ingresses,jobs,cronjobs
helm -n tourism-technology-2026 list
helm -n tourism-technology-2026 history <release>
helm -n tourism-technology-2026 rollback <release> <revision>
```

- Private DNS failures: check the machine client's access to `k8s.daria-and-nico.private`.
- Authentication failures: check the kubeconfig and the Authentik trust for this repository.
- Ingress 404: hostname and class. Pangolin 502: target address and port.
- Data refresh: `/c04-api/meta` → `freshness.refresh` shows the current and last run, including errors.

References: [GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc),
[Pangolin machine clients](https://docs.pangolin.net/manage/clients/machine-clients).
