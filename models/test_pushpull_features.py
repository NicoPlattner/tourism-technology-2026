"""PLAN.md §6: push-pull outputs as EXTRA LightGBM features (existing holiday columns kept).

Per training window (no look-ahead): fit PushPull on the history before the origin, then add per day
(a) expected share of guests per market group (push x pull parts, normalised) and (b) the pull factor.
Compare LightGBM and the ensemble with/without these features on winters 24/25 and 25/26 and summer 2026.
"""
import warnings

import numpy as np
import pandas as pd

import real_backtest as rb
from backtest_v2 import gbm
from common import ROOT, peak_mask, rescale_to_month, wmape
from push_pull import PushPull

warnings.filterwarnings("ignore")
f, real, X = rb.f, rb.real, rb.X
SW = f.sample_weight
GROUPS = {"pp_DE": ["DE"], "pp_BENELUX": ["NL", "BE", "LU"], "pp_NORDIC_UK": ["DK", "SE", "GB"],
          "pp_NEIGHBOURS": ["CH", "AT", "IT", "FR"], "pp_EAST": ["PL", "CZ"]}
WINDOWS = {"winter 24/25": ("2024-10-31", "2024-11-04", "2025-04-30"),
           "winter 25/26": ("2025-10-31", "2025-11-01", "2026-04-30"),
           "summer 2026": ("2025-10-31", "2026-05-01", "2026-10-31")}

rows = []
for lab, (o, a, b) in WINDOWS.items():
    idx = f.loc[a:b].index
    idx = idx[real.reindex(idx).notna()]
    h = rb.history(o)
    tr = h.index[(f.loc[h.index, "in_season"] == 1) & h.notna() & (h > 0)]
    tr_all = tr.union(h.index[f.loc[h.index, "month"].isin([6, 7, 8, 9]) & h.notna() & (h > 0)])
    pp = PushPull(f).fit(h[tr], SW[tr].clip(lower=.5))
    total, parts = pp.predict(f.index, by_market=True)
    share = parts.div(parts.sum(axis=1), axis=0)
    extra = pd.DataFrame({g: share[[m for m in ms if m in share]].sum(axis=1) for g, ms in GROUPS.items()})
    extra["pp_pull"] = np.log(total / pp.push_index(f.index))
    variants = {"base": X, "+ market groups": pd.concat([X, extra.drop(columns="pp_pull")], axis=1),
                "+ market groups + pull": pd.concat([X, extra], axis=1)}
    months = pd.DatetimeIndex(sorted(set(idx.to_period("M").to_timestamp())))
    tot = pd.Series(idx.to_period("M").to_timestamp().map(rb.anchor_months(o, months)), index=idx)
    closed = f.loc[idx, "in_season"] == 0
    sc = lambda p: rescale_to_month(p.where(~closed, 0).clip(lower=0).fillna(0) + 1e-9, tot)
    py = sc(rb.py_holiday(h, idx).fillna(0))
    y = real[idx]
    pk = peak_mask(idx, f.loc[idx])
    preds = {}
    for name, Xv in variants.items():
        g = sc(pd.Series(gbm(Xv.loc[tr_all], h[tr_all], SW[tr_all]).predict(Xv.loc[idx]), index=idx))
        preds[name] = g
        ens = (g + py) / 2
        rows.append({"window": lab, "features": name, "lgbm": wmape(y, g), "ensemble": wmape(y, ens),
                     "ensemble peak days": wmape(y[pk], ens[pk]) if pk.any() else np.nan})
    e3 = (py + preds["base"] + preds["+ market groups + pull"]) / 3
    rows.append({"window": lab, "features": "3-member: py + lgbm + lgbm(push-pull)", "lgbm": np.nan,
                 "ensemble": wmape(y, e3), "ensemble peak days": wmape(y[pk], e3[pk]) if pk.any() else np.nan})
res = pd.DataFrame(rows)
res.to_csv(ROOT / "models" / "results_pushpull_features.csv", index=False)
print(res[res.window != "summer 2026"].pivot_table(index="features", columns="window", values=["ensemble", "ensemble peak days"]).round(3).to_string())
