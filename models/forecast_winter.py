"""Forecast winter 2026/27 daily stays and export JSON for the UI.

    python3 models/forecast_winter.py            # open-data mode (TR53 region level)
    (partner mode is used automatically when data/raw/partner/ has the overnight file)

Pipeline: monthly anchor (anchor.py) x daily shape (LightGBM on the open daily
index; averaged with the holiday-aligned previous year when partner actuals for
2025/26 exist) -> rescale to the anchor -> conformal 80 % band -> utilisation
and flags. Output: out/c04_forecast.json (git-ignored; partner-derived when in
partner mode).
"""
import datetime as dt
import json
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd

from anchor import anchor
from common import ROOT, design, load, peak_mask, rescale_to_month

sys.path.insert(0, str(ROOT / "data"))
OUT = ROOT / "out"
START, END = "2026-11-01", "2027-04-30"
# 80 % multiplicative half-widths from results_conformal.csv (calibrated on 23/24, tested on 24/25)
CONF = {"normal": 1.35, "peak": 1.29}


def partner_actuals():
    try:
        from load_partner import load_overnights
        t = load_overnights(verbose=False)
        tot = t[t.muni == "total"] if (t.muni == "total").any() else t.groupby("date", as_index=False)[["py", "fc", "act"]].sum(min_count=1)
        return tot.set_index("date").sort_index()
    except FileNotFoundError:
        return None


def main():
    f = load()
    X = design(f)
    partner = partner_actuals()
    mode = "partner" if partner is not None else "open"
    hist = f.pseudo_actual.copy()
    if partner is not None:  # partner actuals extend / replace history (scaled to region level by monthly ratio)
        hist = hist.combine_first(partner.act.reindex(f.index))
    w = f.index[(f.in_season == 1) & hist.notna()]
    gbm = lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                            min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                            random_state=0, verbose=-1).fit(X.loc[w], hist[w])
    idx = f.loc[START:END].index
    shape = pd.Series(gbm.predict(X.loc[idx]), index=idx).where(f.loc[idx, "in_season"] == 1, 0.0)
    if partner is not None:
        py = pd.Series([hist.get(d - pd.Timedelta(days=364), np.nan) for d in idx], index=idx)
        if py.notna().mean() > .9:
            shape = (shape / shape.sum() + py.fillna(0) / py.sum()) / 2
    an = anchor()
    totals = idx.to_period("M").to_timestamp().map(an.anchor)
    pred = rescale_to_month(shape, pd.Series(totals, index=idx))
    pk = peak_mask(idx, f.loc[idx])
    k = np.where(pk, CONF["peak"], CONF["normal"])
    beds = f.loc[idx, "beds_static"]
    daily = []
    for d in idx:
        p = float(pred[d])
        flags = []
        off = f.at[d, "official_daily"]
        if off < 1:
            flags.append("official_zero_artifact")
        if off > beds[d]:
            flags.append("official_over_bed_cap")
        util = p / beds[d]
        if util >= .9:
            flags.append("tight")
        elif f.at[d, "in_season"] == 1 and util <= .5 and d.month in (1, 2, 3):
            flags.append("idle_in_season")
        i = idx.get_loc(d)
        daily.append({"date": str(d.date()), "forecast_ours": round(p), "p10": round(p / k[i]),
                      "p90": round(p * k[i]), "forecast_official": round(float(off)),
                      "beds": int(beds[d]), "utilisation": round(util, 3), "flags": flags})
    out = {
        "meta": {
            "generated": dt.datetime.now().isoformat(timespec="seconds"), "mode": mode,
            "level": "TR53 tourism region (Statistik Austria scope)" if mode == "open" else "Paznaun-Ischgl total (TVB / feratel)",
            "anchor": "avg of last 2 seasons + Easter March/April correction",
            "easter_2027_april_share": round(an.attrs["apr_share"], 3),
            "interval": "split-conformal 80 %, calibrated winter 23/24, tested 24/25 (coverage 0.85)",
            "beds": "static regional cap 22,078 from the official model; NOT a hard limit (open daily data exceeds it "
                    "at New Year every winter, max 24,891), so forecasts are not clipped and 'tight' is indicative "
                    "until partner daily beds are loaded",
            "sources": ["Österreich Werbung / JOANNEUM RESEARCH / TU Wien / AAU (CC BY 4.0)",
                        "GeoSphere Austria (CC BY 4.0)", "OpenHolidays (ODbL)"] +
                       (["TVB Paznaun-Ischgl (TTF 2026 data licence)"] if mode == "partner" else []),
        },
        "monthly": [{"month": str(m.date())[:7], "anchor": round(r.anchor), "official": round(r.official),
                     "avg_2y": round(r.avg_2y)} for m, r in an.iterrows()],
        "daily": daily,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "c04_forecast.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    df = pd.DataFrame(daily).set_index("date")
    print(f"mode={mode}; days={len(df)}; tight days (ours) {df['flags'].map(lambda x: 'tight' in x).sum()}, "
          f"official over cap {df['flags'].map(lambda x: 'official_over_bed_cap' in x).sum()}")
    print(df.loc["2026-12-24":"2027-01-03", ["forecast_ours", "p10", "p90", "forecast_official", "utilisation"]].to_string())
    print("->", OUT / "c04_forecast.json")


if __name__ == "__main__":
    main()
