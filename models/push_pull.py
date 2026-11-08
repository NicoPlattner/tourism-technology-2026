"""Push-pull model of daily overnight stays (Challenge 04).

PUSH (why people travel at time t, per source market m):
    market m's nights in a month are spread over the month's days in proportion to
        1 + gamma_m * school_m(t) + lam * longwe_bridge_m(t)
    weighted by m's share of Paznaun nights in that month (Landesstatistik Tirol season mix x Tirol
    monthly pattern, data/market_mix.py). Markets without holiday data form "other" (flat).
PULL (why Paznaun, same for every market):
    exp(beta . x(t)): weekday, season phase, Christmas / Easter window, snow, big concerts, month.

    stays(t) ~ PULL(t) * sum_m share_m(month t) * N(month) * (1 + gamma_m H_m(t) + lam L_m(t)) / norm_m(month)

gamma_m starts from (and is shrunk towards) the holiday multipliers measured in the Salzburg mobile data
(NL x10 -> gamma 9 ...). Fitted by weighted least squares on log stays (real TVB days weight 1, open-index
stand-in 0.5), in-season days only. The fit gives a daily split of stays by market, raked to the known
season totals per market (Landesstatistik Tirol), which interpolates the missing daily nationality data.
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from common import ROOT

sys.path.insert(0, str(ROOT / "data"))
from holiday_features import MARKET_SHARE, daily_market_weights, load_mix  # noqa: E402

# prior holiday response gamma_m = multiplier - 1 (mobile data, Salzburger Sportwelt, Feb-Apr 2026);
# markets without a usable estimate get a weak prior of 1.
# DE and AT: the Feb-Apr mobile estimate (x0.9) misses Christmas, so a neutral prior of 2 is used.
GAMMA0 = {"NL": 9.2, "GB": 6.3, "BE": 4.2, "LU": 2.2, "DK": 1.8, "FR": 1.6, "SE": 1.3, "DE": 2.0, "AT": 2.0,
          "CH": 1.0, "PL": 1.0, "CZ": 1.0, "IT": 1.0}
PULL = ["dow_0", "dow_1", "dow_2", "dow_3", "dow_4", "dow_5", "season_week1", "season_week2_3",
        "season_last_week", "opening_weekend", "closing_weekend", "xmas_newyear", "pre_xmas", "holy_week",
        "easter_week", "low_snow", "fresh_snow", "big_concert"]


class PushPull:
    def __init__(self, f: pd.DataFrame, kappa: float = 0.3, ridge: float = 1.0):
        self.f, self.kappa, self.ridge = f, kappa, ridge
        self.mix = load_mix()
        self.markets = [m for m in MARKET_SHARE if f"school_{m}" in f and m in self.mix]

    # ---------- inputs
    def pull_matrix(self, idx) -> pd.DataFrame:
        f = self.f.loc[idx]
        X = pd.DataFrame(index=idx)
        for d in range(6):
            X[f"dow_{d}"] = (f.dow == d).astype(float)
        dso, dtc, off = f.days_since_open, f.days_to_close, f.easter_offset
        X["season_week1"] = ((dso >= 0) & (dso < 7)).astype(float)
        X["season_week2_3"] = ((dso >= 7) & (dso < 21)).astype(float)
        X["season_last_week"] = ((dtc >= 0) & (dtc < 7)).astype(float)
        X["opening_weekend"] = f.opening_weekend.astype(float)
        X["closing_weekend"] = f.closing_weekend.astype(float)
        X["xmas_newyear"] = f.xmas_newyear.astype(float)
        X["pre_xmas"] = f.pre_xmas.astype(float)
        X["holy_week"] = ((off >= -8) & (off <= -1)).astype(float)
        X["easter_week"] = ((off >= 0) & (off <= 7)).astype(float)
        sd = f.snow_cm_ski_area_idalpe.fillna(f.snow_cm_ski_area_idalpe.median())
        X["low_snow"] = (sd < 30).astype(float)
        X["fresh_snow"] = (f.new_snow_3d_cm.fillna(0) > 20).astype(float)
        X["big_concert"] = f.ev_big_concert_weekend.astype(float)
        for m in range(1, 13):
            X[f"month_{m}"] = (f.month == m).astype(float)
        wk = (f.days_since_open // 7).clip(-1, 22)  # progress through the season, 2-week steps
        for k in range(0, 23, 2):
            X[f"sweek_{k}"] = ((wk >= k) & (wk < k + 2)).astype(float)
        return X

    def push_inputs(self, idx):
        w = daily_market_weights(idx, self.mix)[self.markets].astype(float)
        H = np.column_stack([self.f.loc[idx, f"school_{m}"].values for m in self.markets])
        L = np.column_stack([self.f.loc[idx, f"longwe_bridge_{m}"].values for m in self.markets])
        month = idx.to_period("M").astype(str).values
        return w.values, H, L, month

    def push(self, gamma, lam, w, H, L, month):
        """Per day and market: market share x within-month distribution by holiday response."""
        raw = 1 + H * gamma[None, :] + lam * L
        norm = pd.DataFrame(raw).groupby(month).transform("mean").values  # mean over each month
        per_market = w * raw / norm
        other = np.clip(1 - w.sum(axis=1), 0, None)
        return per_market, other

    # ---------- fit / predict
    def fit(self, y: pd.Series, weight: pd.Series):
        idx = y.index
        self.cols = list(self.pull_matrix(idx).columns)
        Xp = self.pull_matrix(idx).values
        w, H, L, month = self.push_inputs(idx)
        ly, sw = np.log(y.values), np.sqrt(weight.values)
        g0 = np.array([GAMMA0.get(m, 1.0) for m in self.markets])
        nm, nk = len(self.markets), Xp.shape[1]

        def resid(th):
            gamma, lam, beta, c = th[:nm], th[nm], th[nm + 1:nm + 1 + nk], th[-1]
            pm, other = self.push(gamma, lam, w, H, L, month)
            pred = c + np.log(pm.sum(axis=1) + other) + Xp @ beta
            return np.concatenate([sw * (ly - pred), np.sqrt(self.kappa) * (gamma - g0) / np.maximum(g0, 1),
                                   np.sqrt(self.ridge) * beta])

        th0 = np.concatenate([g0, [0.5], np.zeros(nk), [ly.mean()]])
        lo = np.concatenate([np.zeros(nm), [0], -np.inf * np.ones(nk), [-np.inf]])
        hi = np.concatenate([20 * np.ones(nm), [5], np.inf * np.ones(nk), [np.inf]])
        r = least_squares(resid, th0, bounds=(lo, hi), max_nfev=400)
        self.gamma = pd.Series(r.x[:nm], index=self.markets)
        self.lam, self.beta, self.c = r.x[nm], pd.Series(r.x[nm + 1:nm + 1 + nk], index=self.cols), r.x[-1]
        return self

    def predict(self, idx, by_market: bool = False):
        Xp = self.pull_matrix(idx)[self.cols].values
        w, H, L, month = self.push_inputs(idx)
        pm, other = self.push(self.gamma.values, self.lam, w, H, L, month)
        pull = np.exp(self.c + Xp @ self.beta.values)
        total = pd.Series(pull * (pm.sum(axis=1) + other), index=idx)
        if not by_market:
            return total
        parts = pd.DataFrame(pm * pull[:, None], index=idx, columns=self.markets)
        parts["other"] = other * pull
        return total, parts

    def push_index(self, idx) -> pd.Series:
        """Source-market free-time pull-independent index (1 = average day of the month)."""
        w, H, L, month = self.push_inputs(idx)
        pm, other = self.push(self.gamma.values, self.lam, w, H, L, month)
        return pd.Series(pm.sum(axis=1) + other, index=idx)


def rake(parts: pd.DataFrame, day_totals: pd.Series, market_totals: pd.Series, iters: int = 50) -> pd.DataFrame:
    """Iterative proportional fitting: daily rows sum to the actual stays, market columns to the known season
    totals (markets without a known total are left free)."""
    p = parts.clip(lower=0).copy()
    for _ in range(iters):
        p = p.mul(day_totals / p.sum(axis=1), axis=0)
        known = [c for c in market_totals.index if c in p]
        p[known] = p[known].mul(market_totals[known] / p[known].sum(), axis=1)
    return p.mul(day_totals / p.sum(axis=1), axis=0)


def market_split(pp: PushPull, f: pd.DataFrame, y: pd.Series, season_shares: pd.Series) -> pd.DataFrame:
    """Daily stays per market for the days of y: push-pull split, raked so that days sum to y and each
    market's season total matches season_shares (shares of nights, Landesstatistik Tirol)."""
    _, parts = pp.predict(y.index, by_market=True)
    tot = y.sum()
    known = season_shares.reindex(parts.columns).dropna()
    known = known[known.index != "other"]
    market_totals = known * tot
    return rake(parts, y, market_totals)
