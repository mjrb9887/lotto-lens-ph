#!/usr/bin/env python3
"""Backfill date-scoped reports, retaining only the last twelve months."""
import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta, datetime
from zoneinfo import ZoneInfo
from archive import ROOT, fetch_day, prune_history, retention_start, today_ph, validate_date, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=retention_start().isoformat())
    parser.add_argument("--end", default=(today_ph() - timedelta(days=1)).isoformat())
    parser.add_argument("--workers", type=int, default=2, choices=range(1, 5))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    start, end = validate_date(args.start), validate_date(args.end)
    if start < retention_start() or start > end:
        parser.error("Backfill must be within the rolling 12-month window.")
    path = ROOT / "data/history.json"
    history = prune_history(json.loads(path.read_text()))
    coverage_path = ROOT / "data/coverage.json"
    coverage = json.loads(coverage_path.read_text()) if coverage_path.exists() else {"days": {}}
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    days = [d for d in days if args.force or coverage["days"].get(d.isoformat(), {}).get("status") not in {"retrieved", "reviewed", "suspended", "partial"}]

    def retrieve(day):
        try:
            found = fetch_day(day)
            return day, found, None
        except Exception as exc:
            return day, {}, str(exc)
        finally:
            time.sleep(0.25)

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        for day, found, error in executor.map(retrieve, days):
            iso = day.isoformat()
            for gid, result in found.items():
                rows = history["games"].setdefault(gid, [])
                old = next((r for r in rows if r["date"] == iso), None)
                if old and sorted(old["numbers"]) != sorted(result["numbers"]):
                    raise RuntimeError(f"Source conflict: {gid} on {iso}; refusing to overwrite")
                # Preserve official provenance when a matching draw already exists.
                if old is None:
                    rows.append(result)
            coverage["days"][iso] = {"status": "unavailable" if error else "retrieved", "games": sorted(found)}
            print(f"{iso}: {error or ', '.join(sorted(found))}", flush=True)
            # Checkpoint every date so an interrupted import can resume safely.
            stamp = datetime.now(ZoneInfo("Asia/Manila")).isoformat(timespec="seconds")
            history.update(updated_at=stamp, source="PCSO LottoMatik and date-scoped publisher reports; see row provenance")
            write_json(path, prune_history(history))
            cutoff = retention_start().isoformat()
            coverage["days"] = {d: v for d, v in coverage["days"].items() if cutoff <= d <= today_ph().isoformat()}
            coverage.update(updated_at=stamp, retention_start=cutoff,
                            note="Retrieved means a date-scoped report was parsed; it does not guarantee every scheduled game is present.")
            write_json(coverage_path, coverage)
    # Prune even when every requested date was already retrieved (no loop iterations).
    stamp = datetime.now(ZoneInfo("Asia/Manila")).isoformat(timespec="seconds")
    history["updated_at"] = stamp
    cutoff = retention_start().isoformat()
    coverage["days"] = {d: v for d, v in coverage["days"].items() if cutoff <= d <= today_ph().isoformat()}
    coverage.update(updated_at=stamp, retention_start=cutoff)
    write_json(path, prune_history(history))
    write_json(coverage_path, coverage)
    print("Stored draws:", {g: len(rows) for g, rows in history["games"].items()})


if __name__ == "__main__":
    main()
