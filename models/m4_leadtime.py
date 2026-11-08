"""M4: booking lead time (how far ahead guests book), per arrival month, all markets and by market group.

Data: TVB Paznaun-Ischgl booking lead time (weekly arrival weeks, classes 0 / 8 / 31 / 61 / 90 / 180 days
ahead, 2023-2026; a booking-platform sample, no origin split). Paznaun stands in for Tirol.

A. All markets: class shares per arrival month. Candidates for the next season: mean of earlier seasons,
   last season, last season + damped trend. Tested by leave-last-season-out (predict 2025/26 and summer 2026
   from the seasons before).
B. By market group (derived, grade C): weekly class shares = sum over groups (group share of the week's
   nights x group lead-time profile). Group shares per week come from the push-pull market split
   (models/market_split.py). Fitted on winter 2024/25, tested on winter 2025/26 against A.
Outputs: share per class, cumulative booking curve, median lead time, "x % booked by" dates.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from common import ROOT

CLASSES = ["0d", "8d", "31d", "61d", "90d", "180d"]
MID = np.array([3, 19, 45, 75, 135, 240])  # representative days ahead per class (0-7, 8-30, ..., 180+)
GROUPS = {"DE": ["DE"], "NL": ["NL"], "BE_LU": ["BE", "LU"], "NORDIC_UK": ["DK", "SE", "GB"],
          "OTHER": ["CH", "AT", "PL", "CZ", "FR", "IT", "other"]}


def load() -> pd.DataFrame:
    lt = pd.read_csv(ROOT / "data" / "raw" / "partner" / "booking_lead_time_2023-2026.csv",
                     parse_dates=["week_start"]).set_index("week_start").fillna(0)
    lt.columns = CLASSES
    return lt


def season_of(d: pd.Timestamp) -> str:
    if d.month in (11, 12, 1, 2, 3, 4):
        y = d.year if d.month >= 11 else d.year - 1
        return f"W{y}/{str(y + 1)[2:]}"
    return f"S{d.year}"


def monthly_shares(lt: pd.DataFrame) -> pd.DataFrame:
    m = lt.groupby([lt.index.map(season_of), lt.index.month]).sum()
    m.index.names = ["season", "month"]
    return m.div(m.sum(axis=1), axis=0)


def stats(shares: pd.DataFrame) -> pd.DataFrame:
    """Median lead time and share booked >= 61 days ahead, from class shares."""
    cum = shares[CLASSES[::-1]].cumsum(axis=1)  # share booked at least x days ahead
    med = cum.apply(lambda r: MID[::-1][np.argmax(r.values >= .5)], axis=1)
    return pd.DataFrame({"median_days_ahead": med, "share_61d_plus": shares[["61d", "90d", "180d"]].sum(axis=1),
                         "share_last_minute_0_30d": shares[["0d", "8d"]].sum(axis=1)})


def candidates(ms: pd.DataFrame, target: str) -> dict:
    kind = target[0]
    prev = sorted([s for s in ms.index.get_level_values(0).unique() if s[0] == kind and s < target])
    out = {}
    if not prev:
        return out
    last = ms.loc[prev[-1]]
    out["last season"] = last
    out["mean of earlier seasons"] = pd.concat([ms.loc[s] for s in prev]).groupby(level=0).mean()
    if len(prev) >= 2:
        first = ms.loc[prev[0]]
        tr = (last - first.reindex(last.index)) / (len(prev) - 1)
        p = (last + .5 * tr.fillna(0)).clip(lower=0)
        out["last + damped trend"] = p.div(p.sum(axis=1), axis=0)
    return out


def part_a(lt: pd.DataFrame):
    ms = monthly_shares(lt)
    w = lt.groupby([lt.index.map(season_of), lt.index.month]).sum().sum(axis=1)
    rows = []
    for target in ("W2025/26", "W2024/25", "S2026", "S2025"):
        if target not in ms.index.get_level_values(0):
            continue
        truth = ms.loc[target]
        for name, pred in candidates(ms, target).items():
            common = truth.index.intersection(pred.index)
            wt = w.loc[target].reindex(common)
            mae = (truth.loc[common] - pred.loc[common]).abs().mean(axis=1)
            dmed = (stats(truth.loc[common]).median_days_ahead - stats(pred.loc[common]).median_days_ahead).abs()
            rows.append({"target season": target, "method": name,
                         "class share error (pp, booking-weighted)": float((mae * wt).sum() / wt.sum() * 100),
                         "median lead time error (days)": float((dmed * wt).sum() / wt.sum())})
    return ms, pd.DataFrame(rows)


def part_b(lt: pd.DataFrame):
    split = pd.read_parquet(ROOT / "data" / "processed" / "daily_market_split.parquet")
    split = split[~split.season.str.contains("forecast")]
    grp = pd.DataFrame({g: split[[c for c in cols if c in split]].sum(axis=1) for g, cols in GROUPS.items()})
    gw = grp.groupby(grp.index.to_period("W-SUN").start_time).sum()
    gw = gw.div(gw.sum(axis=1), axis=0)
    y = lt.reindex(gw.index).dropna()
    gw = gw.loc[y.index]
    n = y.sum(axis=1)
    ys = y.div(n, axis=0)
    seasons = gw.index.map(season_of)
    G, K = gw.shape[1], len(CLASSES)

    def profiles(theta):
        z = theta.reshape(G, K)
        e = np.exp(z - z.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)

    def fit(mask):
        A, Y, W = gw[mask].values, ys[mask].values, np.sqrt(n[mask].values)[:, None]
        base = Y.mean(axis=0)
        loss = lambda th: (((A @ profiles(th) - Y) * W) ** 2).sum() + .5 * ((profiles(th) - base) ** 2).sum() * len(Y)
        r = minimize(loss, np.tile(np.log(base + 1e-6), G), method="L-BFGS-B")
        return pd.DataFrame(profiles(r.x), index=gw.columns, columns=CLASSES)

    tr, te = seasons == "W2024/25", seasons == "W2025/26"
    prof = fit(tr)
    pred = pd.DataFrame(gw[te].values @ prof.values, index=gw.index[te], columns=CLASSES)
    base = ys[tr].groupby(ys[tr].index.month).mean()
    pred_base = pd.DataFrame([base.loc[d.month].values if d.month in base.index else ys[tr].mean().values
                              for d in gw.index[te]], index=gw.index[te], columns=CLASSES)
    wt = n[te]
    err = lambda p: float(((ys[te] - p).abs().mean(axis=1) * wt).sum() / wt.sum() * 100)
    return prof, fit(tr | te), {"by-market model (pp)": err(pred), "same-month average (pp)": err(pred_base)}


if __name__ == "__main__":
    lt = load()
    ms, ra = part_a(lt)
    print("A. All markets, class-share error when forecasting a held-out season:")
    print(ra.round(2).to_string(index=False))
    print("\nObserved lead-time mix per arrival month (winter 2025/26):")
    print(pd.concat([ms.loc["W2025/26"].round(3), stats(ms.loc["W2025/26"])], axis=1).round(2).to_string())
    prof_test, prof_all, cmp = part_b(lt)
    print("\nB. By market group, test winter 2025/26 (weekly class shares):", {k: round(v, 2) for k, v in cmp.items()})
    print("Lead-time profile by market group (fitted on both winters):")
    print(pd.concat([prof_all.round(3), stats(prof_all)], axis=1).round(2).to_string())
    pd.to_pickle({"monthly": ms, "eval": ra, "profiles": prof_all, "profile_test": cmp},
                 ROOT / "data" / "processed" / "m4_leadtime.pkl")
