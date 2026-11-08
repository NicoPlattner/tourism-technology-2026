"""Fetch open Austria Tourism overnight-stay forecast data (CC BY 4.0, credit
"Österreich Werbung" / JOANNEUM RESEARCH, TU Wien, AAU) for Paznaun-Ischgl
(TR53) and neighbour regions into data/raw/open/ (git-ignored).

Usage: python3 c04/data/fetch_open_data.py [REGION ...]
"""
import json
import pathlib
import sys
import urllib.request

API = "https://naechtigungen.pol.joanneum.at/v1"
OUT = pathlib.Path(__file__).resolve().parent / "raw" / "open"
REGIONS = sys.argv[1:] or ["TR53", "TR52", "TR55", "TR71", "TR74"]


def get(path: str) -> list:
    rows, skip = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        with urllib.request.urlopen(f"{API}{path}{sep}skip={skip}&limit=5000", timeout=60) as r:
            d = json.load(r)
        batch = d["forecast_data"] if isinstance(d, dict) else d
        rows += batch
        skip += len(batch)
        if not batch or skip >= d.get("total_rows", 0):
            return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for reg in REGIONS:
        for freq, lo in (("month", "1999-01-01"), ("day", "2023-01-01")):
            rows = get(f"/forecast/{freq}/?region={reg}&min_date={lo}&max_date=2028-12-31")
            p = OUT / f"{reg}_{freq}.json"
            p.write_text(json.dumps(rows))
            print(f"{p.name}: {len(rows)} rows")


if __name__ == "__main__":
    main()
