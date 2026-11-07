"""Backtest the DAILY SHAPE of winter demand on open data (Challenge 04).

Target: pseudo_actual (open regional daily index rescaled to Statistik Austria
monthly actuals, see data/build_features.py). All models get the true monthly
totals ("oracle anchor"), so only the distribution of each month over its
days is compared. Level errors are evaluated separately in
probe_open_forecast.py.

Test seasons (Dec-Apr): 2023/24 (train: 2022) and 2024/25 (train: 2022-2024
up to Nov 2024). Plus Nov-Dec 2025 (train: up to Oct 2025).

Models
  flat            month total spread evenly
  py_364          previous year, same weekday (t-364), shape rescaled
  py_holiday      t-364, but Christmas window by date and Easter window by Easter offset
  official        official TR53 daily (in-sample for 2023-2025: fitted on the same index)
  glm             Poisson GLM (log link, light L2) on interpretable calendar/holiday/season/snow features
  lgbm            LightGBM on the same features (challenger)
"""
import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor, Ridge

from common import ROOT, WINTER_MONTHS, design, load, peak_mask, rescale_to_month, wmape

warnings.filterwarnings("ignore")
f = load()
y = f.pseudo_actual
X = design(f)
totals = f.monthly_actual
SCALE, ALPHA = 1000.0, 1e-3

SPLITS = {  # name: (train_end, test_start, test_end)
    "winter 23/24": ("2023-10-31", "2023-11-01", "2024-04-30"),
    "winter 24/25": ("2024-10-31", "2024-11-01", "2025-04-30"),
    "Nov-Dec 2025": ("2025-10-31", "2025-11-01", "2025-12-31"),
}


def py_source(d: pd.Timestamp, holiday_aligned: bool = True) -> pd.Timestamp:
    """The previous-year day that is compared with day d."""
    src = d - pd.Timedelta(days=364)
    if holiday_aligned:
        if (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 6):
            src = d - pd.DateOffset(years=1)
        off = f.at[d, "easter_offset"]
        if -14 <= off <= 14:  # same position relative to Easter last year
            prev = f[(f.index.year == d.year - 1) & (f.easter_offset == off)].index
            if len(prev):
                src = prev[0]
    return src


def py_shape(idx: pd.DatetimeIndex, holiday_aligned: bool) -> pd.Series:
    return pd.Series([y.get(py_source(d, holiday_aligned), np.nan) for d in idx], index=idx)


def delta_model(tr: pd.Index, te: pd.Index) -> pd.Series:
    """Previous year (holiday-aligned) x exp(beta . (x_t - x_py)): explains what changed vs last year."""
    DROP = [c for c in X.columns if c.startswith(("month_", "dow_"))]
    Xd = X.drop(columns=DROP)

    def pairs(idx):
        src = [py_source(d) for d in idx]
        ok = [s in y.index and pd.notna(y.get(s)) and pd.notna(y.get(d)) for d, s in zip(idx, src)]
        idx2 = idx[ok]
        src2 = pd.DatetimeIndex([s for s, k in zip(src, ok) if k])
        return idx2, src2, Xd.loc[idx2].values - Xd.loc[src2].values

    w = tr[(f.loc[tr, "in_season"] == 1)]
    i_tr, s_tr, dx = pairs(w)
    if len(i_tr) < 60:  # not enough year-over-year pairs: fall back to the plain baseline
        return py_shape(te, True).mask(f.loc[te, "in_season"] == 0, 0.0)
    r = np.log1p(y[i_tr].values) - np.log1p(y[s_tr].values)
    m = Ridge(alpha=5.0).fit(dx, np.clip(r, -1.5, 1.5))
    i_te, s_te, dx_te = pairs(te.intersection(f.index[f.index.year >= te.min().year]))
    src_all = pd.DatetimeIndex([py_source(d) for d in te])
    base = pd.Series(y.reindex(src_all).values, index=te)
    out = base.copy()
    adj = pd.Series(np.exp(m.predict(Xd.loc[te].values - Xd.reindex(src_all).fillna(0).values)), index=te)
    DELTA_COEF[te.min()] = pd.Series(m.coef_, index=Xd.columns)
    return (out * adj).mask(f.loc[te, "in_season"] == 0, 0.0)


