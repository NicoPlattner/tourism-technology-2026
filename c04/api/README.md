# Challenge 04 data API

Read-only service over the precomputed tables in `c04/results/gui/` (GUI: origin x
destination x time frame) and `c04/results/c04/` (challenge answers for
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
| `/tables`, `/table?name=monthly_origin.csv`, `/table?name=c04/actions.csv` | the result tables as CSV (also `/tables/{name}`) |

Tests (from the repository root):

```bash
pip install -r c04/api/requirements-dev.txt && pytest -q c04/api/tests
```

Run locally:

```bash
pip install -r c04/api/requirements.txt
```

```bash
cd c04/api && uvicorn app:app --port 8080
```

Docker (from the repository root):

```bash
docker build -f c04/api/Dockerfile -t c04-api .
```

```bash
docker run -p 8080:8080 c04-api
```

Deployment: [c04-api-image.yaml](../../.github/workflows/c04-api-image.yaml) runs the tests, builds the image,
smoke-tests the container (read-only, prefixed path) and pushes `ghcr.io/<owner>/c04-api` on every push to
`main` that touches `c04/`. The Helm chart runs it under `<path>/c04-api` (`templates/c04-api.yaml`); with
the refresh pipeline it serves the newest validated snapshot from `/work/snapshots/current`, otherwise the
tables baked into the image. See [docs/deployment.md](../../docs/deployment.md).
