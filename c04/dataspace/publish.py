"""Publish the two Challenge 04 API products on TTF Space (nexyo) via its MCP endpoint.

    python3 c04/dataspace/publish.py draft      # team licences, product drafts, description, sources, contact, coverage
    python3 c04/dataspace/publish.py publish    # connect the API source, set access, publish, list in the catalogue
    python3 c04/dataspace/publish.py update     # catalogue texts of published products (c04/dataspace/texts.py)
    python3 c04/dataspace/publish.py status     # products, checklists, API sources

Needs a TTF Space key with products:write (injected by the proxy in the cloud session, or TTF_SPACE_API_KEY).
Idempotency keys are derived from fixed names (uuid5), so a re-run repeats the same requests instead of
creating duplicates. The API itself: https://hackathon.daria-and-nico.com/c04-api/ (public, no key).
"""
from __future__ import annotations

import json
import sys
import uuid

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "data"))
from ttf_mcp import Client  # noqa: E402

NS = uuid.UUID("6f1d3c2a-8b4e-4c1a-9f0e-0c04da7a5ace")
BASE = "https://hackathon.daria-and-nico.com"
API = f"{BASE}/c04-api/"
SOURCE_ID = "700ffe3d-82e3-4606-8ab8-ec223ea7f650"  # API source "Tirol & Austria Demand by Origin (live APIs)",
# created in the TTF Space UI from the API's openapi.json (no fixed parameters)
CONTACT = {"name": "Team WeMissYouFlo<3, Challenge 04 data", "url": API}

LICENCES = [
    {"key": "odbl-1.0", "title": "Open Data Commons Open Database License 1.0 (ODbL)",
     "url": "https://opendatacommons.org/licenses/odbl/1-0/",
     "text": "Open Data Commons Open Database License (ODbL) v1.0, https://opendatacommons.org/licenses/odbl/1-0/. "
             "You may share, create and adapt the database. Attribute the sources, keep derived databases open "
             "under the ODbL (share-alike), and do not apply technical restrictions.",
     "redistribution": True, "attribution": True, "shareAlike": True, "commercialUse": True, "modification": True},
    {"key": "c04-tvb-derived-nc-v1",
     "title": "Derived from TVB Paznaun-Ischgl data: attribution, non-commercial (TTF 2026)",
     "url": "urn:ttf-c04:licence:tvb-derived-nc:v1",
     "text": "Derived results, models and aggregated datasets computed from data of TVB Paznaun-Ischgl with feratel, "
             "provided under the TVB Paznaun-Ischgl TTF 2026 data licence, which allows distributing derived "
             "datasets, results and models with attribution. Name 'TVB Paznaun-Ischgl with feratel' as the source. "
             "No commercial use. No raw TVB data is included (only derived values and monthly sums). Other inputs: "
             "Statistik Austria, Österreich Werbung / Nächtigungsprognose, GeoSphere Austria, Open-Meteo "
             "(CC BY 4.0), OpenHolidays (ODbL): name them as well.",
     "redistribution": True, "attribution": True, "shareAlike": False, "commercialUse": False, "modification": True},
]

RIGHTS = {"use": True, "derive": True, "distribute": True, "derivedDatasets": True, "results": True, "models": True}

