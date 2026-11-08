"""Route tests for the c04 data API. Run from the repository root: pytest api/c04/tests"""
import importlib
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
B = "/t/c04-api"


@pytest.fixture(scope="module")
def client():
    os.environ.setdefault("DATA_DIR", str(ROOT / "results" / "gui"))  # the pipeline points these at new tables
    os.environ.setdefault("C04_DIR", str(ROOT / "results" / "c04"))
    os.environ.update(BASE_PATH=B, TODAY="2026-11-08")
    os.environ.pop("SNAPSHOT_DIR", None)
    sys.path.insert(0, str(ROOT / "api" / "c04"))
    app = importlib.import_module("app")
    return TestClient(app.app)


def get(client, path, code=200, **params):
    r = client.get(B + path, params=params)
    assert r.status_code == code, r.text
    return r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text


def test_health(client):
    h = get(client, "/health")
    assert h["ok"] and h["tables"] >= 9 and h["c04_tables"] >= 6


def test_meta(client):
    m = get(client, "/meta")
    assert {"Tirol", "Paznaun-Ischgl"} <= {d["destination"] for d in m["destinations"]}
    assert any(o["origin_code"] == "80" for o in m["origins"])


def test_query_fields(client):
    q = get(client, "/query", destination="Tirol", origin="80", start="2027-01-15", end="2027-03-15")
    for k in ("guests", "nights", "nights_range", "length_of_stay", "weekly_nights", "booking_lead_time", "age_profile"):
        assert {"value", "is_estimate", "method", "grade"} <= set(q[k]), k
        assert q[k]["grade"] in "ABCD"
    n, g = q["nights"]["value"], q["guests"]["value"]
    assert n > g > 0
    lo, hi = q["nights_range"]["value"]
    assert lo <= n <= hi
    assert abs(q["length_of_stay"]["value"] - n / g) < .01
    assert q["reasons"]["push"]["value"], "Bavarian holidays expected in Jan-Mar"


def test_query_errors(client):
    get(client, "/query", 404, destination="Atlantis", origin="80", start="2027-01-01", end="2027-01-31")
    get(client, "/query", 400, destination="Tirol", origin="80", start="2027-02-01", end="2027-01-01")
    get(client, "/query", 404, destination="Tirol", origin="80", start="2030-01-01", end="2030-01-31")
    get(client, "/query", 404, destination="Tirol", origin="nope", start="2027-01-01", end="2027-01-31")


def test_paznaun_query(client):
    q = get(client, "/query", destination="PAZNAUN", origin="25", start="2027-02-01", end="2027-02-28")
    assert q["destination"] == "Paznaun-Ischgl" and q["nights"]["value"] > 0


def test_forecast(client):
    f = get(client, "/forecast", start="2027-02-01", end="2027-02-07")
    assert len(f["daily"]) == 7 and len(f["monthly"]) == 6
    row = f["daily"][0]
    assert "forecast_tvb" not in row  # TVB daily values are not published
    assert row["p10"] <= row["forecast_ours"] <= row["p90"]


def test_deviations(client):
    d = get(client, "/deviations", season="winter 25/26")
    assert set(d["summary"]) == {"winter 25/26", "method"}
    assert all(r["grade"] in "ABC" for r in d["drivers"])
    assert {r["season"] for r in d["monthly"]} == {"winter 25/26"}
    get(client, "/deviations", 404, season="winter 99/00")


def test_warnings(client):
    w = get(client, "/warnings", kind="tight")
    assert w and all(x["kind"] == "tight" and x["mean_utilisation"] >= .95 for x in w)


def test_actions(client):
    a = get(client, "/actions", limit=50)
    assert len(a) == 50 and [x["rank"] for x in a] == sorted(x["rank"] for x in a)
    assert all(x["grade"] in "ABCD" and x["basis"] and x["launch_by"] <= x["from"] for x in a)
    be = get(client, "/actions", market="62", kind="win demand", limit=5)
    assert be and all(x["market"] == "Belgium" for x in be)
    assert get(client, "/actions", market="belgium", limit=5) == get(client, "/actions", market="62", limit=5)
    win = get(client, "/actions", kind="win demand", limit=500)
    assert all(x["reason_type"] in ("holiday-driven", "share-driven") for x in win)
    assert all(x["holiday_part_nights"] <= x["expected_nights"] for x in win)
    assert all(x["base_part_nights"] <= .15 * x["expected_nights"] + 1 for x in win)
    top = [x["reason_type"] for x in win[:5]]
    assert top.count("holiday-driven") >= 3, "holiday-driven actions should lead the list"
    feb = get(client, "/actions", start="2027-02-01", end="2027-02-28", limit=500)
    assert all(x["to"] >= "2027-02-01" and x["from"] <= "2027-02-28" for x in feb)


def test_tables(client):
    t = get(client, "/tables")
    assert "monthly_origin.csv" in t and "c04/actions.csv" in t
    assert get(client, "/tables/c04/actions.csv").startswith("rank,")
    get(client, "/tables/monthly_origin.csv")
    for bad in ("../app.py", "c04/../../app.py", "nope.csv", "c04/nope.csv", "README.md"):
        get(client, "/tables/" + bad, 404)


def test_json_is_strict(client):
    for path in ("/forecast", "/deviations", "/warnings", "/actions"):
        json.loads(client.get(B + path).text, parse_constant=lambda c: pytest.fail(f"{path}: {c} in JSON"))


def test_docs_and_landing(client):
    spec = get(client, "/openapi.json")
    assert B + "/actions" in spec["paths"] and B + "/query" in spec["paths"]
    assert client.get(B + "/docs").status_code == 200
    page = get(client, "/")
    assert "Alpine demand by origin" in page and B + "/docs" in page


def test_freshness(client):
    f = get(client, "/meta")["freshness"]
    assert f["snapshot"] == "baked" and f["today"] == "2026-11-08"
    assert f["generated_at"] and "Statistik Austria, last observed month" in f["sources"]


def test_actions_follow_today(client, monkeypatch):
    monkeypatch.setenv("TODAY", "2027-03-20")
    a = get(client, "/actions", limit=500)
    assert a and all(x["to"] >= "2027-03-20" and x["launch_by"] >= "2027-03-20" for x in a)
    assert [x["rank"] for x in a] == list(range(1, len(a) + 1))
    assert all(x["as_of"] == "2027-03-20" for x in a)
    w = get(client, "/warnings")
    assert {x["status"] for x in w} <= {"past", "ongoing", "upcoming"} and any(x["status"] == "past" for x in w)


def test_snapshot_switch(client, monkeypatch, tmp_path):
    import shutil
    import app
    snap = tmp_path / "snapshots" / "20270101T0000Z"
    shutil.copytree(os.environ["DATA_DIR"], snap / "gui")
    shutil.copytree(os.environ["C04_DIR"], snap / "c04")
    (tmp_path / "snapshots" / "current").symlink_to(snap.name)
    monkeypatch.setattr(app, "SNAPSHOTS", tmp_path / "snapshots")
    assert get(client, "/health")["version"] == "20270101T0000Z"
    assert get(client, "/meta")["freshness"]["snapshot"] == "20270101T0000Z"
    monkeypatch.setattr(app, "SNAPSHOTS", tmp_path / "missing")
    assert get(client, "/health")["version"] == "baked"
