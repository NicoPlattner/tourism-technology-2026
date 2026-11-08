"""What can other regions' visitor data tell Challenge 04?  (Salzburger Sportwelt, TTF Data Space)

1. Accuracy: Hutchison Drei daily overnight visitors vs official monthly overnight stays (TR66).
2. Market mix and age structure of overnight guests by month (mobile data) and by season (guest cards).
3. Agreement of the two independent sources on the market mix.
4. Holiday response per market: how much more present is each market on its own school-holiday days?
   (transferable to Paznaun as a prior for market-specific holiday effects)
5. Field check: what home postcode and age mean for foreign phones.
Licences: Hutchison Drei TTF 2026 / Salzburger Sportwelt TTF (non-commercial, no redistribution):
only aggregates are written to docs.
"""
import glob
import json
import urllib.request

import numpy as np
import pandas as pd

import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "models"))  # production models
from common import ROOT

OTHER = ROOT / "data" / "raw" / "other"
OVERNIGHT = ["<=1", "<=2", "<=6", "<=13", ">13"]
MCC = {"Deutschland": "DE", "Niederlande": "NL", "Belgien": "BE", "Dänemark": "DK", "Österreich": "AT",
       "Tschechische Republik": "CZ", "Polen": "PL", "Vereinigtes Königreich": "GB", "Ungarn": "HU",
       "Schweden": "SE", "Luxemburg": "LU", "Frankreich": "FR", "Schweiz": "CH", "Italien": "IT"}

d = pd.read_csv(OTHER / "drei_sportwelt_2026" / "part_00.csv", low_memory=False)
d["date"] = pd.to_datetime(d.event_date)
reg = d[d.poi_id == "Salzburger Sportwelt"].copy()
reg["cc"] = reg.mcc.map(MCC).fillna("other")
ov = reg[reg.dest_visit_type.isin(OVERNIGHT)]

# 1. accuracy vs official
with urllib.request.urlopen("https://naechtigungen.pol.joanneum.at/v1/forecast/month/?region=TR66&min_date=2026-01-01&max_date=2026-12-31&limit=50") as r:
    off = pd.DataFrame(json.load(r)["forecast_data"])
off = off.assign(date=pd.to_datetime(off.date)).set_index("date").stays
m = pd.DataFrame({"drei_overnight_visitor_days": ov.groupby(ov.date.dt.to_period("M").dt.to_timestamp()).n_visitors.sum(),
                  "drei_incl_type0": reg[reg.dest_visit_type.isin(OVERNIGHT + ["0"])].groupby(
                      reg.date.dt.to_period("M").dt.to_timestamp()).n_visitors.sum(),
                  "official_stays": off}).loc["2026-02-01":"2026-08-01"]
m["ratio"] = m.drei_overnight_visitor_days / m.official_stays
print("1. Drei overnight visitor-days vs official overnight stays (TR66, actuals to Aug 2026):")
print(m.round(3).to_string())
print(f"   corr (7 months) {m.drei_overnight_visitor_days.corr(m.official_stays):.3f}; "
      f"incl. type 0: {m.drei_incl_type0.corr(m.official_stays):.3f}")

# 2. market mix by month (overnight guests)
mix = ov.pivot_table(index=ov.date.dt.to_period("M"), columns="cc", values="n_visitors", aggfunc="sum").fillna(0)
mix = mix.div(mix.sum(axis=1), axis=0)
top = mix.mean().sort_values(ascending=False).index[:9]
print("\n2. Market mix of overnight guests by month (mobile data, share):")
print(mix[top].round(3).to_string())
age = ov[ov.age_band != "-1"].pivot_table(index="cc", columns="age_band", values="n_visitors", aggfunc="sum")
age = age.div(age.sum(axis=1), axis=0).loc[[c for c in top if c in age.index]]
print("\n   Age structure of overnight guests by market (known ages only; mobile contract holders 18+):")
print(age.round(2).to_string())
los = ov.pivot_table(index="cc", columns="dest_visit_type", values="n_visitors", aggfunc="sum")[OVERNIGHT]
print("\n   Stay-length class by market (share of visitor-days):")
print(los.div(los.sum(axis=1), axis=0).loc[[c for c in top if c in los.index]].round(2).to_string())

# 3. guest cards: market mix per season, agreement with mobile data for winter 2025/26 Feb-Apr
gc = pd.concat([pd.read_csv(p, usecols=["date", "card_id", "origin_country", "age_band"]) for p in
                sorted(glob.glob(str(OTHER / "guestcard_usage_sportwelt" / "part_*.csv")))])
