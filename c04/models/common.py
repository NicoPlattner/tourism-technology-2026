"""Shared helpers for Challenge 04 models: feature matrix, metrics, rescaling."""
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
FEATURES = ROOT / "data" / "processed" / "features_daily.parquet"
WINTER_MONTHS = [12, 1, 2, 3, 4]
MARKETS = ["DE", "NL", "BE", "CH", "AT", "DK", "GB", "PL", "CZ", "FR", "LU", "IT"]


def load() -> pd.DataFrame:
    return pd.read_parquet(FEATURES)


def design(f: pd.DataFrame, snow: bool = True) -> pd.DataFrame:
    """Interpretable design matrix. Every column has a plain-language meaning."""
    X = pd.DataFrame(index=f.index)
    for d in range(7):
        X[f"dow_{d}"] = (f.dow == d).astype(float)
    for m in range(1, 13):
        X[f"month_{m}"] = (f.month == m).astype(float)
    for m in MARKETS:
        if f"hol_{m}" in f:
            X[f"hol_{m}"] = f[f"hol_{m}"]
    X["at_public_holiday"] = f.at_public_holiday
    for k in ("pub", "longwe", "bridge", "longwe_bridge"):  # source-market long weekends and bridge days
        if f"{k}_weighted" in f:
            X[f"{k}_weighted"] = f[f"{k}_weighted"]
    for c in ("DE", "NL", "AT", "CH"):
        if f"longwe_bridge_{c}" in f:
            X[f"longwe_bridge_{c}"] = f[f"longwe_bridge_{c}"]
    X["xmas_newyear"] = f.xmas_newyear
    X["pre_xmas"] = f.pre_xmas
    X["carnival_week"] = f.carnival_week
    off = f.easter_offset
    X["holy_week"] = ((off >= -8) & (off <= -1)).astype(float)
    X["easter_week"] = ((off >= 0) & (off <= 7)).astype(float)
    X["post_easter_2w"] = ((off >= 8) & (off <= 21)).astype(float)
    X["in_season"] = f.in_season.astype(float)
    dso = f.days_since_open
    X["season_week1"] = ((dso >= 0) & (dso < 7)).astype(float)
    X["season_week2_3"] = ((dso >= 7) & (dso < 21)).astype(float)
    dtc = f.days_to_close
    X["season_last_week"] = ((dtc >= 0) & (dtc < 7)).astype(float)
    X["opening_weekend"] = f.opening_weekend.astype(float)
    X["closing_weekend"] = f.closing_weekend.astype(float)
    if snow:
        sd = f.snow_cm_ski_area_idalpe.fillna(f.snow_cm_ski_area_idalpe.median())
        X["snow_depth_lt30cm"] = (sd < 30).astype(float) * f.in_season
        X["new_snow_3d_gt20cm"] = (f.new_snow_3d_cm.fillna(0) > 20).astype(float)
    return X


def rescale_to_month(pred: pd.Series, totals: pd.Series) -> pd.Series:
    """Scale daily values so that each calendar month sums to the given monthly total."""
    key = pred.index.to_period("M")
    s = pred.clip(lower=0)
    return s * totals / s.groupby(key).transform("sum")


def wmape(a: pd.Series, p: pd.Series) -> float:
    m = a.notna() & p.notna()
    return float((a[m] - p[m]).abs().sum() / a[m].abs().sum())


def peak_mask(idx: pd.DatetimeIndex, f: pd.DataFrame) -> pd.Series:
    """Peak periods judged separately: Christmas/New Year, Feb half-terms, Easter window."""
    return (f.xmas_newyear.astype(bool) | ((idx.month == 2) & (f.hol_weighted > .2)) |
            ((f.easter_offset >= -9) & (f.easter_offset <= 8)))
