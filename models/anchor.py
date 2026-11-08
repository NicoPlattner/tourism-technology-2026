"""Monthly anchor for the coming winter: average of the last two seasons plus an
Easter correction for the March/April split (learned from 1999-2026 monthly data).

    python3 models/anchor.py   # prints anchor vs official monthly forecast for Nov 2026 - Apr 2027
"""
import json

import numpy as np
import pandas as pd
from dateutil.easter import easter

from common import ROOT

RAW = ROOT / "data" / "raw" / "open"
SKIP_YEARS = {2020, 2021}  # COVID


def monthly() -> pd.Series:
    m = pd.DataFrame(json.loads((RAW / "TR53_month.json").read_text()))
    return m.assign(date=pd.to_datetime(m.date)).set_index("date").stays.sort_index()


def easter_doy(year: int) -> int:
    return easter(year).timetuple().tm_yday


def april_share_model(y: pd.Series, last_actual: str = "2026-08-01"):
    rows = []
    for yr in range(2000, pd.Timestamp(last_actual).year + 1):
        if yr in SKIP_YEARS:
            continue
        mar, apr = y.get(pd.Timestamp(f"{yr}-03-01")), y.get(pd.Timestamp(f"{yr}-04-01"))
        if mar and apr and pd.Timestamp(f"{yr}-04-01") <= pd.Timestamp(last_actual):
            rows.append((yr, easter_doy(yr), apr / (mar + apr)))
    d = pd.DataFrame(rows, columns=["year", "easter_doy", "apr_share"])
    b, a = np.polyfit(d.easter_doy, d.apr_share, 1)
    resid_sd = float(np.std(d.apr_share - (a + b * d.easter_doy), ddof=2))
    return a, b, resid_sd, d


def anchor(season_start: int = 2026, last_actual: str = "2026-08-01") -> pd.DataFrame:
    y = monthly()
    months = pd.date_range(f"{season_start}-11-01", f"{season_start + 1}-04-01", freq="MS")
    avg = pd.Series({m: np.mean([y[m - pd.DateOffset(years=k)] for k in (1, 2)]) for m in months})
    a, b, sd, _ = april_share_model(y, last_actual)
    share = a + b * easter_doy(season_start + 1)
    ma = avg[months[4]] + avg[months[5]]
    adj = avg.copy()
    adj[months[4]], adj[months[5]] = ma * (1 - share), ma * share
    out = pd.DataFrame({"avg_2y": avg, "anchor": adj, "official": y.reindex(months)})
    out.attrs.update(apr_share=share, apr_share_sd=sd, slope_per_day=b)
    return out


if __name__ == "__main__":
    y = monthly()
    a, b, sd, d = april_share_model(y)
    print(f"April share of Mar+Apr = {a:.3f} + {b:.4f} * Easter day-of-year  (n={len(d)}, resid sd {sd:.3f}, "
          f"corr {np.corrcoef(d.easter_doy, d.apr_share)[0, 1]:.2f})")
    an = anchor()
    print(f"Easter 2027 = {easter(2027)}, predicted April share {an.attrs['apr_share']:.3f} ± {an.attrs['apr_share_sd']:.3f}")
    print((an.round(0)).to_string())
    diff = an.anchor - an.official
    print("\nanchor - official:", diff.round(0).to_dict())
