"""Deviation explainer: why does ACTUAL differ from a FORECAST (or from last year)?

    python3 models/explain.py                      # demo: open pseudo-actual vs official TR53 forecast
    (with partner data, call explain(actual, forecast) on the partner columns)

Method, per day t in season:
  r_t = log(actual_t / forecast_t)
  1. data-quality layer: forecast artefact zeros / missing actuals are tagged and excluded
  2. ridge regression of r_t on interpretable 0..1 drivers (market school holidays, Christmas /
     Easter / carnival windows, season phase, weekday, snow)
  3. contribution_{t,j} = beta_j * x_{t,j} on log scale; in stays (first order):
     stays_{t,j} = forecast_t * c_tj; the rest of actual - forecast is "unexplained"
  4. cross-check: LightGBM TreeSHAP contributions (pred_contrib) on the same r_t
  5. week-block bootstrap (200x) for each driver's total contribution
  6. grade A: CI excludes 0 and SHAP agrees in sign; B: one of the two; C: neither
Also: Theil decomposition of the forecast MSE (bias / variance / covariance shares)
and a monthly tracking signal (cumulative error / MAD) to detect systematic bias.
"""
from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from common import ROOT, load

ALPHA = 10.0

DRIVERS = {  # feature -> plain-language label. Markets grouped: single-market holidays overlap too much
    "hol_DE": "German school holidays",            # to separate without nationality data
    "hol_BENELUX": "Dutch/Belgian school holidays",
    "hol_NORTH_UK": "Danish/UK school holidays",
    "hol_NEIGHBOURS": "Swiss/Austrian school holidays",
    "hol_EAST": "Polish/Czech school holidays",
    "longwe_weighted": "long weekend with public holiday (source markets)",
    "longwe_bridge_weighted": "bridge-day long weekend (source markets)",
    "xmas_newyear": "Christmas / New Year window", "pre_xmas": "pre-Christmas weeks",
    "carnival_week": "carnival week", "easter_window": "Easter window",
    "opening_weekend": "season opening weekend", "closing_weekend": "season closing weekend",
    "early_season": "first 3 weeks of season", "late_season": "last 2 weeks of season",
    "weekend_night": "Fri/Sat night", "low_snow": "snow depth < 30 cm (ski area)",
    "fresh_snow": "> 20 cm new snow in 3 days",
    "ev_concert": "concert day (TVB calendar)", "ev_sport": "sports / freeride event (TVB calendar)",
    "ev_other": "other event day (TVB calendar)", "forecast_zero": "forecast is 0 (data gap)",
}
GROUPS = {"hol_BENELUX": ["hol_NL", "hol_BE"], "hol_NORTH_UK": ["hol_DK", "hol_GB"],
          "hol_NEIGHBOURS": ["hol_CH", "hol_AT"], "hol_EAST": ["hol_PL", "hol_CZ"]}


def driver_matrix(f: pd.DataFrame) -> pd.DataFrame:
    X = pd.DataFrame(index=f.index)
    for g, cols in GROUPS.items():
        X[g] = f[[c for c in cols if c in f]].max(axis=1)
    for c in [k for k in DRIVERS if k in f.columns]:
        X[c] = f[c].astype(float)
    X["early_season"] = ((f.days_since_open >= 0) & (f.days_since_open < 21)).astype(float)
    X["late_season"] = ((f.days_to_close >= 0) & (f.days_to_close < 14)).astype(float)
    X["weekend_night"] = f.is_weekend_night.astype(float)
    sd = f.snow_cm_ski_area_idalpe.fillna(f.snow_cm_ski_area_idalpe.median())
    X["low_snow"] = (sd < 30).astype(float)
    X["fresh_snow"] = (f.new_snow_3d_cm.fillna(0) > 20).astype(float)
    if "ev_any" in f:
        X["ev_concert"] = f.ev_concert.astype(float)
        X["ev_sport"] = f.ev_sport.astype(float)
        X["ev_other"] = ((f.ev_any == 1) & (f.ev_concert == 0) & (f.ev_sport == 0)).astype(float)
    return X[[k for k in DRIVERS if k in X.columns]]


def theil(actual: pd.Series, fc: pd.Series) -> dict:
    a, p = actual.values, fc.values
    mse = np.mean((p - a) ** 2)
    sa, sp, r = a.std(), p.std(), np.corrcoef(a, p)[0, 1]
    return {"rmse": float(np.sqrt(mse)), "bias_share": float((p.mean() - a.mean()) ** 2 / mse),
            "variance_share": float((sp - sa) ** 2 / mse), "covariance_share": float(2 * (1 - r) * sp * sa / mse),
            "mean_error": float((p - a).mean())}


def tracking_signal(actual: pd.Series, fc: pd.Series) -> pd.DataFrame:
    e = (actual - fc)
    g = e.groupby(e.index.to_period("M"))
    out = pd.DataFrame({"sum_error": g.sum(), "mad": g.apply(lambda s: s.abs().mean())})
    out["tracking_signal"] = out.sum_error / out.mad  # |TS| > ~4 per month of ~30 days => systematic bias
    out["mean_pct_error"] = g.sum() / actual.groupby(actual.index.to_period("M")).sum()
    return out


