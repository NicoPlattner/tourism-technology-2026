"""Probe the official TR53 forecast and monthly baselines (open data only).

Reads data/raw/open/TR53_{month,day}.json (run data/fetch_open_data.py first).
Prints: (1) audit of the official daily forecast (zero days, bed-cap breaches),
(2) rolling-origin backtest of simple monthly baselines, (3) Easter effect on
the March/April split. Results are recorded in docs/challenge-04/RESEARCH.md.
"""
import json
import pathlib
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")
RAW = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw" / "open"
BEDS_TR53 = 22078  # Nächtigungsprognose repo, data/bettenkapazität.csv (R54 Paznaun - Ischgl)
LAST_ACTUAL = "2026-08"  # monthly values after this are forecasts (non-integer)


def load(freq: str) -> pd.Series:
    df = pd.DataFrame(json.loads((RAW / f"TR53_{freq}.json").read_text()))
    return df.assign(date=pd.to_datetime(df.date)).set_index("date").stays.sort_index()


def audit_daily(d: pd.Series) -> None:
    print("Zero days in official daily series:", [str(x.date()) for x in d[d < 1].index])
    w = d["2026-11-01":"2027-04-30"]
    print(f"Winter 26/27 forecast days >= 90% of {BEDS_TR53} beds: {(w >= .9 * BEDS_TR53).sum()},"
          f" > 100%: {(w > BEDS_TR53).sum()}, max {w.max():.0f} on {w.idxmax().date()}")


def backtest(y: pd.Series) -> None:
    act = y[:LAST_ACTUAL].asfreq("MS")
    off = lambda k: pd.DateOffset(months=k)

    def snaive(tr, h):
        return np.array([tr[tr.index[-1] + off(k) - pd.DateOffset(years=1)] for k in range(1, h + 1)])

    def avg2y(tr, h):
        return np.array([np.mean([tr[tr.index[-1] + off(k) - pd.DateOffset(years=j)] for j in (1, 2)])
                         for k in range(1, h + 1)])

    def snaive_yoy(tr, h):
        return snaive(tr, h) * tr[-12:].sum() / tr[-24:-12].sum()

    def ets_log(tr, h):
        t = tr["2012-01":].copy()
        for dt in pd.date_range("2020-03-01", "2022-02-01", freq="MS"):  # patch COVID gap with 2019
            if dt in t.index:
                t[dt] = y[dt.replace(year=2019)]  # no look-ahead
        f = ExponentialSmoothing(np.log1p(t), seasonal="add", seasonal_periods=12,
                                 initialization_method="estimated").fit()
        return np.expm1(f.forecast(h).values)

    rows = []
    for o in pd.date_range("2023-10-01", "2025-08-01", freq="MS"):
        tgt = act[o + off(1):o + off(12)]
        for name, fn in [("snaive", snaive), ("avg2y", avg2y), ("snaive_x_yoy", snaive_yoy), ("ets_log", ets_log)]:
            if name == "avg2y" and o < pd.Timestamp("2024-01-01"):
                continue  # needs two post-COVID years
            p = fn(act[:o], 12)
            rows += [(name, k + 1, dt.month, a, p[k]) for k, (dt, a) in enumerate(tgt.items())]
    r = pd.DataFrame(rows, columns=["model", "h", "month", "actual", "pred"])
    r["ape"] = (r.pred - r.actual).abs() / r.actual
    r = r[r.month.isin([12, 1, 2, 3, 4])]
    r["horizon"] = pd.cut(r.h, [0, 3, 6, 12], labels=["h1-3", "h4-6", "h7-12"])
    print("\nMedian APE, winter months Dec-Apr, origins 2023-10..2025-08:")
    print(r.groupby(["model", "horizon"], observed=True).ape.median().unstack().round(3))


def easter(y: pd.Series) -> None:
    from dateutil.easter import easter as edate
    print("\nApril share of Mar+Apr stays vs Easter Sunday:")
    for yr in [2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025, 2026, 2027]:
        mar, apr = y[f"{yr}-03"].sum(), y[f"{yr}-04"].sum()
        tag = " (official forecast)" if yr == 2027 else ""
        print(f"  {yr}  Easter {edate(yr)}  share {apr / (mar + apr):.2f}{tag}")


if __name__ == "__main__":
    m, d = load("month"), load("day")
    audit_daily(d)
    backtest(m)
    easter(m)
