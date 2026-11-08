"""Export package for the front-end team and the data API: results/gui/ (tracked in git).

Run after the pipeline (README.md "Run everything", then models/m1_origin.py, m4_leadtime.py, m3_daily.py,
gui_outputs.py, gui_api.py). Files:
  monthly_origin.csv            destination x origin x month: guests, nights, 80 % range, length of stay, flags
  daily_share.csv               origin x date: share of the month's nights on that day (multiply with monthly_origin)
  lead_time_by_arrival_month.csv  share of bookings by days ahead, median days ahead, per arrival month
  lead_time_by_market_indicative.csv
  age_profile.csv               origin country x season kind: age bands (+ "ALL" fallback)
  origins.csv, destinations.csv lookup lists
  examples/*.json               query() answers
  README.md                     schema, how to combine, grades, sources, licences
"""
import json
import shutil
import sys

import numpy as np
import pandas as pd

from common import ROOT
from gui_api import GUI, origin_calendar, query
from m3_daily import GAMMA, pull_pattern

sys.path.insert(0, str(ROOT / "data"))
from build_origin_panel import school_daily  # noqa: E402

OUT = ROOT / "results" / "gui"  # tracked in git: used by the front end and the data API


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "examples").mkdir(parents=True)
    t = pd.read_parquet(GUI / "complete_origin_month.parquet")
    mon = t.assign(month=t.month.dt.strftime("%Y-%m"))[
        ["destination", "dest", "origin", "origin_name", "month", "arrivals", "nights", "nights_p10", "nights_p90",
         "length_of_stay", "is_estimate", "method", "grade"]].rename(columns={"arrivals": "guests", "dest": "destination_code",
                                                                              "origin": "origin_code"})
    for c in ("guests", "nights", "nights_p10", "nights_p90"):
        mon[c] = mon[c].round().astype("Int64")
    # 0 guests in a month: length of stay = the pair's typical value (median over its months)
    typ = mon.groupby(["destination", "origin_code"]).length_of_stay.transform("median")
    mon["length_of_stay"] = mon.length_of_stay.fillna(typ).fillna(mon.length_of_stay.median()).round(2)
    mon["origin_name"] = mon.origin_name.fillna("").replace("", np.nan).fillna("Other (code " + mon.origin_code + ")")
    mon.to_csv(OUT / "monthly_origin.csv", index=False)

    tir = pd.read_parquet(ROOT / "data" / "processed" / "tirol_daily.parquet").tirol
    dates = pd.date_range("2024-01-01", "2027-12-31")
    pull = pull_pattern(tir, dates)
    rows = []
    for o, name in t[["origin", "origin_name"]].drop_duplicates().itertuples(index=False):
        c, subs = origin_calendar(o)
        H = school_daily(c, subs, dates) if c else pd.Series(np.nan, index=dates)
        ok = H.notna()
        w = pull * (1 + GAMMA.get(c, 1.0) * H.fillna(0))
        share = w / w.groupby(w.index.to_period("M")).transform("sum")
        rows.append(pd.DataFrame({"origin_code": o, "date": dates.strftime("%Y-%m-%d"), "share_of_month": share.round(6).values,
                                  "school_holiday_share": H.round(3).values,
                                  "is_estimate": ~ok.values,
                                  "method": np.where(ok, "Tirol daily pattern x origin school-holiday push",
                                                     "Tirol daily pattern only (no school calendar)"),
                                  "grade": np.where(ok, "B", "C")}))
    pd.concat(rows).to_csv(OUT / "daily_share.csv", index=False)

    lt = pd.read_parquet(GUI / "m4_leadtime.parquet")
    lt.to_csv(OUT / "lead_time_by_arrival_month.csv", index=False)
    lm = pd.read_parquet(GUI / "m4_leadtime_by_market_indicative.parquet")
    lm.rename_axis("market_group").reset_index().round(4).to_csv(OUT / "lead_time_by_market_indicative.csv", index=False)

    age = pd.read_parquet(GUI / "m5_age.parquet")
    cols = [c for c in age if c.startswith("age_")]
    allp = age.groupby("season_kind").apply(lambda g: g[cols].mul(g.n_persons, axis=0).sum() / g.n_persons.sum()).reset_index()
    allp["origin_country"], allp["grade"], allp["n_persons"] = "ALL", "D (fallback for origins without data)", np.nan
    pd.concat([age, allp], ignore_index=True).round(4).to_csv(OUT / "age_profile.csv", index=False)

    org = t[["origin", "origin_name"]].drop_duplicates().rename(columns={"origin": "origin_code"})
    org["origin_name"] = org.origin_name.fillna("").replace("", np.nan).fillna("Other (code " + org.origin_code + ")")
    org["calendar_country"] = [origin_calendar(o)[0] for o in org.origin_code]
    org["kind"] = np.where(org.origin_code.str.startswith("DE-"), "German state (estimate: region split by population)",
                           np.where(org.origin_code.isin(["DE", "AT"]), "country total (sum of regions/states)", "Statistik Austria origin"))
    org.sort_values("origin_name").to_csv(OUT / "origins.csv", index=False)
    t[["dest", "destination"]].drop_duplicates().rename(columns={"dest": "destination_code"}).to_csv(OUT / "destinations.csv", index=False)

    for dest, o, a, b in (("Tirol", "80", "2027-01-15", "2027-03-15"), ("Tirol", "DE-HE", "2027-02-01", "2027-02-28"),
                          ("Paznaun-Ischgl", "25", "2027-02-01", "2027-03-07"), ("Salzburg", "DE", "2027-01-01", "2027-01-31")):
        q = query(dest, o, a, b)
        (OUT / "examples" / f"{dest}_{o}_{a}_{b}.json").write_text(json.dumps(q, indent=1, ensure_ascii=False, default=str))
    from export_reasons import main as reasons
    reasons(OUT)
    shutil.copy(ROOT / "docs" / "challenge-04" / "GUI-EXPORT-README.md", OUT / "README.md")
    zp = OUT
    for f in sorted(OUT.rglob("*")):
        if f.is_file():
            print(f"{f.relative_to(OUT)}: {f.stat().st_size / 1e6:.2f} MB")
    print("->", zp)


if __name__ == "__main__":
    main()