PRODUCTS = [
    {"slug": "c04-demand-by-origin",
     "title": "Tirol & Austria Demand by Origin (live API)",
     "licence": "odbl-1.0",
     "themes": ["overnight-data", "off-season", "calendar", "weather"],
     "operations": ["query-demand", "get-meta", "list-tables", "get-table", "get-health"],
     "places": ["AT11", "AT12", "AT13", "AT21", "AT22", "AT31", "AT32", "AT33", "AT34"], "start": "2024-01", "end": "2027-12",
     "sources": ["Guest card usage, Salzburger Sportwelt"],
     "urls": [("https://data.statistik.gv.at/", "Statistik Austria, accommodation statistics by origin (CC BY 4.0)"),
              ("https://naechtigungen.pol.joanneum.at/docs", "Österreich Werbung / Nächtigungsprognose API (CC BY 4.0)"),
              ("https://www.openholidaysapi.org/", "OpenHolidays API, school and public holidays (ODbL)"),
              ("https://dataset.api.hub.geosphere.at/", "GeoSphere Austria SNOWGRID (CC BY 4.0)"),
              ("https://open-meteo.com/", "Open-Meteo weather forecast (CC BY 4.0)"),
              ("https://statistik.tirol.gv.at/", "Landesstatistik Tirol, tourism by origin")],
     "description":
         "Who comes to which Austrian state, and when? For destination (any Austrian state or Paznaun-Ischgl) x "
         "origin market (countries, German regions and states, Austrian states) x time frame, the API returns guests, "
         "nights with an 80 % range, length of stay, weekly distribution, booking lead time and age profile, plus the "
         "reasons: school holidays, public holidays and long weekends at the origin (free-day blocks, population-"
         "weighted) and season, events, snow and the weather forecast at the destination. Every value carries "
         "is_estimate, method and an evidence grade (A observed ... D rough), so no cell is empty and every gap is "
         "labelled. For destination marketing teams, tourism boards and analysts who plan campaigns by source "
         "market, and for teams who need origin-level demand without raw data. Models: pooled LightGBM per origin "
         "and month (about 10 % monthly error for large markets), daily split by destination pattern x origin "
         "holidays (validated on mobile network data). Example: queryDemand with destination=Tirol, origin=80 "
         "(Bavaria), start=2027-01-15, end=2027-03-15. Docs: " + API + "docs. Sources: Statistik Austria, "
         "Österreich Werbung / Nächtigungsprognose, GeoSphere Austria, Open-Meteo (CC BY 4.0), OpenHolidays (ODbL), "
         "Landesstatistik Tirol; age profiles derived from Salzburger Sportwelt guest cards."},
    {"slug": "c04-paznaun-outlook",
     "title": "Paznaun-Ischgl Demand Outlook & Actions (live API)",
     "licence": "c04-tvb-derived-nc-v1",
     "themes": ["overnight-data", "accommodation", "events"],
     "operations": ["get-actions", "get-forecast", "get-deviations", "get-warnings", "get-table", "get-health"],
     "places": ["AT334"], "start": "2025-11", "end": "2027-04",
     "sources": ["Overnight stays Paznaun-Ischgl: previous year, forecast and actuals", "Available beds Paznaun-Ischgl",
                 "Booking lead time Paznaun-Ischgl, 2023–2026", "Event calendar Paznaun-Ischgl 2026–2027"],
     "urls": [("https://www.openholidaysapi.org/", "OpenHolidays API, school and public holidays (ODbL)"),
              ("https://naechtigungen.pol.joanneum.at/docs", "Österreich Werbung / Nächtigungsprognose API (CC BY 4.0)")],
     "description":
         "Where will Paznaun-Ischgl have empty or tight beds this winter, why did past stays differ from the "
         "forecast, and which source market should be addressed first? For the tourism board, hotels and marketing "
         "teams of Paznaun-Ischgl, and for teams building dashboards or campaign planners. getForecast: daily "
         "forecast winter 2026/27 with 80 % band (8.5 % daily error in a real-data backtest), capacity from stays and "
         "free beds, utilisation and flags. getDeviations: drivers of last season's deviations from the TVB forecast "
         "(push: holidays in the source markets; pull: snow, season, events) with evidence grades. getWarnings: "
         "windows with spare or tight capacity. getActions: ranked marketing actions with market, travel window, "
         "reason (holiday- or share-driven), launch date from the booking lead times, nights to win, share still "
         "bookable and confidence grade, re-dated every day. Only derived values and monthly sums, no TVB raw data. "
         "Attribution: TVB Paznaun-Ischgl with feratel (TTF 2026 data licence), non-commercial use. Docs: "
         + API + "docs"},
]


def key(*parts) -> str:
    """Deterministic request key in UUID v4 format (some tools accept only v4): same request -> same key."""
    return str(uuid.UUID(bytes=uuid.uuid5(NS, "/".join(parts)).bytes, version=4))


class Space:
    def __init__(self):
        self.c = Client()

    def call(self, tool, **args):
        r = self.c.rpc("tools/call", {"name": tool, "arguments": args})
        txt = r["content"][0]["text"] if isinstance(r, dict) and r.get("content") else json.dumps(r)
        try:
            out = json.loads(txt, strict=False)
        except ValueError:
            out = {"text": txt}
        if isinstance(r, dict) and r.get("isError"):
            raise RuntimeError(f"{tool}: {txt[:800]}")
        return out


def find_product(s: Space, title: str, slug: str):
    own = [p for p in s.call("list_products").get("items", []) if p["title"] == title and p.get("productId")]
    # an older draft may share the title (e.g. one made in the UI): take the newest
    return max(own, key=lambda p: p.get("createdAt") or "", default=None)


