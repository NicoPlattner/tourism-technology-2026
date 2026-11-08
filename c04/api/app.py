"""Challenge 04 data API (read-only): Paznaun-Ischgl / Austria demand by origin, with reasons and flags.

Serves the precomputed tables in results/gui/ (built by models/export_gui.py); no raw data, no keys, no
training at runtime. All routes live under BASE_PATH (default "/c04-api"), so the service works behind an
ingress prefix such as https://<host>/<branch>/c04-api.

GET {BASE}/                               landing page; {BASE}/docs and {BASE}/openapi.json
GET {BASE}/health                         {"ok": true, "version": snapshot}
GET {BASE}/meta                           destinations, origins, months, grades, sources
GET {BASE}/query?destination=Tirol&origin=80&start=2027-01-15&end=2027-03-15
                                          guests, nights, range, length of stay, weekly nights, lead time,
                                          age profile, push and pull reasons; every field {value, is_estimate,
                                          method, grade}
GET {BASE}/forecast?start=&end=           Paznaun winter 26/27: daily forecast, 80 % band, capacity, flags
GET {BASE}/deviations?season=             why actual differed from the TVB forecast (drivers, grades)
GET {BASE}/warnings?kind=                 windows with spare capacity, tight capacity, forecast disagreement
GET {BASE}/actions?kind=&market=&limit=   ranked marketing actions (launch date, addressable nights, grade)
GET {BASE}/tables                         list of tables
GET {BASE}/table?name=                    one table as CSV (e.g. monthly_origin.csv, c04/actions.csv);
                                          also {BASE}/tables/{name}
"""
from __future__ import annotations

import html
import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

BAKED_DATA = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else \
    Path(__file__).resolve().parent.parent / "results" / "gui"  # repo layout when run locally
BAKED_C04 = Path(os.environ["C04_DIR"]) if os.environ.get("C04_DIR") else BAKED_DATA.parent / "c04"
SNAPSHOTS = Path(os.environ["SNAPSHOT_DIR"]) if os.environ.get("SNAPSHOT_DIR") else None  # live refresh volume
BASE = "/" + os.environ.get("BASE_PATH", "/c04-api").strip("/")
CLASSES = ["0d", "8d", "31d", "61d", "90d", "180d"]
MID = np.array([3, 19, 45, 75, 135, 240])
GRADES = "ABCD"
GRADE_TEXT = {"A": "observed or model for a large origin (~10 % monthly error)",
              "B": "model for a smaller origin / validated method",
              "C": "estimate (proxy, split, 2-year average, carried forward)", "D": "rough fallback"}
SOURCES = ["Statistik Austria (CC BY 4.0)", "Landesstatistik Tirol", "Österreich Werbung / Nächtigungsprognose (CC BY 4.0)",
           "OpenHolidays (ODbL)", "TVB Paznaun-Ischgl (TTF 2026 data licence)", "Salzburger Sportwelt (TTF licence, aggregates)",
           "GeoSphere Austria SNOWGRID (CC BY 4.0)", "Open-Meteo (CC BY 4.0)"]


def source() -> tuple[Path, Path, str]:
    """(gui dir, c04 dir, version): the live snapshot SNAPSHOT_DIR/current when present, else the baked tables."""
    if SNAPSHOTS:
        try:
            cur = (SNAPSHOTS / "current").resolve(strict=True)
            if (cur / "gui").is_dir() and (cur / "c04").is_dir():
                return cur / "gui", cur / "c04", cur.name
        except OSError:
            pass
    return BAKED_DATA, BAKED_C04, "baked"


def today() -> pd.Timestamp:
    """Reference date for launch dates and bookability (TODAY overrides, e.g. in tests)."""
    t = os.environ.get("TODAY")
    return pd.Timestamp(t) if t else pd.Timestamp(datetime.now(ZoneInfo("Europe/Vienna")).date())


@lru_cache(maxsize=256)
def _csv(path: str, version: str) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"origin_code": str, "destination_code": str, "origin_country": str,
                                    "market_code": str}, keep_default_na=True)


@lru_cache(maxsize=64)
def _json(path: str, version: str) -> dict:
    return json.loads(Path(path).read_text())


def table(name: str) -> pd.DataFrame:
    d, _, v = source()
    p = d / f"{name}.csv"
    if not p.exists():
        raise HTTPException(404, f"table {name} not found")
    return _csv(str(p), v)