def explain(actual: pd.Series, fc: pd.Series, f: pd.DataFrame, n_boot: int = 200, seed: int = 0,
            season_only: bool = True):
    dq = pd.DataFrame({"forecast_zero_or_missing": (fc.fillna(0) < 1), "actual_missing": actual.isna(),
                       "out_of_season": (f.in_season.reindex(actual.index) == 0) & season_only})
    ok = ~dq.any(axis=1) & (actual > 0)
    idx = actual.index[ok]
    X = driver_matrix(f.loc[idx])
    X = X.loc[:, X.std() > 0]
    r = np.log(actual[idx] / fc[idx]).clip(-2, 2)
    Z = X  # all drivers are 0..1 with a natural zero: contribution only on days where a driver is active
    model = Ridge(alpha=ALPHA).fit(Z, r)
    contrib = Z * model.coef_  # log-scale contributions per day
    # first-order conversion to stays (additive, consistent with the bootstrap):
    stays = contrib.mul(fc[idx], axis=0)
    stays["level (all days)"] = fc[idx] * model.intercept_
    stays["unexplained"] = (actual[idx] - fc[idx]) - stays.sum(axis=1)
    # LightGBM SHAP cross-check
    g = lgb.LGBMRegressor(n_estimators=300, learning_rate=.03, num_leaves=7, min_child_samples=15,
                          random_state=seed, verbose=-1).fit(X, r)
    shap = pd.DataFrame(g.predict(X, pred_contrib=True)[:, :-1], index=idx, columns=X.columns)
    # week-block bootstrap of total contribution per driver
    weeks = idx.to_period("W")
    uw = weeks.unique()
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(n_boot):
        pick = rng.choice(len(uw), len(uw), replace=True)
        sel = np.concatenate([np.where(weeks == uw[i])[0] for i in pick])
        m = Ridge(alpha=ALPHA).fit(Z.iloc[sel], r.iloc[sel])
        boots.append((Z * m.coef_).mul(fc[idx], axis=0).sum())
    boots = pd.DataFrame(boots)
    summary = pd.DataFrame({
        "driver": [DRIVERS[c] for c in X.columns],
        "stays_total": stays[X.columns].sum().values,
        "ci80_low": boots.quantile(.1).values, "ci80_high": boots.quantile(.9).values,
        "shap_sign_agrees": (np.sign(shap.mul(fc[idx], axis=0).sum()) == np.sign(stays[X.columns].sum())).values,
    }, index=X.columns)
    ci_ok = (np.sign(summary.ci80_low) == np.sign(summary.ci80_high)) & (summary.ci80_low != 0)
    summary["grade"] = np.where(ci_ok & summary.shap_sign_agrees, "A",
                                np.where(ci_ok | summary.shap_sign_agrees, "B", "C"))
    summary = summary.reindex(summary.stays_total.abs().sort_values(ascending=False).index)
    return {"daily": stays, "summary": summary, "dq": dq, "r2": float(model.score(Z, r)),
            "theil": theil(actual[idx], fc[idx]), "tracking": tracking_signal(actual[idx], fc[idx])}


def waterfall(res: dict, actual: pd.Series, fc: pd.Series, start: str, end: str, top: int = 5) -> pd.DataFrame:
    d = res["daily"].loc[start:end]
    tot = d.sum()
    drivers = tot.drop(["level (all days)", "unexplained"])
    keep = drivers.abs().sort_values(ascending=False).index[:top]
    rows = [("forecast", fc.loc[d.index].sum())]
    rows += [(DRIVERS.get(k, k), drivers[k]) for k in keep]
    rows += [("other drivers", drivers.drop(keep).sum()), ("level shift", tot["level (all days)"]),
             ("unexplained", tot["unexplained"]), ("actual", actual.loc[d.index].sum())]
    return pd.DataFrame(rows, columns=["step", "stays"])


if __name__ == "__main__":
    f = load()
    if "real_actual" in f and f.partner_fc.notna().any():
        print("REAL: TVB actual vs TVB forecast, 4 Nov 2025 - 31 Oct 2026 (source: TVB Paznaun-Ischgl / feratel)\n")
        period = slice("2025-11-04", "2026-10-31")
        A, F = f.real_actual.loc[period], f.partner_fc.loc[period]
        dq = (F.fillna(0) < 1)
        print(f"Data quality: forecast = 0 on {int(dq.sum())} days ({', '.join(str(d.date()) for d in F.index[dq])}); "
              f"actual on those days: {int(A[dq].sum()):,} stays not covered by the forecast")
        mon = pd.DataFrame({"actual": A.resample("MS").sum(), "forecast": F.resample("MS").sum()})
        mon["error %"] = (mon.forecast / mon.actual - 1) * 100
        print("\nMonthly forecast error (forecast vs actual):")
        print(mon.round(1).to_string())
        for lab, sl, so in (("winter season (in-season days)", slice("2025-11-04", "2026-05-03"), True),
                            ("summer May-Oct 2026 (all days)", slice("2026-05-04", "2026-10-31"), False)):
            res = explain(A.loc[sl], F.loc[sl], f, season_only=so)
            print(f"\n=== {lab}: R² {res['r2']:.2f}; Theil", {k: round(v, 3) for k, v in res["theil"].items()})
            print(res["summary"].round(0).to_string())
            res["summary"].to_csv(ROOT / "models" / f"results_explain_real_{'winter' if so else 'summer'}.csv")
            worst = res["daily"].drop(columns=["level (all days)"]).sum(axis=1).abs()
            wk = res["daily"]["unexplained"].abs().groupby(res["daily"].index.to_period("W")).sum().idxmax()
            print(f"\nWaterfall, week with the largest unexplained deviation ({wk}):")
            print(waterfall(res, A, F, str(wk.start_time.date()), str(wk.end_time.date())).round(0).to_string(index=False))
            print("\nMonthly tracking signal:")
            print(res["tracking"].round(2).to_string())
    else:
        print("TVB data not loaded: run data/fetch_partner.py and data/build_features.py first.")
