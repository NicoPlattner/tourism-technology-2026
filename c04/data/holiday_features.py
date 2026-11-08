"""Holiday features per source market, population-weighted, for every day (year-specific dates).

Per market C:
  school_C        share of the population whose schools are on holiday (OpenHolidays + static supplement)
  pub_C           share of the population with a public holiday that day (national + regional;
                  python `holidays` package, rule-based for any year, per state / canton / region)
  longwe_C        share of the population in a long weekend: a run of >= 3 consecutive work-free days
                  (weekend or public holiday) that contains at least one public holiday
  bridge_C        share of the population for whom the day is a bridge day ("Fenstertag"): a single
                  working day between two work-free days
  longwe_bridge_C share of the population in a run of >= 4 work-free days once bridge days are taken off
Plus `<feature>_weighted`: the same, weighted by the monthly market mix of Tirol from Statistik Austria
(data/market_mix.py; falls back to the assumed MARKET_SHARE). German states are weighted by where German
guests in Tirol come from (Statistik Austria origin regions), not by population.

Weights: population of states / cantons / communities / voivodeships where the calendar differs
by region (approximate 2023-2024 figures, millions); equal weights over subdivisions elsewhere.
"""
from __future__ import annotations

import json
import pathlib

import sys

import holidays as pyholidays
import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from holiday_corrections import fix  # noqa: E402
HD = ROOT / "raw" / "open" / "holidays"
STATIC = ROOT / "static" / "school_holidays_extra.csv"

# ASSUMED market mix (share of stays), not verified; replace with TVB / STATcube nationality data.
MARKET_SHARE = {"DE": .50, "NL": .13, "BE": .07, "CH": .05, "AT": .05, "DK": .04, "GB": .04,
                "PL": .03, "CZ": .02, "SE": .02, "FR": .02, "LU": .01, "IT": .01}

POP = {  # population weights for regional calendars (millions, approx.)
    "DE": {"BW": 11.3, "BY": 13.4, "BE": 3.9, "BB": 2.6, "HB": .7, "HH": 1.9, "HE": 6.4, "MV": 1.6,
           "NI": 8.1, "NW": 18.1, "RP": 4.2, "SL": 1.0, "SN": 4.1, "ST": 2.2, "SH": 3.0, "TH": 2.1},
    "AT": {"BL": .30, "KÄ": .57, "NÖ": 1.72, "OÖ": 1.52, "SB": .57, "SM": 1.27, "TI": .77, "VA": .41, "WI": 2.0},
    "CH": {"ZH": 1.58, "BE": 1.05, "LU": .42, "UR": .04, "SZ": .17, "OW": .04, "NW": .04, "GL": .04,
           "ZG": .13, "FR": .33, "SO": .28, "BS": .2, "BL": .29, "SH": .08, "AR": .06, "AI": .02,
           "SG": .52, "GR": .2, "AG": .71, "TG": .29, "TI": .36, "VD": .83, "VS": .36, "NE": .18,
           "GE": .51, "JU": .07},
    "BE": {"NL": 6.8, "FR": 4.4, "DE": .08},
    "PL": {"DS": 2.9, "KP": 2.0, "LU": 2.0, "LB": 1.0, "LD": 2.4, "MA": 3.4, "MZ": 5.5, "OP": .95,
           "PK": 2.1, "PD": 1.15, "PM": 2.35, "SL": 4.4, "SK": 1.2, "WN": 1.4, "WP": 3.5, "ZP": 1.65},
    "FR": {"ZA": .31, "ZB": .38, "ZC": .31},  # metropolitan school zones; overseas ignored
    "GB": {"ENG": 56.5, "SCT": 5.4, "WLS": 3.1, "NIR": 1.9},
}
# `holidays` package subdivision codes for Austria are 1..9
AT_HOLIDAYS_SUBDIV = {"1": "BL", "2": "KÄ", "3": "NÖ", "4": "OÖ", "5": "SB", "6": "SM", "7": "TI", "8": "VA", "9": "WI"}
BE_HOLIDAYS_SUBDIV = {"Flemish": "NL", "French": "FR", "German": "DE"}


