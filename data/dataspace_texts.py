"""Catalogue texts of the two Challenge 04 API products on TTF Space (applied by publish_dataspace.py update).

Plain text with line breaks (the catalogue shows descriptions as text). Operation names are the keys the Data
Space shows (query-demand, get-actions, ...); the same routes are documented at https://hackathon.daria-and-nico.com/c04-api/docs.
"""

DOCS = "https://hackathon.daria-and-nico.com/c04-api/docs"

DESC_DEMAND = f"""Who comes to which Austrian state, when, and why? For any Austrian federal state or Paznaun-Ischgl, any origin market (countries, German regions and states, Austrian states) and any time frame from January 2024 to December 2027.

For: tourism boards, destination marketing and analysts who plan by source market, and teams that need origin-level demand without raw data.

Operations
- query-demand (destination, origin, start, end): guests and overnight stays with an 80 % range, length of stay, nights per week, booking lead time (share booked 0-180+ days ahead, median, "book by" date), age profile, and the reasons: school and public holidays and long weekends at the origin; season, Christmas and Easter, events, snow and the 16-day weather forecast at the destination. Defaults: Tirol, origin 80 (Bavaria), 2027-01-15 to 2027-03-15.
- get-meta: destination and origin codes, months, grades, sources, date of each source.
- list-tables, get-table (name): the tables as CSV, e.g. monthly_origin.csv, push_reasons.csv.
- get-health: status.

Quality: every value comes as value, is_estimate, method and grade, from A (observed, or a model for a large market with about 10 % monthly error) to D (rough fallback). No cell is empty; every gap is labelled.

Method: monthly guests and nights per origin from a LightGBM model pooled over all nine states, trained on Statistik Austria 2004-2025 (COVID months excluded). Daily split: the destination's daily pattern times the origin's holiday push (school holidays, plus long weekends inside free-day blocks); validated on mobile network data. Lead time from TVB Paznaun-Ischgl booking data, age profiles from Salzburger Sportwelt guest cards (both estimates for other destinations, grade C). German states: region split by population (grade C).

Updates: weather and snow on request or schedule; models re-run only when a source publishes new data.

Sources: Statistik Austria (CC BY 4.0), Österreich Werbung / Nächtigungsprognose (CC BY 4.0), OpenHolidays (ODbL), GeoSphere Austria SNOWGRID and Open-Meteo (CC BY 4.0), Landesstatistik Tirol; derived aggregates of TVB Paznaun-Ischgl with feratel and Salzburger Sportwelt data (TTF 2026 data licences). Docs and examples: {DOCS}"""

DESC_OUTLOOK = f"""Where will Paznaun-Ischgl have empty or tight beds this winter, why did past stays differ from the forecast, and which source market should be addressed first?

For: the tourism board, hotels and marketing teams of Paznaun-Ischgl, and teams building dashboards or campaign planners on top.

Operations
- get-forecast (start, end): daily forecast for winter 2026/27 with an 80 % band, official forecast, capacity (stays + free beds of last season, aligned to Easter), utilisation and flags (tight >= 95 %, spare < 80 %).
- get-warnings (kind): windows with spare capacity, tight capacity or disagreement with the TVB forecast, with days until start.
- get-deviations (season): why actual stays differed from the TVB forecast in winter 2025/26 and summer 2026: monthly error, tracking signal, and the drivers, split into push (holidays in the source markets) and pull (snow, season phase, weekday, events), each with stays explained, an 80 % interval and grade A-C.
- get-actions (kind, market, start, end, limit): ranked marketing actions: market, travel window, reason (holiday- or share-driven), action type (holiday campaign, short-trip package, midweek offer), launch date from the booking lead times, nights to win, share still bookable, confidence grade and basis. Re-dated every day.
- get-table (name): the tables as CSV, e.g. c04/actions.csv.

Quality: forecast backtested on real data (8.5 % daily error over winter 2025/26, 80 % band); driver effects with bootstrap intervals; every row has a grade and its basis.

Method: monthly anchor (two-season average, Easter-corrected) x daily shape (holiday-aligned previous year + LightGBM with push-pull features); deviations by ridge regression on interpretable drivers with SHAP check and week-block bootstrap; actions = spare beds split by market share x holiday push in free-day blocks, capped at plausible gains.

Updates: re-run when TVB publishes new data; launch dates and bookable shares move with the date.

Sources: TVB Paznaun-Ischgl with feratel (overnight stays, available beds, booking lead time, event calendar; TTF 2026 data licence), Statistik Austria and Landesstatistik Tirol (market shares), Österreich Werbung / Nächtigungsprognose (official forecast, CC BY 4.0), OpenHolidays (ODbL), GeoSphere Austria SNOWGRID (CC BY 4.0). Only derived values and monthly sums; no TVB raw data. Attribution: TVB Paznaun-Ischgl with feratel; non-commercial use. Docs: {DOCS}"""

# (title in get_product_options sources -> linked as catalogue entry) and external links
TTF_TVB = ["Overnight stays Paznaun-Ischgl: previous year, forecast and actuals", "Available beds Paznaun-Ischgl",
           "Booking lead time Paznaun-Ischgl, 2023–2026", "Event calendar Paznaun-Ischgl 2026–2027"]
