"""Download other challenges' Data Space products that help Challenge 04 into data/raw/other/ (git-ignored).

Licences (no redistribution: never commit raw files):
- Hutchison Drei TTF 2026 data licence (non-commercial, attribution)
- Salzburger Sportwelt TTF challenge data (non-commercial, attribution)
- Austria Tourism TOURDATA TTF licence (attribution)
Large files use get_direct_access (short-lived token, kept in memory only).

    python3 c04/data/fetch_other.py
"""
import pathlib
import urllib.request

from fetch_partner import key, wait
from ttf_mcp import Client

OUT = pathlib.Path(__file__).resolve().parent / "raw" / "other"
PRODUCTS = {
    "bbb8b4f8-38a4-4573-b160-7bf5a1c12629": "drei_sportwelt_2026",
    "b8bc8274-59b3-416e-8e9c-b801b087d3c1": "guestcard_usage_sportwelt",
    "05fd177c-7f5b-477d-9b37-d3330ebfce6a": "guestcards_per_type_sportwelt",
}


def ensure(c, pid):
    eid = key(pid)
    st = c.call("contract_status", {"exchangeId": eid})
    if not isinstance(st, dict) or "phase" not in st:
        c.call("request_contract", {"productId": pid, "idempotencyKey": eid})
    st = wait(c, eid, ("AGREED", "STARTED"))
    if st.get("phase") == "AGREED":
        c.call("start_transfer", {"exchangeId": eid, "idempotencyKey": key("transfer-" + eid)})
        wait(c, eid, ("STARTED",))
    return eid


def download(c, eid, folder: pathlib.Path):
    folder.mkdir(parents=True, exist_ok=True)
    acc = c.call("get_direct_access", {"exchangeId": eid})
    items = [i for ls in acc["linkset"]["linkset"] for i in ls.get("item", [])]
    for n, it in enumerate(items):
        req = urllib.request.Request(it["href"], headers={"Authorization": f"Bearer {acc['accessToken']}",
                                                          "User-Agent": "ttf-c04-data-models"})
        with urllib.request.urlopen(req, timeout=600) as r:
            name = r.headers.get_filename() or f"part_{n:02d}.csv"
            data = r.read()
        (folder / name).write_bytes(data)
        print(f"  {folder.name}/{name}: {len(data) / 1e6:.1f} MB")


if __name__ == "__main__":
    c = Client()
    for pid, name in PRODUCTS.items():
        download(c, ensure(c, pid), OUT / name)
