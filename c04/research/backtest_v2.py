"""Model comparison v2 on real TVB actuals: push-pull model, push-index LightGBM, sample weights, ensembles.
All daily predictions are rescaled to the same ex-ante monthly anchor, so the comparison is about the daily
pattern (+ the shared level). Origins 31 Oct 2024 (winter 24/25, real actuals from 4 Nov 2024) and 31 Oct 2025.
"""
import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd

import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "models"))  # production models
import real_backtest as rb
from common import ROOT, peak_mask, rescale_to_month, wmape
from push_pull import PushPull

warnings.filterwarnings("ignore")
f, real, X = rb.f, rb.real, rb.X
SW = f.sample_weight
WINDOWS = {"winter 24/25": ("2024-10-31", "2024-11-04", "2025-04-30"),
           "winter 25/26": ("2025-10-31", "2025-11-01", "2026-04-30")}


def gbm(Xtr, ytr, w=None):
    return lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                             min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                             random_state=0, verbose=-1).fit(Xtr, ytr, sample_weight=w)


def run(origin, start, end):
    idx = f.loc[start:end].index
    idx = idx[real.reindex(idx).notna()]
    h = rb.history(origin)
    tr = h.index[(f.loc[h.index, "in_season"] == 1) & h.notna() & (h > 0)]
    months = pd.DatetimeIndex(sorted(set(idx.to_period("M").to_timestamp())))
    tot = pd.Series(idx.to_period("M").to_timestamp().map(rb.anchor_months(origin, months)), index=idx)
    closed = f.loc[idx, "in_season"] == 0
    sc = lambda p: rescale_to_month(p.where(~closed, 0).clip(lower=0).fillna(0) + 1e-9, tot)
    out = {}
    out["py_holiday"] = sc(rb.py_holiday(h, idx).fillna(0))
    out["lgbm"] = sc(pd.Series(gbm(X.loc[tr], h[tr]).predict(X.loc[idx]), index=idx))
    out["lgbm (weighted)"] = sc(pd.Series(gbm(X.loc[tr], h[tr], SW[tr]).predict(X.loc[idx]), index=idx))
    pp = PushPull(f).fit(h[tr], SW[tr].clip(lower=.5))
    out["push-pull"] = sc(pp.predict(idx))
    # compact LightGBM: pull features + one push index instead of 20+ holiday columns
    Xc = pp.pull_matrix(f.index).copy()
    Xc["push_index"] = pp.push_index(f.index)
    out["lgbm (pull + push index)"] = sc(pd.Series(gbm(Xc.loc[tr], h[tr], SW[tr]).predict(Xc.loc[idx]), index=idx))
    out["ens (py_holiday, lgbm)"] = (out["py_holiday"] + out["lgbm"]) / 2
    out["ens (py_holiday, lgbm, push-pull)"] = (out["py_holiday"] + out["lgbm"] + out["push-pull"]) / 3
    out["ens (py_holiday, compact lgbm, push-pull)"] = (out["py_holiday"] + out["lgbm (pull + push index)"] +
                                                       out["push-pull"]) / 3
    return idx, out, pp


if __name__ == "__main__":
    rows, fits = [], {}
    for lab, (o, a, b) in WINDOWS.items():
        idx, out, pp = run(o, a, b)
        fits[lab] = pp
        y = real[idx]
        pk = peak_mask(idx, f.loc[idx])
        win = f.loc[idx, "month"].isin([12, 1, 2, 3, 4])
        for k, p in out.items():
            rows.append({"window": lab, "model": k, "daily wMAPE": wmape(y, p), "peak days": wmape(y[pk], p[pk]),
                         "Dec-Apr": wmape(y[win], p[win])})
    res = pd.DataFrame(rows)
    res.to_csv(ROOT / "evaluation" / "backtest_v2.csv", index=False)
    print(res.pivot_table(index="model", columns="window", values=["daily wMAPE", "peak days"]).round(3).to_string())
    pp = fits["winter 25/26"]
    print("\nFitted holiday response gamma_m (prior from mobile data in brackets):")
    from push_pull import GAMMA0
    print({m: f"{g:.1f} ({GAMMA0[m]:.1f})" for m, g in pp.gamma.round(1).items()}, " lambda (long weekend):", round(pp.lam, 2))
    print("Pull effects (exp(beta), x per day):", np.exp(pp.beta[[c for c in pp.beta.index if not c.startswith("month")]]).round(2).to_dict())
