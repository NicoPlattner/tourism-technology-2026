"""M1 (guests and nights per origin and month, Tirol) and M2 (length of stay).

Global LightGBM across all origins, target = log change vs the same month in the most recent non-COVID year
(log(y) - log(lag1)), so origins of very different size share one model. Features: month, origin, lags 1-3,
recent growth of the origin, origin holiday calendar (school days this month and last year, public holidays on
weekdays, long weekends, bridge days), Easter / Carnival / Pentecost days. 12-month forecast from each 31 Oct.

Baselines: last year (lag1), mean of the last two years, last year x the origin's growth of the last 12 months.
Combination: mean of LightGBM and 2-year mean (chosen on the pre-COVID backtest, tested post-COVID).
Intervals: split conformal on log errors by horizon (months ahead), calibrated pre-COVID, tested post-COVID.
M2: length of stay. The 2-year ratio (4.9 % error) beats dividing the two forecasts (5.6 %); arrivals are set
to the mean of the direct forecast and nights / 2-year length of stay (10.2 % vs 10.5 %), and length of stay
= nights / arrivals, so the three outputs are consistent.

    python3 c04/models/m1_origin.py   -> evaluation/m1.csv, out/gui/m1_origin_month.parquet, m2_los.parquet
"""
from __future__ import annotations

import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd

from common import ROOT

warnings.filterwarnings("ignore")
P = pd.read_parquet(ROOT / "data" / "processed" / "origin_panel.parquet")
P["origin_cat"] = P.origin.astype("category")
P["dest_cat"] = P.dest.astype("category")
TIROL = P.dest == "W96-7"
POOLED = True  # train on all 9 Austrian states (destination as a feature); evaluation and SIZE on Tirol
HOL = ["school_days", "school_days_ly", "school_delta", "pub_weekdays", "longwe_days", "bridge_days",
       "easter_days", "carnival_days", "pentecost_days", "ascension_days", "weekend_days", "days_in_month"]
P["school_delta"] = P.school_days - P.school_days_ly
CUTOFFS_PRE = [2012, 2013, 2014, 2015, 2016, 2017, 2018]  # 31 Oct of these years
CUTOFFS_POST = [2022, 2023, 2024, 2025]


def features(v: str, holidays: bool = True) -> pd.DataFrame:
    X = pd.DataFrame(index=P.index)
    X["origin_cat"] = P.origin_cat
    X["dest_cat"] = P.dest_cat
    X["month"] = P.month_of_year
    for k in (1, 2, 3):
        X[f"log_lag{k}"] = np.log1p(P[f"lag{k}_{v}"])
    X["g12"] = X.log_lag1 - X.log_lag2
    X["g23"] = X.log_lag2 - X.log_lag3
    X["year"] = P.year
    if holidays:
        for c in HOL:
            X[c] = P[c]
    return X


def model():
    return lgb.LGBMRegressor(n_estimators=600, learning_rate=.03, num_leaves=31, min_child_samples=20,
                             subsample=.8, subsample_freq=1, colsample_bytree=.8, reg_lambda=1.0,
                             random_state=0, verbose=-1)


def forecast(v: str, cutoff_year: int, holidays: bool = True, pooled: bool | None = None) -> pd.DataFrame:
    pooled = POOLED if pooled is None else pooled
    cut = pd.Timestamp(f"{cutoff_year}-10-01")
    X = features(v, holidays)
    y = np.log1p(P[v]) - X.log_lag1
    train = (P.month <= cut) & (P.covid == 0) & y.notna() & X.log_lag1.notna() & (P[v] > 0)
    if not pooled:
        train &= TIROL
    test = (P.month > cut) & (P.month <= cut + pd.DateOffset(months=12)) & X.log_lag1.notna() & TIROL
    m = model().fit(X[train], y[train])
    out = P.loc[test, ["month", "origin", "origin_name", v, f"lag1_{v}", f"lag2_{v}", f"lag3_{v}"]].copy()
    out["h"] = (out.month.dt.year - cut.year) * 12 + out.month.dt.month - cut.month
    out["lgbm"] = np.expm1(X.loc[test, "log_lag1"] + m.predict(X[test]))
    out["last_year"] = out[f"lag1_{v}"]
    out["avg2"] = out[[f"lag1_{v}", f"lag2_{v}"]].mean(axis=1)
    g = P[(P.month > cut - pd.DateOffset(months=12)) & (P.month <= cut)].groupby("origin")
    growth = (g[v].sum() / g[f"lag1_{v}"].sum()).clip(.5, 2)
    out["last_year_x_growth"] = out.last_year * out.origin.map(growth)
    out["combo"] = (out.lgbm + out.avg2) / 2
    out["cutoff"] = cutoff_year
    return out.rename(columns={v: "actual"})


