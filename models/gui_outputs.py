"""GUI outputs for M4 (booking lead time) and M5 (age profile), plus a query function that answers one GUI
request (destination, origin, time frame) from the precomputed tables in out/gui/.

M5 age profile (proxy, grade C): Salzburger Sportwelt guest cards (comparable Austrian ski region; licence:
non-commercial, attribution, aggregates only), distinct card holders per origin country x age band, winter
and summer, last 3 seasons; small origins shrunk towards the all-origin profile (weight n / (n + 300)).
German regions use the German profile, Austrian states the Austrian one. Children are included (cards are
per person). Stability check: profile of the last season vs the two before.

    python3 models/gui_outputs.py   -> out/gui/m4_leadtime.parquet, m5_age.parquet, example_bavaria.json
"""
from __future__ import annotations

import glob
import json

import numpy as np
import pandas as pd

from common import ROOT
from m4_leadtime import CLASSES, MID, load, monthly_shares, stats

GUI = ROOT / "out" / "gui"
BANDS = ["0-5", "6-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65+"]
BAND_MID = {"0-5": 3, "6-14": 10, "15-24": 20, "25-34": 30, "35-44": 40, "45-54": 50, "55-64": 60, "65+": 70}


def m4_output():
    lt = load()
    ms = monthly_shares(lt)
    pk = pd.read_pickle(ROOT / "data" / "processed" / "m4_leadtime.pkl")
    rows = []
    for kind, label in (("W", "winter"), ("S", "summer")):
        seasons = sorted(s for s in ms.index.get_level_values(0).unique() if s.startswith(kind))
        last = ms.loc[seasons[-1]]  # chosen method: same as last season
        st = stats(last)
        for mth, r in last.iterrows():
            cum = r[CLASSES[::-1]].cumsum()
            rows.append({"arrival_month": int(mth), "season_kind": label, "based_on": seasons[-1],
                         **{f"share_{c}": float(r[c]) for c in CLASSES},
                         **{f"booked_at_least_{d}d_ahead": float(v) for d, v in zip([180, 90, 61, 31, 8, 0], cum)},
                         "median_days_ahead": int(st.loc[mth, "median_days_ahead"]),
                         "grade": "B (Paznaun as proxy for Tirol)"})
    out = pd.DataFrame(rows)
    out.to_parquet(GUI / "m4_leadtime.parquet")
    prof = pk["profiles"]
    allm = ms.loc[[s for s in ms.index.get_level_values(0).unique() if s.startswith("W")][-1]].mean()
    ind = (prof * .5 + allm.values * .5)  # shrunk halfway to the all-market mix, indicative only
    ind.assign(grade="C indicative (derived from market split)").to_parquet(GUI / "m4_leadtime_by_market_indicative.parquet")
    return out


def m5_output():
    gc = pd.concat([pd.read_csv(p, usecols=["date", "card_id", "origin_country", "age_band"])
                    for p in sorted(glob.glob(str(ROOT / "data" / "raw" / "other" / "guestcard_usage_sportwelt" / "part_*.csv")))])
    gc["date"] = pd.to_datetime(gc.date)
    gc = gc[gc.age_band.isin(BANDS)].dropna(subset=["origin_country"])
    gc["kind"] = np.where(gc.date.dt.month.isin([11, 12, 1, 2, 3, 4]), "winter", "summer")
    gc["season"] = np.where(gc.kind == "winter", gc.date.dt.year - (gc.date.dt.month <= 4), gc.date.dt.year)
    people = gc.drop_duplicates(["season", "kind", "card_id"])
    rows, stab = [], []
    for kind, g in people.groupby("kind"):
        recent = sorted(g.season.unique())[-3:]
        g = g[g.season.isin(recent)]
        allp = g.age_band.value_counts(normalize=True).reindex(BANDS).fillna(0)
        for c, gg in g.groupby("origin_country"):
            n = len(gg)
            p = gg.age_band.value_counts(normalize=True).reindex(BANDS).fillna(0)
            w = n / (n + 300)
            p = w * p + (1 - w) * allp
            cum = p.cumsum()
            med_band = cum.index[np.argmax(cum.values >= .5)]
            rows.append({"origin_country": c, "season_kind": kind, "n_persons": n, **{f"age_{b}": float(p[b]) for b in BANDS},
                         "median_age_band": med_band, "mean_age_approx": float(sum(p[b] * BAND_MID[b] for b in BANDS)),
                         "share_children_0_14": float(p["0-5"] + p["6-14"]),
                         "grade": "C (Salzburger Sportwelt guest cards as proxy)"})
            if n > 2000:
                last = gg[gg.season == recent[-1]].age_band.value_counts(normalize=True).reindex(BANDS).fillna(0)
                prev = gg[gg.season != recent[-1]].age_band.value_counts(normalize=True).reindex(BANDS).fillna(0)
                stab.append({"origin": c, "kind": kind, "TV distance last vs earlier": float((last - prev).abs().sum() / 2)})
    out = pd.DataFrame(rows)
    out.to_parquet(GUI / "m5_age.parquet")
    return out, pd.DataFrame(stab)


