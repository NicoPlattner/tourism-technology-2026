"""Seasonal tourism tables of the Land Tirol statistics office (Landesstatistik Tirol,
statistik.tirol.gv.at, "Der Tourismus im Winter/Sommer ..."), free HTML tables.
Source credit: Amt der Tiroler Landesregierung, Landesstatistik Tirol.

Extracted for Paznaun-Ischgl (municipalities Galtür, Ischgl, Kappl, See, and Pians which is in TR53 but
not in the TVB data) and the tourism association "Paznaun - Ischgl":
  origin      nights by country of origin (top 9-10 markets) per municipality and season
  tvb_origin  origin shares (%) for the tourism association
  beds        beds by category per municipality
  keyfig      arrivals, nights, length of stay, occupancy per municipality

    python3 c04/data/fetch_tirol_stats.py   -> data/processed/tirol_paznaun_*.csv
"""
import io
import pathlib
import re
import urllib.request

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
RAW, OUT = ROOT / "raw" / "open" / "tirol", ROOT / "processed"
URL = "https://statistik.tirol.gv.at/tourismus_{kind}_{year}_tabellen/index.html"
MUNIS = ["Galtür", "Ischgl", "Kappl", "See", "Pians"]
SEASONS = [("winter", y) for y in range(2019, 2028)] + [("sommer", y) for y in range(2019, 2027)]


def season_label(kind, year):
    return f"winter {year - 1}/{str(year)[2:]}" if kind == "winter" else f"summer {year}"


def flat(cols):
    return [" ".join(dict.fromkeys(str(x).replace(" ", "") if "e r" in str(x) else str(x) for x in c))
            if isinstance(c, tuple) else str(c) for c in cols]


def find(tabs, *must):
    for t in tabs:
        cols = " | ".join(flat(t.columns))
        if all(re.search(m, cols) for m in must):
            t = t.copy()
            t.columns = flat(t.columns)
            return t
    return None


def rows(t, names):
    key = t.columns[0]
    t[key] = t[key].astype(str).str.strip()
    return t[t[key].isin(names)].rename(columns={key: "unit"})


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    acc = {"origin": [], "tvb_origin": [], "beds": [], "keyfig": []}
    for kind, year in SEASONS:
        p = RAW / f"{kind}_{year}.html"
        if not p.exists():
            try:
                req = urllib.request.Request(URL.format(kind=kind, year=year), headers={"User-Agent": "Mozilla/5.0"})
                p.write_bytes(urllib.request.urlopen(req, timeout=120).read())
            except Exception:
                continue
        tabs = pd.read_html(io.StringIO(p.read_text(encoding="utf-8", errors="replace")), decimal=",", thousands=".")
        lab = season_label(kind, year)
        spec = {"origin": (("Gemeinde", "Deutschland", "Niederlande"), MUNIS),
                "tvb_origin": (("^Tourismusverband", "Deutschland"), ["Paznaun - Ischgl"]),
                "beds": (("Gemeinde", "gesamt", "Stern"), MUNIS),
                "keyfig": (("Gemeinde", "Aufenthaltsdauer"), MUNIS)}
        for k, (must, names) in spec.items():
            t = find(tabs, *must)
            if t is not None:
                acc[k].append(rows(t, names).assign(season=lab))
        print(lab, {k: len(v[-1]) if v and v[-1]["season"].iloc[0] == lab else 0 for k, v in acc.items()})
    for k, v in acc.items():
        if v:
            pd.concat(v).to_csv(OUT / f"tirol_paznaun_{k}.csv", index=False)


if __name__ == "__main__":
    main()
