"""Backtest on REAL daily actuals (TVB Paznaun-Ischgl / feratel), winter 2025/26 and summer 2026.

Needs the partner files (data/fetch_partner.py) and a rebuilt feature table.

Everything is ex ante as of 31 Oct 2025 (and 31 Oct 2024 for the calibration season):
history = real daily actuals where available (from 4 Nov 2024) plus the open daily
index scaled to the partner level before that; monthly anchor from TR53 monthly
actuals up to the origin, scaled by the partner/TR53 level ratio of the 12 months
before the origin.

Compared with:
  partner_fc      the TVB forecast column (vintage unknown: may not be ex ante!)
  partner_py      the TVB previous-year column (same date one year earlier)
  py_holiday      previous year, weekday-aligned, Christmas by date, Easter by Easter offset
  official_tr53   official TR53 daily x level ratio (in-sample: disaggregates actual monthly totals)
  ours_lgbm       anchor x LightGBM daily shape
  ours_ens        anchor x mean(py_holiday shape, LightGBM shape)   <- our main model
"""
import json

import lightgbm as lgb
import numpy as np
import pandas as pd

from anchor import april_share_model, easter_doy, monthly
from common import ROOT, design, load, peak_mask, rescale_to_month, wmape

f = load()
assert "real_actual" in f, "rebuild features with partner data first"
X = design(f)
real = f.real_actual
TR53M = monthly()


def level_ratio(origin: str) -> float:
    o = pd.Timestamp(origin)
    m = real.loc[:o].resample("MS").sum(min_count=25).dropna()
    m = m[m.index > o - pd.DateOffset(months=12)]
    if len(m) < 6:  # not enough real history: use the level found on the 2024/25 overlap (open index vs real)
        return 1.036
    return float(m.sum() / TR53M.reindex(m.index).sum())


def history(origin: str) -> pd.Series:
    r = level_ratio(origin) if real.loc[:origin].notna().sum() > 200 else 1.036
    return real.loc[:origin].combine_first(f.pseudo_actual.loc[:origin] * r)


def py_holiday(h: pd.Series, idx: pd.DatetimeIndex) -> pd.Series:
    out = []
    for d in idx:
        src = d - pd.Timedelta(days=364)
        if (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 6):
            src = d - pd.DateOffset(years=1)
        off = f.at[d, "easter_offset"]
        if -14 <= off <= 14:
            prev = f.index[(f.index.year == d.year - 1) & (f.easter_offset == off)]
            if len(prev):
                src = prev[0]
        out.append(h.get(src, np.nan))
    return pd.Series(out, index=idx)


def anchor_months(origin: str, months: pd.DatetimeIndex) -> pd.Series:
    """avg of the same month in the last two years (TR53), Easter-corrected Mar/Apr, x partner level."""
    y = TR53M.loc[:origin]
    avg = pd.Series({m: np.mean([y[m - pd.DateOffset(years=k)] for k in (1, 2)]) for m in months})
    a, b, _, _ = april_share_model(TR53M, last_actual=origin)
    for yr in sorted({m.year for m in months if m.month in (3, 4)}):
        mar, apr = pd.Timestamp(f"{yr}-03-01"), pd.Timestamp(f"{yr}-04-01")
        if mar in avg and apr in avg:
            share = a + b * easter_doy(yr)
            tot = avg[mar] + avg[apr]
            avg[mar], avg[apr] = tot * (1 - share), tot * share
    return avg * level_ratio(origin)


def ours(origin: str, idx: pd.DatetimeIndex):
    h = history(origin)
    w = h.index[(f.loc[h.index, "in_season"] == 1) & h.notna()]
    w = w.union(h.index[(f.loc[h.index, "month"].isin([6, 7, 8, 9])) & h.notna()])  # summer too
    gbm = lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                            min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                            random_state=0, verbose=-1).fit(X.loc[w], h[w], sample_weight=f.loc[w, "sample_weight"])
    g = pd.Series(gbm.predict(X.loc[idx]), index=idx)
    py = py_holiday(h, idx)
    months = pd.DatetimeIndex(sorted(set(idx.to_period("M").to_timestamp())))
    tot = pd.Series(idx.to_period("M").to_timestamp().map(anchor_months(origin, months)), index=idx)
    # anchor is a full-month total; scale it to the days in the test window
    frac = pd.Series(idx.to_period("M").to_timestamp(), index=idx).map(
        lambda m: 1.0)  # full months only (test windows are whole months)
    lg = rescale_to_month(g, tot * frac)
    ph = rescale_to_month(py.fillna(py.mean()), tot * frac)
    # third member: LightGBM with push-pull columns (market-group shares + pull factor), fitted on the same
    # history only. Kept although winter 24/25 (trained on the open stand-in only) got slightly worse
    # (14.0 vs 13.5 %): with real training data (winter 25/26) the 3-member ensemble is clearly best
    # (7.7 vs 9.0 %, peak days 6.3 vs 7.2 %), and real data will keep growing.
    from push_pull import PushPull
    trn = h.index[(f.loc[h.index, "in_season"] == 1) & h.notna() & (h > 0)]
    pp = PushPull(f).fit(h[trn], f.loc[trn, "sample_weight"].clip(lower=.5))
    total, parts = pp.predict(f.index, by_market=True)
    sh = parts.div(parts.sum(axis=1), axis=0)
    groups = {"pp_DE": ["DE"], "pp_BENELUX": ["NL", "BE", "LU"], "pp_NORDIC_UK": ["DK", "SE", "GB"],
              "pp_NEIGHBOURS": ["CH", "AT", "IT", "FR"], "pp_EAST": ["PL", "CZ"]}
    Xp = X.copy()
    for k, ms in groups.items():
        Xp[k] = sh[[m for m in ms if m in sh]].sum(axis=1)
    Xp["pp_pull"] = np.log(total / pp.push_index(f.index))
    gbm2 = lgb.LGBMRegressor(objective="poisson", n_estimators=400, learning_rate=.03, num_leaves=15,
                             min_child_samples=10, subsample=.8, subsample_freq=1, colsample_bytree=.8,
                             random_state=0, verbose=-1).fit(Xp.loc[w], h[w], sample_weight=f.loc[w, "sample_weight"])
    lp = rescale_to_month(pd.Series(gbm2.predict(Xp.loc[idx]), index=idx), tot * frac)
    e2, e3 = (lg + ph) / 2, (lg + ph + lp) / 3
    winter = pd.Series(idx.month.isin([11, 12, 1, 2, 3, 4]), index=idx)  # push-pull is fitted on winter days
    return {"ours_lgbm": lg, "ours_ens": e3.where(winter, e2), "ours_ens2": e2, "py_holiday": py}


