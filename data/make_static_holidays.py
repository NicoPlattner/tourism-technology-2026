"""Generate data/static/school_holidays_extra.csv: school holidays for markets or years that the
OpenHolidays API does not cover. Rule-based, approximate, one row per break with the share of pupils
on holiday. Weekends adjoining a break are included.

Covered: Denmark, United Kingdom (England pattern; Scotland and Northern Ireland differ), Sweden,
school years 2013/14-2026/27; Italy summer 2026 and 2026/27 (API ends June 2026); Poland Christmas,
Easter and summer 2026/27; France summer 2027.

Sources for the rules (checked 8 Nov 2026):
- DK: vinterferie week 7 in 77 of 98 municipalities, week 8 in 20 (tv2kosmopol.dk, skagenonline.dk);
  efterårsferie week 42; juleferie and påskeferie per schulferienplaner.de pattern.
- England: council calendars (Haringey, West Berkshire, Enfield, Leicestershire, findmyschool.uk):
  February half-term split between two weeks, May half-term = last week of May, October half-term =
  last full week of October, two Easter weeks, summer ~22 Jul - 1 Sep.
- SE: sportlov weeks 7-11 by region (loudavymkrokem.cz/sv/sportlov-sverige-2027; municipalities decide);
  höstlov week 44; jullov ~21 Dec - 8 Jan; sommarlov mid-June - mid-August.
- IT 2026/27: orizzontescuola.it regional overview, Regione Piemonte and Lombardia decrees:
  Christmas 23 Dec - 6 Jan, Carnival 8-9 Feb 2027 in some regions, Easter 25-30 Mar 2027.
Usage: python3 data/make_static_holidays.py
"""
import csv
import datetime as dt
import pathlib

from dateutil.easter import easter

OUT = pathlib.Path(__file__).resolve().parent / "static" / "school_holidays_extra.csv"
D = dt.date
W = dt.timedelta


def iso_week(year: int, week: int):
    """Saturday before .. Sunday after the Mon-Fri of ISO week `week`."""
    mon = D.fromisocalendar(year, week, 1)
    return mon - W(days=2), mon + W(days=6)


def wrap(a: D, b: D):
    """Extend a break to the adjoining weekends."""
    while a.weekday() != 5 and (a - W(days=1)).weekday() in (5, 6):
        a -= W(days=1)
    if a.weekday() == 0:
        a -= W(days=2)
    if b.weekday() == 4:
        b += W(days=2)
    return a, b


def last_weekday(year, month, weekday):
    d = D(year + (month == 12), month % 12 + 1, 1) - W(days=1)
    while d.weekday() != weekday:
        d -= W(days=1)
    return d


rows = []


def add(c, a, b, share, name, conf="approx"):
    rows.append((c, a.isoformat(), b.isoformat(), share, name, conf))


for y in range(2013, 2027):  # school year y/y+1
    e = easter(y + 1)
    # Denmark
    add("DK", *iso_week(y, 42), 1.0, "efterårsferie")
    add("DK", *wrap(D(y, 12, 21), D(y + 1, 1, 2)), 1.0, "juleferie")
    add("DK", *iso_week(y + 1, 7), 0.77, "vinterferie uge 7", "approx (77 of 98 municipalities)")
    add("DK", *iso_week(y + 1, 8), 0.20, "vinterferie uge 8", "approx (20 of 98 municipalities)")
    add("DK", e - W(days=8), e + W(days=1), 1.0, "påskeferie")
    add("DK", last_weekday(y + 1, 6, 5), D.fromisocalendar(y + 1, 32, 7), 1.0, "sommerferie")
    # England
    oct_mon = last_weekday(y, 10, 0)
    if oct_mon.day > 25:  # last full Mon-Fri week inside October
        oct_mon -= W(days=7) if (oct_mon + W(days=4)).month == 11 else W(days=0)
    add("GB", oct_mon - W(days=2), oct_mon + W(days=6), 0.8, "October half-term")
    add("GB", oct_mon - W(days=9), oct_mon - W(days=1), 0.2, "October half-term (early councils)")
    add("GB", *wrap(D(y, 12, 20), D(y + 1, 1, 3)), 1.0, "Christmas")
    feb = D(y + 1, 2, 13)
    while feb.weekday() != 0:
        feb += W(days=1)
    add("GB", feb - W(days=2), feb + W(days=6), 0.6, "February half-term (main week)")
    add("GB", feb - W(days=9), feb - W(days=1), 0.3, "February half-term (other councils)")
    add("GB", e - W(days=9), e + W(days=8), 0.9, "Easter holidays")
    may = last_weekday(y + 1, 5, 0)
    add("GB", may - W(days=2), may + W(days=6), 1.0, "May half-term")
    add("GB", D(y + 1, 7, 22), D(y + 1, 9, 1), 1.0, "summer holidays (England)")
    # Sweden
    add("SE", *iso_week(y, 44), 1.0, "höstlov")
    add("SE", D(y, 12, 21), D(y + 1, 1, 8), 1.0, "jullov")
    for wk, sh in {7: .10, 8: .25, 9: .30, 10: .25, 11: .10}.items():
        add("SE", *iso_week(y + 1, wk), sh, f"sportlov vecka {wk}", "approx (regional pattern)")
    add("SE", e - W(days=2), e + W(days=7), 0.8, "påsklov")
    add("SE", D(y + 1, 6, 12), D(y + 1, 8, 18), 1.0, "sommarlov")

# Italy 2026/27 (API data ends 16 Jun 2026)
add("IT", D(2026, 12, 23), D(2027, 1, 6), 1.0, "vacanze di Natale", "regional decrees")
add("IT", D(2027, 2, 6), D(2027, 2, 10), 0.4, "Carnevale (some regions)", "regional decrees, partial")
add("IT", D(2027, 3, 25), D(2027, 3, 30), 0.95, "vacanze di Pasqua", "regional decrees")
add("IT", D(2027, 6, 9), D(2027, 9, 12), 1.0, "vacanze estive", "approx")
add("IT", D(2026, 6, 11), D(2026, 9, 13), 1.0, "vacanze estive", "approx (API ends 16 Jun 2026)")
# Poland 2026/27 (API has the three ferie zimowe turns; MEN calendar 2026/27 per gazetaprawna.pl, rmf24.pl)
add("PL", D(2026, 12, 23), D(2027, 1, 1), 1.0, "zimowa przerwa świąteczna", "MEN calendar 2026/27")
add("PL", D(2027, 3, 25), D(2027, 3, 30), 1.0, "wiosenna przerwa świąteczna", "MEN calendar 2026/27")
add("PL", D(2027, 6, 26), D(2027, 8, 31), 1.0, "ferie letnie", "MEN calendar 2026/27")
# France summer 2027 (national; zones only differ in winter and spring)
add("FR", D(2027, 7, 3), D(2027, 8, 31), 1.0, "vacances d'été", "approx")

with OUT.open("w") as f:
    f.write("# Generated by data/make_static_holidays.py (rules and sources in its docstring). Approximate.\n")
    w = csv.writer(f)
    w.writerow(["country", "start", "end", "share", "name", "confidence"])
    w.writerows(rows)
print(f"{len(rows)} rows -> {OUT}")