MIX_FILE = ROOT / "processed" / "market_mix_monthly.parquet"


def load_mix():
    """Monthly market shares (Statistik Austria, Tirol) if built by data/market_mix.py, else None."""
    return pd.read_parquet(MIX_FILE) if MIX_FILE.exists() else None


def _de_origin_weights(mix: pd.DataFrame) -> dict:
    """German Länder weights from where German guests in Tirol come from (last 3 winters),
    split inside each Statistik Austria origin region by population."""
    from market_mix import DE_REGION_LAENDER
    win = mix[mix.index.month.isin([12, 1, 2, 3])].iloc[-12:]
    w = {}
    for reg, laender in DE_REGION_LAENDER.items():
        share = win.get(f"de_region_{reg}", pd.Series(0.0)).mean()
        pop = sum(POP["DE"][l] for l in laender)
        for l in laender:
            w[l] = share * POP["DE"][l] / pop
    return w


def daily_market_weights(idx: pd.DatetimeIndex, mix: pd.DataFrame) -> pd.DataFrame:
    """Market share per day = share in that calendar month; months after the data use the latest
    year with the same calendar month."""
    cols = [c for c in MARKET_SHARE if c in mix]
    out = pd.DataFrame(index=idx, columns=cols, dtype=float)
    for m in pd.date_range(idx.min().to_period("M").to_timestamp(), idx.max(), freq="MS"):
        src = m if m in mix.index else mix.index[mix.index.month == m.month].max()
        out.loc[(idx >= m) & (idx < m + pd.offsets.MonthBegin(1))] = mix.loc[src, cols].values
    return out


def _leaves(nodes):
    return [x for n in nodes for x in (_leaves(n["children"]) if n.get("children") else [n["code"]])]


def school(idx: pd.DatetimeIndex) -> pd.DataFrame:
    out = pd.DataFrame(index=idx)
    for c in MARKET_SHARE:
        p = HD / f"{c}_SchoolHolidays.json"
        if not p.exists():
            continue
        recs = fix(c, json.loads(p.read_text()))
        if c == "DE" and "DE_ORIGIN" in POP:
            w = {f"DE-{k}": v for k, v in POP["DE_ORIGIN"].items()}
        elif c in POP:
            w = {f"{c}-{k}": v for k, v in POP[c].items()}
        else:
            subs = json.loads((HD / f"{c}_subdivisions.json").read_text())
            w = {k: 1.0 for k in _leaves(subs)} or {c: 1.0}
        tot = sum(w.values())
        days = pd.DataFrame(0.0, index=idx, columns=list(w))
        for h in recs:
            rng = (idx >= h["startDate"]) & (idx <= h["endDate"])
            codes = [s["code"] for s in (h.get("subdivisions") or [])] + [g["code"] for g in (h.get("groups") or [])]
            if h.get("nationwide") or not codes:
                days.loc[rng, :] = 1.0
                continue
            for code in codes:
                hit = [k for k in w if k == code or k.startswith(code + "-") or code.startswith(k + "-")]
                days.loc[rng, hit] = 1.0  # unknown codes (e.g. French overseas) hit nothing
        out[c] = sum(days[k] * v for k, v in w.items()) / tot
    st = pd.read_csv(STATIC, comment="#")
    for c, g in st.groupby("country"):
        s = out[c].copy() if c in out else pd.Series(0.0, index=idx)
        add = pd.Series(0.0, index=idx)
        for r in g.itertuples():
            rng = (idx >= r.start) & (idx <= r.end)
            add[rng] = np.minimum(add[rng] + r.share, 1.0)
        out[c] = np.maximum(s, add)  # supplement fills gaps, never lowers API data
    return out.add_prefix("school_")


