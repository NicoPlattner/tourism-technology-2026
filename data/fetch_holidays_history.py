"""School holidays 2014-2027 from OpenHolidays (ODbL) for every origin country it covers, for the
Tirol origin panel (data/build_origin_panel.py). Coverage differs: e.g. Germany from 2015, Netherlands and
Austria from 2020; years without data stay missing (NaN), not zero.

    python3 data/fetch_holidays_history.py   -> data/raw/open/holidays_hist/<CC>_School.json
"""
import json
import pathlib
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent / "raw" / "open" / "holidays_hist"
COUNTRIES = ["DE", "AT", "NL", "BE", "CH", "CZ", "PL", "IT", "FR", "LU", "SE", "HU", "SK", "SI", "RO", "ES", "IE", "HR"]
WINDOWS = [("2014-01-01", "2016-12-31"), ("2017-01-01", "2019-12-31"), ("2020-01-01", "2022-12-31"),
           ("2023-01-01", "2025-12-31"), ("2026-01-01", "2027-12-31")]


def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"accept": "application/json"}), timeout=120) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001
            time.sleep(2 ** (i + 1))
    return []


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for c in COUNTRIES:
        recs = {}
        for a, b in WINDOWS:
            for h in get(f"https://openholidaysapi.org/SchoolHolidays?countryIsoCode={c}&validFrom={a}&validTo={b}") or []:
                recs[h["id"]] = h
        subs = get(f"https://openholidaysapi.org/Subdivisions?countryIsoCode={c}")
        (OUT / f"{c}_School.json").write_text(json.dumps(list(recs.values())))
        (OUT / f"{c}_subdivisions.json").write_text(json.dumps(subs))
        years = sorted({h["startDate"][:4] for h in recs.values()})
        print(c, len(recs), "records, years", years[0] if years else "-", "-", years[-1] if years else "-")
