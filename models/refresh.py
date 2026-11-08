"""Live refresh of the Challenge 04 data product: fetch, rebuild what changed, validate, publish a snapshot.

    python3 models/refresh.py fast    # weather, snow, official forecast, Paznaun forecast, reasons, actions
    python3 models/refresh.py full    # also holidays, Statistik Austria, Landesstatistik Tirol, TVB and guest
                                      # cards from the TTF Data Space; models re-run only when their inputs changed
    python3 models/refresh.py auto    # full when there is no snapshot or no state yet, else fast

Layout (WORK, default /work, a persistent volume in the cluster):
  WORK/raw, WORK/processed, WORK/out      caches of the scripts (data/raw, data/processed, out), never served
  WORK/results/{gui,c04}                  working copy written by the export scripts
  WORK/snapshots/<UTC timestamp>/         published, validated copies; WORK/snapshots/current -> newest good one
  WORK/state.json                         input hashes of each model step (change detection)
The API reads WORK/snapshots/current (read-only mount). A failed fetch keeps the cached data; a failed
step or validation keeps the last good snapshot, so consumers never see a broken state.
TTF_SPACE_API_KEY (environment) is needed for the TVB and guest-card data; without it those stay cached.
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # code: /app in the image, the repository locally
WORK = Path(os.environ.get("WORK_DIR", "/work"))
KEEP = int(os.environ.get("KEEP_SNAPSHOTS", "8"))
PY = sys.executable


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def link(code_path: Path, work_path: Path):
    """Point the scripts' fixed paths (data/raw, ...) at the persistent volume."""
    work_path.mkdir(parents=True, exist_ok=True)
    if code_path.is_symlink() and code_path.resolve() == work_path.resolve():
        return
    if code_path.exists() and not code_path.is_symlink():
        if any(code_path.iterdir()):
            return  # a real local folder (developer machine): use it as it is
        code_path.rmdir()
    code_path.parent.mkdir(parents=True, exist_ok=True)
    if code_path.is_symlink():
        code_path.unlink()
    code_path.symlink_to(work_path, target_is_directory=True)


def setup():
    link(ROOT / "data" / "raw", WORK / "raw")
    link(ROOT / "data" / "processed", WORK / "processed")
    link(ROOT / "out", WORK / "out")
    res = WORK / "results"
    if not (res / "gui").exists():  # seed the working copy with the tables baked into the image
        for part in ("gui", "c04"):
            src = ROOT / "baked-results" / part
            if not src.exists():
                src = ROOT / "results" / part
            if src.exists() and src.resolve() != (res / part).resolve():
                shutil.copytree(src, res / part, dirs_exist_ok=True)
    link(ROOT / "results", res)
    (WORK / "snapshots").mkdir(parents=True, exist_ok=True)


def run(script: str, *args, required=True, timeout=1800) -> bool:
    log("run", script, *args)
    t = time.time()
    p = subprocess.run([PY, str(ROOT / script), *args], cwd=ROOT / Path(script).parent, timeout=timeout,
                       capture_output=True, text=True)
    tail = (p.stdout + p.stderr).strip().splitlines()[-6:]
    log(f"  exit {p.returncode} after {time.time() - t:.0f}s", *(("\n    " + x) for x in tail))
    if p.returncode != 0 and required:
        raise RuntimeError(f"{script} failed")
    return p.returncode == 0


def run_py(code: str, label: str, required=True) -> bool:
    log("run", label)
    p = subprocess.run([PY, "-c", code], cwd=ROOT / "models", capture_output=True, text=True, timeout=1800)
    log(f"  exit {p.returncode}", *(("\n    " + x) for x in (p.stdout + p.stderr).strip().splitlines()[-4:]))
    if p.returncode != 0 and required:
        raise RuntimeError(f"{label} failed")
    return p.returncode == 0


def digest(patterns: list[str]) -> str:
    h = hashlib.sha1()
    for pat in patterns:
        for f in sorted(glob.glob(str(ROOT / pat), recursive=True)):
            if os.path.isfile(f):
                h.update(f.encode())
                h.update(Path(f).read_bytes())
    return h.hexdigest()


