"""Monthly source-market mix of overnight stays from Statistik Austria open data (CC BY 4.0,
"Datenquelle: Statistik Austria - data.statistik.gv.at"), dataset OGD_touextsai_Tour_HKL_1:
arrivals and nights by federal state x country of origin x month since Nov 1973.

Market weights for the holiday features: Tirol's monthly pattern (W96-7), rescaled per market to the
Paznaun-Ischgl season mix from Landesstatistik Tirol (data/fetch_tirol_stats.py) where available.
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


PAZ_ORIGIN = ROOT / "processed" / "tirol_paznaun_origin.csv"  # from data/fetch_tirol_stats.py
DE_NAMES = {"Deutschland": "DE", "Niederlande": "NL", "Österreich": "AT", "Belgien": "BE", "Schweiz": "CH",
            "Vereinigtes Königreich": "GB", "Polen": "PL", "Tschechien": "CZ", "Dänemark": "DK",
            "Italien": "IT", "Frankreich": "FR"}
PAZ_MUNIS = ["Galtür", "Ischgl", "Kappl", "See"]  # TVB area (Pians excluded)


def paznaun_season_shares() -> pd.DataFrame:
    """Share of nights per market and season for the four TVB municipalities (Landesstatistik Tirol).
    Shares are of total nights is not published here, so they are shares among the listed markets
    rescaled to the TVB's known coverage (listed markets = ~92 % of winter nights)."""
    o = pd.read_csv(PAZ_ORIGIN)
    o = o[o.unit.isin(PAZ_MUNIS)]
    cols = [c for c in o if c.startswith("Übernachtungen ")]
    g = o.groupby("season")[cols].sum(min_count=1)
    g.columns = [DE_NAMES.get(c.replace("Übernachtungen ", ""), c) for c in g.columns]
    return g


def extend_trend(ps: pd.DataFrame, damp: float = .5) -> pd.DataFrame:
    """Add the next season per kind (winter, summer): last share + damped linear trend over the observed
    seasons (3 points), so 2026/27 does not simply repeat 2025/26."""
    rows = {}
    for kind in ("winter", "summer"):
        k = ps[[s.startswith(kind) for s in ps.index]].sort_index()
        if len(k) < 2:
            continue
        slope = (k.iloc[-1] - k.iloc[0]) / (len(k) - 1)
        nxt = (k.iloc[-1] + damp * slope).clip(lower=0)
        last = k.index[-1]
        y = int(last.split()[1][:4]) + 1
        lab = f"winter {y}/{str(y + 1)[2:]}" if kind == "winter" else f"summer {y}"
        rows[lab] = nxt
    return pd.concat([ps, pd.DataFrame(rows).T])


def paznaun_monthly(tirol: pd.DataFrame, cover: float = .92) -> pd.DataFrame:
    """Monthly Paznaun market weights = Tirol's monthly shares x (Paznaun / Tirol) season ratio per market.
    Seasons without Paznaun data use the nearest season of the same kind."""
    ps = paznaun_season_shares()
    ps = ps.div(ps.sum(axis=1), axis=0) * cover
    ps = extend_trend(ps)
    # extend Tirol's monthly pattern 15 months ahead (same calendar month of the latest year)
    fut = pd.date_range(tirol.index.max() + pd.offsets.MonthBegin(1), periods=15, freq="MS")
    ext = pd.DataFrame([tirol[tirol.index.month == m.month].iloc[-1].values for m in fut], index=fut,
                       columns=tirol.columns)
    tirol = pd.concat([tirol, ext])
    out = tirol.copy()
    for m in out.index:
        kind = "winter" if m.month in (11, 12, 1, 2, 3, 4) else "summer"
        y = m.year + (m.month >= 11) if kind == "winter" else m.year
        lab = f"winter {y - 1}/{str(y)[2:]}" if kind == "winter" else f"summer {y}"
        cand = [s for s in ps.index if s.startswith(kind)]
        if not cand:
            continue
        if lab not in ps.index:  # nearest season of the same kind
            yrs = {s: int(s.split()[1][:4]) for s in cand}
            ty = y - 1 if kind == "winter" else y
            lab = min(cand, key=lambda s: abs(yrs[s] - ty))
        months = [mm for mm in tirol.index if (mm.month in (11, 12, 1, 2, 3, 4)) == (kind == "winter")
                  and ((mm.year + (mm.month >= 11)) if kind == "winter" else mm.year) == y]
        tir_season = tirol.loc[months].mean() if months else tirol.loc[m]
        for c in ps.columns:
            if c in out and pd.notna(ps.loc[lab, c]) and tir_season.get(c, 0) > 0:
                out.loc[m, c] = tirol.loc[m, c] * ps.loc[lab, c] / tir_season[c]
        mk = [c for c in out.columns if not c.startswith("de_region")]
        out.loc[m, mk] = out.loc[m, mk] / out.loc[m, mk].sum()
    return out


if __name__ == "__main__":
    fetch()
    m = build()
    if PAZ_ORIGIN.exists():
        m = paznaun_monthly(m)
        m.attrs["source"] = "Paznaun-Ischgl (Landesstatistik Tirol seasons x Statistik Austria Tirol months)"
        print("using Paznaun season mix from Landesstatistik Tirol")
    OUT.parent.mkdir(exist_ok=True)
    m.to_parquet(OUT)
    w = m.loc["2024-11":"2025-04"].mean()
    print(f"{m.index.min().date()} .. {m.index.max().date()} -> {OUT}")
    print("Winter 24/25 mix used:", w[[c for c in m if not c.startswith("de_region")]].sort_values(ascending=False).round(3).to_dict())
    print("German guests by origin region:", w[[c for c in m if c.startswith("de_region")]].round(3).to_dict())
