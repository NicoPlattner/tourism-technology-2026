"""GUI data layer: complete tables (no empty cells) and query().

Every value comes with `is_estimate`, `method`, `grade` (A best ... D rough). Fallback ladder:

guests / nights per destination x origin x month (2024-01 .. 2027-12)
  1 observed            months with official data (Statistik Austria, 2024-01 .. latest)    not an estimate
  2 model               M1 pooled LightGBM (destination-origin pairs with >= 20k nights/yr)  A (>= 500k) / B
  3 sum of parts        Germany = 7 origin regions + unspecified, Austria = 9 states        grade of the weakest part
  4 population split    a single German state = its Statistik Austria region x population share   C, estimate
  5 2-year average      small origins (no model): same month, last 2 non-COVID years          C, estimate
  6 carried forward     months after the model horizon: M1 same month a year earlier x the pair's
                        forecast growth                                                     C, estimate
  7 destination share   destination Paznaun-Ischgl: Tirol value x Paznaun share of Tirol nights for the
                        origin country and season (Landesstatistik Tirol)                   C, estimate
daily distribution      destination pattern (Tirol; other states use it as a proxy) x origin holiday push
                        (origin's school calendar; none -> destination pattern only, flagged)
length of stay          nights / guests of the chosen values (same grade)
lead time               M4 arrival month (Paznaun as proxy); by market: indicative profile (C)
age                     M5 origin country; unknown country -> all-origin profile (D)

    python3 models/gui_api.py   -> out/gui/complete_origin_month.parquet, out/gui/example_*.json
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

from common import ROOT
from m3_daily import GAMMA, pull_pattern
from m4_leadtime import CLASSES, MID

sys.path.insert(0, str(ROOT / "data"))
from build_origin_panel import COVID, DE_POP, ORIGIN, STATES, school_daily  # noqa: E402

GUI = ROOT / "out" / "gui"
RAW = ROOT / "data" / "raw" / "open" / "statistik_at"
HORIZON_END = pd.Timestamp("2027-12-01")
DE_REGIONS = {"80": ["BY"], "81": ["BW"], "82": ["NW"], "83": ["HE", "RP", "SL"], "84": ["HH", "HB", "NI", "SH"],
              "85": ["BB", "MV", "SN", "ST", "TH"], "53": ["BE"]}
LAND_NAMES = {"BY": "Bavaria", "BW": "Baden-Württemberg", "NW": "North Rhine-Westphalia", "HE": "Hesse",
              "RP": "Rhineland-Palatinate", "SL": "Saarland", "HH": "Hamburg", "HB": "Bremen", "NI": "Lower Saxony",
              "SH": "Schleswig-Holstein", "BB": "Brandenburg", "MV": "Mecklenburg-Vorpommern", "SN": "Saxony",
              "ST": "Saxony-Anhalt", "TH": "Thuringia", "BE": "Berlin"}
AT_STATES = ["01", "70", "71", "72", "73", "74", "75", "76", "77"]
GRADE_ORDER = "ABCD"


def worst(grades) -> str:
    return max(grades, key=GRADE_ORDER.index)


def observed() -> pd.DataFrame:
    d = pd.read_csv(RAW / "OGD_touextsai_Tour_HKL_1.csv", sep=";", dtype=str)
    d = d.assign(month=pd.to_datetime(d["C-SDB_TIT-0"], format="%Y%m"), dest=d["C-W96-0"], origin=d["C-C93-2"],
                 nights=pd.to_numeric(d["F-UEB"]), arrivals=pd.to_numeric(d["F-ANK"]))
    return d[d.month >= "2014-01-01"][["month", "dest", "origin", "nights", "arrivals"]]


def names() -> dict:
    n = pd.read_csv(RAW / "OGD_touextsai_Tour_HKL_1_C-C93-2.csv", sep=";", dtype=str)
    return dict(zip(n.code, n.en_name.fillna("").str.replace(r"\s*\(.*?\)|\s*<.*?>", "", regex=True).str.strip()))


def two_year_avg(obs: pd.DataFrame, month: pd.Timestamp, dest: str, origin: str):
    vals = []
    for y in range(month.year - 1, month.year - 8, -1):
        m = month.replace(year=y)
        if COVID[0] <= m <= COVID[1]:
            continue
        r = obs[(obs.month == m) & (obs.dest == dest) & (obs.origin == origin)]
        if len(r):
            vals.append(r[["nights", "arrivals"]].iloc[0].values)
        if len(vals) == 2:
            break
    return np.mean(vals, axis=0) if vals else (np.nan, np.nan)


def complete_table() -> pd.DataFrame:
    m1 = pd.read_parquet(GUI / "m1_origin_month.parquet")
    obs = observed()
    nm = names()
    months = pd.date_range("2024-01-01", HORIZON_END, freq="MS")  # observed history + forecast
    last_obs = obs.month.max()
    rows = []
    for dest in STATES:
        o_recent = obs[(obs.dest == dest) & (obs.month >= "2023-11-01")].groupby("origin").nights.sum()
        origins = sorted(o_recent[o_recent > 0].index)
        mm = m1[m1.dest == dest].set_index(["origin", "month"])
        for o in origins:
            for m in months:
                rec = {"dest": dest, "destination": STATES[dest], "origin": o, "origin_name": nm.get(o, o), "month": m}
                if m <= last_obs:
                    r = obs[(obs.month == m) & (obs.dest == dest) & (obs.origin == o)]
                    n_, a_ = (r.nights.iloc[0], r.arrivals.iloc[0]) if len(r) else (0.0, 0.0)  # not listed = no stays
                    rows.append({**rec, "nights": n_, "arrivals": a_, "nights_p10": n_, "nights_p90": n_,
                                 "is_estimate": False, "method": "observed (Statistik Austria)", "grade": "A"})
                    continue
                if (o, m) in mm.index:
                    r = mm.loc[(o, m)]
                    rows.append({**rec, "nights": r.nights, "arrivals": r.arrivals, "nights_p10": r.nights_p10,
                                 "nights_p90": r.nights_p90, "is_estimate": False, "method": "M1 model", "grade": r.grade})
                    continue
                prev = m - pd.DateOffset(years=1)
                if (o, prev) in mm.index:  # beyond the model horizon
                    pr = mm.loc[(o, prev)]
                    g = mm.loc[o]
                    growth = float((g.nights.sum() / g.nights_last_year.sum())) if g.nights_last_year.sum() else 1.0
                    growth = float(np.clip(growth, .8, 1.25))
                    rows.append({**rec, "nights": pr.nights * growth, "arrivals": pr.arrivals * growth,
                                 "nights_p10": pr.nights_p10 * growth * .95, "nights_p90": pr.nights_p90 * growth * 1.05,
                                 "is_estimate": True, "method": "carried forward: M1 one year earlier x forecast growth",
                                 "grade": "C"})
                    continue
                n_, a_ = two_year_avg(obs, m, dest, o)
                rows.append({**rec, "nights": n_, "arrivals": a_, "nights_p10": n_ * .7, "nights_p90": n_ * 1.3,
                             "is_estimate": True, "method": "2-year average of the same month (no model for this origin)",
                             "grade": "C"})
    t = pd.DataFrame(rows)
    t = pd.concat([t, aggregates(t)], ignore_index=True)
    t = pd.concat([t, paznaun(t)], ignore_index=True)
    t["length_of_stay"] = t.nights / t.arrivals
    return t


def aggregates(t: pd.DataFrame) -> pd.DataFrame:
    out = []
    groups = {"DE": ("Germany", list(DE_REGIONS) + ["12"]), "AT": ("Austria", AT_STATES)}
    for code, (name, parts) in groups.items():
        g = t[t.origin.isin(parts)].groupby(["dest", "destination", "month"])
        agg = g[["nights", "arrivals", "nights_p10", "nights_p90"]].sum(min_count=1).reset_index()
        agg["is_estimate"] = g.is_estimate.any().values
        agg["grade"] = g.grade.agg(worst).values
        agg["method"] = "sum of origin regions / states"
        agg["origin"], agg["origin_name"] = code, name
        out.append(agg)
    reg = t[t.origin.isin(DE_REGIONS)]
    for rcode, laender in DE_REGIONS.items():
        r = reg[reg.origin == rcode]
        tot = sum(DE_POP[x] for x in laender)
        for land in laender:
            if len(laender) == 1:
                continue
            x = r.copy()
            f = DE_POP[land] / tot
            for c in ("nights", "arrivals", "nights_p10", "nights_p90"):
                x[c] = x[c] * f
            x["origin"], x["origin_name"] = f"DE-{land}", LAND_NAMES[land]
            x["is_estimate"], x["grade"] = True, "C"
            x["method"] = f"Statistik Austria region {rcode} split by population ({f:.0%})"
            out.append(x)
    return pd.concat(out, ignore_index=True)


def paznaun(t: pd.DataFrame) -> pd.DataFrame:
    from gui_outputs import paznaun_view  # shares per origin country and season kind
    shares = paznaun_view()
    tir = t[t.dest == "W96-7"].copy()
    kind = np.where(tir.month.dt.month.isin([11, 12, 1, 2, 3, 4]), "winter", "summer")

    def country(o):
        if o.startswith("DE") or o in DE_REGIONS or o == "12":
            return "DE"
        if o == "AT" or o in AT_STATES:
            return "AT"
        return ORIGIN.get(o, (None, None))[0]
    f = []
    for k, o in zip(kind, tir.origin):
        _, sh, rest = shares[k]
        f.append(sh.get(country(o), rest))
    for c in ("nights", "arrivals", "nights_p10", "nights_p90"):
        tir[c] = tir[c] * np.array(f)
    tir["dest"], tir["destination"] = "PAZNAUN", "Paznaun-Ischgl"
    tir["is_estimate"] = True
    tir["grade"] = [worst([g, "C"]) for g in tir.grade]
    tir["method"] = tir.method + " x Paznaun share of Tirol nights (Landesstatistik Tirol)"
    return tir


def origin_calendar(origin: str):
    if origin.startswith("DE-"):
        return "DE", [origin[3:]]
    if origin == "DE":
        return "DE", list(DE_POP)
    if origin == "AT":
        return "AT", ["WI", "BL", "KÄ", "NÖ", "OÖ", "SB", "SM", "TI", "VA"]
    return ORIGIN.get(origin, (None, None))


def field(value, est, method, grade, note=None):
    d = {"value": value, "is_estimate": bool(est), "method": method, "grade": grade}
    if note:
        d["note"] = note
    return d


def query(destination: str, origin: str, start: str, end: str) -> dict:
    t = pd.read_parquet(GUI / "complete_origin_month.parquet")
    m4 = pd.read_parquet(GUI / "m4_leadtime.parquet")
    m4m = pd.read_parquet(GUI / "m4_leadtime_by_market_indicative.parquet")
    m5 = pd.read_parquet(GUI / "m5_age.parquet")
    tir = pd.read_parquet(ROOT / "data" / "processed" / "tirol_daily.parquet").tirol
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    rows = t[(t.destination == destination) & (t.origin == origin)].set_index("month")
    if rows.empty:
        return {"error": f"no data for origin {origin} in {destination}"}
    dates = pd.date_range(s, e)
    pull = pull_pattern(tir, pd.date_range(s.replace(day=1), e + pd.offsets.MonthEnd(0)))
    country, subs = origin_calendar(origin)
    H = school_daily(country, subs, pull.index) if country else pd.Series(np.nan, index=pull.index)
    push_ok = H.notna().mean() > .5
    w = pull * (1 + GAMMA.get(country, 1.0) * H.fillna(0))
    share = (w / w.groupby(w.index.to_period("M")).transform("sum")).loc[dates]
    mo = dates.to_period("M").to_timestamp()
    nights = share * mo.map(rows.nights).values
    guests = share * mo.map(rows.arrivals).values
    used = rows.loc[sorted(set(mo))]
    est, grade = bool(used.is_estimate.any()), worst(list(used.grade))
    methods = sorted(set(used.method))
    daily_note = None if destination in ("Tirol", "Paznaun-Ischgl") else "Tirol daily pattern used as proxy"
    lt = m4.set_index("arrival_month").reindex(sorted(set(dates.month)))
    lt_missing = lt.share_0d.isna()
    if lt_missing.any():  # nearest month of the same season kind
        lt = lt.apply(lambda r: r if r.notna().all() else m4.iloc[(m4.arrival_month - r.name).abs().argmin()]
                      .drop("arrival_month"), axis=1)
    wts = nights.groupby(nights.index.month).sum()
    mix = (lt[[f"share_{c}" for c in CLASSES]].mul(wts, axis=0).sum() / wts.sum())
    mix.index = CLASSES
    med = int(MID[::-1][np.argmax(mix[CLASSES[::-1]].cumsum().values >= .5)])
    group = {"DE": "DE", "NL": "NL", "BE": "BE_LU", "LU": "BE_LU", "DK": "NORDIC_UK", "SE": "NORDIC_UK",
             "GB": "NORDIC_UK"}.get(country, "OTHER")
    mk = m4m.loc[group, CLASSES]
    med_m = int(MID[::-1][np.argmax(mk[CLASSES[::-1]].cumsum().values >= .5)])
    kind = "winter" if s.month in (11, 12, 1, 2, 3, 4) else "summer"
    age = m5[(m5.origin_country == country) & (m5.season_kind == kind)]
    age_est, age_grade = False, "C"
    if age.empty:
        allp = m5[m5.season_kind == kind]
        age = allp.assign(w=allp.n_persons).pipe(lambda d: d)
        cols = [c for c in m5.columns if c.startswith("age_")]
        prof = (age[cols].mul(age.n_persons, axis=0).sum() / age.n_persons.sum())
        age_val, age_est, age_grade = prof.round(3).to_dict(), True, "D"
    else:
        cols = [c for c in m5.columns if c.startswith("age_")]
        age_val = age.iloc[0][cols].astype(float).round(3).to_dict()
        age_val["median_age_band"] = age.iloc[0].median_age_band
    weekly = nights.resample("W-SUN").sum()
    total_n, total_g = float(nights.sum()), float(guests.sum())
    lo = float((share * mo.map(rows.nights_p10).values).sum())
    hi = float((share * mo.map(rows.nights_p90).values).sum())
    return {
        "destination": destination, "origin": origin, "origin_name": rows.origin_name.iloc[0], "from": start, "to": end,
        "guests": field(round(total_g), est, "; ".join(methods), grade),
        "nights": field(round(total_n), est, "; ".join(methods), grade),
        "nights_80pct_range": field([round(lo), round(hi)], est, "conformal band of M1 (estimate rows: rough band)", grade),
        "length_of_stay": field(round(total_n / total_g, 2) if total_g else None, est, "nights / guests", grade),
        "daily_distribution": field({str(k.date()): round(float(v)) for k, v in weekly.items()},
                                    not push_ok or daily_note is not None,
                                    "destination pattern x origin school-holiday push" if push_ok
                                    else "destination pattern only (no school calendar for this origin)",
                                    "B" if push_ok and not daily_note else "C", daily_note),
        "booking_lead_time": field({"share_by_days_ahead": mix.round(3).to_dict(), "median_days_ahead": med,
                                    "book_by_for_half_of_first_arrivals": str((s - pd.Timedelta(days=med)).date())},
                                   True, "TVB Paznaun lead time per arrival month (proxy for the destination)",
                                   "B" if destination in ("Tirol", "Paznaun-Ischgl") else "C",
                                   "nearest month used for some arrival months" if lt_missing.any() else None),
        "booking_lead_time_this_market": field({"share_by_days_ahead": mk.round(3).to_dict(), "median_days_ahead": med_m},
                                               True, f"indicative profile for market group {group} (derived)", "C",
                                               "lost a validation test against the monthly average; direction only"),
        "age_profile": field(age_val, age_est, "Salzburger Sportwelt guest cards (comparable ski region)", age_grade,
                             "all-origin profile, origin not in the guest-card data" if age_est else None),
        "sources": ["Statistik Austria (CC BY 4.0)", "Landesstatistik Tirol", "Österreich Werbung / Nächtigungsprognose (CC BY 4.0)",
                    "OpenHolidays (ODbL)", "TVB Paznaun-Ischgl (TTF 2026 data licence)",
                    "Salzburger Sportwelt (TTF licence, aggregates only)"],
    }


if __name__ == "__main__":
    t = complete_table()
    t.to_parquet(GUI / "complete_origin_month.parquet")
    print(t.shape, "rows |", t.destination.nunique(), "destinations |", t.origin.nunique(), "origins")
    print("empty cells (nights):", int(t.nights.isna().sum()))
    print(t.groupby(["is_estimate", "grade"]).size().to_string())
    print(t.groupby("method").size().sort_values(ascending=False).head(10).to_string())
    for dest, o, a, b in (("Tirol", "80", "2026-01-15", "2026-03-15"), ("Tirol", "80", "2027-01-15", "2027-03-15"), ("Tirol", "DE-HE", "2027-02-01", "2027-02-28"),
                          ("Paznaun-Ischgl", "25", "2027-02-01", "2027-03-07"), ("Tirol", "40", "2027-11-01", "2027-12-31"),
                          ("Salzburg", "DE", "2027-01-01", "2027-01-31")):
        q = query(dest, o, a, b)
        (GUI / f"example_{dest}_{o}.json".replace(" ", "_")).write_text(json.dumps(q, indent=1, ensure_ascii=False, default=str))
        print(f"\n{dest} <- {q['origin_name']} {a}..{b}: guests {q['guests']['value']}, nights {q['nights']['value']} "
              f"({q['nights']['grade']}, estimate={q['nights']['is_estimate']}; {q['nights']['method'][:80]}), "
              f"stay {q['length_of_stay']['value']}, lead median {q['booking_lead_time']['value']['median_days_ahead']} d, "
              f"age est={q['age_profile']['is_estimate']}")