def c04(name: str) -> pd.DataFrame:
    _, c, v = source()
    p = c / f"{name}.csv"
    if not p.exists():
        raise HTTPException(404, f"table c04/{name} not found")
    return _csv(str(p), v)


def c04_json(name: str) -> dict:
    _, c, v = source()
    p = c / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, f"c04/{name} not found")
    return _json(str(p), v)


def still_bookable(days_ahead: int, month: int) -> float:
    """Share of a month's arrivals usually booked less than days_ahead days before arrival (TVB lead times)."""
    lt = table("lead_time_by_arrival_month").set_index("arrival_month")
    r = lt.loc[month, [f"share_{c}" for c in CLASSES]].astype(float).values
    lower = np.array([0, 8, 31, 61, 90, 180])
    upper = np.r_[lower[1:], 10_000]
    return float((r * np.clip((days_ahead - lower) / (upper - lower), 0, 1)).sum())


def live_actions(a: pd.DataFrame) -> pd.DataFrame:
    """Re-date the ranked actions to today: drop finished windows, move launch dates, rescale the score
    by the share of bookings still to come, re-rank."""
    t = today()
    a = a[pd.to_datetime(a["to"]) >= t].copy()
    if a.empty:
        return a
    start = pd.to_datetime(a["from"])
    win = a.kind == "win demand"
    med = pd.to_numeric(a.get("median_lead_days"), errors="coerce").fillna(0)
    ideal = start - pd.to_timedelta(med, unit="D")
    a["launch_overdue"] = win & (ideal < t)
    a["launch_by"] = np.where(win, np.maximum(ideal, t).dt.strftime("%Y-%m-%d"), t.strftime("%Y-%m-%d"))
    new = [still_bookable(max((s - t).days, 0), s.month) for s in start]
    old = pd.to_numeric(a.get("share_still_bookable"), errors="coerce")
    factor = np.where(win & (old > 0), np.array(new) / old.where(old > 0, 1), 1.0)
    a["share_still_bookable"] = np.where(win, np.round(new, 3), old)
    a["score"] = np.round(a.score * factor).astype(int)
    a = a.sort_values("score", ascending=False)
    a["rank"] = range(1, len(a) + 1)
    a["as_of"] = t.strftime("%Y-%m-%d")
    return a


def live_warnings(w: pd.DataFrame) -> pd.DataFrame:
    t = today()
    w = w.copy()
    f, e = pd.to_datetime(w["from"]), pd.to_datetime(w["to"])
    w["days_until_start"] = (f - t).dt.days
    w["status"] = np.where(e < t, "past", np.where(f <= t, "ongoing", "upcoming"))
    w["as_of"] = t.strftime("%Y-%m-%d")
    return w


def records(df: pd.DataFrame) -> list[dict]:
    """JSON-safe rows: NaN -> null, numpy scalars -> Python."""
    return json.loads(df.to_json(orient="records", force_ascii=False))


def worst(gs) -> str:
    gs = [g[0] for g in gs if isinstance(g, str) and g]
    return max(gs, key=GRADES.index) if gs else "C"


def field(value, est, method, grade, note=None):
    d = {"value": value, "is_estimate": bool(est), "method": method, "grade": grade}
    if note:
        d["note"] = note
    return d


def country_of(origin: str) -> str | None:
    o = table("origins")
    r = o[o.origin_code == origin]
    return None if r.empty or pd.isna(r.calendar_country.iloc[0]) else str(r.calendar_country.iloc[0])


def resolve_destination(dest: str) -> str:
    d = table("destinations")
    hit = d[(d.destination.str.lower() == dest.lower()) | (d.destination_code.str.lower() == dest.lower())]
    if hit.empty:
        raise HTTPException(404, f"unknown destination {dest}; see {BASE}/meta")
    return hit.destination.iloc[0]


