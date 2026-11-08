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


def export_actions(d: pd.DataFrame, w: pd.DataFrame) -> pd.DataFrame:
    mo = pd.read_csv(GUI / "monthly_origin.csv", dtype={"origin_code": str})
    org = pd.read_csv(GUI / "origins.csv", dtype=str)
    base = set(org[org.kind == "Statistik Austria origin"].origin_code)  # non-overlapping origins
    mo = mo[(mo.destination == "Paznaun-Ischgl") & mo.origin_code.isin(base)]
    push = pd.read_csv(GUI / "push_reasons.csv", dtype={"origin_code": str}, parse_dates=["date"])
    push = push[push.origin_code.isin(base)]
    lt = pd.read_csv(GUI / "lead_time_by_arrival_month.csv").set_index("arrival_month")
    rows = []
    def weekly(gs):  # long windows -> calendar weeks, so actions follow each market's holiday week
        for g in gs:
            if len(g) <= 9:
                yield g
            else:
                yield from (x for _, x in g.groupby(g.date.dt.to_period("W-SUN")))
    for kind in ("spare_capacity", "tight"):
        for g in weekly(windows(d, kind)):
            a, b = g.date.min(), g.date.max()
            months = sorted(set(g.date.dt.strftime("%Y-%m")))
            m = mo[mo.month.isin(months)].groupby(["origin_code", "origin_name"]).agg(
                nights=("nights", "sum"), grade=("grade", "max")).reset_index()
            m["share"] = m.nights / m.nights.sum()
            m = m[m.share >= .01]
            p = push[(push.date >= a) & (push.date <= b)].groupby("origin_code").agg(
                push=("push_multiplier", "mean"), school=("school_holiday_share", "mean"),
                holidays=("holiday_names", lambda s: "; ".join(sorted({x for v in s.dropna() for x in v.split("; ") if x}))))
            m = m.join(p, on="origin_code")
            m["push"] = m.push.fillna(1.0)
            m["weight"] = m.share * m.push  # who comes anyway x who is free to travel then
            m["weight"] /= m.weight.sum()
            spare = float(g.spare_beds.sum())
            mid = a + (b - a) / 2
            med = int(lt.loc[mid.month, "median_days_ahead"])
            launch = max(a - pd.Timedelta(days=med), AS_OF)
            bookable = still_bookable((a - AS_OF).days, a.month, lt)
            for r in m.itertuples():
                if kind == "spare_capacity":
                    addr = spare * r.weight
                    act = (f"Campaign for {r.origin_name}: stay {a:%d %b}–{b:%d %b %Y}"
                           + (f" ({r.holidays})" if isinstance(r.holidays, str) and r.holidays else ""))
                    score = addr * bookable * (1.15 if r.push > 1.2 else 1.0)
                else:
                    addr = float(g.forecast_ours.sum()) * r.share
                    act = (f"Yield for {r.origin_name}: {a:%d %b}–{b:%d %b %Y} near full: no discounts, "
                           "minimum stay, offer the shoulder days before/after")
                    score = addr * .05  # yield actions rank below demand actions of the same size
                grade = max(["B", str(r.grade)[0]], key="ABCD".index)
                rows.append({
                    "kind": "win demand" if kind == "spare_capacity" else "protect yield",
                    "action": act, "market": r.origin_name, "market_code": r.origin_code,
                    "from": str(a.date()), "to": str(b.date()), "days": len(g),
                    "launch_by": str(launch.date()), "median_lead_days": med,
                    "share_still_bookable": round(bookable, 3),
                    "market_share": round(float(r.share), 3), "holiday_push": round(float(r.push), 2),
                    "school_holiday_share": None if pd.isna(r.school) else round(float(r.school), 2),
                    "addressable_nights": round(addr), "score": round(score),
                    "grade": grade,
                    "note": (f"after the early Easter ({pd.Timestamp(easter(a.year)):%d %b}) some hotels may close "
                             "earlier than last year: confirm open beds with partners before spending")
                    if kind == "spare_capacity" and a > pd.Timestamp(easter(a.year)) + pd.Timedelta(days=7) else "",
                    "basis": ("spare beds = capacity (stays + free beds last year, same weekday; around Easter same distance from Easter) - our forecast; "
                              "split by market share (M1, Paznaun) x holiday push (origin calendars); "
                              "still bookable = TVB lead-time mix of the arrival month"
                              if kind == "spare_capacity" else
                              "forecast >= 95 % of capacity; market share from M1 (Paznaun)")})
    a = pd.DataFrame(rows).sort_values("score", ascending=False)
    a.insert(0, "rank", range(1, len(a) + 1))
    a.to_csv(OUT / "actions.csv", index=False)
    return a


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d = export_forecast()
    w = export_warnings(d)
    a = export_actions(d, w)
    export_deviations()
    shutil.copy(ROOT / "docs" / "challenge-04" / "C04-RESULTS-README.md", OUT / "README.md")
    print(w.groupby("kind").size().to_dict())
    print(a.head(12)[["rank", "kind", "market", "from", "to", "launch_by", "addressable_nights",
                      "share_still_bookable", "score", "grade"]].to_string(index=False))


if __name__ == "__main__":
    main()
