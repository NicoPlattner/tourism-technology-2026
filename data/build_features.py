"""Build the daily feature table for Challenge 04 from open data.

Output: data/processed/features_daily.parquet (git-ignored), one row per day
2022-01-01 .. 2027-08-31, with
  calendar      dow, month, iso week, Christmas / Easter / carnival phases, AT public holiday
  markets       school-holiday intensity per source market (0..1) and a market-share-weighted index
  season        in_season, days since opening, opening / closing weekend flags
  events        large/medium/small event flags for Paznaun from the Nächtigungsprognose repo
  snow          SNOWGRID snow depth (ski area, village), 3-day new snow
  targets       official daily forecast (TR53 API), monthly actual (TR53), pseudo-daily actual
Partner columns are joined later by models (never written to git).

pseudo_actual: the open daily regional index 2022-2025 (a linear combination of
Feratel and mobile-network data, z-scored) rescaled so that each month sums to
the official Statistik Austria monthly actual. It is the best open stand-in for
daily actuals; the official daily LASSO was fitted on the same index, so any
in-sample comparison flatters the official forecast.
"""
import json
import pathlib

import sys

import numpy as np
import pandas as pd
from dateutil.easter import easter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

ROOT = pathlib.Path(__file__).resolve().parent
RAW, STATIC, OUT = ROOT / "raw" / "open", ROOT / "static", ROOT / "processed"
REGION = "Paznaun - Ischgl"
START, END = "2022-01-01", "2027-08-31"

from holiday_features import MARKET_SHARE, build as build_holidays  # noqa: E402


