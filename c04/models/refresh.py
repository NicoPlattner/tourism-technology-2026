"""Refresh of the Challenge 04 data product: fetch, (re)build, validate, publish a snapshot.

Nothing runs by itself: a run is started manually (deploy workflow input c04_refresh) or by a CronJob that is
switched on explicitly (Helm values c04Pipeline.schedule.fast / .full; both off by default).

    python3 c04/models/refresh.py fast    # data only: snow (GeoSphere SNOWGRID) and weather forecast (Open-Meteo)
                                      # -> pull reasons + freshness; no model fit, no new forecast
    python3 c04/models/refresh.py full    # all sources incl. TVB and guest cards (TTF Data Space); re-runs only the
                                      # models whose inputs changed, then the Paznaun forecast and actions

Layout (WORK, default /work, a persistent volume in the cluster):
  WORK/raw, WORK/processed, WORK/out      caches of the scripts (data/raw, data/processed, out), never served
  WORK/results/{gui,c04}                  working copy (seeded with the tables baked into the image)
  WORK/snapshots/<UTC timestamp>/         published, validated copies; WORK/snapshots/current -> newest good one
  WORK/snapshots/status.json              current / last run, last success, last failure (shown in /meta)
  WORK/state.json                         input hashes of each model step (change detection, full mode)
The API reads WORK/snapshots/current (read-only mount). A failed step or validation keeps the last good snapshot.
TTF_SPACE_API_KEY (environment) is needed for the TVB and guest-card data; without it those parts stay as they are.
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
    seed = ROOT / "pipeline" / "seed"  # derived outputs of the TTF-data steps (fallback)
    gui = ROOT / "out" / "gui"
    gui.mkdir(parents=True, exist_ok=True)
    for f in seed.glob("*.parquet"):
        if not (gui / f.name).exists():
            shutil.copy(f, gui / f.name)


WARNINGS: list[str] = []  # optional steps that failed (shown in /meta -> freshness.refresh)


def run(script: str, *args, required=True, timeout=1800) -> bool:
    log("run", script, *args)
    t = time.time()
    p = subprocess.run([PY, str(ROOT / script), *args], cwd=ROOT / Path(script).parent, timeout=timeout,
                       capture_output=True, text=True)
    tail = (p.stdout + p.stderr).strip().splitlines()[-6:]
    log(f"  exit {p.returncode} after {time.time() - t:.0f}s", *(("\n    " + x) for x in tail))
    if p.returncode != 0:
        msg = f"{script} {' '.join(args)}: " + " | ".join(tail)[-600:]
        if required:
            raise RuntimeError(msg)
        WARNINGS.append(msg)
    return p.returncode == 0


def run_py(code: str, label: str, required=True) -> bool:
    log("run", label)
    p = subprocess.run([PY, "-c", code], cwd=ROOT / "models", capture_output=True, text=True, timeout=1800)
    tail = (p.stdout + p.stderr).strip().splitlines()[-6:]
    log(f"  exit {p.returncode}", *(("\n    " + x) for x in tail))
    if p.returncode != 0:
        msg = f"{label}: " + " | ".join(tail)[-600:]
        if required:
            raise RuntimeError(msg)
        WARNINGS.append(msg)
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
    ("market_split", ("models/market_split.py",), ["data/processed/features_daily.parquet", "data/raw/partner/*.csv",
                                                   "out/c04_forecast.json"],
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
    # snow (SNOWGRID, Paznaun and Tirol points) and weather forecast (Open-Meteo)
    run("data/fetch_drivers.py", "--skip-repo", "--skip-holidays", required=False)
    pts = ROOT / "data" / "raw" / "open" / "snow" / "snowgrid_tirol_points.csv"
    if pts.exists() and time.time() - pts.stat().st_mtime > 20 * 3600:
        pts.unlink()  # observed snow at the Tirol points: refetched at most once a day
    if mode != "full":
        return
    run("data/fetch_open_data.py", required=False)  # official forecast (Nächtigungsprognose)
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


NEEDS = {"market_split": "partner", "m4_leadtime": "partner", "gui_outputs": "cards"}


def available() -> dict:
    raw = ROOT / "data" / "raw"
    if os.environ.get("REFRESH_SIMULATE_NO_TTF"):  # test switch: behave as if the TTF Data Space failed
        return {"partner": False, "cards": False}
    return {"partner": any((raw / "partner").glob("overnight_stays_*.csv")),
            "cards": any((raw / "other" / "guestcard_usage_sportwelt").glob("*.csv"))}


def models(state: dict) -> list[str]:
    ran, have = [], available()
    if have["partner"]:
        run("models/forecast_winter.py")  # out/c04_forecast.json: input of market_split (and M4)
    for name, how, inputs, output in MODELS:
        need = NEEDS.get(name)
        if need and not have[need]:
            WARNINGS.append(f"{name} skipped: no {'TVB' if need == 'partner' else 'guest-card'} data from the "
                            "TTF Data Space; its last outputs are kept")
            continue
        h = digest(inputs)
        if state.get(name) == h and (ROOT / output).exists():
            continue
        if isinstance(how, tuple):
            run(*how)
        else:
            run_py(how, name)
        state[name] = h
        ran.append(name)
    run("models/export_gui.py")        # GUI tables + push and pull reasons
    if have["partner"]:
        run("models/export_challenge.py")  # forecast, deviations, warnings, actions, manifest
    else:
        WARNINGS.append("Paznaun outlook not rebuilt (no TVB data): the last tables are kept")
        run_py("import export_challenge as e; e.write_manifest()", "manifest", required=False)
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
    p = subprocess.run([PY, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(ROOT / "api" / "tests")],
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
    mode = (sys.argv[1] if len(sys.argv) > 1 else "fast").lower()
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
    if mode not in ("fast", "full"):
        log(f"unknown mode {mode!r}: use fast or full")
        sys.exit(2)
    has_key = bool(os.environ.get("TTF_SPACE_API_KEY"))
    log(f"refresh {mode}; key {'present' if has_key else 'missing'}; work {WORK}")
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    status_p = WORK / "snapshots" / "status.json"  # read by the API (/meta): last run, also when it failed
    status = {"mode": mode, "started": started, "running": True, "ttf_key": has_key}
    old = json.loads(status_p.read_text()) if status_p.exists() else {}
    status_p.write_text(json.dumps({**old, "current_run": status}, indent=1))
    try:
        fetch(mode, has_key)
        if mode == "full":
            prepare(mode)
            ran = models(state)
        else:  # data only: no model fit, no new forecast
            ran = []
            run_py("from pathlib import Path; import export_reasons as e; e.update_weather(Path('../results/gui'))",
                   "pull reasons: snow and weather")
            run_py("import export_challenge as e; e.write_manifest()", "manifest", required=False)
        ts = publish(mode, ran)
    except Exception as e:  # keep the last good snapshot
        log("FAILED:", e)
        status.update(running=False, ok=False, finished=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                      error=str(e)[-1500:], warnings=WARNINGS)
        status_p.write_text(json.dumps({**old, "current_run": None, "last_run": status,
                                        "last_failure": status}, indent=1))
        sys.exit(1)
    state_p.write_text(json.dumps(state, indent=1))
    status.update(running=False, ok=True, finished=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                  snapshot=ts, models_rerun=ran, warnings=WARNINGS)
    status_p.write_text(json.dumps({**old, "current_run": None, "last_run": status, "last_success": status}, indent=1))
    log(f"published snapshot {ts}; models re-run: {ran or 'none'}")


if __name__ == "__main__":
    main()
