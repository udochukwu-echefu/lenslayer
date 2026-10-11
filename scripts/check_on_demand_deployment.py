"""Fail before a production build/migration if worker coordinates are unreviewed.

Validates non-secret coordinates and optionally reads cloud resource metadata.
Provision the private worker, queue, recovery schedule and narrow IAM first.
"""
import argparse
import json
import subprocess
from urllib.parse import urlsplit

from backend.app.worker_config import validate_worker_wake_target


def validate_production_worker(project, region, service, queue, origin, invoker):
    full_queue = f"projects/{project}/locations/{region}/queues/{queue}"
    email = f"{invoker}@{project}.iam.gserviceaccount.com"
    validate_worker_wake_target(origin, full_queue, email)
    if (service != "lenslayer-agent-worker" or queue != "lenslayer-agent-work" or invoker != "lenslayer-agent-wake"
            or not urlsplit(origin).hostname.startswith(service + "-") or "staging" in origin):
        raise ValueError("Use the reviewed production worker, queue and invoker")


def check_cloud_worker(project, region, service, queue, origin, invoker):
    def read(arguments):
        result = subprocess.run(["gcloud", *arguments, f"--project={project}", "--format=json"],
            capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise ValueError("Required worker infrastructure is unavailable")
        return json.loads(result.stdout)

    queue_state = read(["tasks", "queues", "describe", queue, f"--location={region}"])
    rates = queue_state.get("rateLimits", {})
    if (queue_state.get("state") != "RUNNING" or rates.get("maxConcurrentDispatches") != 1
            or rates.get("maxDispatchesPerSecond") != 1):
        raise ValueError("Queue must be active and bounded")
    recovery = read(["scheduler", "jobs", "describe", "lenslayer-agent-recovery", f"--location={region}"])
    target = recovery.get("httpTarget", {})
    token = target.get("oidcToken", {})
    if (recovery.get("state") != "ENABLED" or recovery.get("schedule") != "0 * * * *"
            or target.get("uri") != origin + "/recover" or target.get("httpMethod") != "POST"
            or token.get("audience") != origin or token.get("serviceAccountEmail") != f"{invoker}@{project}.iam.gserviceaccount.com"):
        raise ValueError("Enabled private hourly recovery is required")
    worker = read(["run", "services", "describe", service, f"--region={region}"])
    annotations = worker.get("spec", {}).get("template", {}).get("metadata", {}).get("annotations", {})
    service_annotations = worker.get("metadata", {}).get("annotations", {})
    if (worker.get("status", {}).get("url") != origin
            or annotations.get("autoscaling.knative.dev/minScale", "0") != "0"
            or service_annotations.get("run.googleapis.com/minScale", "0") != "0"
            or annotations.get("run.googleapis.com/cpu-throttling", "true") != "true"):
        raise ValueError("Request-billed zero-minimum worker is required")
    policy = read(["run", "services", "get-iam-policy", service, f"--region={region}"])
    members = {member for binding in policy.get("bindings", []) if binding.get("role") == "roles/run.invoker"
        for member in binding.get("members", [])}
    if ({"allUsers", "allAuthenticatedUsers"} & members
            or f"serviceAccount:{invoker}@{project}.iam.gserviceaccount.com" not in members):
        raise ValueError("Private invocation with the reviewed identity is required")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("project", "region", "service", "queue", "origin", "invoker"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--check-cloud", action="store_true")
    parser.add_argument("--secret-version", action="append", default=[])
    args = parser.parse_args()
    values = vars(args).copy()
    check_cloud = values.pop("check_cloud")
    versions = values.pop("secret_version")
    try:
        if check_cloud and (len(versions) != 7 or any(not v.isdecimal() or int(v) < 1 for v in versions)):
            raise ValueError("Pin all seven reviewed numeric secret versions")
        validate_production_worker(**values)
        if check_cloud:
            check_cloud_worker(**values)
    except (ValueError, subprocess.TimeoutExpired):
        parser.exit(1, "Production requires a reviewed private scale-to-zero worker, bounded queue and active hourly recovery before build/migration.\n")


if __name__ == "__main__":
    main()