def answer(destination: str, origin: str, start: str, end: str) -> dict:
    dest = resolve_destination(destination)
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    if e < s:
        raise HTTPException(400, "end before start")
    m = table("monthly_origin")
    rows = m[(m.destination == dest) & (m.origin_code == origin)].set_index("month")
    if rows.empty:
        raise HTTPException(404, f"no data for origin {origin} in {dest}; see {BASE}/meta")
    ds = table("daily_share")
    d = ds[(ds.origin_code == origin)].copy()
    d["date"] = pd.to_datetime(d.date)
    d = d[(d.date >= s) & (d.date <= e)]
    if d.empty:
        raise HTTPException(404, "time frame outside the data (2024-01-01 .. 2027-12-31)")
    d["month"] = d.date.dt.strftime("%Y-%m")
    for c in ("nights", "guests", "nights_p10", "nights_p90"):
        d[c] = d.share_of_month * d.month.map(rows[c].astype(float))
    used = rows.loc[sorted(set(d.month))]
    est, grade = bool(used.is_estimate.any()), worst(list(used.grade))
    methods = "; ".join(sorted(set(used.method)))
    n, g = float(d.nights.sum()), float(d.guests.sum())
    proxy_daily = dest not in ("Tirol", "Paznaun-Ischgl")
    daily_est = bool(d.is_estimate.any()) or proxy_daily
    weekly = d.set_index("date").nights.resample("W-SUN").sum()
    # lead time weighted by nights per arrival month
    lt = table("lead_time_by_arrival_month").set_index("arrival_month")
    wts = d.groupby(d.date.dt.month).nights.sum()
    sub = lt.reindex(wts.index)
    if sub[[f"share_{c}" for c in CLASSES]].isna().any().any():
        sub = sub.apply(lambda r: r if r.notna().all() else lt.iloc[(lt.index - r.name).to_series().abs().argmin()], axis=1)
    mix = sub[[f"share_{c}" for c in CLASSES]].mul(wts, axis=0).sum() / max(wts.sum(), 1e-9)
    mix.index = CLASSES
    med = int(MID[::-1][np.argmax(mix[CLASSES[::-1]].cumsum().values >= .5)])
    country = country_of(origin)
    group = {"DE": "DE", "NL": "NL", "BE": "BE_LU", "LU": "BE_LU", "DK": "NORDIC_UK", "SE": "NORDIC_UK",
             "GB": "NORDIC_UK"}.get(country, "OTHER")
    lm = table("lead_time_by_market_indicative").set_index("market_group")
    mk = lm.loc[group, CLASSES].astype(float) if group in lm.index else None
    kind = "winter" if s.month in (11, 12, 1, 2, 3, 4) else "summer"
    ag = table("age_profile")
    a = ag[(ag.origin_country == country) & (ag.season_kind == kind)]
    age_est = a.empty
    if age_est:
        a = ag[(ag.origin_country == "ALL") & (ag.season_kind == kind)]
    age_cols = [c for c in ag.columns if c.startswith("age_")]
    age_val = {k: round(float(v), 3) for k, v in a.iloc[0][age_cols].items()} if len(a) else None
    if age_val and not age_est:
        age_val["median_age_band"] = a.iloc[0].median_age_band
    # reasons
    pr = table("push_reasons")
    p = pr[pr.origin_code == origin].copy()
    p["date"] = pd.to_datetime(p.date)
    p = p[(p.date >= s) & (p.date <= e)]
    push = []
    if len(p):
        p["holiday_names"] = p.holiday_names.fillna("")
        hot = p[(p.school_holiday_share >= .3) | (p.long_weekend_share >= .3) | (p.public_holiday_share >= .3)]
        for names, grp in hot.groupby("holiday_names"):
            if not names:
                continue
            push.append({"from": str(grp.date.min().date()), "to": str(grp.date.max().date()), "holidays": names,
                         "days": int(len(grp)), "max_push_multiplier": float(grp.push_multiplier.max())})
        push = sorted(push, key=lambda x: -x["days"] * x["max_push_multiplier"])[:8]
    pl = table("pull_reasons")
    pull_dest = dest if dest in set(pl.destination) else "Tirol"
    q = pl[pl.destination == pull_dest].copy()
    q["date"] = pd.to_datetime(q.date)
    q = q[(q.date >= s) & (q.date <= e)]
    pull = {"destination_used": pull_dest,
            "events": [{"date": str(r.date.date()), "event": r.events} for r in q[q.events.fillna("") != ""].itertuples()][:20],
            "christmas_window_days": int(q.christmas_window.sum()), "easter_window_days": int(q.easter_window.sum()),
            "season_open_days": int(q.season_open.sum()), "days": int(len(q)),
            "snow_depth_cm_mean": None if q.snow_depth_cm.isna().all() else round(float(q.snow_depth_cm.mean())),
            "snow_is_typical_not_observed": bool(q.snow_depth_is_typical_not_observed.all()),
            "forecast_snowfall_cm_next_16_days": None if q.forecast_snowfall_cm.isna().all()
            else round(float(q.forecast_snowfall_cm.sum()), 1),
            "pull_multiplier_mean": None if q.pull_multiplier.isna().all() else round(float(q.pull_multiplier.mean()), 2)}
    return {
        "destination": dest, "origin": origin, "origin_name": rows.origin_name.iloc[0], "from": start, "to": end,
        "guests": field(round(g), est, methods, grade),
        "nights": field(round(n), est, methods, grade),
        "nights_range": field([round(float(d.nights_p10.sum())), round(float(d.nights_p90.sum()))], est,
                              "band of the monthly values (>= 80 % coverage for model rows)", grade),
        "length_of_stay": field(round(n / g, 2) if g else None, est, "nights / guests", grade),
        "weekly_nights": field({str(k.date()): round(float(v)) for k, v in weekly.items()}, daily_est,
                               "daily share (destination pattern x origin holidays) x monthly values",
                               "C" if daily_est else "B", "Tirol daily pattern used as proxy" if proxy_daily else None),
        "booking_lead_time": field({"share_by_days_ahead": {k: round(float(v), 3) for k, v in mix.items()},
                                    "median_days_ahead": med,
                                    "book_by_for_half_of_first_arrivals": str((s - pd.Timedelta(days=med)).date())},
                                   True, "TVB Paznaun booking lead time per arrival month (proxy)",
                                   "B" if dest in ("Tirol", "Paznaun-Ischgl") else "C"),
        "booking_lead_time_this_market": field(None if mk is None else {k: round(float(v), 3) for k, v in mk.items()},
                                               True, f"indicative profile, market group {group}", "C"),
        "age_profile": field(age_val, True, "guest cards of a comparable ski region (Salzburger Sportwelt)",
                             "D" if age_est else "C", "all-origin profile" if age_est else None),
        "reasons": {"push": field(push, False, "origin holidays (school, public, long weekends) in the time frame", "B"),
                    "pull": field(pull, pull_dest != dest, "destination events, season, holidays, snow, weather",
                                  "B" if pull_dest == dest else "C",
                                  None if pull_dest == dest else "Tirol reasons used for this destination")},
        "sources": SOURCES,
    }


