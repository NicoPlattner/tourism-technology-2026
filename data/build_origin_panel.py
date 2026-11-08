"""Tirol x origin x month panel for the GUI models (M1 guests/nights, M2 length of stay).

Rows: destination state x origin (Statistik Austria country / German region / Austrian state) x month,
2004-11 .. 2027-12 (future months have no target). All 9 Austrian states (pooled training; Tirol is the
main destination). Origins: >= 20,000 nights per year in that state.

Columns
  nights, arrivals                Statistik Austria OGD_touextsai_Tour_HKL_1 (CC BY 4.0), Tirol
  lag{1,2,3}_nights / _arrivals   same month in the 1st/2nd/3rd most recent NON-COVID year (Mar 2020-Apr 2022 skipped)
  covid                           target month inside the COVID window (excluded from training)
  school_days                     days of school holiday in the origin in that month (population-weighted share
                                  of the origin on holiday, summed over days); NaN where no calendar exists
  school_days_ly                  the same for the month one year earlier (what changed vs last year)
  pub_weekdays, longwe_days, bridge_days   public holidays on weekdays, long-weekend days, bridge days in the
                                  origin (python `holidays`, national + regional, any year)
  easter_days, carnival_days, pentecost_days, ascension_days   rule-based, for every origin
  weekend_days, days_in_month
Origin holiday mapping: German regions -> their Länder (population-weighted), Austrian states -> that state,
countries -> national calendar (OpenHolidays school data where available; DK, GB, SE from the rule generator).

    python3 data/build_origin_panel.py   -> data/processed/origin_panel.parquet
"""
from __future__ import annotations

import json
import pathlib

import holidays as pyholidays
import numpy as np
import pandas as pd
from dateutil.easter import easter

from holiday_corrections import fix

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw" / "open"
HH = RAW / "holidays_hist"
OUT = ROOT / "processed" / "origin_panel.parquet"
COVID = (pd.Timestamp("2020-03-01"), pd.Timestamp("2022-04-01"))
START, END = "2004-11-01", "2027-12-01"

DE_POP = {"BW": 11.3, "BY": 13.4, "BE": 3.9, "BB": 2.6, "HB": .7, "HH": 1.9, "HE": 6.4, "MV": 1.6,
          "NI": 8.1, "NW": 18.1, "RP": 4.2, "SL": 1.0, "SN": 4.1, "ST": 2.2, "SH": 3.0, "TH": 2.1}