def wmape(a, p):
    m = a.notna() & p.notna()
    return float((a[m] - p[m]).abs().sum() / a[m].sum())


def evaluate(fc: pd.DataFrame, models) -> pd.DataFrame:
    rows = []
    for (period, cut), g in fc.groupby(["period", "cutoff"]):
        tot = g.groupby("month")[["actual"] + models].sum()  # Tirol total over origins
        for mdl in models:
            per = g.groupby("origin").apply(lambda x: wmape(x.actual, x[mdl]))
            rows.append({"period": period, "cutoff": cut, "model": mdl,
                         "all origins (wMAPE)": wmape(g.actual, g[mdl]),
                         "median origin": per.median(),
                         "top 10 origins": wmape(g[g.origin.isin(TOP10)].actual, g[g.origin.isin(TOP10)][mdl]),
                         "Tirol total by month": wmape(tot.actual, tot[mdl]),
                         "winter months": wmape(g[g.month.dt.month.isin([12, 1, 2, 3, 4])].actual,
                                                g[g.month.dt.month.isin([12, 1, 2, 3, 4])][mdl])})
    return pd.DataFrame(rows)


TOP10 = P[TIROL & (P.month >= "2023-11-01") & (P.month <= "2025-10-01")].groupby("origin").nights.sum().nlargest(10).index

if __name__ == "__main__":
    MODELS = ["last_year", "avg2", "last_year_x_growth", "lgbm", "lgbm_no_hol", "lgbm_tirol_only", "combo"]
    res, store = [], {}
    for v in ("nights", "arrivals"):
        fcs = []
        for period, cuts in (("pre-COVID 2012-2019", CUTOFFS_PRE), ("post-COVID 2022-2026", CUTOFFS_POST)):
            for c in cuts:
                f = forecast(v, c)
                f["lgbm_no_hol"] = forecast(v, c, holidays=False).lgbm.values
                f["lgbm_tirol_only"] = forecast(v, c, pooled=False).lgbm.values
                f["period"] = period
                fcs.append(f)
        fc = pd.concat(fcs)
        store[v] = fc
        r = evaluate(fc, MODELS).assign(target=v)
        res.append(r)
        print(f"\n=== {v}: mean over cutoffs ===")
        print(r.groupby(["period", "model"])[["all origins (wMAPE)", "median origin", "top 10 origins",
                                              "Tirol total by month", "winter months"]].mean().round(3).to_string())
    res = pd.concat(res)
    res.to_csv(ROOT / "evaluation" / "m1.csv", index=False)
    pd.to_pickle(store, ROOT / "data" / "processed" / "m1_backtest.pkl")


# ------------------------------------------------------------------ selection, intervals, M2, production
BIG = 500_000  # nights per year: size class for the interval widths


def conformal(fc: pd.DataFrame, level=.8) -> pd.DataFrame:
    """Half-width of absolute log errors per horizon (months ahead) and size class."""
    e = np.log(fc.actual / fc.final).replace([np.inf, -np.inf], np.nan)
    df = fc.assign(err=e.abs(), big=fc.size_ >= BIG).dropna(subset=["err"])
    return df.groupby(["h", "big"]).err.quantile(level).unstack()


def sizes() -> pd.Series:
    r = P[(P.month >= "2023-11-01") & (P.month <= "2025-10-01")]
    return r.groupby(["dest", "origin"]).nights.sum() / 2