def _region_calendars(c: str, years) -> dict[str, tuple[float, set]]:
    """{region: (weight, set of public-holiday dates)} for country c."""
    if c == "AT":
        return {AT_HOLIDAYS_SUBDIV[s]: (POP["AT"][AT_HOLIDAYS_SUBDIV[s]],
                                        set(pyholidays.country_holidays("AT", subdiv=s, years=years)))
                for s in AT_HOLIDAYS_SUBDIV}
    if c == "BE":
        return {BE_HOLIDAYS_SUBDIV[s]: (POP["BE"][BE_HOLIDAYS_SUBDIV[s]],
                                        set(pyholidays.country_holidays("BE", subdiv=s, years=years)))
                for s in BE_HOLIDAYS_SUBDIV}
    if c == "DE" and "DE_ORIGIN" in POP:
        return {s: (POP["DE_ORIGIN"][s], set(pyholidays.country_holidays(c, subdiv=s, years=years))) for s in POP["DE"]}
    if c in ("DE", "CH", "GB"):
        return {s: (POP[c][s], set(pyholidays.country_holidays(c, subdiv=s, years=years))) for s in POP[c]}
    return {c: (1.0, set(pyholidays.country_holidays(c, years=years)))}


def public(idx: pd.DatetimeIndex) -> pd.DataFrame:
    years = range(idx.min().year - 1, idx.max().year + 2)
    ext = pd.date_range(idx.min() - pd.Timedelta(days=10), idx.max() + pd.Timedelta(days=10), freq="D")
    out = {}
    for c in MARKET_SHARE:
        regs = _region_calendars(c, years)
        tot = sum(w for w, _ in regs.values())
        feats = {k: pd.Series(0.0, index=ext) for k in ("pub", "longwe", "bridge", "longwe_bridge")}
        for w, hol in regs.values():
            ph = pd.Series(ext.date, index=ext).isin(hol)
            off = ph | (ext.dayofweek >= 5)
            # runs of work-free days
            run_id = (off != off.shift()).cumsum()
            run_len = off.groupby(run_id).transform("size").where(off, 0)
            run_has_ph = ph.groupby(run_id).transform("max").where(off, False)
            longwe = (run_len >= 3) & run_has_ph
            bridge = (~off) & off.shift(1, fill_value=False) & off.shift(-1, fill_value=False)
            off_b = off | bridge
            rid_b = (off_b != off_b.shift()).cumsum()
            len_b = off_b.groupby(rid_b).transform("size").where(off_b, 0)
            has_bridge = bridge.groupby(rid_b).transform("max").where(off_b, False)
            longwe_b = (len_b >= 4) & has_bridge
            for k, s in (("pub", ph), ("longwe", longwe), ("bridge", bridge), ("longwe_bridge", longwe_b)):
                feats[k] += s.astype(float) * w / tot
        for k, s in feats.items():
            out[f"{k}_{c}"] = s.reindex(idx)
    return pd.DataFrame(out, index=idx)


def build(idx: pd.DatetimeIndex) -> pd.DataFrame:
    mix = load_mix()
    if mix is not None:  # German states weighted by where German guests come from, not by population
        POP["DE_ORIGIN"] = _de_origin_weights(mix)
    f = pd.concat([school(idx), public(idx)], axis=1)
    w = daily_market_weights(idx, mix) if mix is not None else \
        pd.DataFrame({c: MARKET_SHARE[c] for c in MARKET_SHARE}, index=idx)
    for k in ("school", "pub", "longwe", "bridge", "longwe_bridge"):
        cs = [c for c in w if f"{k}_{c}" in f]
        f[f"{k}_weighted"] = sum(f[f"{k}_{c}"] * w[c] for c in cs) / w[cs].sum(axis=1)
    f.attrs["market_weights"] = "Statistik Austria Tirol monthly mix" if mix is not None else "assumed MARKET_SHARE"
    return f


def audit(f: pd.DataFrame) -> pd.DataFrame:
    """Days with any school holiday per market and year: a sudden drop means missing data."""
    cols = [c for c in f if c.startswith("school_") and c != "school_weighted"]
    return pd.DataFrame({c[7:]: (f[c] > 0).groupby(f.index.year).sum() for c in cols})


if __name__ == "__main__":
    idx = pd.date_range("2022-01-01", "2027-08-31", freq="D")
    f = build(idx)
    print(audit(f).to_string())
    print(f.loc["2026-05-12":"2026-05-17", [c for c in f if c.endswith(("_DE", "_AT"))]].round(2).T.to_string())
