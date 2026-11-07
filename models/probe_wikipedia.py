"""Is Wikipedia attention for "Ischgl" a leading indicator of stays?
Wikimedia pageviews API (no key, CC0 metadata). Compares monthly views per
language edition with TR53 monthly stays at lags 0-2.
"""
import json
import pathlib
import urllib.request

import numpy as np
import pandas as pd

RAW = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw" / "open"
URL = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{l}.wikipedia/"
       "all-access/user/Ischgl/daily/20230101/20261031")
m = pd.DataFrame(json.loads((RAW / "TR53_month.json").read_text()))
y = m.assign(date=pd.to_datetime(m.date)).set_index("date").stays["2023-01":"2026-08"]
for lang in ("de", "nl", "en"):
    req = urllib.request.Request(URL.format(l=lang), headers={"User-Agent": "ttf-hackathon-research/0.1"})
    items = json.load(urllib.request.urlopen(req, timeout=60))["items"]
    s = pd.Series({pd.to_datetime(i["timestamp"][:8]): i["views"] for i in items}).resample("MS").sum()
    r = []
    for lag in (0, 1, 2):
        a = pd.concat([s.shift(lag), y], axis=1).dropna()
        r.append(f"lag{lag} r={np.corrcoef(np.log(a.iloc[:, 0]), np.log(a.iloc[:, 1]))[0, 1]:.2f}")
    season = {yr: int(s[f"{yr}-10":f"{yr + 1}-03"].sum()) for yr in (2023, 2024, 2025)}
    print(lang, r, "Oct-Mar views:", season)