def run_final():
    size = sizes()
    store = pd.read_pickle(ROOT / "data" / "processed" / "m1_backtest.pkl")
    summary, LEVEL = [], {}
    for v, fc in store.items():
        fc["final"] = fc.lgbm  # pooled LightGBM everywhere (beats the mix also for small origins)
        fc["size_"] = [size.get(("W96-7", o), 0) for o in fc.origin]
        pre, post = fc[fc.period.str.startswith("pre")], fc[fc.period.str.startswith("post")]
        for level in (.8, .85, .9):
            q = conformal(pre, level)
            hw = post.apply(lambda r: q.loc[r.h, r.size_ >= BIG], axis=1)
            cov = float((np.log(post.actual / post.final).abs() <= hw)[post.actual > 0].mean())
            summary.append({"target": v, "quantile used": level, "post-COVID coverage of the '80 %' band": cov})
            if cov >= .8 and v not in LEVEL:
                LEVEL[v] = level
        LEVEL.setdefault(v, .9)
        store[v] = fc
    print(pd.DataFrame(summary).round(3).to_string(index=False), "\nchosen quantile:", LEVEL)
    n, a = store["nights"], store["arrivals"]
    m = n.merge(a, on=["month", "origin", "cutoff", "period"], suffixes=("_n", "_a"))
    m = m[(m.actual_a > 0) & m.period.str.startswith("post")]
    los_true = m.actual_n / m.actual_a
    print("M2 length of stay post-COVID, median abs. % error: forecast ratio",
          round(float(((m.final_n / m.final_a) - los_true).abs().div(los_true).median()), 3),
          "| 2-year ratio", round(float(((m.avg2_n / m.avg2_a) - los_true).abs().div(los_true).median()), 3))
    # production: cutoff = last observed month, 12 months ahead, every destination state
    last = P[P.nights.notna()].month.max()
    prod = {}
    for v in ("nights", "arrivals"):
        X = features(v)
        y = np.log1p(P[v]) - X.log_lag1
        train = (P.month <= last) & (P.covid == 0) & y.notna() & X.log_lag1.notna() & (P[v] > 0)
        test = (P.month > last) & (P.month <= last + pd.DateOffset(months=12)) & X.log_lag1.notna()
        mdl = model().fit(X[train], y[train])
        out = P.loc[test, ["month", "dest", "dest_name", "origin", "origin_name", f"lag1_{v}", f"lag2_{v}"]].copy()
        out["final"] = np.expm1(X.loc[test, "log_lag1"] + mdl.predict(X[test]))
        out["h"] = (out.month.dt.year - last.year) * 12 + out.month.dt.month - last.month
        q = conformal(store[v], LEVEL[v])
        big = np.array([size.get((d, o), 0) >= BIG for d, o in zip(out.dest, out.origin)])
        hw = np.array([q.loc[min(h, q.index.max()), b] for h, b in zip(out.h, big)])
        out[v], out[f"{v}_p10"], out[f"{v}_p90"] = out.final, out.final * np.exp(-hw), out.final * np.exp(hw)
        out[f"{v}_last_year"] = out[f"lag1_{v}"]
        prod[v] = out[["month", "dest", "dest_name", "origin", "origin_name", v, f"{v}_p10", f"{v}_p90",
                       f"{v}_last_year", f"lag1_{v}", f"lag2_{v}"]]
    keys = ["month", "dest", "dest_name", "origin", "origin_name"]
    g = prod["nights"].merge(prod["arrivals"], on=keys)
    # arrivals = mean of the direct forecast and nights / 2-year length of stay (backtest 10.2 % vs 10.5 %)
    los2 = (g.lag1_nights + g.lag2_nights) / (g.lag1_arrivals + g.lag2_arrivals)
    adj = (((g.arrivals + g.nights / los2) / 2) / g.arrivals).fillna(1)
    for c in ("arrivals", "arrivals_p10", "arrivals_p90"):
        g[c] = g[c] * adj
    g["length_of_stay"] = g.nights / g.arrivals
    g = g.drop(columns=["lag1_nights", "lag2_nights", "lag1_arrivals", "lag2_arrivals"])
    g["destination"] = g.dest_name
    g["method"], g["is_estimate"], g["grade"] = "M1 pooled LightGBM", False, np.where(big, "A", "B")
    g["source"] = "Statistik Austria (CC BY 4.0), model M1/M2 c04-data-models"
    gui = ROOT / "out" / "gui"
    gui.mkdir(parents=True, exist_ok=True)
    g.to_parquet(gui / "m1_origin_month.parquet")
    g[["destination", "month", "origin", "origin_name", "length_of_stay"]].to_parquet(gui / "m2_los.parquet")
    b = g[(g.origin == "80") & (g.dest == "W96-7")].set_index("month")[
        ["arrivals", "nights", "nights_p10", "nights_p90", "nights_last_year", "length_of_stay"]]
    print(f"\nProduction forecast from {last.date()}: {g.month.min().date()}..{g.month.max().date()}, "
          f"{g.dest.nunique()} destinations, {len(g.groupby(['dest', 'origin']))} destination-origin pairs")
    print("Bavaria -> Tirol:"); print(b.round(1).to_string())


if __name__ == "__main__":
    run_final()