gc["date"] = pd.to_datetime(gc.date)
gc["season"] = np.where(gc.date.dt.month.isin([11, 12, 1, 2, 3, 4]),
                        "W" + (gc.date.dt.year - (gc.date.dt.month <= 4)).astype(str), "S" + gc.date.dt.year.astype(str))
cards = gc.dropna(subset=["origin_country"]).drop_duplicates(["season", "card_id"])
sm = cards.pivot_table(index="season", columns="origin_country", values="card_id", aggfunc="count").fillna(0)
sm = sm.div(sm.sum(axis=1), axis=0)
print("\n3. Guest cards: market mix of card holders per season (share, cards with known origin):")
print(sm[[c for c in ["AT", "DE", "NL", "DK", "BE", "CZ", "HU", "PL", "GB"] if c in sm]].round(3).to_string())
w = gc[(gc.date >= "2026-02-01") & (gc.date <= "2026-04-15")].dropna(subset=["origin_country"]).drop_duplicates("card_id")
gmix = w.origin_country.value_counts(normalize=True)
dmix = ov[(ov.date >= "2026-02-01") & (ov.date <= "2026-04-15")].groupby("cc").n_visitors.sum()
dmix = dmix / dmix.sum()
cmp = pd.DataFrame({"mobile (visitor-days)": dmix, "guest cards (cards)": gmix}).dropna()
cmp = cmp[cmp.max(axis=1) > .01].sort_values("mobile (visitor-days)", ascending=False)
print("\n   Feb - mid-Apr 2026, two independent sources:")
print(cmp.round(3).to_string())
print(f"   corr of market shares: {cmp.corr().iloc[0, 1]:.2f}")

# 4. holiday response per market (mobile data, Feb-Apr 2026 = winter season days)
f = pd.read_parquet(ROOT / "data" / "processed" / "features_daily.parquet")
daily = ov.pivot_table(index="date", columns="cc", values="n_visitors", aggfunc="sum").fillna(0)
win = daily.loc["2026-02-01":"2026-04-12"]
rows = []
for c in ["DE", "NL", "BE", "DK", "CZ", "PL", "GB", "SE", "FR", "LU", "AT"]:
    if c not in win or f"school_{c}" not in f:
        continue
    h = f.loc[win.index, f"school_{c}"]
    on, offd = win.loc[h >= .5, c], win.loc[h < .1, c]
    if len(on) >= 3 and len(offd) >= 3 and offd.mean() > 0:
        rows.append({"market": c, "holiday days": len(on), "visitors/day on holiday": round(on.mean()),
                     "visitors/day no holiday": round(offd.mean()), "holiday multiplier": round(on.mean() / offd.mean(), 1),
                     "corr(daily visitors, holiday share)": round(win[c].corr(h), 2)})
print("\n4. Holiday response per market, winter season Feb - 12 Apr 2026 (mobile data):")
print(pd.DataFrame(rows).set_index("market").to_string())

# 5. What the postcode and age fields mean
foreign = ov[ov.cc != "AT"]
print("\n5. Field check: for foreign SIM cards home_zip is an Austrian postcode (where the phone stays "
      "overnight), e.g.", foreign[foreign.home_zip > 0].home_zip.astype(int).value_counts().head(3).to_dict(),
      "; age and gender known only for Austrian contracts:",
      f"{(foreign.age_band.isin(['-1', 'N/A'])).mean():.0%} of foreign rows have no age.")

# 6. Stay-length proxy from guest cards: days between first and last use per card (winter seasons, >= 2 uses)
wc = gc[gc.season.str.startswith("W") & (gc.season != "W2020")].dropna(subset=["origin_country"])
span = wc.groupby(["season", "card_id", "origin_country"]).date.agg(["min", "max", "count"]).reset_index()
span = span[span["count"] >= 2]
span["days"] = (span["max"] - span["min"]).dt.days + 1
print("\n6. Guest cards, winter: days between first and last card use (median), by origin (proxy for stay length):")
print(span[span.origin_country.isin(["AT", "DE", "NL", "DK", "BE", "CZ", "PL", "GB", "HU"])]
      .groupby("origin_country").days.agg(["median", "count"]).sort_values("count", ascending=False).to_string())

# 7. TOURDATA: accommodation supply in Paznaun-Ischgl (no bed counts in the feed)
acc = pd.read_csv(OTHER / "tourdata_paznaun" / "part_05.csv")
acc["kind"] = acc.categories.fillna("").str.split("|").str[-1]
print(f"\n7. TOURDATA accommodations in Paznaun-Ischgl: {len(acc)} listings")
print(acc.pivot_table(index="kind", columns="city", values="id", aggfunc="count", fill_value=0)
      .assign(total=lambda x: x.sum(axis=1)).sort_values("total", ascending=False).head(10).to_string())