def _country_of(origin: str) -> str:
    import sys
    sys.path.insert(0, str(ROOT / "data"))
    from build_origin_panel import ORIGIN
    return ORIGIN[origin][0]


def query(origin: str, start: str, end: str, destination: str = "Tirol") -> dict:
    """Answer one GUI request (destination, origin, time frame) from the precomputed tables."""
    m1 = pd.read_parquet(GUI / "m1_origin_month.parquet")
    m3 = pd.read_parquet(GUI / "m3_daily_share.parquet")
    m4 = pd.read_parquet(GUI / "m4_leadtime.parquet")
    m5 = pd.read_parquet(GUI / "m5_age.parquet")
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    d = m3[(m3.origin == origin) & (m3.date >= s) & (m3.date <= e)].copy()
    one = m1[m1.origin == origin].set_index("month")
    d["month"] = d.date.dt.to_period("M").dt.to_timestamp()
    d["nights_p10"] = d.share_of_month * d.month.map(one.nights_p10)
    d["nights_p90"] = d.share_of_month * d.month.map(one.nights_p90)
    d["los"] = d.month.map(one.length_of_stay)
    d["nights_last_year"] = d.share_of_month * d.month.map(one.nights_last_year)
    nights = float(d.expected_nights.sum())
    guests = float((d.expected_nights / d.los).sum())
    c = _country_of(origin)
    age = m5[(m5.origin_country == c) & (m5.season_kind == ("winter" if s.month in (11, 12, 1, 2, 3, 4) else "summer"))]
    lt = m4[m4.arrival_month.isin(sorted(set(d.date.dt.month)))]
    wts = d.groupby(d.date.dt.month).expected_nights.sum()
    lt_w = lt.set_index("arrival_month").reindex(wts.index)
    share_cols = [f"share_{k}" for k in CLASSES]
    mix = (lt_w[share_cols].mul(wts, axis=0).sum() / wts.sum()).rename(lambda x: x.replace("share_", ""))
    cum = mix[CLASSES[::-1]].cumsum()
    med = int(MID[::-1][np.argmax(cum.values >= .5)])
    weekly = d.set_index("date").expected_nights.resample("W-SUN").sum()
    return {
        "destination": destination, "origin": origin, "origin_name": one.origin_name.iloc[0], "from": start, "to": end,
        "guests": round(guests), "nights": round(nights),
        "nights_80pct_range": [round(float(d.nights_p10.sum())), round(float(d.nights_p90.sum()))],
        "nights_last_year_same_period": round(float(d.nights_last_year.sum())),
        "length_of_stay_nights": round(nights / guests, 2) if guests else None,
        "booking_lead_time": {"share_by_class": {k: round(float(v), 3) for k, v in mix.items()},
                              "median_days_ahead": med,
                              "book_by_for_50pct_of_first_arrivals": str((s - pd.Timedelta(days=med)).date()),
                              "grade": "B (Paznaun as proxy, all markets)"},
        "age_profile": (age.iloc[0][[f"age_{b}" for b in BANDS] + ["median_age_band", "share_children_0_14", "grade"]]
                        .to_dict() if len(age) else None),
        "weekly_nights": {str(k.date()): round(float(v)) for k, v in weekly.items()},
        "sources": ["Statistik Austria (CC BY 4.0)", "Nächtigungsprognose / Österreich Werbung (CC BY 4.0)",
                    "OpenHolidays (ODbL)", "TVB Paznaun-Ischgl (TTF 2026 data licence)",
                    "Salzburger Sportwelt guest cards (TTF licence, aggregates)"],
        "grades": {"guests_nights": "A/B (M1 backtest 10 % monthly error)", "daily_distribution": "B (validated push)",
                   "lead_time": "B", "age": "C"},
    }


if __name__ == "__main__":
    lt = m4_output()
    print("M4: lead-time table", lt.shape)
    age, stab = m5_output()
    print("M5: age profiles", age.shape, "| stability (total variation, last season vs earlier):")
    print(stab.round(3).to_string(index=False))
    print(age[age.season_kind == "winter"].sort_values("n_persons", ascending=False).head(8)[
        ["origin_country", "n_persons", "median_age_band", "mean_age_approx", "share_children_0_14"]].round(2).to_string(index=False))
    ex = query("80", "2027-01-15", "2027-03-15")
    (GUI / "example_bavaria.json").write_text(json.dumps(ex, indent=1, ensure_ascii=False, default=str))
    print(json.dumps({k: v for k, v in ex.items() if k not in ("weekly_nights", "sources")}, indent=1, default=str))
