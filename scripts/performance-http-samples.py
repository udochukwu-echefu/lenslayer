"""Bounded, body-free HTTP timing samples. No cookies, bearer or provider calls.

Production is opt-in and restricted to the existing API's non-DB /health/live.
No interval loop, keepalive traffic, worker invocation or resource mutation.
First-observed is NOT proof of a cold instance. Correlate existing metrics before
labeling any sample cold/warm. curl reports client/network timing, not server spans.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import subprocess
from urllib.parse import urlsplit


def sample(url, count, allow_existing_production_health=False):
    parsed = urlsplit(url)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    production_health = url == "https://lenslayer-api-th7nw37zha-ew.a.run.app/health/live"
    if (parsed.username or parsed.password or parsed.query or parsed.fragment
            or not 1 <= count <= 5
            or (not local and not (allow_existing_production_health and production_health))):
        raise ValueError("Only bounded local samples or explicit existing production health are supported")
    output = []
    for index in range(count):
        reply = subprocess.run([
            "curl", "--silent", "--show-error", "--max-time", "30", "--connect-timeout", "10",
            "--output", "/dev/null", "--write-out", "%{json}", url,
        ], capture_output=True, text=True, timeout=35)
        # Never persist curl diagnostics: unexpected URLs/headers may be sensitive.
        if reply.returncode:
            output.append({"sample": index + 1, "error": "transport_failed", "curl_exit": reply.returncode})
            continue
        raw = json.loads(reply.stdout)
        output.append({"sample": index + 1, **{key: raw.get(key) for key in (
            "http_code", "time_namelookup", "time_connect", "time_appconnect", "time_starttransfer", "time_total", "size_download",
        )}})
    timings = [row["time_total"] * 1000 for row in output if row.get("http_code") == 200]
    return {"at": datetime.now(timezone.utc).isoformat(), "target": "existing-production-health" if production_health else "loopback",
            "method": "GET /health/live" if production_health else "GET local", "count": count,
            "conditions": "Separate curl processes; no cookies/auth; cache/instance state uncontrolled; first-observed is not cold-start proof",
            "samples": output, "median_ms": statistics.median(timings) if timings else None,
            "range_ms": [min(timings), max(timings)] if timings else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--allow-existing-production-health", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = sample(args.url, args.count, args.allow_existing_production_health)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
