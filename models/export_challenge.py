"""Challenge 04 answers as tracked tables: forecast, deviations (why), warnings (where), actions (what first).

    python3 models/export_challenge.py          # after forecast_winter.py (out/c04_forecast.json)

Output: results/c04/ (tracked, served by api/c04). Only derived values and aggregates: TVB daily values
(stays, forecast, free beds) are not written; monthly sums and derived estimates are.

  forecast_daily.csv     Paznaun-Ischgl winter 26/27 per day: our forecast + 80 % band, official TR53,
                         capacity estimate, utilisation, flags (tight, spare_capacity, forecast disagreement)
  forecast_monthly.csv   per month: ours, TVB forecast, official TR53
  deviations_monthly.csv winter 25/26 + summer 26: actual vs TVB forecast per month, error, tracking signal
  deviations_drivers.csv why: stays explained per driver (push = source-market free time, pull = destination),
                         80 % bootstrap interval, grade A-C
  deviations_summary.json R², Theil decomposition, data-quality notes
  warnings.csv           windows of consecutive flagged days (spare capacity, tight, forecast disagreement)
  actions.csv            ranked marketing actions: market x window, launch date, addressable nights,
                         share still bookable, confidence grade, basis
  README.md              schema and method
"""
from __future__ import annotations

import json
import shutil

import numpy as np
import pandas as pd
from dateutil.easter import easter

from common import ROOT

OUT = ROOT / "results" / "c04"
GUI = ROOT / "results" / "gui"
AS_OF = pd.Timestamp("2026-11-08")
CLASSES = ["0d", "8d", "31d", "61d", "90d", "180d"]
LOWER = np.array([0, 8, 31, 61, 90, 180])  # lower bound of each lead-time class (days ahead)
PUSH_KIND = ("hol_", "longwe")


# ---------------------------------------------------------------- forecast
def easter_aligned_capacity(d: pd.DataFrame) -> pd.DataFrame:
    """Capacity comes from the same weekday last year (364 days). Around Easter that compares Easter 2027
    (28 Mar) with the Easter peak of 2026 (5 Apr). From two weeks before Easter to the season end, take
    last year's capacity at the same distance from Easter instead, and recompute utilisation and flags."""
    try:
        from common import load
        f = load()
        cap, ins = f.capacity_est, f.in_season
    except Exception:  # no TVB data: keep the forecast's capacity
        return d
    dt = pd.to_datetime(d.date)
    out = d.copy()
    for y in sorted(set(dt.dt.year)):
        e, e0 = pd.Timestamp(easter(y)), pd.Timestamp(easter(y - 1))
        m = (dt >= e - pd.Timedelta(days=14)) & (dt <= pd.Timestamp(f"{y}-04-30"))
        m &= (ins.reindex(dt + (e0 - e)).fillna(0).values == 1)  # only onto days that were in season
        if not m.any():
            continue
        src = dt[m] + (e0 - e)
        out.loc[m, "capacity_est"] = cap.reindex(src).values
        out.loc[m, "capacity_basis"] = "same distance from Easter last year"
    out["capacity_basis"] = out.get("capacity_basis", pd.Series(index=out.index, dtype=object)).fillna(
        "same weekday last year")
    u = out.forecast_ours / out.capacity_est
    out["utilisation"] = u.round(3)
    flags = []
    for i, r in out.iterrows():
        fl = [x for x in r["flags"].split("; ") if x and x not in ("tight", "spare_capacity")]
        if pd.notna(u[i]) and u[i] >= .95:
            fl.insert(0, "tight")
        elif pd.notna(u[i]) and u[i] < .8 and dt[i].month in (1, 2, 3, 4) and "spare_capacity" in r["flags"] + "spare_capacity":
            fl.insert(0, "spare_capacity")
        flags.append("; ".join(fl))
    out["flags"] = flags
    return out


