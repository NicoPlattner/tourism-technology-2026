"""Zero-shot Chronos-2 (amazon/chronos-2, Apache-2.0) vs the baselines in
probe_open_forecast.py on TR53 monthly actuals. Same origins, horizons and
metric (median APE, winter months Dec-Apr).

Needs: pip install torch chronos-forecasting (CPU is enough).
"""
import json
import pathlib

import numpy as np
import pandas as pd
import torch
from chronos import BaseChronosPipeline

RAW = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw" / "open"
df = pd.DataFrame(json.loads((RAW / "TR53_month.json").read_text()))
y = df.assign(date=pd.to_datetime(df.date)).set_index("date").stays.sort_index()[:"2026-08"].asfreq("MS")

pipe = BaseChronosPipeline.from_pretrained("amazon/chronos-2", device_map="cpu", torch_dtype=torch.float32)


def easter_month_feats(idx: pd.DatetimeIndex) -> np.ndarray:
    from dateutil.easter import easter
    e = np.array([easter(d.year) for d in idx])
    return np.array([[d.month == ed.month for d, ed in zip(idx, e)]], dtype=float)[0]


rows = []
origins = pd.date_range("2023-10-01", "2025-08-01", freq="MS")
for variant in ("univariate", "with_easter_covariate"):
    for o in origins:
        ctx = y["2010-01":o].copy()
        cov = pd.Series(np.log1p(ctx.values), index=ctx.index)  # log scale context
        fut_idx = pd.date_range(o + pd.DateOffset(months=1), periods=12, freq="MS")
        tgt = y.reindex(fut_idx).dropna()
        ctx_df = pd.DataFrame({"id": "TR53", "timestamp": ctx.index, "target": cov.values})
        fut_df = None
        if variant == "with_easter_covariate":
            ctx_df["easter"] = easter_month_feats(ctx.index)
            ctx_df["covid"] = ((ctx.index >= "2020-03-01") & (ctx.index <= "2022-02-01")).astype(float)
            fut_df = pd.DataFrame({"id": "TR53", "timestamp": fut_idx,
                                   "easter": easter_month_feats(fut_idx), "covid": 0.0})
        p = pipe.predict_df(ctx_df, future_df=fut_df, prediction_length=12, quantile_levels=[0.1, 0.5, 0.9],
                            id_column="id", timestamp_column="timestamp", target="target")
        med = np.expm1(p.set_index("timestamp")["0.5"])
        for k, (dt, a) in enumerate(tgt.items()):
            rows.append((variant, k + 1, dt.month, a, med[dt]))
r = pd.DataFrame(rows, columns=["model", "h", "month", "actual", "pred"])
r["ape"] = (r.pred - r.actual).abs() / r.actual
r = r[r.month.isin([12, 1, 2, 3, 4])]
r["horizon"] = pd.cut(r.h, [0, 3, 6, 12], labels=["h1-3", "h4-6", "h7-12"])
print("Chronos-2 zero-shot, median APE, winter months Dec-Apr:")
print(r.groupby(["model", "horizon"], observed=True).ape.median().unstack().round(3))
