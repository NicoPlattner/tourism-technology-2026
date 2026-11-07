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

import numpy as np
import pandas as pd
from dateutil.easter import easter

ROOT = pathlib.Path(__file__).resolve().parent
RAW, STATIC, OUT = ROOT / "raw" / "open", ROOT / "static", ROOT / "processed"
REGION = "Paznaun - Ischgl"
START, END = "2022-01-01", "2027-08-31"

# ASSUMED market mix (share of winter stays), not verified: DE/NL/BE values come from a web-search
# snippet of an MCI poster (Paznaun-Ischgl DE 50 %, NL 13 %, BE 7 %), the rest are placeholders.
# Replace with nationality data from the TVB or Statistik Austria STATcube.
MARKET_SHARE = {"DE": .50, "NL": .13, "BE": .07, "CH": .05, "AT": .05, "DK": .04, "GB": .04,
                "PL": .03, "CZ": .02, "SE": .02, "FR": .02, "LU": .01, "IT": .01}
# German Länder population (millions, 2023) to weight Land-level holidays.
DE_POP = {"BW": 11.3, "BY": 13.4, "BE": 3.9, "BB": 2.6, "HB": .7, "HH": 1.9, "HE": 6.4, "MV": 1.6,
          "NI": 8.1, "NW": 18.1, "RP": 4.2, "SL": 1.0, "SN": 4.1, "ST": 2.2, "SH": 3.0, "TH": 2.1}


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
    hd = RAW / "holidays"
    out = pd.DataFrame(index=idx)
    for c in [m for m in MARKET_SHARE if (hd / f"{m}_SchoolHolidays.json").exists()]:
        subs = json.loads((hd / f"{c}_subdivisions.json").read_text())
        if c == "DE":  # Länder, population-weighted
            w = {f"DE-{k}": v for k, v in DE_POP.items()}
        else:  # leaves of the subdivision tree (e.g. NL municipalities), equal weight
            def leaves(nodes):
                return [x for n in nodes for x in (leaves(n["children"]) if n.get("children") else [n["code"]])]
            w = {k: 1.0 for k in leaves(subs)} or {c: 1.0}
        days = pd.DataFrame(0.0, index=idx, columns=list(w))
        for kind in ("SchoolHolidays", "PublicHolidays"):
            for h in json.loads((hd / f"{c}_{kind}.json").read_text()):
                if kind == "PublicHolidays" and not h.get("nationwide", False):
                    continue
                rng = (idx >= h["startDate"]) & (idx <= h["endDate"])
                if h.get("nationwide", False) or not h.get("subdivisions"):
                    days.loc[rng, :] = 1.0
                    continue
                for sub in h["subdivisions"]:
                    code = sub["code"]
                    hit = [k for k in w if k == code or k.startswith(code + "-") or code.startswith(k + "-")]
                    days.loc[rng, hit] = 1.0
        tot = sum(w.values())
        s = sum(days[k] * (v / tot) for k, v in w.items())
        out[f"hol_{c}"] = s
    st = pd.read_csv(STATIC / "school_holidays_dk_gb.csv", comment="#")
    for c, g in st.groupby("country"):
        s = pd.Series(0.0, index=idx)
        for r in g.itertuples():
            rng = (idx >= r.start) & (idx <= r.end)
            s[rng] = np.minimum(s[rng] + r.share, 1.0)
        out[f"hol_{c}"] = s
    cols = [f"hol_{m}" for m in MARKET_SHARE if f"hol_{m}" in out]
    out["hol_weighted"] = sum(out[c] * MARKET_SHARE[c[4:]] for c in cols) / sum(MARKET_SHARE[c[4:]] for c in cols)
    at = json.loads((hd / "AT_PublicHolidays.json").read_text()) if (hd / "AT_PublicHolidays.json").exists() else []
    out["at_public_holiday"] = 0
    for h in at:
        if h.get("nationwide"):
            out.loc[(idx >= h["startDate"]) & (idx <= h["endDate"]), "at_public_holiday"] = 1
    return out


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


def dq_flags(f: pd.DataFrame) -> pd.DataFrame:
    f["dq_official_zero"] = (f.official_daily < 1).astype(int)
    f["dq_official_over_cap"] = (f.official_daily > f.beds_static).astype(int)
    f["dq_pseudo_missing"] = f.pseudo_actual.isna().astype(int)
    return f


def build() -> pd.DataFrame:
    idx = pd.date_range(START, END, freq="D", name="date")
    f = pd.concat([calendar(idx), holiday_intensity(idx), season(idx), events(idx), snow(idx), targets(idx)], axis=1)
    return dq_flags(f)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    df = build()
    df.to_parquet(OUT / "features_daily.parquet")
    print(df.shape, "->", OUT / "features_daily.parquet")
    print(df.loc["2025-12-20":"2026-01-08", ["dow", "hol_DE", "hol_NL", "hol_weighted", "in_season",
                                             "event_G", "snow_cm_ski_area_idalpe", "pseudo_actual",
                                             "official_daily"]].round(2).to_string())
