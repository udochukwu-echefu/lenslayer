#!/usr/bin/env python3
"""Render narrow Cloud Monitoring policies; never create or send notifications.

Uses Cloud Run/Scheduler request logs and existing-request ledger observations.
Future scheduled tasks and human approval waits are not queue-depth incidents.
"""
import argparse
import json
from pathlib import Path
import re
import shlex


def policies(stage=False, channels=()):
    for channel in channels:
        if not re.fullmatch(r"projects/lenslayer/notificationChannels/[0-9]+", channel):
            raise ValueError("Use reviewed notification channels in the LensLayer project")
    suffix = "-staging" if stage else ""
    worker = "lenslayer-agent-worker" + suffix
    recovery = "lenslayer-agent-recovery" + suffix
    queue = "lenslayer-agent-work" + suffix
    labels = {"application": "lenslayer", "environment": "staging" if stage else "production"}
    runbook = ("Inspect the retained ledger and task/worker/recovery state. Pause dispatch if authority or an external outcome is uncertain. "
               "Reconciliation after Calendar dispatch is GET-only. Do not replay a POST, auto-approve, downgrade the ledger, or start an idle polling worker. "
               "Normal recovery runs hourly, so lost post-commit wakes can wait up to one hour; deadlines still apply. "
               "Runbook: https://github.com/udochukwu-echefu/lenslayer/blob/main/docs/deployment/agent-worker-operations.md")
    result = {}

    def log_policy(name, display, filter_):
        result[name] = {"displayName": "LensLayer " + display + suffix, "enabled": bool(channels),
            "userLabels": labels, "combiner": "OR", "notificationChannels": list(channels),
            "documentation": {"content": runbook, "mimeType": "text/markdown"},
            "conditions": [{"displayName": display, "conditionMatchedLog": {"filter": filter_}}],
            "alertStrategy": {"notificationRateLimit": {"period": "3600s"}, "autoClose": "86400s"}}

    scope = 'resource.labels.project_id="lenslayer" resource.labels.location="europe-west1"'
    worker_filter = f'resource.type="cloud_run_revision" {scope} resource.labels.service_name="{worker}"'
    log_policy("worker-request-failure", "agent worker request failed", worker_filter + " httpRequest.status>=500")
    log_policy("worker-ledger-attention", "agent ledger needs attention", worker_filter +
        ' jsonPayload.kind="lenslayer_agent_worker_health" (jsonPayload.state="attention" OR jsonPayload.state="unavailable")')
    log_policy("recovery-delivery-failure", "hourly agent recovery failed",
        f'resource.type="cloud_scheduler_job" {scope} resource.labels.job_id="{recovery}" severity>=ERROR')
    api = "lenslayer-api" + suffix
    log_policy("wake-enqueue-failure", "committed agent work needs wake recovery",
        f'resource.type="cloud_run_revision" {scope} '
        f'(resource.labels.service_name="{api}" OR resource.labels.service_name="{worker}") '
        'jsonPayload.kind="lenslayer_agent_wake_failure"')
    result["task-delivery-failure"] = {
        "displayName": "LensLayer agent task deliveries failed" + suffix, "enabled": bool(channels),
        "userLabels": labels, "combiner": "OR", "notificationChannels": list(channels),
        "documentation": {"content": runbook, "mimeType": "text/markdown"},
        "conditions": [{"displayName": "At least three unsuccessful deliveries in fifteen minutes",
            "conditionThreshold": {"filter": f'resource.type="cloud_tasks_queue" {scope} '
                f'resource.labels.queue_id="{queue}" metric.type="cloudtasks.googleapis.com/queue/task_attempt_count" metric.labels.response_code!="ok"',
                "comparison": "COMPARISON_GT", "thresholdValue": 2, "duration": "60s", "trigger": {"count": 1},
                "aggregations": [{"alignmentPeriod": "900s", "perSeriesAligner": "ALIGN_SUM",
                    "crossSeriesReducer": "REDUCE_SUM"}], "evaluationMissingData": "EVALUATION_MISSING_DATA_INACTIVE"}}],
        "alertStrategy": {"autoClose": "86400s"},
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging", action="store_true")
    parser.add_argument("--channel", action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = policies(args.staging, args.channel)
    except ValueError as e:
        parser.exit(1, str(e) + "\n")
    args.output.mkdir(parents=True, exist_ok=True)
    commands = []
    for name, policy in result.items():
        path = args.output.resolve() / (name + ".json")
        path.write_text(json.dumps(policy, indent=2) + "\n")
        commands.append(shlex.join(["gcloud", "monitoring", "policies", "create", "--project=lenslayer", f"--policy-from-file={path}"]))
    (args.output / "commands.md").write_text("# Monitoring commands (rendered only)\n\n"
        + ("Enabled with reviewed channel references.\n\n" if args.channel else "Disabled: select and verify a notification channel before activation.\n\n")
        + "Inspect existing policies by display name before creating, to avoid duplicates.\n\n```sh\n" + "\n".join(commands) + "\n```\n")
    print(json.dumps({"policies": len(result), "enabled": bool(args.channel), "renders_only": True}))


if __name__ == "__main__":
    main()
