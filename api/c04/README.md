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

Image: `.github/workflows/c04-api-image.yaml` builds and pushes
`ghcr.io/nicoplattner/c04-api:latest` (and `:<sha>`) on every push to `main`
that touches `api/c04/` or `results/gui/`.

Run it: container port 8080; set `BASE_PATH` to the URL prefix it is served
under (default `/c04-api`, e.g. `/<branch>/c04-api` behind the ingress; the app
serves the full prefix itself, no rewrite needed). Health check:
`GET $BASE_PATH/health`. Runs as user 1000, works with a read-only root
filesystem (mount an emptyDir at `/tmp`), ~300 MB memory.
