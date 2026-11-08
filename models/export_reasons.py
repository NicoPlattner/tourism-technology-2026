"""Reasons behind the numbers (push and pull) for the front end.

push_reasons.csv   origin x day: why people from that origin travel then
    school_holiday_share, public_holiday_share, long_weekend_share, bridge_day_share (population-weighted, 0..1),
    holiday_names (school and public holidays active in any part of the origin), push_multiplier
    (= 1 + gamma_origin x school share: relative presence vs a normal day of that origin, from the push-pull fit)
pull_reasons.csv   destination x day: why the destination attracts guests then
    season_open, christmas_window, easter_window, weekday, events (names), snow_depth_cm (observed until
    yesterday, afterwards the median of the same date 2000-2025 = typical, flagged), new_snow_3d_cm,
    forecast_snowfall_cm and forecast_temp_max_c (next 16 days), pull_multiplier (push-pull fit, Paznaun)
driver_effects.csv one row per driver: effect size, basis, grade

Snow points: Paznaun = Idalpe ski area (2,300 m); Tirol = mean of six ski areas (SNOWGRID 1 km, GeoSphere
Austria, CC BY 4.0). Weather forecast: Open-Meteo (CC BY 4.0). Events: TVB Paznaun-Ischgl event calendar
2026-2027 (TTF licence, attribution) + recurring concerts by rule.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request

import holidays as pyholidays
import numpy as np
import pandas as pd

from common import ROOT, load
from gui_api import AT_STATES, DE_REGIONS, origin_calendar
from m3_daily import GAMMA

sys.path.insert(0, str(ROOT / "data"))
from build_origin_panel import AT_HOL, DE_POP, HH, public_daily, school_daily  # noqa: E402
from holiday_corrections import fix  # noqa: E402

RAW = ROOT / "data" / "raw" / "open" / "snow"
DATES = pd.date_range("2024-01-01", "2027-12-31")
TIROL_POINTS = {"Soelden": (46.94, 10.97), "Hintertux": (47.08, 11.68), "Kitzbuehel": (47.43, 12.37),
                "St_Anton": (47.13, 10.23), "Seefeld": (47.33, 11.19), "Ischgl_Idalpe": (46.985, 10.315)}


def snow_series() -> pd.DataFrame:
    p = RAW / "snowgrid_tirol_points.csv"
    if not p.exists():
        q = "&".join(f"lat_lon={a},{b}" for a, b in TIROL_POINTS.values())
        url = ("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km"
               f"?parameters=snow_depth&{q}&start=2000-01-01&end={(pd.Timestamp.today() - pd.Timedelta(days=1)).date()}"
               "&output_format=csv")
        p.write_bytes(urllib.request.urlopen(url, timeout=600).read())
    d = pd.read_csv(p)
    d["date"] = pd.to_datetime(d.time).dt.tz_localize(None).dt.normalize()
    d["cm"] = d["snow_depth [m]"] * 100
    d["point"] = d.groupby(["lat", "lon"]).ngroup()
    wide = d.pivot_table(index="date", columns="point", values="cm")
    paz_pt = d.loc[(d.lat - 46.985).abs().add((d.lon - 10.315).abs()).idxmin(), "point"]
    return pd.DataFrame({"Paznaun-Ischgl": wide[paz_pt], "Tirol": wide.mean(axis=1)})


def holiday_names(origin: str) -> pd.Series:
    """Names of school and public holidays active on each day in any part of the origin."""
    country, subs = origin_calendar(origin)
    names = pd.Series([set() for _ in DATES], index=DATES)
    if not country:
        return names.map(lambda s: "")
    p = HH / f"{country}_School.json"
    codes = None
    if country == "DE":
        codes = {f"DE-{s}" for s in subs}
    elif country == "AT":
        codes = {f"AT-{s}" for s in subs}
    if p.exists():
        for h in fix(country, json.loads(p.read_text())):
            hc = {s["code"] for s in (h.get("subdivisions") or [])} | {g["code"] for g in (h.get("groups") or [])}
            if codes and hc and not any(c == k or c.startswith(k + "-") or k.startswith(c + "-") for c in hc for k in codes):
                continue
            nm = next((n["text"] for n in h["name"] if n["language"] == "EN"), h["name"][0]["text"])
            for d in pd.date_range(max(pd.Timestamp(h["startDate"]), DATES[0]), min(pd.Timestamp(h["endDate"]), DATES[-1])):
                names[d].add(f"school: {nm}")
    st = pd.read_csv(ROOT / "data" / "static" / "school_holidays_extra.csv", comment="#")
    for r in st[st.country == country].itertuples():
        for d in pd.date_range(max(pd.Timestamp(r.start), DATES[0]), min(pd.Timestamp(r.end), DATES[-1])):
            names[d].add(f"school: {r.name}")
    years = range(2024, 2028)
    if country == "DE":
        regs = [(s, s) for s in (subs or DE_POP)]
    elif country == "AT":
        regs = [(s, AT_HOL[s]) for s in subs]
    else:
        regs = [(None, None)]
    for _, sub in regs:
        try:
            hol = pyholidays.country_holidays(country, subdiv=sub, years=years, language="en_US")
        except Exception:  # noqa: BLE001
            try:
                hol = pyholidays.country_holidays(country, subdiv=sub, years=years)
            except Exception:  # noqa: BLE001
                continue
        for d, nm in hol.items():
            ts = pd.Timestamp(d)
            if ts in names.index:
                names[ts].add(f"public: {nm}")
    return names.map(lambda s: "; ".join(sorted(s))[:300])


def push_reasons(origins: pd.DataFrame) -> pd.DataFrame:
    out = []
    for o, name in origins.itertuples(index=False):
        country, subs = origin_calendar(o)
        if country:
            sch = school_daily(country, subs, DATES)
            pub = public_daily(country, subs, DATES)
        else:
            sch = pd.Series(np.nan, index=DATES)
            pub = pd.DataFrame(np.nan, index=DATES, columns=["pub", "longwe", "bridge"])
        g = GAMMA.get(country, 1.0)
        out.append(pd.DataFrame({
            "origin_code": o, "origin_name": name, "date": DATES.strftime("%Y-%m-%d"),
            "school_holiday_share": sch.round(3).values, "public_holiday_share": pub["pub"].round(3).values,
            "long_weekend_share": pub["longwe"].round(3).values, "bridge_day_share": pub["bridge"].round(3).values,
            "holiday_names": holiday_names(o).values,
            "push_multiplier": (1 + g * sch.fillna(0)).round(2).values,
            "is_estimate": sch.isna().values,
            "grade": np.where(sch.notna(), "B", "C")}))
    return pd.concat(out)


def pull_reasons() -> pd.DataFrame:
    f = load()
    snow = snow_series()
    last = snow.index.max()
    clim = snow[(snow.index >= "2000-01-01") & (snow.index < "2026-01-01")]
    clim = clim.groupby([clim.index.month, clim.index.day]).median()
    fc = json.loads((RAW / "openmeteo_forecast_idalpe.json").read_text())["daily"]
    fc = pd.DataFrame(fc).assign(time=lambda d: pd.to_datetime(d.time)).set_index("time")
    ev = pd.read_csv(ROOT / "data" / "raw" / "partner" / "event_calendar_2026-2027.csv", parse_dates=["date"])
    evn = ev.groupby("date").event.agg(lambda s: "; ".join(sorted(set(s))))
    sd = pd.read_csv(ROOT / "data" / "static" / "season_dates.csv", comment="#",
                     parse_dates=["first_day", "last_day", "opening_concert", "closing_concert"])
    from push_pull import PushPull
    real = f.real_actual
    tr = real.index[(f.in_season == 1) & real.notna() & (real > 0)]
    pp = PushPull(f).fit(real[tr], pd.Series(1.0, index=tr))
    Xp = pp.pull_matrix(f.index)[pp.cols]
    keep = [c for c in pp.cols if not c.startswith(("month_", "sweek_"))]  # interpretable pull reasons only
    pull_mult = np.exp(Xp[keep].values @ pp.beta[keep].values)
    pull_mult = pd.Series(pull_mult, index=f.index)
    rows = []
    for dest in ("Paznaun-Ischgl", "Tirol"):
        for d in DATES:
            obs = d <= last and pd.notna(snow.at[d, dest]) if d in snow.index else False
            depth = snow.at[d, dest] if obs else clim.loc[(d.month, d.day), dest] if (d.month, d.day) in clim.index else np.nan
            new3 = (snow[dest].diff().clip(lower=0).rolling(3).sum().get(d, np.nan)) if obs else np.nan
            e = pd.Timestamp(__import__("dateutil.easter", fromlist=["easter"]).easter(d.year))
            off = (d - e).days
            if dest == "Paznaun-Ischgl":
                in_season = bool(((sd.first_day <= d) & (sd.last_day >= d)).any())
                events = evn.get(d, "")
                if not events and ((sd.opening_concert == d).any() or (sd.closing_concert == d).any()):
                    events = "Top of the Mountain concert (recurring)"
                if not events and off == 0 and in_season:
                    events = "Top of the Mountain Easter concert (recurring)"
            else:
                in_season = d.month in (12, 1, 2, 3) or (d.month == 4 and d.day <= 20) or (d.month in (7, 8))
                events = ""
            rows.append({
                "destination": dest, "date": d.strftime("%Y-%m-%d"), "weekday": d.strftime("%a"),
                "season_open": in_season,
                "christmas_window": (d.month == 12 and d.day >= 24) or (d.month == 1 and d.day <= 6),
                "easter_window": -9 <= off <= 8,
                "events": events,
                "snow_depth_cm": None if pd.isna(depth) else round(float(depth)),
                "snow_depth_is_typical_not_observed": not obs,
                "new_snow_3d_cm": None if pd.isna(new3) else round(float(new3)),
                "forecast_snowfall_cm": round(float(fc.snowfall_sum.get(d, np.nan)), 1) if d in fc.index else None,
                "forecast_temp_max_c": round(float(fc.temperature_2m_max.get(d, np.nan)), 1) if d in fc.index else None,
                "pull_multiplier": round(float(pull_mult.get(d, np.nan)), 2) if dest == "Paznaun-Ischgl" and d in pull_mult.index else None,
                "grade": "B" if dest == "Paznaun-Ischgl" else "C"})
    return pd.DataFrame(rows), pp


def driver_effects(pp) -> pd.DataFrame:
    rows = []
    label = {"dow_0": "Monday night", "dow_1": "Tuesday night", "dow_2": "Wednesday night", "dow_3": "Thursday night",
             "dow_4": "Friday night", "dow_5": "Saturday night", "season_week1": "first week of the season",
             "season_week2_3": "weeks 2-3 of the season", "season_last_week": "last week of the season",
             "opening_weekend": "season opening weekend", "closing_weekend": "season closing weekend",
             "xmas_newyear": "Christmas / New Year window", "pre_xmas": "pre-Christmas weeks", "holy_week": "Holy Week",
             "easter_week": "Easter week", "low_snow": "snow depth < 30 cm", "fresh_snow": "> 20 cm new snow in 3 days",
             "big_concert": "big concert weekend (Top of the Mountain)"}
    for k, v in pp.beta.items():
        if k in label:
            rows.append({"kind": "pull", "driver": label[k], "applies_to": "Paznaun-Ischgl, all markets",
                         "effect_multiplier": round(float(np.exp(v)), 2),
                         "basis": "push-pull fit on TVB daily stays 2024-2026; relative to a normal day of the same month and season phase", "grade": "B"})
    for c, g in GAMMA.items():  # the values used in daily_share / push_reasons
        rows.append({"kind": "push", "driver": f"school holidays in {c}", "applies_to": f"guests from {c}",
                     "effect_multiplier": round(1 + float(g), 2),
                     "basis": "push-pull fit on Paznaun (used in daily_share): presence on a full school-holiday day vs a normal day of that market",
                     "grade": "B"})
    for c, m in {"NL": 10.2, "GB": 7.3, "BE": 5.2, "LU": 3.2, "DK": 2.8, "FR": 2.6, "SE": 2.3, "DE": .9}.items():
        rows.append({"kind": "push", "driver": f"school holidays in {c} (Salzburg mobile data)", "applies_to": f"guests from {c}",
                     "effect_multiplier": m, "basis": "Hutchison Drei mobile visitors, Salzburger Sportwelt Feb-Apr 2026", "grade": "C"})
    rows += [
        {"kind": "pull", "driver": "+10 cm more snow (Dec-Mar mean) than last season", "applies_to": "season total, Paznaun",
         "effect_multiplier": 1.0045, "basis": "20 winter seasons, r = 0.50", "grade": "B"},
        {"kind": "context", "driver": "economy, inflation, exchange rates, geopolitical risk", "applies_to": "season total",
         "effect_multiplier": 1.0, "basis": "no significant effect on season growth (20 seasons)", "grade": "B"},
        {"kind": "push", "driver": "Easter in March instead of April", "applies_to": "March/April split",
         "effect_multiplier": None, "basis": "April share = -0.062 + 0.004 x Easter day-of-year (25 seasons, r 0.75)", "grade": "A"}]
    return pd.DataFrame(rows)


def update_weather(out_dir):
    """Data-only refresh (no model fit, no partner data): replace the snow and weather columns of
    pull_reasons.csv with the latest SNOWGRID values and the Open-Meteo forecast; keep everything else."""
    p = out_dir / "pull_reasons.csv"
    t = pd.read_csv(p, keep_default_na=False, na_values=[""])
    snow = snow_series()
    last = snow.index.max()
    clim = snow[(snow.index >= "2000-01-01") & (snow.index < "2026-01-01")]
    clim = clim.groupby([clim.index.month, clim.index.day]).median()
    fc = json.loads((RAW / "openmeteo_forecast_idalpe.json").read_text())["daily"]
    fc = pd.DataFrame(fc).assign(time=lambda d: pd.to_datetime(d.time)).set_index("time")
    new3 = {dest: snow[dest].diff().clip(lower=0).rolling(3).sum() for dest in snow.columns}
    depth, typical, n3, fsn, ftx = [], [], [], [], []
    for dest, ds in zip(t.destination, t.date):
        d = pd.Timestamp(ds)
        obs = bool(d <= last and d in snow.index and pd.notna(snow.at[d, dest]))
        v = snow.at[d, dest] if obs else clim[dest].get((d.month, d.day), np.nan)
        depth.append(None if pd.isna(v) else round(float(v)))
        typical.append(not obs)
        n3.append(round(float(new3[dest].get(d, np.nan))) if obs and pd.notna(new3[dest].get(d, np.nan)) else None)
        fsn.append(round(float(fc.snowfall_sum.get(d)), 1) if d in fc.index and pd.notna(fc.snowfall_sum.get(d)) else None)
        ftx.append(round(float(fc.temperature_2m_max.get(d)), 1) if d in fc.index and pd.notna(fc.temperature_2m_max.get(d)) else None)
    t["snow_depth_cm"], t["snow_depth_is_typical_not_observed"], t["new_snow_3d_cm"] = depth, typical, n3
    t["forecast_snowfall_cm"], t["forecast_temp_max_c"] = fsn, ftx
    t.to_csv(p, index=False)
    return t


def main(out_dir):
    origins = pd.read_csv(out_dir / "origins.csv")[["origin_code", "origin_name"]]
    push = push_reasons(origins)
    push.to_csv(out_dir / "push_reasons.csv", index=False)
    pull, pp = pull_reasons()
    pull.to_csv(out_dir / "pull_reasons.csv", index=False)
    driver_effects(pp).to_csv(out_dir / "driver_effects.csv", index=False)
    return push, pull


if __name__ == "__main__":
    out = ROOT / "results" / "gui"
    push, pull = main(out)
    print(push[(push.origin_code == "80") & (push.date.between("2027-02-06", "2027-02-15"))][
        ["date", "school_holiday_share", "public_holiday_share", "holiday_names", "push_multiplier"]].to_string(index=False))
    print(pull[(pull.destination == "Paznaun-Ischgl") & (pull.date.between("2026-11-25", "2026-11-30"))].to_string(index=False))
    print(pd.read_csv(out / "driver_effects.csv").head(25).to_string(index=False))