OPEN = {
    "statistik": ("https://data.statistik.gv.at/web/meta.jsp?dataset=OGD_touextsai_Tour_HKL_1",
                  "Statistik Austria: arrivals and overnight stays by state and origin, monthly since 1973 (CC BY 4.0)"),
    "tirol": ("https://statistik.tirol.gv.at/", "Landesstatistik Tirol: tourism by origin per municipality and season"),
    "forecast": ("https://naechtigungen.pol.joanneum.at/docs",
                 "Österreich Werbung / Nächtigungsprognose API: official forecast and daily index (CC BY 4.0)"),
    "holidays": ("https://www.openholidaysapi.org/", "OpenHolidays API: school and public holidays (ODbL)"),
    "snow": ("https://dataset.api.hub.geosphere.at/", "GeoSphere Austria SNOWGRID: daily snow depth, 1 km (CC BY 4.0)"),
    "weather": ("https://open-meteo.com/", "Open-Meteo: 16-day weather forecast (CC BY 4.0)"),
}
SOURCES = {
    "demand": {"ttf": ["Guest card usage, Salzburger Sportwelt", "Booking lead time Paznaun-Ischgl, 2023–2026",
                       "Event calendar Paznaun-Ischgl 2026–2027"],
               "open": ["statistik", "tirol", "forecast", "holidays", "snow", "weather"]},
    "outlook": {"ttf": TTF_TVB, "open": ["statistik", "tirol", "forecast", "holidays", "snow"]},
}

FIELD = {"type": "object", "description": "One value with its evidence",
         "properties": {"value": {"description": "the value (number, object or list)"},
                        "is_estimate": {"type": "boolean", "description": "true if modelled, split or filled, not observed"},
                        "method": {"type": "string", "description": "how the value was produced"},
                        "grade": {"type": "string", "enum": ["A", "B", "C", "D"],
                                  "description": "A observed / large-market model, B smaller-market model, C estimate, D rough"},
                        "note": {"type": "string"}},
         "required": ["value", "is_estimate", "method", "grade"]}

SCHEMA_DEMAND = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "query-demand response",
    "description": "Demand of one origin market at one destination in a time frame. Every measure is a field "
                   "{value, is_estimate, method, grade}.",
    "type": "object",
    "$defs": {"field": FIELD},
    "properties": {
        "destination": {"type": "string", "description": "Austrian state or Paznaun-Ischgl"},
        "origin": {"type": "string", "description": "origin code (see get-meta)"},
        "origin_name": {"type": "string"},
        "from": {"type": "string", "format": "date"}, "to": {"type": "string", "format": "date"},
        "guests": {"$ref": "#/$defs/field", "description": "arrivals in the time frame"},
        "nights": {"$ref": "#/$defs/field", "description": "overnight stays in the time frame"},
        "nights_range": {"$ref": "#/$defs/field", "description": "[low, high], at least 80 % coverage"},
        "length_of_stay": {"$ref": "#/$defs/field", "description": "nights per guest"},
        "weekly_nights": {"$ref": "#/$defs/field", "description": "nights per week (week ending Sunday)"},
        "booking_lead_time": {"$ref": "#/$defs/field",
                              "description": "share of bookings 0, 8, 31, 61, 90, 180+ days ahead, median days, book-by date"},
        "booking_lead_time_this_market": {"$ref": "#/$defs/field", "description": "indicative profile of the market group"},
        "age_profile": {"$ref": "#/$defs/field", "description": "shares by age band, median band"},
        "reasons": {"type": "object", "description": "why people travel then",
                    "properties": {"push": {"$ref": "#/$defs/field",
                                            "description": "holiday windows at the origin: from, to, holidays, days, max push multiplier"},
                                   "pull": {"$ref": "#/$defs/field",
                                            "description": "events, Christmas and Easter days, season days, snow depth, 16-day snowfall forecast, pull multiplier"}}},
        "sources": {"type": "array", "items": {"type": "string"}},
    },
}

SCHEMA_OUTLOOK = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Paznaun-Ischgl outlook: get-actions item (other operations in the API docs)",
    "description": "One ranked marketing action. get-forecast, get-warnings and get-deviations are described in "
                   "the API documentation.",
    "type": "object",
    "properties": {
        "rank": {"type": "integer", "description": "1 = first"},
        "kind": {"type": "string", "enum": ["win demand", "protect yield"]},
        "reason_type": {"type": "string", "enum": ["holiday-driven", "share-driven", "capacity tight"]},
        "action_type": {"type": "string", "description": "holiday campaign, short-trip package, midweek offer, short-stay offer, yield"},
        "action": {"type": "string", "description": "the action in one sentence"},
        "market": {"type": "string"}, "market_code": {"type": "string"},
        "from": {"type": "string", "format": "date"}, "to": {"type": "string", "format": "date"},
        "holiday_days": {"type": "number", "description": "days with a holiday push of the market in the window"},
        "holidays": {"type": "string"},
        "launch_by": {"type": "string", "format": "date", "description": "window start minus median booking lead time (not before today)"},
        "launch_overdue": {"type": "boolean"},
        "share_still_bookable": {"type": "number", "description": "share of the window's bookings usually made later than today"},
        "market_share": {"type": "number"},
        "expected_nights": {"type": "number", "description": "nights the market brings in the window anyway"},
        "holiday_part_nights": {"type": "number"}, "base_part_nights": {"type": "number"},
        "addressable_nights": {"type": "number", "description": "room to win, not a promised effect"},
        "score": {"type": "number"},
        "grade": {"type": "string", "enum": ["A", "B", "C", "D"]},
        "note": {"type": "string"}, "basis": {"type": "string", "description": "what the row is based on"},
        "as_of": {"type": "string", "format": "date"},
    },
}

COVERAGE = {
    "demand": {"temporalResolution": "P1D"},
    "outlook": {"temporalResolution": "P1D",
                "areas": [{"label": "Paznaun valley (Ischgl, Galtür, Kappl, See)", "bbox": [10.10, 46.90, 10.45, 47.10]}]},
}
