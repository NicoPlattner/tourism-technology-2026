"""Request (if needed) and download the TVB Paznaun-Ischgl Challenge 04 datasets
from the TTF Data Space into data/raw/partner/ (git-ignored; never commit).

Licence: TVB Paznaun-Ischgl TTF 2026 data licence, attribute TVB Paznaun-Ischgl.
Key: injected by the cloud proxy, or TTF_SPACE_API_KEY locally.

    python3 data/fetch_partner.py
"""
import base64
import pathlib
import time
import uuid

from ttf_mcp import Client

OUT = pathlib.Path(__file__).resolve().parent / "raw" / "partner"
PRODUCTS = {
    "264dc170-6f1d-4105-8a02-e5169617c822": "overnight_stays_2025-11_2027-04.csv",
    "736f1187-a922-450a-b9ba-4f7e2bf8eb3e": "available_beds_2025-02_2026-11.csv",
    "892e2449-89da-4df3-b5dc-469a0061ec5a": "booking_lead_time_2023-2026.csv",
    "146a8548-31df-4c25-88f5-0a4a59a3b7a3": "event_calendar_2026-2027.csv",
}


def key(name: str) -> str:
    """Deterministic UUID per request, so re-running retries the same request (it becomes the exchangeId)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ttf-c04-data-models/{name}"))


def wait(c, eid, phases, tries=30):
    st = {}
    for _ in range(tries):
        st = c.call("contract_status", {"exchangeId": eid})
        if st.get("phase") in phases:
            return st
        time.sleep(4)
    return st


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    c = Client()
    for pid, fname in PRODUCTS.items():
        eid = key(pid)  # the request's idempotency key becomes the exchangeId
        st = c.call("contract_status", {"exchangeId": eid})
        if not isinstance(st, dict) or "phase" not in st:
            c.call("request_contract", {"productId": pid, "idempotencyKey": eid})
        st = wait(c, eid, ("AGREED", "STARTED"))
        if st.get("phase") == "AGREED":
            c.call("start_transfer", {"exchangeId": eid, "idempotencyKey": key("transfer-" + eid)})
            st = wait(c, eid, ("STARTED",))
        if st.get("phase") != "STARTED":
            print(f"{fname}: not ready (phase {st.get('phase')})")
            continue
        links = c.call("get_contracted_links", {"exchangeId": eid})
        items = [i for ls in links.get("linkset", []) for i in ls.get("item", [])]
        if not items:
            print(f"{fname}: no file links: {str(links)[:300]}")
            continue
        data = c.call("read_file", {"exchangeId": eid, "href": items[0]["href"]})
        if isinstance(data, dict):  # binary answers come as base64
            data = base64.b64decode(data.get("content", "")).decode("utf-8")
        (OUT / fname).write_text(data if data.endswith("\n") else data + "\n", encoding="utf-8")
        print(f"{fname}: {len(data.splitlines()) - 1} rows")


if __name__ == "__main__":
    main()
