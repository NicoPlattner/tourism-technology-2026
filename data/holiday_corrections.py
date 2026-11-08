"""Known errors in the OpenHolidays school-holiday data, corrected wherever the JSON is loaded.

Each entry: country, the record's (startDate, endDate) as published, the corrected endDate, and the source.
"""
from __future__ import annotations

CORRECTIONS = [
    # Voorjaarsvakantie 2027, region south: published 13 Feb - 21 Mar (5 weeks); official 13 - 21 Feb
    # (rijksoverheid.nl, schoolvakanties 2026-2027: voorjaarsvakantie regio zuid 13 t/m 21 februari 2027).
    ("NL", "2027-02-13", "2027-03-21", "2027-02-21"),
]


def fix(country: str | None, recs: list[dict]) -> list[dict]:
    for c, start, end, new_end in CORRECTIONS:
        if c != country:
            continue
        for r in recs:
            if r.get("startDate") == start and r.get("endDate") == end:
                r["endDate"] = new_end
    return recs
