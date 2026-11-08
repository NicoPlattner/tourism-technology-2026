"""Profile the TVB partner files and answer the data checks (see c04/docs/data-sources.md).

    python3 c04/data/profile_partner.py            # full report -> data/processed/partner_profile.md (git-ignored)
    python3 c04/data/profile_partner.py --public   # structure-only report -> c04/docs/partner-data-profile.md

The --public report contains no partner values: only column names, date ranges,
counts, correlations and yes/no answers. The full report contains monthly sums
and stays local.
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from load_partner import load_beds, load_events, load_leadtime, load_overnights  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
OPEN = ROOT / "data" / "raw" / "open"
PUBLIC = "--public" in sys.argv
lines: list[str] = []


def out(s: str = "") -> None:
    print(s)
    lines.append(s)


def val(x, fmt="{:,.0f}"):
    return "(hidden)" if PUBLIC else fmt.format(x)


def tr53_daily() -> pd.Series:
    d = pd.DataFrame(json.loads((OPEN / "TR53_day.json").read_text()))
    return d.assign(date=pd.to_datetime(d.date)).set_index("date").stays


def tr53_month() -> pd.Series:
    d = pd.DataFrame(json.loads((OPEN / "TR53_month.json").read_text()))
    return d.assign(date=pd.to_datetime(d.date)).set_index("date").stays


def overnights() -> None:
    t = load_overnights()
    out("## Overnight stays")
    out(f"- municipalities: {sorted(t.muni.unique())}; rows {len(t)}; dates {t.date.min().date()} .. {t.date.max().date()}")
    tot = t[t.muni == "total"] if (t.muni == "total").any() else t.groupby("date")[["py", "fc", "act"]].sum(min_count=1).reset_index()
    tot = tot.set_index("date").sort_index()
    for r in ("py", "fc", "act"):
        s = tot[r]
        out(f"- `{r}`: non-missing {s.notna().sum()}, zeros {(s == 0).sum()}, first {s.first_valid_index()}, last {s.last_valid_index()}")
    # 1 forecast = TR53?
    off = tr53_daily()
    j = pd.concat([tot.fc, off.rename("tr53")], axis=1, sort=True).dropna()
    if len(j) > 30:
        ratio = (j.fc.sum() / j.tr53.sum())
        out(f"- **Check 1, forecast vs official TR53 daily**: corr {j.fc.corr(j.tr53):.3f}, level ratio {ratio:.3f}, "
            f"days {len(j)}")
        zfc = set(tot.index[tot.fc == 0].date)
        ztr = set(off.index[off < 1].date)
        out(f"  - zero-forecast days: {sorted(map(str, zfc))[:10]}; TR53 artefact zeros also zero in partner file: "
            f"{sorted(map(str, zfc & ztr))}")
        m = j.resample("MS").sum()
        out(f"  - monthly ratio partner/TR53 range {(m.fc / m.tr53).min():.3f} .. {(m.fc / m.tr53).max():.3f}")
    # 2 actuals stop / gaps
    a = tot.act
    last = a.last_valid_index()
    inside = a[:last]
    out(f"- **Check 2, actuals**: last actual {last}; missing inside observed range {int(inside.isna().sum())}; "
        f"zero actuals inside range {int((inside == 0).sum())}")
    # 3 PY alignment
    res = {}
    for lag in (364, 365, 366):
        sh = a.shift(lag, freq="D")
        jj = pd.concat([tot.py, sh.rename("a")], axis=1, sort=True).dropna()
        if len(jj) > 30:
            res[lag] = (float(np.mean(np.isclose(jj.py, jj.a, rtol=1e-3))), float(jj.py.corr(jj.a)))
    if res:
        out(f"- **Check 3, PY alignment** (share equal, corr) by lag: { {k: (round(v[0], 3), round(v[1], 3)) for k, v in res.items()} }")
    else:
        out("- **Check 3, PY alignment**: actual and PY do not overlap by one year; compare PY with TR53 pseudo-daily instead")
    # 4 level vs TR53 actual (TR53 = Galtür, Ischgl, Kappl, Pians, See; hotels + holiday flats only)
    if (t.muni != "total").any() and (t.muni == "total").any():
        s = t[t.muni != "total"].groupby("date").act.sum(min_count=1)
        jj = pd.concat([s, tot.act], axis=1, sort=True).dropna()
        out(f"- **Check 4a, municipalities sum to total**: share equal {np.mean(np.isclose(jj.iloc[:, 0], jj.iloc[:, 1], rtol=1e-3)):.3f}")
    m = a.resample("MS").sum(min_count=20)
    tm = tr53_month()
    jj = pd.concat([m.rename("p"), tm.rename("t")], axis=1, sort=True).dropna()
    jj = jj[jj.index <= "2026-08-01"]
    if len(jj):
        out(f"- **Check 4b, level partner actual / TR53 actual (Statistik Austria, hotels + holiday flats)**: "
            f"months {len(jj)}, ratio min {(jj.p / jj.t).min():.3f}, median {(jj.p / jj.t).median():.3f}, max {(jj.p / jj.t).max():.3f}")
        if not PUBLIC:
            out("\n| month | partner actual | TR53 actual | ratio |\n|---|---|---|---|")
            for d, r in jj.iterrows():
                out(f"| {d:%Y-%m} | {r.p:,.0f} | {r.t:,.0f} | {r.p / r.t:.3f} |")


def beds() -> None:
    b = load_beds().set_index("date").sort_index()
    out("\n## Available beds")
    for c in b.columns:
        s = b[c]
        out(f"- `{c}`: {s.first_valid_index()} .. {s.last_valid_index()}, missing {int(s.isna().sum())}, "
            f"zeros {int((s == 0).sum())}, distinct values {s.nunique()}, max {val(s.max())} "
            f"(official static cap 22,078)")


def leadtime() -> None:
    lt = load_leadtime().set_index("week").sort_index()
    out("\n## Booking lead time")
    out(f"- weeks {lt.index.min().date()} .. {lt.index.max().date()} ({len(lt)} rows), classes {list(lt.columns)}")
    out(f"- empty cells per class: {lt.isna().sum().to_dict()}")
    step = lt.index.to_series().diff().dt.days.mode()
    out(f"- row spacing (days): {int(step.iloc[0]) if len(step) else 'n/a'}")
    try:
        t = load_overnights(verbose=False)
        act = t.groupby("date").act.sum(min_count=1).resample("W-MON", label="left", closed="left").sum(min_count=7)
        tot = lt.sum(axis=1).resample("W-MON", label="left", closed="left").sum()
        cors = {}
        for k in range(0, 27, 2):
            jj = pd.concat([tot.shift(k), act], axis=1, sort=True).dropna()
            if len(jj) > 10:
                cors[k] = round(float(jj.iloc[:, 0].corr(jj.iloc[:, 1])), 2)
        out(f"- **Check 6** corr(total weekly bookings shifted k weeks, weekly actual stays): {cors} "
            "(peak at k=0 suggests rows are arrival weeks; peak at k>0 suggests booking weeks)")
    except Exception as e:  # noqa: BLE001
        out(f"- check 6 skipped: {e}")


def events() -> None:
    ev = load_events()
    out("\n## Events")
    w = ev[(ev.date >= "2026-11-01") & (ev.date <= "2027-04-30")]
    out(f"- rows {len(ev)}, dates {ev.date.min().date()} .. {ev.date.max().date()}, in winter 26/27: {len(w)}")
    name = next((c for c in ev.columns if any(k in c for k in ("name", "titel", "title", "event", "bezeichnung"))), None)
    if name is not None and not PUBLIC:
        for _, r in w.drop_duplicates(name).head(40).iterrows():
            out(f"  - {r.date.date()} {r[name]}")


if __name__ == "__main__":
    out(f"# Partner data profile ({'structure only' if PUBLIC else 'full, local only'})\n")
    out("Generated by `data/profile_partner.py`. Source: TVB Paznaun-Ischgl (TTF 2026 data licence).\n")
    for fn in (overnights, beds, leadtime, events):
        try:
            fn()
        except FileNotFoundError as e:
            out(f"\n- {fn.__name__}: {e}")
    target = ROOT / ("docs/partner-data-profile.md" if PUBLIC else "data/processed/partner_profile.md")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines) + "\n")
    print(f"\n-> {target}")
