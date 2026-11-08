"""Fetch open explanatory-driver data into data/raw/open/ (git-ignored).

- Nächtigungsprognose repo data (Österreich Werbung et al., CC BY 4.0): daily
  regional index 2022-2025, holiday/calendar matrix 2022-2027, event flags,
  bed caps, per-region scales.
- OpenHolidays API (ODbL): school + public holidays per source market.
- GeoSphere Austria SNOWGRID 1 km (CC BY 4.0): daily snow depth, ski area
  (Idalpe, ~2,300 m) and valley (Ischgl village).
- Open-Meteo forecast (CC BY 4.0): 16-day snowfall / temperature outlook.

Usage: python3 c04/data/fetch_drivers.py [--skip-repo] [--skip-holidays] [--skip-snow]
"""
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent / "raw" / "open"
UA = {"User-Agent": "ttf-hackathon-c04/0.1", "accept": "application/json"}
REPO = "https://raw.githubusercontent.com/kan-jr/Naechtigungsprognose/main/data/"
REPO_FILES = ["proxy_data_daily.csv", "matrix_daily_forecast.csv", "Events_Konzerte_daily_G.csv",
              "Events_Konzerte_daily_M.csv", "Events_Konzerte_daily_K.csv", "bettenkapazität.csv",
              "region_scale_13032026.csv", "region_method_rmse.csv", "Ferien_und_Feiertage.csv"]
# Candidate source markets for Paznaun (mix not verified, see build_features.MARKET_SHARE)
MARKETS = ["DE", "NL", "BE", "CH", "AT", "CZ", "PL", "SE", "FR", "LU", "IT"]
WINDOWS = [("2022-01-01", "2024-12-31"), ("2025-01-01", "2027-08-31")]  # API max range 1095 days
SNOW_POINTS = {"ski_area_idalpe": (46.985, 10.315), "village_ischgl": (47.012, 10.293)}


def get(url: str, raw: bool = False):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                body = r.read()
                return body if raw else json.loads(body)
        except Exception as e:  # noqa: BLE001 - network retry
            if attempt == 3:
                raise
            print(f"  retry {url[:80]}… ({e})")
            time.sleep(2 ** (attempt + 1))


def fetch_repo() -> None:
    d = OUT / "np_repo"
    d.mkdir(parents=True, exist_ok=True)
    for f in REPO_FILES:
        (d / f).write_bytes(get(REPO + urllib.request.quote(f), raw=True))
        print(f"repo/{f}")


def fetch_holidays() -> None:
    d = OUT / "holidays"
    d.mkdir(parents=True, exist_ok=True)
    for c in MARKETS:
        subs = get(f"https://openholidaysapi.org/Subdivisions?countryIsoCode={c}")
        (d / f"{c}_subdivisions.json").write_text(json.dumps(subs))
        for kind in ("SchoolHolidays", "PublicHolidays"):
            rows = []
            for lo, hi in WINDOWS:
                rows += get(f"https://openholidaysapi.org/{kind}?countryIsoCode={c}&validFrom={lo}&validTo={hi}")
            (d / f"{c}_{kind}.json").write_text(json.dumps(rows))
            print(f"holidays/{c}_{kind}: {len(rows)}")


def fetch_snow() -> None:
    d = OUT / "snow"
    d.mkdir(parents=True, exist_ok=True)
    end = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    for name, (lat, lon) in SNOW_POINTS.items():
        url = ("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km"
               f"?parameters=snow_depth&lat_lon={lat},{lon}&start=2021-10-01&end={end}&output_format=csv")
        (d / f"snowgrid_{name}.csv").write_bytes(get(url, raw=True))
        print(f"snow/snowgrid_{name}.csv")
    lat, lon = SNOW_POINTS["ski_area_idalpe"]
    fc = get(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&elevation=2300"
             "&daily=snowfall_sum,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=Europe/Vienna")
    (d / "openmeteo_forecast_idalpe.json").write_text(json.dumps(fc))
    print("snow/openmeteo_forecast_idalpe.json")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    if "--skip-repo" not in sys.argv:
        fetch_repo()
    if "--skip-holidays" not in sys.argv:
        fetch_holidays()
    if "--skip-snow" not in sys.argv:
        fetch_snow()
