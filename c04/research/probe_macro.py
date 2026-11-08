"""Do economy, inflation, exchange rates, geopolitics or snow explain season-to-season changes in
Paznaun-Ischgl (TR53) overnight stays?  26 years of Statistik Austria monthly data (open), seasons
with COVID effects excluded.

Unit: winter season (Nov-Apr). Target: log growth of the season total vs the previous season.
Ex-ante drivers: value in Sep-Oct before the season, as change vs one year earlier (known when the
season is planned). Ex-post driver: mean snow depth Dec-Mar (explains, cannot forecast).
Evaluation: leave-one-season-out, ridge on standardised drivers vs "no change" and "mean growth".
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "models"))  # production models
from anchor import monthly
from common import ROOT

y = monthly()[:"2026-04-01"]
m = pd.read_parquet(ROOT / "data" / "processed" / "macro_monthly.parquet")
COVID = {2019, 2020, 2021, 2022}  # season start years affected by COVID / recovery


def season_total(start_year):
    return y[f"{start_year}-11-01":f"{start_year + 1}-04-01"].sum()


rows = []
for s in range(2001, 2026):
    if s in COVID or s - 1 in COVID:
        continue
    g = np.log(season_total(s) / season_total(s - 1))
    pre = m[f"{s}-09-01":f"{s}-10-01"].mean()
    pre_ly = m[f"{s - 1}-09-01":f"{s - 1}-10-01"].mean()
    r = {"season": f"{s}/{(s + 1) % 100:02d}", "growth": g}
    for c in ["cons_conf_DE", "cons_conf_NL", "cons_conf_BE", "cons_conf_DK", "cons_conf_PL", "unemployment_DE"]:
        r[f"d_{c}"] = pre[c] - pre_ly[c]
    r["hicp_AT_all"] = pre["hicp_AT_all_yoy"]
    r["hicp_AT_accommodation"] = pre["hicp_AT_accommodation_yoy"]
    for c in ["fx_CHF_per_EUR", "fx_GBP_per_EUR", "fx_PLN_per_EUR", "fx_DKK_per_EUR"]:
        r[f"dlog_{c}"] = np.log(pre[c] / pre_ly[c])
    for c in ["gpr_global", "epu_europe"]:
        r[f"dlog_{c}"] = np.log(pre[c] / pre_ly[c])
    snow = m[f"{s}-12-01":f"{s + 1}-03-01"].snow_depth_idalpe_cm_mean.mean()
    snow_ly = m[f"{s - 1}-12-01":f"{s}-03-01"].snow_depth_idalpe_cm_mean.mean()
    r["d_snow_ex_post"] = snow - snow_ly
    rows.append(r)
d = pd.DataFrame(rows).set_index("season").dropna(axis=1, thresh=10)
print(f"Seasons used: {len(d)} ({', '.join(d.index)})")
print(f"Season growth: mean {d.growth.mean() * 100:.1f} %, sd {d.growth.std() * 100:.1f} %")
corr = d.drop(columns="growth").corrwith(d.growth).sort_values(key=abs, ascending=False)
n = len(d)
crit = 2 / np.sqrt(n)  # rough 95 % threshold for |r|
print(f"\nCorrelation with season growth (|r| > {crit:.2f} is roughly significant):")
print(corr.round(2).to_string())

X = d.drop(columns=["growth", "d_snow_ex_post"]).fillna(d.mean())
errs = {"no change": [], "mean growth": [], "ridge macro": [], "ridge top-3 macro": []}
top3 = corr.drop("d_snow_ex_post").abs().sort_values(ascending=False).index[:3]
for i in range(n):
    tr = np.arange(n) != i
    yt, ya = d.growth.values[tr], d.growth.values[i]
    errs["no change"].append(abs(ya))
    errs["mean growth"].append(abs(ya - yt.mean()))
    for name, cols in (("ridge macro", X.columns), ("ridge top-3 macro", top3)):
        Z = X[cols]
        mu, sd = Z[tr].mean(), Z[tr].std().replace(0, 1)
        mdl = Ridge(alpha=5.0).fit((Z[tr] - mu) / sd, yt)
        errs[name].append(abs(ya - mdl.predict(((Z.iloc[[i]] - mu) / sd))[0]))
print("\nLeave-one-season-out mean absolute error of season growth (pp):")
print({k: round(np.mean(v) * 100, 2) for k, v in errs.items()})
print("(top-3 chosen on all seasons -> optimistic)")
d.to_csv(ROOT / "evaluation" / "macro_seasons.csv")
