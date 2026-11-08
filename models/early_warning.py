"""Capacity and booking-behaviour signals from the TVB data.

1. Occupancy: available_beds in the TVB file are FREE (still bookable) beds: they fall to ~1,100 in
   February while stays peak (corr -0.45). Occupancy = stays / (stays + free beds).
2. Booking lead time: rows are ARRIVAL weeks (all classes peak in Dec-Apr). Per arrival week we get the
   mix of booking lead times; a rising last-minute share means bookings on hand at a given lead time
   understate final demand -> the early-warning rule.
"""
import numpy as np
import pandas as pd

from common import ROOT, load

f = load()
P = ROOT / "data" / "raw" / "partner"


def occupancy_report():
    w = f.loc["2025-11-04":"2026-10-31", ["real_actual", "free_beds", "capacity_est", "occupancy", "dow"]].dropna()
    w["season"] = np.where(w.index.month.isin([11, 12, 1, 2, 3, 4]), "winter 25/26", "summer 26")
    print("Occupancy = stays / (stays + free beds):")
    g = w.groupby("season").occupancy
    print(pd.DataFrame({"median": g.median(), "days >= 95 %": g.apply(lambda s: int((s >= .95).sum())),
                        "days < 60 %": g.apply(lambda s: int((s < .6).sum()))}).round(2).to_string())
    tight = w[w.occupancy >= .95]
    print("\nTight days (>= 95 %) by month:", tight.groupby(tight.index.to_period("M")).size().to_dict())
    win = w[(w.index >= "2025-12-15") & (w.index <= "2026-04-06")]
    idle = win[win.occupancy < .8]
    print("In-season days (15 Dec - Easter Monday) below 80 %:", idle.groupby(idle.index.to_period("M")).size().to_dict())
    print("Weekday occupancy in season (Mon=0):", win.groupby("dow").occupancy.median().round(3).to_dict())
    return w


def leadtime_report():
    lt = pd.read_csv(P / "booking_lead_time_2023-2026.csv", parse_dates=["week_start"]).set_index("week_start").fillna(0)
    lt.columns = [c.replace("bookings_", "").replace("_days_ahead", "d") for c in lt.columns]
    tot = lt.sum(axis=1)
    share = lt.div(tot.replace(0, np.nan), axis=0)
    share["last_minute(0+8d)"] = share["0d"] + share["8d"]
    share["early(90+180d)"] = share["90d"] + share["180d"]
    seas = {"winter 23/24": ("2023-11-01", "2024-04-30"), "winter 24/25": ("2024-11-01", "2025-04-30"),
            "winter 25/26": ("2025-11-01", "2026-04-30"), "summer 24": ("2024-06-01", "2024-09-30"),
            "summer 25": ("2025-06-01", "2025-09-30"), "summer 26": ("2026-06-01", "2026-09-30")}
    rows = []
    for k, (a, b) in seas.items():
        s = lt.loc[a:b]
        n = s.sum()
        rows.append({"period": k, "bookings": int(n.sum()), "last-minute share": n[["0d", "8d"]].sum() / n.sum(),
                     "31-89d share": n[["31d", "61d"]].sum() / n.sum(), "early share (90d+)": n[["90d", "180d"]].sum() / n.sum()})
    r = pd.DataFrame(rows).set_index("period")
    print("\nBooking lead-time mix per arrival period (TVB booking data):")
    print(r.round(3).to_string())
    return r


if __name__ == "__main__":
    occupancy_report()
    leadtime_report()
