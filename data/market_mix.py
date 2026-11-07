"""Monthly source-market mix of overnight stays from Statistik Austria open data (CC BY 4.0,
"Datenquelle: Statistik Austria - data.statistik.gv.at"), dataset OGD_touextsai_Tour_HKL_1:
arrivals and nights by federal state x country of origin x month since Nov 1973.

Used as the market weights for holiday features until municipality-level data for Paznaun-Ischgl
(STATcube) or TVB nationality data is available. Region: Tirol (W96-7).
German guests are split into the six origin regions Statistik Austria reports since 05/2003.

    python3 data/market_mix.py        -> data/processed/market_mix_monthly.parquet
"""
import pathlib
import urllib.request

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw" / "open" / "statistik_at"
OUT = ROOT / "processed" / "market_mix_monthly.parquet"
BASE = "https://data.statistik.gv.at/data/"
FILES = ["OGD_touextsai_Tour_HKL_1", "OGD_touextsai_Tour_HKL_1_C-C93-2"]
# Statistik Austria country codes -> our market codes
CODE = {"25": "NL", "62": "BE", "16": "GB", "32": "CH", "27": "PL", "09": "CZ", "11": "DK", "14": "FR",
        "29": "IT", "31": "SE", "19": "LU"}
DE_REGIONS = {"80": "BY", "81": "BW", "82": "NW", "83": "DE_CENTRAL", "84": "DE_NORTH", "85": "DE_EAST", "53": "BE_BERLIN"}
# German origin regions -> Länder (population split inside a region)
DE_REGION_LAENDER = {"BY": ["BY"], "BW": ["BW"], "NW": ["NW"], "DE_CENTRAL": ["HE", "RP", "SL"],
                     "DE_NORTH": ["HH", "HB", "NI", "SH"], "DE_EAST": ["BB", "MV", "SN", "ST", "TH"],
                     "BE_BERLIN": ["BE"]}
AUSTRIAN = {"01", "70", "71", "72", "73", "74", "75", "76", "77"}  # Vienna + federal states (since 05/03)


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        req = urllib.request.Request(BASE + f + ".csv", headers={"User-Agent": "Mozilla/5.0 ttf-c04"})
        (RAW / f"{f}.csv").write_bytes(urllib.request.urlopen(req, timeout=300).read())


def build(state="W96-7") -> pd.DataFrame:
    d = pd.read_csv(RAW / "OGD_touextsai_Tour_HKL_1.csv", sep=";", dtype=str)
    d = d[d["C-W96-0"] == state]
    d["nights"] = pd.to_numeric(d["F-UEB"], errors="coerce").fillna(0)
    d["month"] = pd.to_datetime(d["C-SDB_TIT-0"], format="%Y%m")
    code = d["C-C93-2"]
    d["market"] = code.map(CODE)
    d.loc[code.isin(DE_REGIONS), "market"] = "DE"
    d.loc[code.isin(AUSTRIAN), "market"] = "AT"
    d["market"] = d.market.fillna("other")
    tot = d.groupby("month").nights.sum()
    mix = d.pivot_table(index="month", columns="market", values="nights", aggfunc="sum").fillna(0).div(tot, axis=0)
    de = d[code.isin(DE_REGIONS)].assign(region=code.map(DE_REGIONS))
    der = de.pivot_table(index="month", columns="region", values="nights", aggfunc="sum").fillna(0)
    der = der.div(der.sum(axis=1), axis=0).add_prefix("de_region_")
    out = pd.concat([mix, der], axis=1)
    out.attrs["state"] = state
    return out


if __name__ == "__main__":
    fetch()
    m = build()
    OUT.parent.mkdir(exist_ok=True)
    m.to_parquet(OUT)
    w = m.loc["2024-11":"2025-04"].mean()
    print(f"{m.index.min().date()} .. {m.index.max().date()} -> {OUT}")
    print("Tirol winter 24/25 mix:", w[[c for c in m if not c.startswith("de_region")]].sort_values(ascending=False).round(3).to_dict())
    print("German guests by origin region:", w[[c for c in m if c.startswith("de_region")]].round(3).to_dict())