AT_HOL = {"WI": "9", "BL": "1", "KÄ": "2", "NÖ": "3", "OÖ": "4", "SB": "5", "SM": "6", "TI": "7", "VA": "8"}
# Statistik Austria origin code -> (country, subdivisions or None)
ORIGIN = {
    "80": ("DE", ["BY"]), "81": ("DE", ["BW"]), "82": ("DE", ["NW"]), "83": ("DE", ["HE", "RP", "SL"]),
    "84": ("DE", ["HH", "HB", "NI", "SH"]), "85": ("DE", ["BB", "MV", "SN", "ST", "TH"]), "53": ("DE", ["BE"]),
    "01": ("AT", ["WI"]), "70": ("AT", ["BL"]), "71": ("AT", ["KÄ"]), "72": ("AT", ["NÖ"]), "73": ("AT", ["OÖ"]),
    "74": ("AT", ["SB"]), "75": ("AT", ["SM"]), "76": ("AT", ["TI"]), "77": ("AT", ["VA"]),
    "25": ("NL", None), "32": ("CH", None), "62": ("BE", None), "16": ("GB", None), "09": ("CZ", None),
    "20": ("IT", None), "27": ("PL", None), "14": ("FR", None), "11": ("DK", None), "39": ("US", None),
    "31": ("SE", None), "19": ("IL", None), "38": ("HU", None), "63": ("LU", None), "29": ("RO", None),
    "10": ("SK", None), "18": ("IE", None), "33": ("ES", None), "67": ("CN", None), "60": ("AU", None),
    "13": ("FI", None), "17": ("IN", None), "92": ("UA", None), "26": ("NO", None), "52": ("SI", None),
    "23": ("CA", None), "04": ("AR", None), "07": ("BR", None), "08": ("BG", None), "12": ("DE", None),
    "15": ("GR", None), "21": ("JP", None), "24": ("MX", None), "28": ("PT", None), "30": ("RU", None),
    "91": ("RU", None), "34": ("ZA", None), "36": ("TR", None), "49": ("IS", None), "51": ("HR", None),
    "61": ("NZ", None), "64": ("KR", None), "65": ("TW", None), "86": ("EE", None), "88": ("LV", None),
    "89": ("LT", None), "90": ("MT", None), "93": ("CY", None),
    # groups without one calendar (checked against the official code list OGD_touextsai_Tour_HKL_1_C-C93-2)
    "56": (None, None), "59": (None, None), "57": (None, None), "58": (None, None), "37": (None, None),
    "40": (None, None), "87": (None, None), "22": (None, None),
}
POP = {"CH": {"ZH": 1.58, "BE": 1.05, "LU": .42, "UR": .04, "SZ": .17, "OW": .04, "NW": .04, "GL": .04, "ZG": .13,
              "FR": .33, "SO": .28, "BS": .2, "BL": .29, "SH": .08, "AR": .06, "AI": .02, "SG": .52, "GR": .2,
              "AG": .71, "TG": .29, "TI": .36, "VD": .83, "VS": .36, "NE": .18, "GE": .51, "JU": .07},
       "BE": {"NL": 6.8, "FR": 4.4, "DE": .08}, "FR": {"ZA": .31, "ZB": .38, "ZC": .31},
       "PL": {"DS": 2.9, "KP": 2.0, "LU": 2.0, "LB": 1.0, "LD": 2.4, "MA": 3.4, "MZ": 5.5, "OP": .95, "PK": 2.1,
              "PD": 1.15, "PM": 2.35, "SL": 4.4, "SK": 1.2, "WN": 1.4, "WP": 3.5, "ZP": 1.65}}
STATIC = {"DK", "GB", "SE"}  # rule-generated school calendars (data/static/school_holidays_extra.csv)


def _leaves(nodes):
    return [x for n in nodes for x in (_leaves(n["children"]) if n.get("children") else [n["code"]])]


def school_daily(country: str, subs: list | None, days: pd.DatetimeIndex) -> pd.Series:
    """Population-weighted share of the origin on school holiday per day; NaN in years without data."""
    out = pd.Series(np.nan, index=days)
    if country in STATIC:
        st = pd.read_csv(ROOT / "static" / "school_holidays_extra.csv", comment="#")
        st = st[st.country == country]
        s = pd.Series(0.0, index=days)
        for r in st.itertuples():
            rng = (days >= r.start) & (days <= r.end)
            s[rng] = np.minimum(s[rng] + r.share, 1.0)
        first = pd.Timestamp(st.start.min()) + pd.Timedelta(days=60)
        return s.where(days >= first)
    p = HH / f"{country}_School.json"
    if not p.exists():
        return out
    recs = fix(country, json.loads(p.read_text()))
    if not recs:
        return out
    if country is None:
        return out
    if country == "DE":
        w = {f"DE-{k}": DE_POP[k] for k in (subs or DE_POP)}
    elif country == "AT":
        w = {f"AT-{k}": 1.0 for k in subs}
    elif country in POP:
        w = {f"{country}-{k}": v for k, v in POP[country].items()}
    else:
        tree = json.loads((HH / f"{country}_subdivisions.json").read_text()) or []
        w = {k: 1.0 for k in _leaves(tree)} or {country: 1.0}
    on = pd.DataFrame(0.0, index=days, columns=list(w))
    for h in recs:
        rng = (days >= h["startDate"]) & (days <= h["endDate"])
        codes = [s["code"] for s in (h.get("subdivisions") or [])] + [g["code"] for g in (h.get("groups") or [])]
        if h.get("nationwide") or not codes:
            on.loc[rng, :] = 1.0
            continue
        for code in codes:
            hit = [k for k in w if k == code or k.startswith(code + "-") or code.startswith(k + "-")]
            on.loc[rng, hit] = 1.0
    s = sum(on[k] * v for k, v in w.items()) / sum(w.values())
    years = sorted({int(h["startDate"][:4]) for h in recs})
    first_full = pd.Timestamp(f"{years[0] + 1}-01-01") if len(years) > 1 else pd.Timestamp(f"{years[0]}-01-01")
    last = max(pd.Timestamp(h["endDate"]) for h in recs)
    return s.where((days >= first_full) & (days <= last))