DELTA_COEF = {}


def _unused(idx: pd.DatetimeIndex, holiday_aligned: bool) -> pd.Series:
    out = pd.Series(index=idx, dtype=float)
    for d in idx:
        src = d - pd.Timedelta(days=364)
        if holiday_aligned:
            if (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 6):
                src = d - pd.DateOffset(years=1)
            off = f.at[d, "easter_offset"]
            if -14 <= off <= 14:  # same position relative to Easter last year
                prev = f[(f.index.year == d.year - 1) & (f.easter_offset == off)].index
                if len(prev):
                    src = prev[0]
        out[d] = y.get(src, np.nan)
    return out


def fit_predict(kind: str, tr: pd.Index, te: pd.Index) -> pd.Series:
    # fit on in-season days only; closed days (before opening / after closing) are predicted as 0
    w = tr[y[tr].notna() & (f.loc[tr, "in_season"] == 1)]
    closed = f.loc[te, "in_season"] == 0
    if kind == "glm":  # Poisson GLM, log link: multiplicative, interpretable, handles zero days
        m = PoissonRegressor(alpha=ALPHA, max_iter=3000).fit(X.loc[w], y[w] / SCALE)
        return pd.Series(m.predict(X.loc[te]) * SCALE, index=te).mask(closed, 0.0)
    m = lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                          min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                          verbose=-1).fit(X.loc[w], y[w])
    return pd.Series(m.predict(X.loc[te]), index=te).mask(closed, 0.0)


rows, preds = [], {}
for name, (tr_end, a, b) in SPLITS.items():
    te = f.loc[a:b].index
    te = te[f.loc[te, "month"].isin(WINTER_MONTHS + [11]) & y[te].notna()]
    tr = f.loc[:tr_end].index
    cand = {
        "flat": pd.Series(1.0, index=te),
        "py_364": py_shape(te, False),
        "py_holiday": py_shape(te, True),
        "official": f.loc[te, "official_daily"],
        "glm": fit_predict("glm", tr, te),
        "lgbm": fit_predict("lgbm", tr, te),
        "py_holiday+delta": delta_model(tr, te),
    }
    cand["ens(py_holiday,lgbm)"] = (rescale_to_month(cand["py_holiday"], totals[te]) +
                                    rescale_to_month(cand["lgbm"], totals[te])) / 2
    pk = peak_mask(te, f.loc[te])
    for k, p in cand.items():
        p = rescale_to_month(p, totals[te]) if p.notna().all() else p
        preds[(name, k)] = p
        rows.append({"split": name, "model": k, "wMAPE all": wmape(y[te], p),
                     "wMAPE peaks": wmape(y[te][pk], p[pk]),
                     "wMAPE Dec-Apr": wmape(y[te][f.loc[te, "month"].isin(WINTER_MONTHS)],
                                            p[f.loc[te, "month"].isin(WINTER_MONTHS)])})
res = pd.DataFrame(rows)
res.to_csv(ROOT / "models" / "results_daily_shape.csv", index=False)
print("Daily shape error (oracle monthly totals), lower is better:")
print(res.pivot(index="model", columns="split", values="wMAPE all").round(3).loc[
    ["flat", "py_364", "py_holiday", "official", "glm", "lgbm", "py_holiday+delta", "ens(py_holiday,lgbm)"]].to_string())
print("\nPeak periods only (Christmas/New Year, Feb half-terms, Easter):")
print(res.pivot(index="model", columns="split", values="wMAPE peaks").round(3).loc[
    ["flat", "py_364", "py_holiday", "official", "glm", "lgbm", "py_holiday+delta", "ens(py_holiday,lgbm)"]].to_string())