def draft(s: Space):
    opts = s.call("get_product_options")
    have = {l["key"] for l in opts["licences"]}
    for lic in LICENCES:
        if lic["key"] not in have:
            print("licence", lic["key"], s.call("add_licence", idempotencyKey=key("licence", lic["key"]), **lic))
    srcs = {x["title"]: x["product"] for x in opts["sources"]}
    for p in PRODUCTS:
        # create_product is idempotent per key: a re-run returns the same draft
        r = s.call("create_product", idempotencyKey=key("create-v2", p["slug"]), kind="api", title=p["title"],
                   description=p["description"], licence=p["licence"], rights=RIGHTS,
                   themes=p["themes"])
        pid = r.get("productId") or r.get("product", {}).get("productId")
        print(p["title"], "->", pid)
        # restricted TTF products (TVB, Sportwelt) cannot be formal sources of a relicensed product
        # ("restricted sources must retain their licence"): named by their catalogue link instead
        sources = [{"url": srcs[t], "title": f"{t} (TTF Space)"} for t in p["sources"] if t in srcs]
        sources += [{"url": u, "title": t} for u, t in p["urls"]]
        steps = [("provenance", dict(sources=sources, outputKind="result")),
                 ("contact", dict(name=CONTACT["name"], url=CONTACT["url"], landingPage=API)),
                 ("coverage", dict(places=p["places"], start=p["start"], end=p["end"])),
                 ("themes", dict(themes=p["themes"]))]
        for section, args in steps:
            body = json.dumps(args, sort_keys=True, ensure_ascii=False)  # new content -> new key, same -> same
            s.call("update_product", productId=pid, section=section, idempotencyKey=key(section, p["slug"], body), **args)
        q = s.call("check_product_quality", productId=pid)
        print("  quality", q.get("score"), "/", q.get("total"), "missing:", q.get("missing"))


def publish(s: Space):
    opts = s.call("get_product_options")
    src = next((x for x in opts["serviceSources"] if x["id"] == SOURCE_ID), None)
    if not src:
        sys.exit(f"API source {SOURCE_ID} not found")
    if src["fixed"]:
        sys.exit(f"API source has fixed parameters {src['fixed']}: refresh it from " + API + "openapi.json first")
    for p in PRODUCTS:
        missing = set(p["operations"]) - set(src["operations"])
        if missing:
            sys.exit(f"{p['title']}: operations not in the source: {missing}")
    for p in PRODUCTS:
        prod = find_product(s, p["title"], p["slug"])
        if not prod:
            sys.exit(f"draft {p['title']!r} missing: run draft first")
        pid = prod["productId"]
        if prod.get("state") != "ACTIVE":
            if prod.get("contentPath") != "connected" or not (s.call("get_product", productId=pid).get("service")):
                body = json.dumps([src["id"], p["operations"]])
                s.call("set_content", productId=pid, path="connected", sourceId=src["id"], operations=p["operations"],
                       idempotencyKey=key("content", p["slug"], body))
            if prod.get("accessOption") != "members":
                s.call("set_access", productId=pid, access="members", idempotencyKey=key("access-members", p["slug"]))
            print(p["title"], "publish:", s.call("publish_product", productId=pid,
                                                 idempotencyKey=key("publish-v2", p["slug"])))
        print(p["title"], "catalogue:", s.call("list_in_catalogue", productId=pid, idempotencyKey=key("list", p["slug"])))


def update(s: Space):
    """Catalogue texts (texts.py) for the published products: about, provenance, schema, coverage."""
    import texts as T
    opts = s.call("get_product_options")
    srcs = {x["title"]: x["product"] for x in opts["sources"]}
    plan = [(PRODUCTS[0], "demand", T.DESC_DEMAND, T.SCHEMA_DEMAND), (PRODUCTS[1], "outlook", T.DESC_OUTLOOK, T.SCHEMA_OUTLOOK)]
    for p, k, desc, schema in plan:
        prod = find_product(s, p["title"], p["slug"])
        pid = prod["productId"]
        sources = [{"url": srcs[t], "title": f"{t} (TTF Space, TVB / Sportwelt licence)"} for t in T.SOURCES[k]["ttf"] if t in srcs]
        sources += [{"url": T.OPEN[o][0], "title": T.OPEN[o][1]} for o in T.SOURCES[k]["open"]]
        cov = dict(places=p["places"], start=p["start"], end=p["end"], **T.COVERAGE[k])
        for section, args in (("about", dict(title=p["title"], description=desc)),
                              ("provenance", dict(sources=sources, outputKind="result")),
                              ("schema", dict(schema=schema)),
                              ("coverage", cov)):
            body = json.dumps(args, sort_keys=True, ensure_ascii=False)
            s.call("update_product", productId=pid, section=section, idempotencyKey=key("upd", section, p["slug"], body), **args)
            print(p["title"], section, "ok")
        q = s.call("check_product_quality", productId=pid)
        print("  quality", q.get("score"), "/", q.get("total"), "missing:", q.get("missing"))


def status(s: Space):
    for p in s.call("list_products").get("items", []):
        print(p["productId"], p["state"], p.get("contentPath"), p.get("accessOption"), p.get("checklist"), p["title"])
    for x in s.call("get_product_options")["serviceSources"]:
        print("source", x["id"], x["name"], "fixed", x["fixed"], x["operations"][:6])


if __name__ == "__main__":
    {"draft": draft, "publish": publish, "update": update, "status": status}[sys.argv[1] if len(sys.argv) > 1 else "status"](Space())