def export_forecast() -> pd.DataFrame:
    fc = json.loads((ROOT / "out" / "c04_forecast.json").read_text())
    d = pd.DataFrame(fc["daily"])
    d["events"] = d["events"].apply(lambda e: "; ".join(e))
    d["flags"] = d["flags"].apply(lambda f: "; ".join(f))
    d = d.drop(columns=["forecast_tvb"])  # TVB daily values stay out of the repo; the flag keeps the signal
    d = easter_aligned_capacity(d)
    d["spare_beds"] = (d.capacity_est - d.forecast_ours).clip(lower=0)
    d["grade"] = "B"  # model with real-data backtest (8.5 % daily error winter 25/26), conformal band
    d.to_csv(OUT / "forecast_daily.csv", index=False)
    pd.DataFrame(fc["monthly"]).to_csv(OUT / "forecast_monthly.csv", index=False)
    meta = dict(fc["meta"], destination="Paznaun-Ischgl", as_of=str(AS_OF.date()),
                note="forecast_tvb per day not published (partner data); monthly sums only")
    (OUT / "forecast_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return d


# ---------------------------------------------------------------- deviations
def export_deviations():
    from common import load
    from explain import explain
    f = load()
    if "real_actual" not in f or not f.partner_fc.notna().any():
        print("TVB data not loaded: deviations skipped (run data/fetch_partner.py, data/build_features.py)")
        return
    rows, drivers, summ = [], [], {}
    for lab, sl, so in (("winter 25/26", slice("2025-11-04", "2026-05-03"), True),
                        ("summer 26", slice("2026-05-04", "2026-10-31"), False)):
        A, F = f.real_actual.loc[sl], f.partner_fc.loc[sl]
        res = explain(A, F, f, season_only=so)
        mon = pd.DataFrame({"actual": A.resample("MS").sum(), "forecast_tvb": F.resample("MS").sum()})
        mon["error_pct"] = (mon.forecast_tvb / mon.actual - 1) * 100
        tr = res["tracking"]
        tr.index = tr.index.to_timestamp()
        mon = mon.join(tr[["tracking_signal"]])
        mon["systematic_bias"] = mon.tracking_signal.abs() > 4
        mon.insert(0, "season", lab)
        mon.index = mon.index.strftime("%Y-%m")
        rows.append(mon.rename_axis("month").reset_index())
        s = res["summary"].copy()
        s.insert(0, "season", lab)
        s.insert(1, "driver_key", s.index)
        s["kind"] = np.where(s.driver_key.str.startswith(PUSH_KIND), "push (source-market free time)",
                             "pull (destination)")
        s["direction"] = np.where(s.stays_total > 0, "more stays than forecast", "fewer stays than forecast")
        drivers.append(s)
        dz = F.fillna(0) < 1
        summ[lab] = {"r2": round(res["r2"], 3), "theil": {k: round(v, 3) for k, v in res["theil"].items()},
                     "unexplained_stays": round(float(res["daily"]["unexplained"].sum())),
                     "level_shift_stays": round(float(res["daily"]["level (all days)"].sum())),
                     "forecast_zero_days": int(dz.sum()), "actual_on_forecast_zero_days": int(A[dz].sum()),
                     "actual_total": int(A.sum()), "forecast_total": int(F.sum())}
    pd.concat(rows).round(2).to_csv(OUT / "deviations_monthly.csv", index=False)
    pd.concat(drivers).round(1).to_csv(OUT / "deviations_drivers.csv", index=False)
    summ["method"] = ("log(actual/forecast) per day regressed on 0..1 drivers (ridge); contributions in stays; "
                      "LightGBM SHAP sign check; 200x week-block bootstrap; grade A = interval excludes 0 and "
                      "SHAP agrees, B = one of the two, C = neither. Theil: bias / variance / covariance shares "
                      "of the squared error. Tracking signal |TS| > 4 = systematic bias in that month.")
    (OUT / "deviations_summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- warnings
def windows(d: pd.DataFrame, flag: str, gap: int = 2) -> list[pd.DataFrame]:
    s = d[d["flags"].str.contains(flag)].copy()
    if s.empty:
        return []
    s["date"] = pd.to_datetime(s.date)
    grp = (s.date.diff().dt.days.fillna(1) > gap + 1).cumsum()
    return [g for _, g in s.groupby(grp)]


def export_warnings(d: pd.DataFrame) -> pd.DataFrame:
    text = {"spare_capacity": "in season, forecast below 80 % of beds: demand to win",
            "tight": "forecast at or above 95 % of beds: no discounts, steer to shoulder days",
            "tvb_forecast_outside_our_80pct_band": "TVB forecast outside our 80 % band: check bookings on hand"}
    rows = []
    for flag, what in text.items():
        for g in windows(d, flag):
            rows.append({"kind": flag, "from": str(g.date.min().date()), "to": str(g.date.max().date()),
                         "days": len(g), "forecast_nights": int(g.forecast_ours.sum()),
                         "capacity_est": int(g.capacity_est.sum()), "spare_beds": int(g.spare_beds.sum()),
                         "mean_utilisation": round(float(g.utilisation.mean()), 3),
                         "days_until_start": int((g.date.min() - AS_OF).days), "meaning": what,
                         "grade": "B" if flag != "tvb_forecast_outside_our_80pct_band" else "C"})
    w = pd.DataFrame(rows).sort_values(["kind", "from"])
    w.to_csv(OUT / "warnings.csv", index=False)
    return w


# ---------------------------------------------------------------- actions
def still_bookable(days_ahead: int, month: int, lt: pd.DataFrame) -> float:
    """Share of a month's arrivals that is typically booked less than `days_ahead` days before arrival."""
    r = lt.loc[month, [f"share_{c}" for c in CLASSES]].astype(float).values
    upper = np.r_[LOWER[1:], 10_000]
    part = np.clip((days_ahead - LOWER) / (upper - LOWER), 0, 1)  # linear inside a class
    return float((r * part).sum())


# Assumptions of the action ranking (documented in results/c04/README.md):
FREE_MIN = .5          # a day is free for a market when at least half of its population is free
REACH = {2: {"76", "77"},                                    # Tyrol, Vorarlberg: a weekend is enough
         3: {"01", "70", "71", "72", "73", "74", "75", "32", "80", "81"},  # rest of AT, CH/LI, BY, BW
         4: {"82", "83", "84", "85", "53", "20", "09"}}      # rest of DE, IT, CZ; all others: 7 days
GAMMA_L = {2: .5, 3: .3, 4: .15, 7: 0.}  # long-weekend effect: not measurable in the TVB totals -> cautious prior
HOLIDAY_CAP = 1.0      # holiday part <= 1.0 x the market's expected nights in the window (at most double)
BASE_CAP = .15         # base part (regulars, no trigger) <= 15 % of the market's expected nights
BASE_WEIGHT = .3       # share-driven nights count 30 % in the score
PUSH_DAY = 1.3         # a day with trip push >= 1.3 counts as a holiday day of the market


def reach_of(code: str) -> int:
    return next((k for k, v in REACH.items() if code in v), 7)


def trip_push(push: pd.DataFrame, org: pd.DataFrame) -> pd.DataFrame:
    """Per origin and day: free share, free-day block length, trip push (school + long weekend in a block)."""
    from m3_daily import GAMMA
    cc = org.set_index("origin_code").calendar_country
    out = []
    for o, g in push.sort_values("date").groupby("origin_code"):
        g = g.copy()
        sch, pub = g.school_holiday_share.fillna(0), g.public_holiday_share.fillna(0)
        lw = pd.concat([g.long_weekend_share.fillna(0), g.bridge_day_share.fillna(0)], axis=1).max(axis=1)
        wkend = (g.date.dt.dayofweek >= 5).astype(float)
        free = pd.concat([sch, pub, g.bridge_day_share.fillna(0), wkend], axis=1).max(axis=1)
        run = (free >= FREE_MIN)
        rid = (run != run.shift()).cumsum()
        block = run.groupby(rid).transform("sum").where(run, 0)
        k = reach_of(o)
        gs, gl = GAMMA.get(cc.get(o), 1.0) if isinstance(cc.get(o), str) else 1.0, GAMMA_L[k]
        g["school_term"] = gs * sch
        g["longwe_term"] = gl * lw * (block >= k) * (1 - sch)
        g["trip_push"] = 1 + g.school_term + g.longwe_term
        g["free_block_days"], g["reach_days"] = block.astype(int), k
        out.append(g)
    return pd.concat(out)


def export_actions(d: pd.DataFrame, w: pd.DataFrame) -> pd.DataFrame:
    mo = pd.read_csv(GUI / "monthly_origin.csv", dtype={"origin_code": str})
    org = pd.read_csv(GUI / "origins.csv", dtype=str)
    base = set(org[org.kind == "Statistik Austria origin"].origin_code)  # non-overlapping origins
    mo = mo[(mo.destination == "Paznaun-Ischgl") & mo.origin_code.isin(base)]
    push = pd.read_csv(GUI / "push_reasons.csv", dtype={"origin_code": str}, parse_dates=["date"])
    push = trip_push(push[push.origin_code.isin(base) & (push.date >= "2026-10-01") & (push.date <= "2027-05-31")], org)
    lt = pd.read_csv(GUI / "lead_time_by_arrival_month.csv").set_index("arrival_month")
    easter_note = lambda a: (f"after the early Easter ({pd.Timestamp(easter(a.year)):%d %b}) some hotels may close earlier "
                             "than last year: confirm open beds with partners before spending"
                             if a > pd.Timestamp(easter(a.year)) + pd.Timedelta(days=7) else "")

    def weekly(gs):  # long windows -> calendar weeks first; consecutive weeks with the same reason are merged later
        for g in gs:
            yield from ([g] if len(g) <= 9 else (x for _, x in g.groupby(g.date.dt.to_period("W-SUN"))))

    def shares(g):
        months = sorted(set(g.date.dt.strftime("%Y-%m")))
        m = mo[mo.month.isin(months)].groupby(["origin_code", "origin_name"]).agg(
            nights=("nights", "sum"), grade=("grade", "max")).reset_index()
        m["share"] = m.nights / m.nights.sum()
        return m

    weeks = []
    for g in weekly(windows(d, "spare_capacity")):
        a, b = g.date.min(), g.date.max()
        m = shares(g)
        P = push[(push.date >= a) & (push.date <= b)].pivot(index="date", columns="origin_code", values="trip_push")
        P = P.reindex(index=g.date.values, columns=m.origin_code).fillna(1.0)
        s = m.set_index("origin_code").share
        D = (P * s).sum(axis=1)                                     # sum_k s_k * push_k(t)
        spare = pd.Series(g.spare_beds.values, index=g.date.values)
        fc = pd.Series(g.forecast_ours.values, index=g.date.values)
        midweek = float(spare[spare.index.dayofweek.isin([6, 0, 1, 2, 3])].sum() / max(spare.sum(), 1))
        bookable = still_bookable((a - AS_OF).days, a.month, lt)
        med = int(lt.loc[(a + (b - a) / 2).month, "median_days_ahead"])
        for r in m[m.share >= .01].itertuples():
            pm = P[r.origin_code]
            E = float((fc * r.share).sum())
            H = min(float((spare * r.share * (pm - 1) / D).sum()), HOLIDAY_CAP * E)
            B = min(float((spare * r.share / D).sum()), BASE_CAP * E)
            pdays = push[(push.origin_code == r.origin_code) & (push.date >= a) & (push.date <= b)]
            hot = pdays[pdays.trip_push >= PUSH_DAY]
            weeks.append(dict(code=r.origin_code, market=r.origin_name, a=a, b=b, days=len(g), E=E, H=H, B=B,
                              hdays=len(hot), school=float(hot.school_term.sum()), longwe=float(hot.longwe_term.sum()),
                              names={x for v in hot.holiday_names.dropna() for x in v.split("; ") if x},
                              block=int(pdays.free_block_days.max()), reach=int(pdays.reach_days.max()),
                              share=float(r.share), push=float(pm.mean()), midweek=midweek, bookable=bookable, med=med,
                              grade=max(["B", str(r.grade)[0]], key="ABCD".index)))
    for x in weeks:
        x["reason"] = "holiday-driven" if x["hdays"] >= 2 else "share-driven"
        x["type"] = ("short-trip package" if x["longwe"] > x["school"] else "holiday campaign") \
            if x["reason"] == "holiday-driven" else ("midweek offer" if x["midweek"] >= .7 else "short-stay offer")
        x["score"] = (x["H"] + BASE_WEIGHT * x["B"]) * x["bookable"]
    # merge consecutive weeks of the same market with the same reason and action type
    merged = []
    for x in sorted(weeks, key=lambda x: (x["code"], x["a"])):
        y = merged[-1] if merged else None
        if y and y["code"] == x["code"] and (y["reason"], y["type"]) == (x["reason"], x["type"]) \
                and x["a"] - y["b"] <= pd.Timedelta(days=1):
            for k in ("days", "E", "H", "B", "hdays", "score", "school", "longwe"):
                y[k] += x[k]
            y["b"], y["names"] = x["b"], y["names"] | x["names"]
            y["block"], y["push"] = max(y["block"], x["block"]), max(y["push"], x["push"])
            y["midweek"] = min(y["midweek"], x["midweek"])
            y["grade"] = max(y["grade"], x["grade"], key="ABCD".index)
        else:
            merged.append(dict(x))
    rows = []
    for x in merged:
        a, b, names = x["a"], x["b"], "; ".join(sorted(x["names"]))
        span = f"{a:%d %b}–{b:%d %b %Y}"
        act = {"holiday campaign": f"Holiday campaign for {x['market']}: stay {span}" + (f" ({names})" if names else ""),
               "short-trip package": f"Short-trip package for {x['market']}: long weekend {span}" + (f" ({names})" if names else ""),
               "midweek offer": f"Midweek offer (Sun–Thu) for regular guests from {x['market']}: {span}",
               "short-stay offer": f"Short-stay offer for regular guests from {x['market']}: {span}"}[x["type"]]
        rows.append({
            "kind": "win demand", "reason_type": x["reason"], "action_type": x["type"], "action": act,
            "market": x["market"], "market_code": x["code"], "from": str(a.date()), "to": str(b.date()),
            "days": x["days"], "holiday_days": x["hdays"], "holidays": names,
            "free_block_days_max": x["block"], "reach_days": x["reach"],
            "launch_by": str(max(a - pd.Timedelta(days=x["med"]), AS_OF).date()), "median_lead_days": x["med"],
            "share_still_bookable": round(x["bookable"], 3), "market_share": round(x["share"], 3),
            "trip_push_max": round(x["push"], 2), "midweek_share_of_spare": round(x["midweek"], 2),
            "expected_nights": round(x["E"]), "holiday_part_nights": round(x["H"]), "base_part_nights": round(x["B"]),
            "addressable_nights": round(x["H"] + x["B"]), "score": round(x["score"]),
            "grade": x["grade"] if x["reason"] == "holiday-driven" and x["school"] >= x["longwe"] else "C",
            "note": easter_note(a),
            "basis": ("spare beds = capacity (stays + free beds last year; around Easter same distance from Easter) - our "
                      "forecast; holiday part = spare x s_m (push_m - 1) / sum_k s_k push_k, capped at the market's expected "
                      "nights; base part = spare x s_m / sum_k s_k push_k, capped at 15 %; trip push = school holidays + "
                      "long weekends inside a free-day block of at least the market's reach; score = (holiday + 0.3 base) x "
                      "share still bookable (TVB lead times)")})
    for g in weekly(windows(d, "tight")):
        a, b = g.date.min(), g.date.max()
        for r in shares(g).query("share >= .01").itertuples():
            addr = float(g.forecast_ours.sum()) * r.share
            rows.append({"kind": "protect yield", "reason_type": "capacity tight", "action_type": "yield",
                         "action": (f"Yield for {r.origin_name}: {a:%d %b}–{b:%d %b %Y} near full: no discounts, "
                                    "minimum stay, offer the shoulder days before/after"),
                         "market": r.origin_name, "market_code": r.origin_code, "from": str(a.date()), "to": str(b.date()),
                         "days": len(g), "launch_by": str(AS_OF.date()), "market_share": round(float(r.share), 3),
                         "expected_nights": round(addr), "addressable_nights": round(addr),
                         "score": round(addr * .05),  # yield actions rank below demand actions of the same size
                         "grade": max(["B", str(r.grade)[0]], key="ABCD".index), "note": "",
                         "basis": "forecast >= 95 % of capacity; market share from M1 (Paznaun)"})
    out = pd.DataFrame(rows).sort_values("score", ascending=False)
    out.insert(0, "rank", range(1, len(out) + 1))
    out.to_csv(OUT / "actions.csv", index=False)
    return out


def write_manifest():
    """When each source was last updated: shown by the API in /meta and on its landing page."""
    from datetime import datetime, timezone
    raw = ROOT / "data" / "raw"

    def mtime(p):
        p = raw / p
        return datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d") if p.exists() else None
    src = {}
    mo = pd.read_csv(GUI / "monthly_origin.csv", usecols=["month", "method"])
    obs = mo[mo.method.str.startswith("observed")]
    src["Statistik Austria, last observed month"] = obs.month.max() if len(obs) else None
    try:
        from common import load
        f = load()
        if "real_actual" in f:
            src["TVB overnight stays, last actual day"] = str(f.real_actual.dropna().index.max().date())
        if "free_beds" in f:
            src["TVB available beds, last day"] = str(f.free_beds.dropna().index.max().date())
    except Exception:
        pass
    pr = pd.read_csv(GUI / "pull_reasons.csv", usecols=["date", "forecast_snowfall_cm", "snow_depth_is_typical_not_observed"])
    fc = pr[pr.forecast_snowfall_cm.notna()]
    src["weather forecast (Open-Meteo), first forecast day"] = fc.date.min() if len(fc) else None
    ob = pr[pr.snow_depth_is_typical_not_observed == False]  # noqa: E712
    src["snow depth (GeoSphere SNOWGRID), last observed day"] = ob.date.max() if len(ob) else None
    src["school and public holidays (OpenHolidays), fetched"] = mtime("open/holidays_hist/DE_School.json")
    src["official forecast (Nächtigungsprognose), fetched"] = mtime("open/TR53_day.json")
    man = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sources": src}
    (OUT / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
    return man


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d = export_forecast()
    w = export_warnings(d)
    a = export_actions(d, w)
    export_deviations()
    shutil.copy(ROOT / "docs" / "challenge-04" / "C04-RESULTS-README.md", OUT / "README.md")
    print(write_manifest())
    print(w.groupby("kind").size().to_dict())
    print(a.head(20)[["rank", "reason_type", "action_type", "market", "from", "to", "holiday_days", "launch_by",
                      "holiday_part_nights", "base_part_nights", "score", "grade"]].to_string(index=False))


if __name__ == "__main__":
    main()
