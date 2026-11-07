"""Reliability layer: split-conformal intervals for daily predictions.

Calibrate on winter 23/24 residuals, test coverage on winter 24/25
(and the reverse direction as a sanity check). Residual = log(actual / prediction)
on in-season days; intervals are multiplicative, per horizon-free bucket
(peak vs normal days), so they widen where the backtest showed larger errors.
"""
import numpy as np
import pandas as pd

from common import ROOT, WINTER_MONTHS, peak_mask
from daily_shape_backtest import f, predict_split, y

MODELS = ["py_holiday", "lgbm", "ens(py_holiday,lgbm)", "official"]
LEVEL = 0.8


def log_resid(te, p):
    m = (f.loc[te, "in_season"] == 1) & f.loc[te, "month"].isin(WINTER_MONTHS) & (p > 0) & (y[te] > 0)
    idx = te[m.values]
    return pd.Series(np.log(y[idx] / p[idx]), index=idx)


def conformal(cal: pd.Series, test_idx, level=LEVEL):
    """Per bucket (peak / normal): symmetric quantile of |log residual| with finite-sample correction."""
    q = {}
    pk = peak_mask(cal.index, f.loc[cal.index])
    for bucket, r in (("peak", cal[pk]), ("normal", cal[~pk])):
        n = len(r)
        k = min(1.0, np.ceil((n + 1) * level) / n)
        q[bucket] = float(np.quantile(np.abs(r), k))
    tpk = peak_mask(test_idx, f.loc[test_idx])
    return pd.Series(np.where(tpk, q["peak"], q["normal"]), index=test_idx), q


rows = []
splits = {"winter 23/24": predict_split("winter 23/24"), "winter 24/25": predict_split("winter 24/25")}
for cal_name, test_name in (("winter 23/24", "winter 24/25"), ("winter 24/25", "winter 23/24")):
    te_c, cand_c = splits[cal_name]
    te_t, cand_t = splits[test_name]
    for mdl in MODELS:
        cal = log_resid(te_c, cand_c[mdl])
        test = log_resid(te_t, cand_t[mdl])
        width, q = conformal(cal, test.index)
        cover = float((test.abs() <= width).mean())
        rows.append({"calibrate on": cal_name, "test on": test_name, "model": mdl, "target": LEVEL,
                     "coverage": round(cover, 3), "half-width normal": f"x/÷{np.exp(q['normal']):.2f}",
                     "half-width peak": f"x/÷{np.exp(q['peak']):.2f}"})
res = pd.DataFrame(rows)
res.to_csv(ROOT / "models" / "results_conformal.csv", index=False)
print(f"Split-conformal {int(LEVEL * 100)} % intervals on daily stays (multiplicative):")
print(res.to_string(index=False))
