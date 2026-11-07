"""Schema-tolerant loaders for the TVB Paznaun-Ischgl partner files (TTF Data Space).

The files are members-only: keep them in data/raw/partner/ (git-ignored) and
never commit them or row-level extracts. Exact column names were not known
when this was written, so the loaders detect delimiter, decimal comma, the
date column and column roles by keywords, and print what they mapped.

Roles for the overnight file (wide or long format):
  py   previous-year figure   (vorjahr, vj, previous, prior, ly)
  fc   forecast               (prognose, forecast, fc, plan)
  act  actual stays           (ist, actual, tatsächlich, aktuell, nächtigungen)
and an optional municipality dimension (Ischgl, Galtür, Kappl, See, gesamt/total).
"""
from __future__ import annotations

import csv
import io
import os
import pathlib
import re
import unicodedata

import pandas as pd

PARTNER = pathlib.Path(os.environ.get("C04_PARTNER_DIR", pathlib.Path(__file__).resolve().parent / "raw" / "partner"))
MUNIS = ["ischgl", "galtur", "kappl", "see"]
ROLE_KEYS = {
    "py": ["vorjahr", "vj", "previous", "prior", "last_year", "ly", "py"],
    "fc": ["prognose", "forecast", "fc", "plan", "vorschau"],
    "act": ["ist", "actual", "tatsachlich", "aktuell", "real", "nachtigungen", "stays"],
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def read_csv_any(path: pathlib.Path) -> pd.DataFrame:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "latin1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:5000]
    try:
        sep = csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        sep = ";" if sample.count(";") > sample.count(",") else ","
    decimal = "," if sep == ";" and re.search(r"\d,\d", sample) else "."
    df = pd.read_csv(io.StringIO(text), sep=sep, decimal=decimal, thousands="." if decimal == "," else None)
    df.columns = [norm(c) for c in df.columns]
    return df


def find_date_col(df: pd.DataFrame) -> str:
    best, score = None, 0.0
    for c in df.columns:
        if df[c].dtype.kind in "if" and not re.search(r"date|datum|tag|week|woche", c):
            continue
        parsed = to_dates(df[c])
        sc = parsed.notna().mean() + (0.5 if re.search(r"date|datum|tag|day|week|woche|kw", c) else 0)
        if sc > score:
            best, score = c, sc
    if best is None:
        raise ValueError(f"no date column found in {list(df.columns)}")
    return best


def to_dates(s: pd.Series) -> pd.Series:
    txt = s.astype(str).str.strip()
    if txt.str.match(r"^\d{4}-\d{2}-\d{2}").mean() > .9:  # ISO dates: never day-first
        return pd.to_datetime(txt.str[:10], errors="coerce", format="%Y-%m-%d")
    return pd.to_datetime(txt, errors="coerce", dayfirst=True, format="mixed").dt.normalize()


def role_of(col: str) -> str | None:
    parts = set(col.split("_"))
    for role, keys in ROLE_KEYS.items():
        if any(k in parts or col.startswith(k) or col.endswith(k) for k in keys):
            return role
    return None


def muni_of(col: str) -> str:
    for m in MUNIS:
        if m in col.split("_") or col.startswith(m) or col.endswith(m):
            return m
    return "total"


def load_overnights(path: pathlib.Path | None = None, verbose: bool = True) -> pd.DataFrame:
    """Return a tidy frame: date, muni, py, fc, act (NaN where absent)."""
    path = path or pick("overnight", "nacht", "uebernacht", "stays", "naechtig")
    df = read_csv_any(path)
    dcol = find_date_col(df)
    df["date"] = to_dates(df[dcol])
    obj = [c for c in df.columns if df[c].dtype == object and c not in (dcol, "date")]
    muni_col = next((c for c in obj if df[c].astype(str).map(norm).isin(MUNIS).any()), None)
    num = [c for c in df.columns if df[c].dtype.kind in "if"]
    mapping = {}
    if muni_col:  # long by municipality
        for c in num:
            if role_of(c):
                mapping[c] = role_of(c)
        t = df[["date", muni_col] + list(mapping)].rename(columns={muni_col: "muni", **mapping})
        t["muni"] = t.muni.astype(str).map(norm)
    else:  # wide: one column per (role, muni)
        parts = []
        for c in num:
            r = role_of(c)
            if r is None:
                continue
            mapping[c] = (r, muni_of(c))
            parts.append(pd.DataFrame({"date": df.date, "muni": muni_of(c), "role": r, "v": df[c]}))
        if not parts:
            raise ValueError(f"could not map any column to py/fc/act: {num}")
        long = pd.concat(parts)
        t = long.pivot_table(index=["date", "muni"], columns="role", values="v", aggfunc="first",
                             dropna=False).reset_index()
    for r in ("py", "fc", "act"):
        if r not in t:
            t[r] = float("nan")
    if verbose:
        print(f"[overnights] {path.name}: date column '{dcol}', municipality column '{muni_col}', mapping {mapping}")
    return t[["date", "muni", "py", "fc", "act"]].sort_values(["muni", "date"]).reset_index(drop=True)


def load_beds(path: pathlib.Path | None = None, verbose: bool = True) -> pd.DataFrame:
    path = path or pick("bett", "bed", "kapaz", "capacity")
    df = read_csv_any(path)
    dcol = find_date_col(df)
    num = [c for c in df.columns if df[c].dtype.kind in "if"]
    if verbose:
        print(f"[beds] {path.name}: date column '{dcol}', numeric {num}")
    out = pd.DataFrame({"date": to_dates(df[dcol])})
    for c in num:
        out[f"beds_{muni_of(c)}" if muni_of(c) != "total" else f"beds_{c}"] = df[c]
    return out


def load_leadtime(path: pathlib.Path | None = None, verbose: bool = True) -> pd.DataFrame:
    path = path or pick("lead", "vorlauf", "buchung", "booking")
    df = read_csv_any(path)
    dcol = find_date_col(df)
    num = [c for c in df.columns if df[c].dtype.kind in "if" and c != dcol]
    if verbose:
        print(f"[leadtime] {path.name}: date column '{dcol}', classes {num}")
    out = df[num].copy()
    out.insert(0, "week", to_dates(df[dcol]))
    return out


def load_events(path: pathlib.Path | None = None, verbose: bool = True) -> pd.DataFrame:
    path = path or pick("event", "veranstalt")
    df = read_csv_any(path)
    dcol = find_date_col(df)
    if verbose:
        print(f"[events] {path.name}: date column '{dcol}', columns {list(df.columns)}")
    df.insert(0, "date", to_dates(df[dcol]))
    return df


def pick(*keys: str) -> pathlib.Path:
    files = sorted(PARTNER.glob("*.csv"))
    hits = [p for p in files if any(k in norm(p.name) for k in keys)]
    if not hits:
        raise FileNotFoundError(f"no partner CSV matching {keys} in {PARTNER} (have: {[p.name for p in files]})")
    return max(hits, key=lambda p: p.stat().st_size)  # prefer the 'complete' file over monthly editions
