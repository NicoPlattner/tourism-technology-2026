# Challenge 04 data API

Read-only service over the precomputed tables in `results/gui/` (GUI: origin x
destination x time frame) and `results/c04/` (challenge answers for
Paznaun-Ischgl). See the README in each folder. No raw data, no keys, no
training at runtime.

| Route (under `BASE_PATH`, default `/c04-api`) | Returns |
|---|---|
| `/` | landing page (what, examples, freshness, licences) |
| `/docs`, `/openapi.json` | interactive docs and OpenAPI document |
| `/health` | `{"ok": true, "version": snapshot}` |
| `/meta` | destinations, origins (codes), months, grades, sources, `freshness` (date of each source, snapshot) |
| `/query?destination=Tirol&origin=80&start=2027-01-15&end=2027-03-15` | guests, nights, range, length of stay, weekly nights, booking lead time, age profile, push and pull reasons; every field `{value, is_estimate, method, grade}` |
| `/forecast?start=&end=` | Paznaun winter 26/27 per day: our forecast, 80 % band, official forecast, capacity, utilisation, flags; monthly comparison with the TVB forecast |
| `/deviations?season=winter 25/26` | why actual differed from the TVB forecast: drivers (push / pull) with stays and grade, monthly error, tracking signal, Theil |
| `/warnings?kind=spare_capacity` | windows with spare or tight capacity, or forecast disagreement |
| `/actions?kind=win demand&market=62&start=&end=&limit=20` | ranked marketing actions: market, window, `launch_by`, addressable nights, share still bookable, grade, basis, note |
| `/tables`, `/tables/{name}.csv`, `/tables/c04/{name}.csv` | the raw result tables |

Tests (from the repository root):

```bash
pip install -r api/c04/requirements-dev.txt && pytest -q api/c04/tests
```

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

Deployment: `.github/workflows/c04-api-image.yaml` runs the tests, builds
the image, smoke-tests the container (read-only, prefixed path) and pushes
`ghcr.io/<owner>/c04-api` on every push to `main` that touches `api/c04/`,
`results/gui/` or `results/c04/`. Each deploy restarts the pod, which pulls the current image. The Helm chart runs it when `c04Api.enabled=true`
(`helm/tourism-technology/templates/c04-api.yaml`, on by default), under `<ingress.path>/c04-api`.
The "Deploy to Kubernetes" workflow deploys it next to the dashboard (input
`c04_api`, default on). The GHCR package is public; for a private one set
`c04Api.imagePullSecret`.
