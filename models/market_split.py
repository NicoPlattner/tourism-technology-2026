"""Interpolate the missing daily nationality data: split daily stays into source markets.

Push-pull model (push_pull.py) fitted on all real TVB days, its market parts raked so that
  - every day sums to the actual stays (TVB / feratel), and
  - every market's season total matches its share of nights from Landesstatistik Tirol (4 TVB municipalities).
For winter 2026/27 the forecast (out/c04_forecast.json) is split with the trend-extended season shares.
Output: data/processed/daily_market_split.parquet (git-ignored, derived from partner data).
"""
import json
import sys
import warnings

import numpy as np
import pandas as pd

from common import ROOT, load
from push_pull import PushPull, market_split

sys.path.insert(0, str(ROOT / "data"))
from market_mix import extend_trend, paznaun_season_shares  # noqa: E402

warnings.filterwarnings("ignore")
f = load()
real = f.real_actual
ps = paznaun_season_shares()
ps = extend_trend(ps.div(ps.sum(axis=1), axis=0) * .92)  # listed markets ~92 % of nights
tr = real.index[(f.in_season == 1) & real.notna() & (real > 0)]
pp = PushPull(f).fit(real[tr], pd.Series(1.0, index=tr))

seasons = {"winter 2024/25": ("2024-11-04", "2025-05-03"), "winter 2025/26": ("2025-11-01", "2026-05-03")}
parts = []
for lab, (a, b) in seasons.items():
    idx = f.loc[a:b].index
    idx = idx[real.reindex(idx).notna() & (f.loc[idx, "in_season"] == 1)]
    parts.append(market_split(pp, f, real[idx], ps.loc[lab]).assign(season=lab))
fc = json.loads((ROOT / "out" / "c04_forecast.json").read_text())
fy = pd.Series({pd.Timestamp(d["date"]): d["forecast_ours"] for d in fc["daily"]})
fy = fy[(fy > 0) & (f.loc[fy.index, "in_season"] == 1)]
parts.append(market_split(pp, f, fy, ps.loc["winter 2026/27"]).assign(season="winter 2026/27 (forecast)"))
split = pd.concat(parts)
(ROOT / "data" / "processed").mkdir(exist_ok=True)
split.to_parquet(ROOT / "data" / "processed" / "daily_market_split.parquet")

mk = [c for c in split.columns if c not in ("season", "other")]
wk = split[mk + ["other"]].groupby([split.season, split.index.to_period("W-SAT")]).sum()
sh = wk.div(wk.sum(axis=1), axis=0)
show = ["DE", "NL", "BE", "DK", "GB", "PL", "CH"]
print("Estimated share of nights by market and week, winter 2025/26 (Sun-Sat weeks):")
print(sh.loc["winter 2025/26", show].iloc[::1].round(2).to_string())
print("\nFitted holiday response gamma:", pp.gamma.round(1).to_dict())
peak = sh.loc["winter 2026/27 (forecast)", show].idxmax()
print("\nWinter 2026/27 (forecast): week with the highest share per market:",
      {m: str(w.start_time.date()) for m, w in peak.items()})
