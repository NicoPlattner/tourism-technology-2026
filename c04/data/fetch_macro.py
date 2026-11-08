"""Fetch macro / context drivers into data/raw/open/macro/ (git-ignored) and write a tidy monthly table
data/processed/macro_monthly.parquet.

Sources (all free, no key):
- Eurostat (reuse with attribution): consumer confidence (ei_bsco_m) for source markets, HICP inflation for
  Austria overall and accommodation services (prc_hicp_manr), unemployment (une_rt_m).
- ECB exchange rates (EXR, monthly averages) for CHF, GBP, PLN, CZK, DKK, SEK, USD.
- Geopolitical Risk index, Caldara & Iacoviello (matteoiacoviello.com/gpr.htm), monthly since 1985.
- Economic Policy Uncertainty, Europe (policyuncertainty.com), monthly.
- GeoSphere SNOWGRID 1 km snow depth at the Idalpe ski area, daily since the series start (CC BY 4.0).
"""
import io
import json
import pathlib
import urllib.request

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
RAW, OUT = ROOT / "raw" / "open" / "macro", ROOT / "processed"
UA = {"User-Agent": "ttf-hackathon-c04/0.1"}
EU = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
MARKETS = ["DE", "NL", "BE", "PL", "CZ", "DK", "AT"]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def eurostat(ds, **kw):
    q = "&".join(f"{k}={v}" for k, v in kw.items())
    d = json.loads(get(f"{EU}{ds}?{q}&format=JSON"))
    tidx = {v: k for k, v in d["dimension"]["time"]["category"]["index"].items()}
    s = pd.Series({pd.Period(tidx[int(i)].replace("M", "-"), "M").to_timestamp(): v for i, v in d["value"].items()})
    return s.sort_index()


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    cols = {}
    for g in MARKETS:
        cols[f"cons_conf_{g}"] = eurostat("ei_bsco_m", geo=g, indic="BS-CSMCI", s_adj="SA")
    cols["hicp_AT_all_yoy"] = eurostat("prc_hicp_manr", geo="AT", coicop="CP00")
    cols["hicp_AT_accommodation_yoy"] = eurostat("prc_hicp_manr", geo="AT", coicop="CP112")
    for g in ["DE", "NL"]:
        cols[f"unemployment_{g}"] = eurostat("une_rt_m", geo=g, s_adj="SA", age="TOTAL", sex="T", unit="PC_ACT")
    for c in ["CHF", "GBP", "PLN", "CZK", "DKK", "SEK", "USD"]:
        t = pd.read_csv(io.BytesIO(get(f"https://data-api.ecb.europa.eu/service/data/EXR/M.{c}.EUR.SP00.A?format=csvdata")))
        cols[f"fx_{c}_per_EUR"] = pd.Series(t.OBS_VALUE.values, index=pd.to_datetime(t.TIME_PERIOD))
    x = get("https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls")
    (RAW / "gpr.xls").write_bytes(x)
    g = pd.read_excel(io.BytesIO(x))
    g["month"] = pd.to_datetime(g["month"])
    cols["gpr_global"] = g.set_index("month")["GPR"]
    for c in ("GPRC_DEU", "GPRC_NLD", "GPRC_RUS", "GPRC_UKR"):
        if c in g:
            cols[c.lower()] = g.set_index("month")[c]
    x = get("https://www.policyuncertainty.com/media/Europe_Policy_Uncertainty_Data.xlsx")
    (RAW / "epu_europe.xlsx").write_bytes(x)
    e = pd.read_excel(io.BytesIO(x)).dropna(subset=["Year", "Month"])
    e = e[pd.to_numeric(e.Year, errors="coerce").notna()]
    e.index = pd.to_datetime(dict(year=e.Year.astype(int), month=e.Month.astype(int), day=1))
    cols["epu_europe"] = e["European_News_Index"]
    for c in ("Germany_News_Index",):
        if c in e:
            cols["epu_germany"] = e[c]
    sg = get("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km"
             "?parameters=snow_depth&lat_lon=46.985,10.315&start=1999-09-01&end=2026-11-06&output_format=csv")
    (RAW / "snowgrid_idalpe_long.csv").write_bytes(sg)
    s = pd.read_csv(io.BytesIO(sg))
    s = pd.Series(s["snow_depth [m]"].values * 100, index=pd.to_datetime(s.time).dt.tz_localize(None))
    cols["snow_depth_idalpe_cm_mean"] = s.resample("MS").mean()
    norm = {}
    for k, v in cols.items():
        v = pd.to_numeric(pd.Series(v), errors="coerce")
        v.index = pd.to_datetime(pd.Index(v.index).astype(str), errors="coerce").to_period("M").to_timestamp()
        norm[k] = v[v.index.notna()].groupby(level=0).mean()
    m = pd.DataFrame(norm).sort_index()
    m = m[m.index >= "1999-01-01"]
    m.to_parquet(OUT / "macro_monthly.parquet")
    print(m.shape, m.index.min().date(), m.index.max().date())
    print(m.notna().sum().to_string())


if __name__ == "__main__":
    main()
