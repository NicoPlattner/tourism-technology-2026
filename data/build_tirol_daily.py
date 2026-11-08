"""Tirol-wide daily overnight stays 2022-2025 (destination "pull" pattern for M3).

For each of the 34 Tirol tourism regions: the open daily index (Nächtigungsprognose, feratel + mobile data,
z-scored) is turned into daily stays and scaled so that every month matches the region's official monthly
stays (Statistik Austria via the Nächtigungsprognose API); the regions are summed. Same method as the
Paznaun pseudo-daily series, which matched the real TVB data with correlation 0.993.

    python3 data/build_tirol_daily.py   -> data/processed/tirol_daily.parquet
"""
import json
import pathlib
import urllib.request

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT / "raw" / "open" / "np_repo"
TIROL = {"TR52": "Ötztal Tourismus", "TR53": "Paznaun - Ischgl", "TR22": "Innsbruck und seine Feriendörfer",
         "TR71": "Serfaus-Fiss-Ladis", "TR10": "Erste Ferienregion im Zillertal", "TR36": "Mayrhofen",
         "TR74": "St.Anton am Arlberg", "TR75": "Stubai Tirol", "TR70": "Seefeld", "TR51": "Osttirol",
         "TR93": "Wilder Kaiser", "TR85": "Tux - Finkenberg", "TR98": "Zell-Gerlos",
         "TR26": "Kitzbüheler Alpen - Brixental", "TR84": "Tiroler Zugspitz Arena", "TR82": "Tiroler Oberland",
         "TR55": "Pitztal", "TR1": "Achensee", "TR54": "Pillerseetal", "TR25": "Kitzbühel Tourismus",
         "TR78": "Tannheimer Tal", "TR2": "Alpbachtal und Tiroler Seenland", "TR94": "Wildschönau",
         "TR27": "Kitzbüheler Alpen-St.Johann i.T.", "TR31": "Ferienland Kufstein", "TR23": "Kaiserwinkl",
         "TR12": "Ferienregion Hohe Salve", "TR33": "Lechtal", "TR72": "Silberregion Karwendel", "TR95": "Wipptal",
         "TR21": "Imst Tourismus", "TR46": "Naturparkregion Reutte", "TR58": "Region Hall - Wattens", "TR83": "Tirol West"}


def monthly(code):
    url = f"https://naechtigungen.pol.joanneum.at/v1/forecast/month/?region={code}&min_date=2021-01-01&max_date=2026-08-31&limit=200"
    d = pd.DataFrame(json.load(urllib.request.urlopen(url, timeout=60))["forecast_data"])
    return d.assign(date=pd.to_datetime(d.date)).set_index("date").stays


def main():
    px = pd.read_csv(REPO / "proxy_data_daily.csv", sep=";", decimal=",", encoding="utf-8")
    sc = pd.read_csv(REPO / "region_scale_13032026.csv", sep=";", decimal=",", encoding="latin1")
    idx = pd.date_range("2022-01-01", "2025-12-31", freq="D")
    out = {}
    for code, name in TIROL.items():
        z = px[px.Region == name]
        z = pd.Series(z.time_series.values, index=pd.to_datetime(z.date, dayfirst=True)).reindex(idx)
        mon = monthly(code)
        m_of = idx.to_period("M").to_timestamp()
        tot = pd.Series(m_of.map(mon), index=idx)
        rid = px.loc[px.Region == name, "Regionsnummer"].iloc[0]  # match by region id (names differ in encoding)
        scale = float(sc.loc[sc.reg_id == rid, "year"].iloc[0])
        daily_mean = (tot / idx.days_in_month).groupby(idx.year).transform("mean")
        raw = (z * scale + daily_mean).clip(lower=0)
        out[code] = raw * tot / raw.groupby(m_of).transform("sum")
    df = pd.DataFrame(out)
    df["tirol"] = df.sum(axis=1, min_count=30)
    (ROOT / "processed").mkdir(exist_ok=True)
    df.to_parquet(ROOT / "processed" / "tirol_daily.parquet")
    print(df.shape, "regions:", df.shape[1] - 1, "| Tirol stays 2024:", round(df.loc["2024", "tirol"].sum() / 1e6, 1), "M")


if __name__ == "__main__":
    main()
