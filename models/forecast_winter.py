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


def main():
    f = load()
    real_mode = bool("real_actual" in f and f.real_actual.notna().sum() > 300)
    idx = f.loc[START:END].index
    if real_mode:  # TVB actuals as history, partner level, real conformal widths, capacity from last year
        from real_backtest import ours
        pred = ours("2026-10-31", idx)["ours_ens"]
        conf = json.load(open(ROOT / "models" / "results_real_conformal.json"))["conformal_real"]
        CONF.update(normal=conf["normal"], peak=conf["peak"])
        cap = pd.Series(f.capacity_est.reindex(idx - pd.Timedelta(days=364)).values, index=idx)
        an = None
    else:
        X = design(f)
        w = f.index[(f.in_season == 1) & f.pseudo_actual.notna()]
        gbm = lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                                min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                                random_state=0, verbose=-1).fit(X.loc[w], f.pseudo_actual[w])
        shape = pd.Series(gbm.predict(X.loc[idx]), index=idx).where(f.loc[idx, "in_season"] == 1, 0.0)
        an = anchor()
        pred = rescale_to_month(shape, pd.Series(idx.to_period("M").to_timestamp().map(an.anchor), index=idx))
        cap = f.loc[idx, "beds_static"].astype(float)
    pk = peak_mask(idx, f.loc[idx])
    k = np.where(pk, CONF["peak"], CONF["normal"])
    daily = []
    for i, d in enumerate(idx):
        p = float(pred[d])
        flags = []
        tvb = f.at[d, "partner_fc"] if "partner_fc" in f else np.nan
        if pd.notna(tvb) and tvb == 0:
            flags.append("tvb_forecast_zero")
        c = cap[d]
        util = p / c if pd.notna(c) and c > 0 else None
        if util is not None and util >= .95:
            flags.append("tight")
        elif util is not None and f.at[d, "in_season"] == 1 and util < .8 and d.month in (1, 2, 3, 4):
            flags.append("spare_capacity")
        if pd.notna(tvb) and tvb > 0 and not (p / k[i] <= tvb <= p * k[i]):
            flags.append("tvb_forecast_outside_our_80pct_band")
        daily.append({"date": str(d.date()), "forecast_ours": round(p), "p10": round(p / k[i]),
                      "p90": round(p * k[i]), "forecast_tvb": None if pd.isna(tvb) else int(tvb),
                      "forecast_official_tr53": round(float(f.at[d, "official_daily"])),
                      "capacity_est": None if pd.isna(c) else int(c),
                      "utilisation": None if util is None else round(util, 3),
                      "events": [] if "ev_any" not in f or not f.at[d, "ev_any"] else ["event"], "flags": flags})
    df = pd.DataFrame(daily).set_index("date")
    df.index = pd.to_datetime(df.index)
    cmp_ = df[["forecast_ours", "forecast_tvb", "forecast_official_tr53"]]
    cmp_ = cmp_[cmp_.forecast_tvb.notna()] if real_mode else cmp_  # TVB file ends 4 Apr 2027
    monthly = cmp_.resample("MS").sum()
    out = {
        "meta": {
            "generated": dt.datetime.now().isoformat(timespec="seconds"),
            "mode": "real (TVB data)" if real_mode else "open",
            "level": "Paznaun-Ischgl total, TVB / feratel" if real_mode else "TR53 tourism region",
            "model": "monthly anchor (2-season avg, Easter-corrected, TVB level) x daily shape "
                     "(mean of holiday-aligned previous year and LightGBM)",
            "interval": f"split-conformal 80 % ({'calibrated on real winter 24/25, coverage 0.77 on 25/26' if real_mode else 'open data'})",
            "capacity": "stays + free beds on the same weekday last year (TVB free beds end 7 Nov 2026)"
                        if real_mode else "static regional cap 22,078 (not a hard limit)",
            "sources": ["TVB Paznaun-Ischgl with feratel (TTF 2026 data licence)"] * real_mode +
                       ["Österreich Werbung / JOANNEUM RESEARCH / TU Wien / AAU (CC BY 4.0)",
                        "GeoSphere Austria (CC BY 4.0)", "OpenHolidays (ODbL)"],
        },
        "monthly": [{"month": str(m.date())[:7], **{c: int(v) for c, v in r.items()}} for m, r in monthly.iterrows()],
        "daily": daily,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "c04_forecast.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    cnt = pd.Series([fl for x in daily for fl in x["flags"]]).value_counts().to_dict()
    print(f"mode={out['meta']['mode']}; flags {cnt}")
    m = monthly.copy()
    m["tvb vs ours %"] = (m.forecast_tvb / m.forecast_ours - 1) * 100
    print(m.round(1).to_string())
    print("tight days:", [str(d.date()) for d, fl in df["flags"].items() if "tight" in fl])
    print("->", OUT / "c04_forecast.json")


if __name__ == "__main__":
    main()
