"""M3: distribution of an origin's guests over the days of a month (Tirol).

share_o(t | month) = pull(t) x (1 + gamma_o * school_o(t)) / sum over the month
  pull(t)   Tirol daily pattern: share of each day in its month in the most recent available aligned year (beat 2-3 year averages: 19.3 vs 19.7 / 21.5 %),
            years, aligned by weekday (364-day steps), Christmas window by date and Easter window by Easter offset
            (data/build_tirol_daily.py: 34 Tirol regions, open daily index scaled to official months)
  school_o  population-weighted school-holiday share of origin o (data/build_origin_panel.py)
  gamma_o   holiday response per market from the push-pull fit on Paznaun (models/push_pull.py)

Validation
  pull: predict the daily pattern of 2025 (Tirol) from 2022-2024.
  push: Salzburg mobile data (Hutchison Drei, daily visitors by home country, Feb-Apr 2026): does
        pull x push predict each country's daily distribution better than "same as the total"?
Output: out/gui/m3_daily_share.parquet (origin, date, share of the month, expected nights with M1).
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from dateutil.easter import easter

from common import ROOT

sys.path.insert(0, str(ROOT / "data"))
from build_origin_panel import ORIGIN, school_daily  # noqa: E402

GAMMA = {"DE": 1.3, "NL": 0.9, "BE": 1.7, "CH": 1.0, "AT": 2.0, "DK": 1.6, "GB": 2.4, "PL": 1.1, "CZ": 1.0,
         "SE": 1.3, "FR": 1.5, "LU": 2.2, "IT": 1.0}  # push-pull fit on Paznaun 2024-2026
COVID_TAIL = (pd.Timestamp("2022-01-01"), pd.Timestamp("2022-04-30"))


def source_date(d: pd.Timestamp, k: int) -> pd.Timestamp:
    """The day k years earlier that plays the same role as d."""
    if (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 6):
        try:
            return d.replace(year=d.year - k)
        except ValueError:
            return d.replace(year=d.year - k, day=28)
    e = pd.Timestamp(easter(d.year))
    off = (d - e).days
    if -14 <= off <= 14:
        return pd.Timestamp(easter(d.year - k)) + pd.Timedelta(days=off)
    return d - pd.Timedelta(days=364 * k + 7 * (k // 6))  # keep weekday, stay within ~1 week of the date


def pull_pattern(daily: pd.Series, dates: pd.DatetimeIndex, max_years=1) -> pd.Series:
    """Share of each day in its month from the most recent available aligned years."""
    share = daily / daily.groupby(daily.index.to_period("M")).transform("sum")
    ok = share.dropna()
    ok = ok[~((ok.index >= COVID_TAIL[0]) & (ok.index <= COVID_TAIL[1]))]
    vals = []
    for d in dates:
        got = []
        for k in range(1, 8):
            s = source_date(d, k)
            if s in ok.index:
                got.append(ok[s])
            if len(got) == max_years:
                break
        vals.append(np.mean(got) if got else np.nan)
    p = pd.Series(vals, index=dates)
    p = p.fillna(p.groupby(p.index.to_period("M")).transform("mean"))
    return p / p.groupby(p.index.to_period("M")).transform("sum")


def wmape(a, p):
    return float((a - p).abs().sum() / a.sum())


def validate_pull(tirol: pd.Series):
    test = pd.date_range("2025-01-01", "2025-12-31")
    hist = tirol[tirol.index < "2025-01-01"]
    truth = tirol.loc[test]
    mtot = truth.groupby(truth.index.to_period("M")).transform("sum")
    flat = mtot / test.days_in_month
    p3 = pull_pattern(hist, test, max_years=3) * mtot
    p1 = pull_pattern(hist, test, max_years=1) * mtot
    return {"flat (month / days)": wmape(truth, flat), "last year aligned (M3 pull)": wmape(truth, p1),
            "3 years aligned": wmape(truth, p3)}


def validate_push():
    d = pd.read_csv(ROOT / "data" / "raw" / "other" / "drei_sportwelt_2026" / "part_00.csv", low_memory=False)
    d = d[(d.poi_id == "Salzburger Sportwelt") & d.dest_visit_type.isin(["<=1", "<=2", "<=6", "<=13", ">13"])]
    d["date"] = pd.to_datetime(d.event_date)
    cc = {"Deutschland": "DE", "Niederlande": "NL", "Belgien": "BE", "Dänemark": "DK", "Vereinigtes Königreich": "GB",
          "Schweden": "SE", "Luxemburg": "LU", "Frankreich": "FR"}
    d["cc"] = d.mcc.map(cc)
    win = pd.date_range("2026-02-01", "2026-03-31")
    daily = d.pivot_table(index="date", columns="cc", values="n_visitors", aggfunc="sum").reindex(win).fillna(0)
    total = d.groupby("date").n_visitors.sum().reindex(win)
    rows = []
    for c in daily.columns:
        if daily[c].sum() < 2000:
            continue
        code = {"DE": "80"}.get(c)  # Germany as a whole: use all Länder via the national calendar below
        H = school_daily(c, list(__import__("build_origin_panel").DE_POP) if c == "DE" else None, win).fillna(0)
        truth = daily[c]
        mt = truth.groupby(truth.index.to_period("M")).transform("sum")
        base = total / total.groupby(total.index.to_period("M")).transform("sum") * mt
        push = total * (1 + GAMMA.get(c, 1.0) * H)
        pp = push / push.groupby(push.index.to_period("M")).transform("sum") * mt
        rows.append({"market": c, "same as total": wmape(truth, base), "total x holiday push (M3)": wmape(truth, pp)})
    return pd.DataFrame(rows).set_index("market")


def build_output():
    tirol = pd.read_parquet(ROOT / "data" / "processed" / "tirol_daily.parquet").tirol
    m1 = pd.read_parquet(ROOT / "out" / "gui" / "m1_origin_month.parquet")
    m1 = m1[m1.dest == "W96-7"]  # Tirol (M1 now covers all 9 states)
    dates = pd.date_range(m1.month.min(), m1.month.max() + pd.offsets.MonthEnd(0))
    pull = pull_pattern(tirol, dates)
    out = []
    for o in m1.origin.unique():
        c, subs = ORIGIN[o]
        H = school_daily(c, subs, dates).fillna(0)
        w = pull * (1 + GAMMA.get(c, 1.0) * H)
        share = w / w.groupby(w.index.to_period("M")).transform("sum")
        mon = m1[m1.origin == o].set_index("month").nights
        nights = share * pd.Series(dates.to_period("M").to_timestamp().map(mon), index=dates)
        out.append(pd.DataFrame({"origin": o, "date": dates, "share_of_month": share.values,
                                 "expected_nights": nights.values, "school_holiday_share": H.values}))
    res = pd.concat(out)
    res["destination"] = "Tirol"
    res.to_parquet(ROOT / "out" / "gui" / "m3_daily_share.parquet")
    return res


if __name__ == "__main__":
    tirol = pd.read_parquet(ROOT / "data" / "processed" / "tirol_daily.parquet").tirol
    print("Pull: daily pattern of Tirol 2025 predicted from 2022-2024 (daily error, month totals given):")
    print({k: round(v, 3) for k, v in validate_pull(tirol).items()})
    print("\nPush: daily distribution per home country, Salzburger Sportwelt mobile data, Feb-Mar 2026:")
    print(validate_push().round(3).to_string())
    res = build_output()
    b = res[(res.origin == "80") & (res.date >= "2027-02-08") & (res.date <= "2027-02-21")]
    print("\nBavaria, 8-21 Feb 2027 (expected nights per day, school holiday share):")
    print(b[["date", "expected_nights", "school_holiday_share"]].round(2).to_string(index=False))