TAG_A = "Austria & Tirol demand by origin"
TAG_B = "Paznaun-Ischgl outlook & actions"
TAG_T = "Tables"
DESCRIPTION = """Live, read-only data API. Every value carries `is_estimate`, `method` and `grade` (A observed /
well-tested ... D rough). Refreshed automatically: weather, snow and the official forecast several times a day;
holidays, Statistik Austria and TVB data when a new release appears (models are re-run only then).
`/meta` shows when each source was last updated.

Sources: Statistik Austria (CC BY 4.0), Österreich Werbung / Nächtigungsprognose (CC BY 4.0), OpenHolidays (ODbL),
GeoSphere Austria (CC BY 4.0), Open-Meteo (CC BY 4.0), Landesstatistik Tirol, TVB Paznaun-Ischgl with feratel and
Salzburger Sportwelt (TTF 2026 data licences: derived data, attribution, non-commercial)."""

LANDING = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Alpine demand API</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#1d2433;background:#fff}
h1{font-size:1.5em}code{background:#f1f3f7;padding:1px 4px;border-radius:3px}table{border-collapse:collapse;width:100%}
td{border-bottom:1px solid #e4e7ee;padding:4px 6px;vertical-align:top}a{color:#0b5cad}
@media (prefers-color-scheme:dark){body{background:#12161f;color:#e6e9f0}code{background:#232a38}td{border-color:#2c3446}a{color:#7db7ff}}</style>
</head><body>
<h1>Alpine demand by origin: live data API</h1>
<p>Who comes to Tirol and Paznaun-Ischgl, when, why, and what to do about it. Read-only, no key needed.
<a href="{BASE}/docs">Interactive docs</a> · <a href="{BASE}/openapi.json">OpenAPI</a> · <a href="{BASE}/meta">/meta</a></p>
<h2>1. Austria &amp; Tirol demand by origin</h2>
<p>Any Austrian state or Paznaun-Ischgl × origin market × time frame: guests, nights (with 80 % range), length of stay,
weekly distribution, booking lead time, age profile, and the reasons: holidays and long weekends at the origin;
season, events, snow and weather at the destination.<br>
<code>{BASE}/query?destination=Tirol&amp;origin=80&amp;start=2027-01-15&amp;end=2027-03-15</code></p>
<h2>2. Paznaun-Ischgl outlook &amp; actions</h2>
<p>Daily winter forecast with capacity, why actual stays differed from the TVB forecast, warning windows, and ranked
marketing actions (market, window, launch date, addressable nights, confidence).<br>
<code>{BASE}/actions?limit=10</code> · <code>{BASE}/forecast</code> · <code>{BASE}/deviations</code> ·
<code>{BASE}/warnings</code></p>
<h2>Freshness</h2><p>Snapshot <code>{SNAPSHOT}</code>, built {GENERATED}.</p><table>{ROWS}</table>
<h2>Licences and attribution</h2>
<p>Open part: Statistik Austria, Österreich Werbung / Nächtigungsprognose, GeoSphere Austria, Open-Meteo (CC BY 4.0),
OpenHolidays (ODbL 1.0). Paznaun outlook: derived from data of TVB Paznaun-Ischgl with feratel (TTF 2026 data licence:
attribution, non-commercial use). Age profiles: derived from guest cards of Salzburger Sportwelt (TTF licence).
Values are model estimates: check <code>grade</code> and <code>is_estimate</code>.</p>
</body></html>"""

router = APIRouter(prefix=BASE if BASE != "/" else "")


@router.get("/health", operation_id="getHealth", summary="Service status and served snapshot")
def health():
    d, c, v = source()
    return {"ok": True, "service": "c04-data-api", "version": v, "tables": len(list(d.glob("*.csv"))),
            "c04_tables": len(list(c.glob("*.csv")))}


@router.get("/meta", tags=[TAG_A], operation_id="getMeta", summary="Destinations, origin codes, months, grades, sources, data freshness")
def meta():
    m = table("monthly_origin")
    return {"destinations": table("destinations").to_dict("records"),
            "origins": table("origins").fillna("").to_dict("records"),
            "months": [m.month.min(), m.month.max()], "grades": GRADE_TEXT, "sources": SOURCES,
            "freshness": freshness()}


def freshness() -> dict:
    """When each source was last updated, from the snapshot's manifest (written by the pipeline)."""
    _, c, v = source()
    p = c / "manifest.json"
    man = _json(str(p), v) if p.exists() else {}
    man = {k: v2 for k, v2 in man.items() if k not in ("snapshot", "today", "refresh")}  # reserved for the API
    out = {**man, "snapshot": v, "today": today().strftime("%Y-%m-%d")}
    if SNAPSHOTS and (SNAPSHOTS / "status.json").exists():
        try:
            out["refresh"] = json.loads((SNAPSHOTS / "status.json").read_text())
        except (OSError, ValueError):
            pass
    return out


@router.get("/query", tags=[TAG_A], operation_id="queryDemand",
            summary="Guests, nights, stay, lead time, age and reasons for destination x origin x time frame")
def query(destination: str = Query("Tirol", description="Austrian state (e.g. Tirol, Salzburg) or Paznaun-Ischgl; "
                                                         "names and codes in /meta"),
          origin: str = Query("80", description="origin market code, e.g. 80 = Bavaria, 25 = Netherlands, "
                                                "DE = Germany; list in /meta"),
          start: str = Query("2027-01-15", description="first day, YYYY-MM-DD (2024-01-01 .. 2027-12-31)"),
          end: str = Query("2027-03-15", description="last day, YYYY-MM-DD")):
    return answer(destination, origin, start, end)


@router.get("/forecast", tags=[TAG_B], operation_id="getForecast", summary="Paznaun-Ischgl daily forecast with 80 % band, capacity and flags")
def forecast(start: str | None = Query(None, description="YYYY-MM-DD"),
             end: str | None = Query(None, description="YYYY-MM-DD")):
    d = c04("forecast_daily")
    if start:
        d = d[d.date >= start]
    if end:
        d = d[d.date <= end]
    return {"meta": c04_json("forecast_meta"), "monthly": records(c04("forecast_monthly")), "daily": records(d)}


@router.get("/deviations", tags=[TAG_B], operation_id="getDeviations", summary="Why actual stays differed from the TVB forecast (drivers, grades)")
def deviations(season: str | None = Query(None, description='"winter 25/26" or "summer 26"')):
    m, dr, sm = c04("deviations_monthly"), c04("deviations_drivers"), c04_json("deviations_summary")
    if season:
        if season not in set(m.season):
            raise HTTPException(404, f"unknown season {season}; use one of {sorted(set(m.season))}")
        m, dr = m[m.season == season], dr[dr.season == season]
        sm = {season: sm[season], "method": sm["method"]}
    return {"summary": sm, "monthly": records(m), "drivers": records(dr)}


@router.get("/warnings", tags=[TAG_B], operation_id="getWarnings", summary="Windows with spare or tight capacity, forecast disagreement")
def warnings(kind: str | None = Query(None, description="spare_capacity, tight, tvb_forecast_outside_our_80pct_band")):
    w = live_warnings(c04("warnings"))
    if kind:
        w = w[w.kind == kind]
    return records(w)


@router.get("/actions", tags=[TAG_B], operation_id="getActions", summary="Ranked marketing actions with launch dates and confidence")
def actions(kind: str | None = Query(None, description='"win demand" or "protect yield"'),
            market: str | None = Query(None, description="market name or code, e.g. Belgium or 62"),
            start: str | None = Query(None, description="windows ending on or after YYYY-MM-DD"),
            end: str | None = Query(None, description="windows starting on or before YYYY-MM-DD"),
            limit: int = Query(20, ge=1, le=500)):
    a = live_actions(c04("actions"))
    if kind:
        a = a[a.kind == kind]
    if market:
        a = a[(a.market.str.lower() == market.lower()) | (a.market_code == market)]
    if start:
        a = a[a.to >= start]
    if end:
        a = a[a["from"] <= end]
    return records(a.head(limit))


@router.get("/tables", tags=[TAG_T], operation_id="listTables", summary="Names of all tables (CSV)")
def tables():
    d, c, _ = source()
    return sorted(p.name for p in d.glob("*.csv")) + sorted(f"c04/{p.name}" for p in c.glob("*.csv"))


@router.get("/table", tags=[TAG_T], operation_id="getTable", summary="One table as CSV")
def get_table_q(name: str = Query("monthly_origin.csv", description="table name from /tables, e.g. "
                                                                    "monthly_origin.csv or c04/actions.csv")):
    return get_table(name)


@router.get("/tables/{name:path}", include_in_schema=False)
def get_table(name: str):
    d, c, _ = source()
    root, file = (c, name[4:]) if name.startswith("c04/") else (d, name)
    p = root / file
    if p.suffix != ".csv" or "/" in file or not p.exists():
        raise HTTPException(404, "unknown table")
    return FileResponse(p, media_type="text/csv", filename=p.name)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
def landing():
    f = freshness()
    rows = "".join(f"<tr><td>{html.escape(k)}</td><td>{html.escape(str(v))}</td></tr>"
                   for k, v in (f.get("sources") or {}).items())
    page = LANDING.replace("{BASE}", BASE).replace("{SNAPSHOT}", html.escape(str(f["snapshot"]))) \
        .replace("{GENERATED}", html.escape(str(f.get("generated_at", "–")))).replace("{ROWS}", rows or
                                                                                    "<tr><td colspan=2>–</td></tr>")
    return HTMLResponse(page)


TAG_INFO = [
    {"name": TAG_A, "description": "Guests, nights, length of stay, daily distribution, booking lead time, age "
     "profile and the reasons (holidays at the origin; season, events, snow, weather at the destination) for any "
     "Austrian state or Paznaun-Ischgl x origin market x time frame. Open sources; licence ODbL 1.0 (holiday data) "
     "/ CC BY 4.0."},
    {"name": TAG_B, "description": "Paznaun-Ischgl winter outlook: daily forecast with 80 % band and capacity, why "
     "actual stays differed from the TVB forecast, warning windows and ranked marketing actions with launch "
     "dates. Derived from TVB Paznaun-Ischgl data (TTF 2026 data licence: attribution, non-commercial)."},
    {"name": TAG_T, "description": "All tables as CSV."},
]
app = FastAPI(title="Alpine demand by origin: live data API (TTF 2026, challenge 04)", version="1.2",
              description=DESCRIPTION, openapi_tags=TAG_INFO, openapi_url=f"{BASE.rstrip('/')}/openapi.json",
              docs_url=f"{BASE.rstrip('/')}/docs", redoc_url=None,
              license_info={"name": "ODbL 1.0 / CC BY 4.0 (open part); TVB Paznaun-Ischgl TTF 2026 data licence "
                                    "(Paznaun outlook)", "url": "https://opendatacommons.org/licenses/odbl/1-0/"},
              contact={"name": "Team c04 data models, TTF 2026"})
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
app.include_router(router)