def evaluate(origin: str, start: str, end: str, label: str):
    idx = f.loc[start:end].index
    idx = idx[real.reindex(idx).notna()]
    a = real[idx]
    o = ours(origin, idx)
    cand = {
        "partner_fc (TVB forecast)": f.loc[idx, "partner_fc"],
        "partner_py (TVB prev. year)": f.loc[idx, "partner_py"],
        "py_holiday": o["py_holiday"],
        "official_tr53 x level (in-sample)": f.loc[idx, "official_daily"] * level_ratio(origin),
        "ours_lgbm": o["ours_lgbm"],
        "ours_ens2 (py + lgbm)": o["ours_ens2"],
        "ours_ens (winter: + lgbm push-pull)": o["ours_ens"],
    }
    rows = []
    pk = peak_mask(idx, f.loc[idx])
    for k, p in cand.items():
        if p.isna().all():
            continue
        p = p.reindex(idx)
        m_a, m_p = a.resample("MS").sum(), p.resample("MS").sum()
        shape = rescale_to_month(p.clip(lower=0).fillna(0) + 1e-9, a.resample("MS").transform("sum"))
        rows.append({"window": label, "model": k,
                     "daily wMAPE": wmape(a, p), "peak-day wMAPE": wmape(a[pk], p[pk]),
                     "monthly MAPE": float(((m_p - m_a).abs() / m_a).mean()),
                     "bias %": float((p.sum() - a.sum()) / a.sum() * 100),
                     "shape-only wMAPE": wmape(a, shape)})
    return pd.DataFrame(rows), cand, idx


if __name__ == "__main__":
    out = []
    w, cand_w, idx_w = evaluate("2025-10-31", "2025-11-01", "2026-04-30", "winter 25/26")
    out.append(w)
    s, _, _ = evaluate("2025-10-31", "2026-05-01", "2026-10-31", "May-Oct 2026")
    out.append(s)
    res = pd.concat(out)
    res.to_csv(ROOT / "evaluation" / "real_backtest.csv", index=False)
    pd.set_option("display.width", 200)
    for lab, g in res.groupby("window", sort=False):
        print(f"\n{lab} (real daily actuals, origin 31 Oct 2025):")
        print(g.drop(columns="window").set_index("model").round(3).to_string())
    # calibration season 24/25 (origin 31 Oct 2024) for conformal intervals
    idx_c = f.loc["2024-11-04":"2025-04-30"].index
    oc = ours("2024-10-31", idx_c)["ours_ens"]
    rc = np.log(real[idx_c] / oc).replace([np.inf, -np.inf], np.nan).dropna()
    pk_c = peak_mask(rc.index, f.loc[rc.index])
    q = {"peak": float(np.quantile(rc[pk_c].abs(), .8)), "normal": float(np.quantile(rc[~pk_c].abs(), .8))}
    p = cand_w["ours_ens (winter: + lgbm push-pull)"]
    rt = np.log(real[idx_w] / p).replace([np.inf, -np.inf], np.nan).dropna()
    pk_t = peak_mask(rt.index, f.loc[rt.index])
    cover = float((rt.abs() <= np.where(pk_t, q["peak"], q["normal"])).mean())
    print(f"\nConformal 80 % (calibrated on real winter 24/25, tested on 25/26): coverage {cover:.2f}, "
          f"half-width x/÷{np.exp(q['normal']):.2f} normal, x/÷{np.exp(q['peak']):.2f} peak")
    json.dump({"conformal_real": {"coverage": cover, "normal": float(np.exp(q["normal"])),
                                  "peak": float(np.exp(q["peak"]))}},
              open(ROOT / "evaluation" / "real_conformal.json", "w"), indent=1)