GUESTCARDS = '''
import sys; sys.path.insert(0, "../data")
from fetch_other import Client, OUT, download, ensure
c = Client()
for pid, name in {"b8bc8274-59b3-416e-8e9c-b801b087d3c1": "guestcard_usage_sportwelt",
                  "05fd177c-7f5b-477d-9b37-d3330ebfce6a": "guestcards_per_type_sportwelt"}.items():
    download(c, ensure(c, pid), OUT / name)
'''
M3 = "import m3_daily; m3_daily.build_output()"

# Model steps: (name, how to run, inputs). A step runs when its input hash changed or its output is missing.
MODELS = [
    ("m1_origin", ("models/m1_origin.py",), ["data/processed/origin_panel.parquet"], "out/gui/m1_origin_month.parquet"),
    ("m3_daily", M3, ["data/processed/tirol_daily.parquet", "data/raw/open/holidays_hist/*.json",
                      "out/gui/m1_origin_month.parquet"], "out/gui/m3_daily_share.parquet"),
    ("market_split", ("models/market_split.py",), ["data/processed/features_daily.parquet", "data/raw/partner/*.csv"],
     "data/processed/daily_market_split.parquet"),
    ("m4_leadtime", ("models/m4_leadtime.py",), ["data/raw/partner/booking_lead_time*.csv",
                                                 "data/processed/daily_market_split.parquet"], "out/gui/m4_leadtime.parquet"),
    ("gui_outputs", ("models/gui_outputs.py",), ["out/gui/m1_origin_month.parquet", "out/gui/m4_leadtime.parquet",
                                                 "data/raw/other/guestcard_usage_sportwelt/*.csv"], "out/gui/m5_age.parquet"),
    ("gui_api", ("models/gui_api.py",), ["out/gui/m1_*.parquet", "out/gui/m2_los.parquet", "out/gui/m3_daily_share.parquet",
                                         "out/gui/m4_*.parquet", "out/gui/m5_age.parquet", "data/processed/tirol_daily.parquet"],
     "out/gui/complete_origin_month.parquet"),
]


def fetch(mode: str, has_key: bool):
    # fast sources: snow (SNOWGRID), weather forecast (Open-Meteo), official forecast for Paznaun
    run("data/fetch_drivers.py", "--skip-repo", "--skip-holidays", required=False)
    run("data/fetch_open_data.py", "TR53", required=False)
    pts = ROOT / "data" / "raw" / "open" / "snow" / "snowgrid_tirol_points.csv"
    if pts.exists() and time.time() - pts.stat().st_mtime > 20 * 3600:
        pts.unlink()  # observed snow at the Tirol points: refetched at most once a day
    if mode != "full":
        return
    run("data/fetch_open_data.py", required=False)
    run("data/fetch_drivers.py", "--skip-snow", required=False)       # repo data and current holidays
    run("data/fetch_holidays_history.py", required=False)
    run("data/fetch_tirol_stats.py", required=False)
    if has_key:
        run("data/fetch_partner.py", required=False)
        run_py(GUESTCARDS, "guest cards (TTF Data Space)", required=False)
    else:
        log("no TTF_SPACE_API_KEY: TVB and guest-card data stay as cached")


def prepare(mode: str):
    run("data/build_features.py")
    if mode == "full" or not (ROOT / "data" / "processed" / "origin_panel.parquet").exists():
        run("data/market_mix.py")              # downloads the Statistik Austria table
        run("data/build_origin_panel.py")
    if mode == "full" or not (ROOT / "data" / "processed" / "tirol_daily.parquet").exists():
        run("data/build_tirol_daily.py")


def models(state: dict) -> list[str]:
    ran = []
    for name, how, inputs, output in MODELS:
        h = digest(inputs)
        if state.get(name) == h and (ROOT / output).exists():
            continue
        if isinstance(how, tuple):
            run(*how)
        else:
            run_py(how, name)
        state[name] = h
        ran.append(name)
    run("models/forecast_winter.py")   # daily inputs (snow, weather, bookings) change every run
    run("models/export_gui.py")        # GUI tables + push and pull reasons
    run("models/export_challenge.py")  # forecast, deviations, warnings, actions, manifest
    return ran