def calendar(idx: pd.DatetimeIndex) -> pd.DataFrame:
    f = pd.DataFrame(index=idx)
    f["dow"] = idx.dayofweek
    f["month"] = idx.month
    f["isoweek"] = idx.isocalendar().week.values.astype(int)
    f["is_sat"] = (idx.dayofweek == 5).astype(int)
    f["is_weekend_night"] = idx.dayofweek.isin([4, 5]).astype(int)  # Fri/Sat nights
    e = np.array([np.datetime64(easter(d.year)) for d in idx])
    off = (idx.values - e).astype("timedelta64[D]").astype(int)
    f["easter_offset"] = off
    f["easter_window"] = ((off >= -9) & (off <= 8)).astype(int)  # Palm Saturday-ish .. Easter week
    f["carnival_week"] = ((off >= -52) & (off <= -45)).astype(int)  # Mon before Ash Wed .. Sun after
    doy = idx.dayofyear
    xm = pd.Series(idx.month * 100 + idx.day, index=idx)
    f["xmas_newyear"] = (((xm >= 1224) | (xm <= 106))).astype(int).values
    f["pre_xmas"] = ((xm >= 1214) & (xm <= 1223)).astype(int).values
    f["fourier_s1"], f["fourier_c1"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    return f


def holiday_intensity(idx: pd.DatetimeIndex) -> pd.DataFrame:
    """School holidays, public holidays (national + regional), long weekends and bridge days per
    source market, population-weighted, year-specific (data/holiday_features.py).
    hol_<C> / hol_weighted are kept as aliases of school_<C> / school_weighted."""
    h = build_holidays(idx)
    for c in MARKET_SHARE:
        if f"school_{c}" in h:
            h[f"hol_{c}"] = h[f"school_{c}"]
    h["hol_weighted"] = h["school_weighted"]
    h["at_public_holiday"] = (h["pub_AT"] >= .5).astype(int)
    return h


def season(idx: pd.DatetimeIndex) -> pd.DataFrame:
    sd = pd.read_csv(STATIC / "season_dates.csv", comment="#", parse_dates=["first_day", "last_day",
                                                                            "opening_concert", "closing_concert"])
    f = pd.DataFrame({"in_season": 0, "days_since_open": -1, "days_to_close": -1, "opening_weekend": 0,
                      "closing_weekend": 0}, index=idx)
    for r in sd.itertuples():
        m = (idx >= r.first_day) & (idx <= r.last_day)
        f.loc[m, "in_season"] = 1
        f.loc[m, "days_since_open"] = (idx[m] - r.first_day).days
        f.loc[m, "days_to_close"] = (r.last_day - idx[m]).days
        f.loc[(idx >= r.first_day) & (idx <= r.first_day + pd.Timedelta(days=3)), "opening_weekend"] = 1
        if pd.notna(r.closing_concert):
            f.loc[(idx >= r.closing_concert - pd.Timedelta(days=2)) & (idx <= r.closing_concert), "closing_weekend"] = 1
    return f


def events(idx: pd.DatetimeIndex) -> pd.DataFrame:
    f = pd.DataFrame(index=idx)
    for size in "GMK":
        p = RAW / "np_repo" / f"Events_Konzerte_daily_{size}.csv"
        e = pd.read_csv(p, sep=";", encoding="latin1", dtype=str)
        e["date"] = pd.to_datetime(e["date"], format="ISO8601")
        col = [c for c in e.columns if c.startswith("Paznaun")][0]
        s = e.set_index("date")[col].fillna("").str.strip().ne("").astype(int)
        f[f"event_{size}"] = s.reindex(idx, fill_value=0).values
    return f


def snow(idx: pd.DatetimeIndex) -> pd.DataFrame:
    f = pd.DataFrame(index=idx)
    for name in ("ski_area_idalpe", "village_ischgl"):
        d = pd.read_csv(RAW / "snow" / f"snowgrid_{name}.csv")
        s = pd.Series(d["snow_depth [m]"].values * 100,
                      index=pd.to_datetime(d.time).dt.tz_localize(None).dt.normalize())
        f[f"snow_cm_{name}"] = s.reindex(idx)
    f["new_snow_3d_cm"] = f["snow_cm_ski_area_idalpe"].diff().clip(lower=0).rolling(3, min_periods=1).sum()
    return f


def targets(idx: pd.DatetimeIndex) -> pd.DataFrame:
    f = pd.DataFrame(index=idx)
    day = pd.DataFrame(json.loads((RAW / "TR53_day.json").read_text()))
    f["official_daily"] = day.assign(date=pd.to_datetime(day.date)).set_index("date").stays.reindex(idx)
    mon = pd.DataFrame(json.loads((RAW / "TR53_month.json").read_text()))
    mon = mon.assign(date=pd.to_datetime(mon.date)).set_index("date").stays
    actual_m = mon[:"2026-08"]  # later values are forecasts
    f["month_start"] = idx.to_period("M").to_timestamp()
    f["monthly_actual"] = f.month_start.map(actual_m)
    f["monthly_official"] = f.month_start.map(mon)
    px = pd.read_csv(RAW / "np_repo" / "proxy_data_daily.csv", sep=";", decimal=",", encoding="latin1")
    px = px[px.Region == REGION]
    z = pd.Series(px.time_series.values, index=pd.to_datetime(px.date, dayfirst=True)).reindex(idx)
    sc = pd.read_csv(RAW / "np_repo" / "region_scale_13032026.csv", sep=";", decimal=",", encoding="latin1")
    scale = float(sc.loc[sc.Region == REGION, "year"].iloc[0])
    daily_mean = (f.monthly_actual / idx.days_in_month).groupby(idx.year).transform("mean")  # annual mean per day
    raw = (z * scale + daily_mean).clip(lower=0)
    f["proxy_z"] = z
    f["pseudo_actual"] = raw * f.monthly_actual / raw.groupby(f.month_start).transform("sum")
    beds = pd.read_csv(RAW / "np_repo" / "bettenkapazität.csv", sep=";", encoding="latin1")
    f["beds_static"] = int(beds.loc[beds.region_vec == REGION, "bettenkapazitaet"].iloc[0])
    return f.drop(columns="month_start")


PARTNER = ROOT / "raw" / "partner"


def partner(f: pd.DataFrame) -> pd.DataFrame:
    """TVB Paznaun-Ischgl data (members-only, never committed; the parquet output is git-ignored).

    real_actual   daily actual stays 2024-11-04 .. 2026-10-31: `actual`, extended one year back with
                  `previous_year` (verified: previous_year(t) == actual(t - 365 days) on every overlap day)
    partner_fc    the TVB forecast column (origin unknown; not the TR53 forecast)
    partner_py    previous_year as delivered (same calendar date one year earlier)
    free_beds     `available_beds` = still bookable beds (falls to ~1,100 in February while stays peak)
    capacity_est  real_actual + free_beds (occupied + free)
    occupancy     real_actual / capacity_est
    ev_*          partner event calendar 2026-2027 (one row per event day)
    """
    idx = f.index
    o = PARTNER / "overnight_stays_2025-11_2027-04.csv"
    if not o.exists():
        return pd.DataFrame(index=idx)
    o = pd.read_csv(o, parse_dates=["date"]).set_index("date")
    out = pd.DataFrame(index=idx)
    out["partner_fc"] = o.forecast.reindex(idx)
    out["partner_py"] = o.previous_year.reindex(idx)
    act = o.actual.dropna()
    back = o.previous_year.copy()
    back.index = back.index - pd.Timedelta(days=365)
    out["real_actual"] = act.combine_first(back).reindex(idx)
    b = pd.read_csv(PARTNER / "available_beds_2025-02_2026-11.csv", parse_dates=["date"]).set_index("date")
    out["free_beds"] = b.available_beds.reindex(idx)
    out["capacity_est"] = out.real_actual + out.free_beds
    out["occupancy"] = out.real_actual / out.capacity_est
    ev = pd.read_csv(PARTNER / "event_calendar_2026-2027.csv", parse_dates=["date"])
    name = ev.event.str.lower()
    kinds = {"ev_any": name.str.len() > 0,
             "ev_concert": name.str.contains("concert|konzert|t.o.m|tom ", regex=True),
             "ev_sport": name.str.contains("freeride|trophy|contest|cup|race|rennen|world", regex=True),
             "ev_season_edge": name.str.contains("erster skitag|saisonab|opening|closing", regex=True)}
    for k, m in kinds.items():
        out[k] = idx.isin(ev.loc[m, "date"]).astype(int)
    out["ev_calendar_covered"] = ((idx >= "2026-01-01") & (idx <= "2027-12-31")).astype(int)
    return out


def dq_flags(f: pd.DataFrame) -> pd.DataFrame:
    f["dq_official_zero"] = (f.official_daily < 1).astype(int)
    f["dq_official_over_cap"] = (f.official_daily > f.beds_static).astype(int)
    f["dq_pseudo_missing"] = f.pseudo_actual.isna().astype(int)
    if "partner_fc" in f:
        f["dq_partner_fc_zero"] = (f.partner_fc == 0).astype(int)
    return f


def build() -> pd.DataFrame:
    idx = pd.date_range(START, END, freq="D", name="date")
    f = pd.concat([calendar(idx), holiday_intensity(idx), season(idx), events(idx), snow(idx), targets(idx)], axis=1)
    f = pd.concat([f, partner(f)], axis=1)
    return dq_flags(f)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    df = build()
    df.to_parquet(OUT / "features_daily.parquet")
    print(df.shape, "->", OUT / "features_daily.parquet")
    print(df.loc["2025-12-20":"2026-01-08", ["dow", "hol_DE", "hol_NL", "hol_weighted", "in_season",
                                             "event_G", "snow_cm_ski_area_idalpe", "pseudo_actual",
                                             "official_daily"]].round(2).to_string())