def public_daily(country: str, subs: list | None, days: pd.DatetimeIndex) -> pd.DataFrame:
    """Population-weighted public holiday, long-weekend and bridge-day shares per day (any year)."""
    years = range(days.min().year, days.max().year + 1)
    if country is None:
        return pd.DataFrame(np.nan, index=days, columns=["pub", "longwe", "bridge"])
    if country == "DE":
        regs = {s: (DE_POP[s], s) for s in (subs or DE_POP)}
    elif country == "AT":
        regs = {s: (1.0, AT_HOL[s]) for s in subs}
    else:
        regs = {country: (1.0, None)}
    tot = sum(w for w, _ in regs.values())
    acc = pd.DataFrame(0.0, index=days, columns=["pub", "longwe", "bridge"])
    for w, sub in regs.values():
        try:
            hol = set(pyholidays.country_holidays(country, subdiv=sub, years=years))
        except (NotImplementedError, KeyError):
            return pd.DataFrame(np.nan, index=days, columns=acc.columns)
        ph = pd.Series(days.date, index=days).isin(hol)
        off = ph | (days.dayofweek >= 5)
        rid = (off != off.shift()).cumsum()
        run = off.groupby(rid).transform("size").where(off, 0)
        has = ph.groupby(rid).transform("max").where(off, False)
        acc["pub"] += (ph & (days.dayofweek < 5)).astype(float) * w / tot
        acc["longwe"] += ((run >= 3) & has).astype(float) * w / tot
        acc["bridge"] += ((~off) & off.shift(1, fill_value=False) & off.shift(-1, fill_value=False)).astype(float) * w / tot
    return acc


def universal(days: pd.DatetimeIndex) -> pd.DataFrame:
    e = np.array([np.datetime64(easter(d.year)) for d in days])
    off = (days.values - e).astype("timedelta64[D]").astype(int)
    return pd.DataFrame({"easter_days": ((off >= -8) & (off <= 1)).astype(float),
                         "carnival_days": ((off >= -50) & (off <= -44)).astype(float),
                         "pentecost_days": ((off >= 48) & (off <= 50)).astype(float),
                         "ascension_days": ((off >= 39) & (off <= 42)).astype(float),
                         "weekend_days": (days.dayofweek >= 5).astype(float)}, index=days)


STATES = {"W96-1": "Burgenland", "W96-2": "Kärnten", "W96-3": "Niederösterreich", "W96-4": "Oberösterreich",
          "W96-5": "Salzburg", "W96-6": "Steiermark", "W96-7": "Tirol", "W96-8": "Vorarlberg", "W96-9": "Wien"}


def load_state(state: str = "W96-7") -> pd.DataFrame:
    d = pd.read_csv(RAW / "statistik_at" / "OGD_touextsai_Tour_HKL_1.csv", sep=";", dtype=str)
    d = d[d["C-W96-0"] == state]
    d = d.assign(month=pd.to_datetime(d["C-SDB_TIT-0"], format="%Y%m"), origin=d["C-C93-2"],
                 nights=pd.to_numeric(d["F-UEB"]), arrivals=pd.to_numeric(d["F-ANK"]))
    return d[["month", "origin", "nights", "arrivals"]]


