"""Challenge 04 data API (read-only): Paznaun-Ischgl / Austria demand by origin, with reasons and flags.

Serves the precomputed tables in results/gui/ (built by models/export_gui.py); no raw data, no keys, no
training at runtime. All routes live under BASE_PATH (default "/c04-api"), so the service works behind an
ingress prefix such as https://<host>/<branch>/c04-api.

GET {BASE}/health                         {"ok": true}
GET {BASE}/meta                           destinations, origins, months, grades, sources
GET {BASE}/query?destination=Tirol&origin=80&start=2027-01-15&end=2027-03-15
                                          guests, nights, range, length of stay, weekly nights, lead time,
                                          age profile, push and pull reasons; every field {value, is_estimate,
                                          method, grade}
GET {BASE}/tables                         list of tables
GET {BASE}/tables/{name}                  one table as CSV (e.g. monthly_origin.csv)
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

DATA = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else \
    Path(__file__).resolve().parent.parent.parent / "results" / "gui"  # repo layout when run locally
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


@lru_cache(maxsize=None)
def table(name: str) -> pd.DataFrame:
    p = DATA / f"{name}.csv"
    if not p.exists():
        raise HTTPException(404, f"table {name} not found")
    return pd.read_csv(p, dtype={"origin_code": str, "destination_code": str, "origin_country": str}, keep_default_na=True)


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


router = APIRouter(prefix=BASE if BASE != "/" else "")


@router.get("/health")
def health():
    return {"ok": True, "service": "c04-data-api", "tables": len(list(DATA.glob("*.csv")))}


@router.get("/meta")
def meta():
    m = table("monthly_origin")
    return {"destinations": table("destinations").to_dict("records"),
            "origins": table("origins").fillna("").to_dict("records"),
            "months": [m.month.min(), m.month.max()], "grades": GRADE_TEXT, "sources": SOURCES}


@router.get("/query")
def query(destination: str = Query("Tirol"), origin: str = Query(..., description="origin code, see /meta"),
          start: str = Query(..., description="YYYY-MM-DD"), end: str = Query(..., description="YYYY-MM-DD")):
    return answer(destination, origin, start, end)


@router.get("/tables")
def tables():
    return sorted(p.name for p in DATA.glob("*.csv"))


@router.get("/tables/{name}")
def get_table(name: str):
    p = DATA / name
    if p.suffix != ".csv" or not p.exists() or p.parent != DATA:
        raise HTTPException(404, "unknown table")
    return FileResponse(p, media_type="text/csv", filename=name)


app = FastAPI(title="Challenge 04 data API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
app.include_router(router)
