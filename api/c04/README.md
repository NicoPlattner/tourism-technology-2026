# Challenge 04 data API

Read-only service over the precomputed tables in `results/gui/` (see
`results/gui/README.md`). No raw data, no keys, no training at runtime.

| Route (under `BASE_PATH`, default `/c04-api`) | Returns |
|---|---|
| `/health` | `{"ok": true}` |
| `/meta` | destinations, origins (codes), months, grades, sources |
| `/query?destination=Tirol&origin=80&start=2027-01-15&end=2027-03-15` | guests, nights, range, length of stay, weekly nights, booking lead time, age profile, push and pull reasons; every field `{value, is_estimate, method, grade}` |
| `/tables`, `/tables/{name}.csv` | the raw result tables |

Run locally:

```bash
pip install -r api/c04/requirements.txt
```

```bash
cd api/c04 && uvicorn app:app --port 8080
```

Docker (from the repository root):

```bash
docker build -f api/c04/Dockerfile -t c04-api .
```

```bash
docker run -p 8080:8080 c04-api
```

Deployment: `.github/workflows/c04-api-image.yaml` builds and pushes
`ghcr.io/<owner>/c04-api` on every push to `main` that touches `api/c04/` or
`results/gui/`. The Helm chart runs it when `c04Api.enabled=true`
(`helm/tourism-technology/templates/c04-api.yaml`), under `<ingress.path>/c04-api`.
Run the "Deploy to Kubernetes" workflow with `c04_api` ticked to deploy it
next to the dashboard. The GHCR package must be public (or set
`c04Api.imagePullSecret`).