def validate(stage: Path, previous: Path | None):
    import pandas as pd
    need = {"gui": ["monthly_origin", "daily_share", "push_reasons", "pull_reasons", "lead_time_by_arrival_month",
                    "age_profile", "origins", "destinations"],
            "c04": ["forecast_daily", "warnings", "actions", "deviations_drivers"]}
    for part, names in need.items():
        for n in names:
            df = pd.read_csv(stage / part / f"{n}.csv")
            assert len(df) > 0, f"{part}/{n} is empty"
            if previous and (previous / part / f"{n}.csv").exists():
                old = pd.read_csv(previous / part / f"{n}.csv", nrows=0).columns
                assert set(old) <= set(df.columns), f"{part}/{n}: columns missing {set(old) - set(df.columns)}"
    mo = pd.read_csv(stage / "gui" / "monthly_origin.csv")
    assert mo[["guests", "nights", "grade"]].notna().all().all(), "monthly_origin has empty cells"
    env = dict(os.environ, DATA_DIR=str(stage / "gui"), C04_DIR=str(stage / "c04"), TODAY="2026-11-08")
    env.pop("SNAPSHOT_DIR", None)
    p = subprocess.run([PY, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(ROOT / "api" / "c04" / "tests")],
                       env=env, capture_output=True, text=True, cwd="/tmp")
    log("tests:", (p.stdout.strip().splitlines() or ["?"])[-1])
    assert p.returncode == 0, "API tests failed on the new tables:\n" + (p.stdout + p.stderr)[-2000:]


def publish(mode: str, ran: list[str]) -> str:
    snaps = WORK / "snapshots"
    cur = snaps / "current"
    previous = cur.resolve() if cur.exists() else None
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%MZ")
    stage = snaps / f".{ts}.tmp"
    shutil.rmtree(stage, ignore_errors=True)
    for part in ("gui", "c04"):
        shutil.copytree((ROOT / "results" / part).resolve(), stage / part)
    man_p = stage / "c04" / "manifest.json"
    man = json.loads(man_p.read_text()) if man_p.exists() else {}
    man.update(refresh_mode=mode, models_rerun=ran, built_snapshot=ts)  # the API adds "snapshot" = served one
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=1))
    validate(stage, previous)
    final = snaps / ts
    stage.rename(final)
    tmp = snaps / ".current.tmp"
    if tmp.is_symlink() or tmp.exists():
        tmp.unlink()
    tmp.symlink_to(ts)
    os.replace(tmp, cur)  # atomic switch
    old = sorted(p for p in snaps.iterdir() if p.is_dir() and not p.name.startswith(".") and p.name != "current")
    for p in old[:-KEEP]:
        shutil.rmtree(p, ignore_errors=True)
    return ts


def main():
    import fcntl
    mode = (sys.argv[1] if len(sys.argv) > 1 else "auto").lower()
    WORK.mkdir(parents=True, exist_ok=True)
    lock = open(WORK / ".lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("another refresh is running: skipped")
        return
    setup()
    state_p = WORK / "state.json"
    state = json.loads(state_p.read_text()) if state_p.exists() else {}
    if mode == "auto":
        mode = "full" if not state or not (WORK / "snapshots" / "current").exists() else "fast"
    has_key = bool(os.environ.get("TTF_SPACE_API_KEY"))
    log(f"refresh {mode}; key {'present' if has_key else 'missing'}; work {WORK}")
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    status_p = WORK / "snapshots" / "status.json"  # read by the API (/meta): last run, also when it failed
    status = {"mode": mode, "started": started, "running": True, "ttf_key": has_key}
    old = json.loads(status_p.read_text()) if status_p.exists() else {}
    status_p.write_text(json.dumps({**old, "current_run": status}, indent=1))
    try:
        fetch(mode, has_key)
        prepare(mode)
        ran = models(state)
        ts = publish(mode, ran)
    except Exception as e:  # keep the last good snapshot
        log("FAILED:", e)
        status.update(running=False, ok=False, finished=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                      error=str(e)[-1500:])
        status_p.write_text(json.dumps({**old, "current_run": None, "last_run": status,
                                        "last_failure": status}, indent=1))
        sys.exit(1)
    state_p.write_text(json.dumps(state, indent=1))
    status.update(running=False, ok=True, finished=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                  snapshot=ts, models_rerun=ran)
    status_p.write_text(json.dumps({**old, "current_run": None, "last_run": status, "last_success": status}, indent=1))
    log(f"published snapshot {ts}; models re-run: {ran or 'none'}")


if __name__ == "__main__":
    main()