def lags(s: pd.Series, k: int) -> pd.Series:
    """Value of the same calendar month in the k-th most recent non-COVID year before each month."""
    out = pd.Series(np.nan, index=s.index)
    for m in s.index:
        found, y = 0, m.year - 1
        while y >= s.index.min().year:
            cand = m.replace(year=y)
            if not (COVID[0] <= cand <= COVID[1]) and cand in s.index and pd.notna(s[cand]):
                found += 1
                if found == k:
                    out[m] = s[cand]
                    break
            y -= 1
    return out


def origin_holidays(o: str, days: pd.DatetimeIndex) -> pd.DataFrame:
    c, subs = ORIGIN[o]
    sch = school_daily(c, subs, days)
    pub = public_daily(c, subs, days)
    g = pd.concat([sch.rename("school_days"), pub], axis=1).groupby(days.to_period("M"))
    mon = g.sum(min_count=1)
    mon.loc[g.school_days.count() < g.size() * .9, "school_days"] = np.nan  # partial-coverage months
    mon.index = mon.index.to_timestamp()
    return mon.rename(columns={"pub": "pub_weekdays", "longwe": "longwe_days", "bridge": "bridge_days"})


def build(states=tuple(STATES), min_nights: float = 20000) -> pd.DataFrame:
    """Panel for all destination states (pooled training gives ~9x more data; Tirol is the main destination)."""
    names = pd.read_csv(RAW / "statistik_at" / "OGD_touextsai_Tour_HKL_1_C-C93-2.csv", sep=";", dtype=str)
    names = dict(zip(names.code, names.en_name.str.replace(r"\s*\(.*?\)|\s*<.*?>", "", regex=True).str.strip()))
    months = pd.date_range(START, END, freq="MS")
    days = pd.date_range(START, pd.Timestamp(END) + pd.offsets.MonthEnd(0), freq="D")
    uni = universal(days).groupby(days.to_period("M")).sum()
    uni.index = uni.index.to_timestamp()
    hol_cache, rows = {}, []
    for st in states:
        t = load_state(st)
        recent = t[(t.month >= "2023-11-01") & (t.month <= "2025-10-01")].groupby("origin").nights.sum() / 2
        origins = [o for o in recent[recent >= min_nights].index if o in ORIGIN]
        for o in origins:
            if o not in hol_cache:
                hol_cache[o] = origin_holidays(o, days)
            obs = t[t.origin == o].set_index("month").reindex(months)
            df = pd.concat([obs[["nights", "arrivals"]], hol_cache[o].reindex(months), uni.reindex(months)], axis=1)
            df["school_days_ly"] = df.school_days.shift(12)
            for v in ("nights", "arrivals"):
                s_ = df[v].where(~df.index.to_series().between(*COVID))
                for k in (1, 2, 3):
                    df[f"lag{k}_{v}"] = lags(s_, k)
            df["covid"] = df.index.to_series().between(*COVID).astype(int)
            df["origin"], df["origin_name"], df["country"] = o, names.get(o, o), ORIGIN[o][0]
            df["dest"], df["dest_name"] = st, STATES[st]
            df["month_of_year"], df["year"] = df.index.month, df.index.year
            df["days_in_month"] = df.index.days_in_month
            rows.append(df)
        print(STATES[st], len(origins), "origins")
    return pd.concat(rows).rename_axis("month").reset_index()


if __name__ == "__main__":
    p = build()
    OUT.parent.mkdir(exist_ok=True)
    p.to_parquet(OUT)
    print(p.shape, p.origin.nunique(), "origins", p.month.min().date(), "..", p.month.max().date())
    cov = p.groupby("country").school_days.apply(lambda s: s.notna().mean()).round(2)
    print("school-holiday coverage share by country:", cov.to_dict())
    print(p[(p.origin == "80") & (p.dest == "W96-7") & (p.month >= "2025-12-01") & (p.month <= "2026-04-01")][
        ["month", "nights", "arrivals", "lag1_nights", "school_days", "pub_weekdays", "longwe_days", "easter_days"]].to_string())
