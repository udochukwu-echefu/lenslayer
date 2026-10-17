#!/usr/bin/env python3
"""Render a pinned production rollout; never execute or read secret values.

Run from the reviewed source checkout. Build only an archive of that exact
commit, then re-render with the registry digest and resolved private origin.
Optional providers require an explicit source/snapshot-bound reviewed profile.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shlex
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.production_provider_profile import provider_settings
MANIFEST = ROOT / "deploy/gcp/production-release.json"
SECRET_ENV = {
    "neon-pooled-url": "LENSLAYER_PLATFORM_DATABASE_URL",
    "r2-access-key-id": "LENSLAYER_PLATFORM_S3_ACCESS_KEY_ID",
    "r2-secret-access-key": "LENSLAYER_PLATFORM_S3_SECRET_ACCESS_KEY",
    "cloudmersive-api-key": "LENSLAYER_PLATFORM_CLOUDMERSIVE_API_KEY",
    "resend-api-key": "LENSLAYER_PLATFORM_RESEND_API_KEY",
    "groq-api-key": "GROQ_API_KEY",
}
FIELDS = {"schema_version", "project_id", "region", "dashboard_origin",
          "oidc_issuer", "oidc_audience", "r2_endpoint", "secret_versions"}


def clean_https(value: object, *, origin=False) -> str:
    if not isinstance(value, str):
        raise ValueError("An HTTPS coordinate is required")
    u = urlsplit(value)
    if (u.scheme != "https" or not u.hostname or u.username or u.password
            or u.query or u.fragment or any(c.isspace() for c in value)
            or (origin and u.path not in {"", "/"})):
        raise ValueError("HTTPS coordinates cannot contain credentials or queries")
    return value.rstrip("/") if origin else value


def validate_manifest(config: object) -> dict:
    if not isinstance(config, dict) or set(config) != FIELDS or config["schema_version"] != 1:
        raise ValueError("Unexpected production release manifest")
    if config["project_id"] != "lenslayer" or config["region"] != "europe-west1":
        raise ValueError("Use the reviewed LensLayer production project and region")
    result = dict(config)
    for k in ("dashboard_origin", "r2_endpoint"):
        result[k] = clean_https(config[k], origin=True)
    for k in ("oidc_issuer", "oidc_audience"):
        result[k] = clean_https(config[k])
    if (result["dashboard_origin"] != "https://app.lenslayer.online"
            or result["oidc_issuer"] != "https://deveze.uk.auth0.com/"
            or result["oidc_audience"] != "https://api.lenslayer.local"
            or result["r2_endpoint"] != "https://9d03f4c51b061a0160b4e10c9765527b.r2.cloudflarestorage.com"):
        raise ValueError("Production authority and storage coordinates must match the reviewed resources")
    versions = config["secret_versions"]
    if (not isinstance(versions, dict) or set(versions) != set(SECRET_ENV) | {"neon-direct-url"}
            or any(not isinstance(v, str) or not re.fullmatch(r"[1-9][0-9]*", v) for v in versions.values())):
        raise ValueError("Pin exactly the seven numeric production secret versions")
    return result


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def render_plan(config, output: Path, commit: str, digest=None, worker_origin=None,
                previous_revision=None, provider_profile=None, provider_snapshot=None):
    config = validate_manifest(config)
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Pin the exact reviewed source commit")
    if digest is not None and not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("Use the built image digest, never a mutable tag")
    if worker_origin is not None:
        worker_origin = clean_https(worker_origin, origin=True)
        worker_url = urlsplit(worker_origin)
        if (worker_url.netloc != worker_url.hostname
                or not re.fullmatch(r"lenslayer-agent-worker-[a-z0-9]+-[a-z0-9]+\.a\.run\.app", worker_url.hostname)):
            raise ValueError("Use the canonical production private-worker origin")
    if previous_revision and not re.fullmatch(r"lenslayer-api-[0-9]{5}-[a-z0-9]+", previous_revision):
        raise ValueError("Previous traffic must name an actual production API revision")
    provider_env, provider_secrets = provider_settings(provider_profile, provider_snapshot, commit)
    output.mkdir(parents=True, exist_ok=True)
    project, region = config["project_id"], config["region"]
    runtime = f"lenslayer-runtime@{project}.iam.gserviceaccount.com"
    invoker = f"lenslayer-agent-wake@{project}.iam.gserviceaccount.com"
    queue = "lenslayer-agent-work"
    registry = f"{region}-docker.pkg.dev/{project}/lenslayer/platform"
    image = registry + "@" + (digest or "IMAGE_DIGEST_REQUIRED")
    origin = worker_origin or "WORKER_ORIGIN_REQUIRED"
    base = [f"--project={project}", f"--region={region}"]
    secrets = ",".join(f"{env}=lenslayer-{suffix}:{config['secret_versions'][suffix]}"
                       for suffix, env in sorted(SECRET_ENV.items()))
    provider_bindings = ",".join(f"{key}={value}" for key, value in sorted(provider_secrets.items()))
    runtime_secrets = secrets + ("," + provider_bindings if provider_bindings else "")
    values = {
        "LENSLAYER_PLATFORM_ENVIRONMENT": "production",
        "LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA": "false",
        "LENSLAYER_PLATFORM_AUTH_MODE": "oidc",
        "LENSLAYER_PLATFORM_OIDC_ISSUER": config["oidc_issuer"],
        "LENSLAYER_PLATFORM_OIDC_AUDIENCE": config["oidc_audience"],
        "LENSLAYER_PLATFORM_OIDC_JWKS_URL": config["oidc_issuer"] + ".well-known/jwks.json",
        "LENSLAYER_PLATFORM_OIDC_EMAIL_CLAIM": "https://lenslayer.app/email",
        "LENSLAYER_PLATFORM_OIDC_NAME_CLAIM": "https://lenslayer.app/name",
        "LENSLAYER_PLATFORM_OIDC_EMAIL_VERIFIED_CLAIM": "https://lenslayer.app/email_verified",
        "LENSLAYER_PLATFORM_OIDC_REQUIRE_VERIFIED_EMAIL": "true",
        "LENSLAYER_PLATFORM_CORS_ORIGINS": config["dashboard_origin"],
        "LENSLAYER_PLATFORM_DASHBOARD_URL": config["dashboard_origin"],
        "LENSLAYER_PLATFORM_OBJECT_STORAGE_BACKEND": "s3",
        "LENSLAYER_PLATFORM_S3_BUCKET": "lenslayer-documents",
        "LENSLAYER_PLATFORM_S3_ENDPOINT_URL": config["r2_endpoint"],
        "LENSLAYER_PLATFORM_S3_REGION": "auto",
        "LENSLAYER_PLATFORM_MALWARE_SCAN_BACKEND": "cloudmersive",
        "LENSLAYER_PLATFORM_EMAIL_BACKEND": "resend",
        "LENSLAYER_PLATFORM_RESEND_FROM_EMAIL": "LensLayer <onboarding@resend.dev>",
        "LENSLAYER_PLATFORM_AGENT_WORKER_MODE": "on_demand",
        "LENSLAYER_PLATFORM_AGENT_WORKER_URL": origin,
        "LENSLAYER_PLATFORM_AGENT_WORKER_QUEUE": f"projects/{project}/locations/{region}/queues/{queue}",
        "LENSLAYER_PLATFORM_AGENT_WORKER_INVOKER_EMAIL": invoker,
        "LENSLAYER_PLATFORM_AGENT_WORKER_DRAIN_SECONDS": "120",
        "LENSLAYER_PLATFORM_WORKER_HEALTH_MAX_AGE_SECONDS": "300",
        "LENSLAYER_PLATFORM_HOSTED_AGENTS_ENABLED": "true",
        "LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED": "false",
        "LENSLAYER_PLATFORM_HOSTED_MODEL_LIFETIME_CALL_LIMIT": "0",
        "LENSLAYER_PLATFORM_GOOGLE_CALENDAR_ENABLED": "false",
        "LENSLAYER_PLATFORM_HOSTED_AGENT_LEASE_SECONDS": "180",
        "LENSLAYER_PLATFORM_AGENT_ACTION_LEASE_SECONDS": "180",
        "GROQ_MODEL": "openai/gpt-oss-120b",
        "GROQ_MAX_TOKENS": "8192",
    }
    review_values = dict(values)
    # Document analysis gets core bindings only, never optional product credentials.
    from scripts.production_provider_profile import DEFAULTS, PREFIX
    review_values.update({PREFIX + k: v for k, v in DEFAULTS.items()})
    write_json(output / "review-env.json", review_values)
    values.update(provider_env)
    write_json(output / "runtime-env.json", values)
    write_json(output / "api-env.json", {**values, "LENSLAYER_PLATFORM_REVIEW_WORKER_JOB":
                                        f"projects/{project}/locations/{region}/jobs/lenslayer-review-worker"})
    write_json(output / "bootstrap-env.json", {**review_values, "LENSLAYER_PLATFORM_AGENT_WORKER_MODE": "continuous",
                                               "LENSLAYER_PLATFORM_HOSTED_AGENTS_ENABLED": "false"})
    if provider_profile is not None:
        write_json(output / "provider-profile.json", provider_profile)
    if provider_snapshot is not None:
        write_json(output / "provider-snapshot.json", provider_snapshot)
    commands = []

    def add(name, phase, args, **gates):
        if phase == "activate":
            gates["requires_authorized_activation"] = True
        commands.append({"id": name, "phase": phase, "argv": ["gcloud", *args], **gates})

    add("build-reviewed-archive", "build", ["builds", "submit", f"--project={project}",
        "--config=deploy/gcp/cloudbuild.release.yaml", f"--substitutions=_SOURCE_COMMIT={commit}"],
        requires_exact_source_archive=True)
    add("resolve-built-digest", "build", ["artifacts", "docker", "images", "describe",
        registry + ":release-" + commit, f"--project={project}", "--format=value(image_summary.digest)"])
    add("create-distinct-invoker", "provision", ["iam", "service-accounts", "create", "lenslayer-agent-wake",
        f"--project={project}"], skip_if_exists=True)
    add("create-bounded-queue", "provision", ["tasks", "queues", "create", queue, f"--project={project}",
        f"--location={region}", "--max-concurrent-dispatches=1", "--max-dispatches-per-second=1",
        "--max-attempts=8", "--min-backoff=10s", "--max-backoff=300s", "--max-retry-duration=86400s"], skip_if_exists=True)
    add("park-queue-before-rollout", "provision", ["tasks", "queues", "pause", queue,
        f"--project={project}", f"--location={region}"])
    add("update-existing-bounded-queue", "provision", ["tasks", "queues", "update", queue, f"--project={project}",
        f"--location={region}", "--max-concurrent-dispatches=1", "--max-dispatches-per-second=1",
        "--max-attempts=8", "--min-backoff=10s", "--max-backoff=300s", "--max-retry-duration=86400s"],
        requires_paused_queue=True)
    add("queue-only-enqueue", "provision", ["tasks", "queues", "add-iam-policy-binding", queue,
        f"--project={project}", f"--location={region}", f"--member=serviceAccount:{runtime}", "--role=roles/cloudtasks.enqueuer"])
    add("use-only-worker-identity", "provision", ["iam", "service-accounts", "add-iam-policy-binding", invoker,
        f"--project={project}", f"--member=serviceAccount:{runtime}", "--role=roles/iam.serviceAccountUser"])
    worker_args = ["run", "deploy", "lenslayer-agent-worker", *base, f"--service-account={runtime}",
        f"--image={image}", "--no-allow-unauthenticated", "--min-instances=0", "--max-instances=1", "--min=0", "--max=1",
        "--invoker-iam-check", "--scaling=auto",
        "--cpu-throttling", "--cpu=1", "--memory=1Gi", "--concurrency=1", "--timeout=300", "--command=python",
        "--args=-m,uvicorn,backend.app.agent_worker_service:app,--host,0.0.0.0,--port,8080,--no-access-log",
        f"--set-secrets={runtime_secrets}"]
    bootstrap_args = [arg if not arg.startswith("--set-secrets=") else f"--set-secrets={secrets}" for arg in worker_args]
    add("bootstrap-private-worker", "provision", [*bootstrap_args, f"--env-vars-file={output/'bootstrap-env.json'}"],
        requires_image_digest=True, skip_if_exists=True)
    add("resolve-worker-origin", "provision", ["run", "services", "describe", "lenslayer-agent-worker", *base,
        "--format=value(status.url)"])
    add("worker-only-invocation", "provision", ["run", "services", "add-iam-policy-binding", "lenslayer-agent-worker",
        *base, f"--member=serviceAccount:{invoker}", "--role=roles/run.invoker"])
    add("configure-migration", "migrate", ["run", "jobs", "deploy", "lenslayer-migrate", *base,
        f"--service-account={runtime}", f"--image={image}", "--command=alembic", "--args=-c,backend/alembic.ini,upgrade,head",
        "--set-env-vars=LENSLAYER_PLATFORM_ENVIRONMENT=migration,LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA=false",
        "--set-secrets=LENSLAYER_PLATFORM_DATABASE_URL=lenslayer-neon-direct-url:" + config["secret_versions"]["neon-direct-url"],
        "--tasks=1", "--parallelism=1", "--max-retries=0", "--task-timeout=10m"], requires_image_digest=True)
    add("migrate-with-recovery-point", "migrate", ["run", "jobs", "execute", "lenslayer-migrate", *base, "--wait"],
        requires_verified_backup=True, requires_staging_acceptance=True, requires_migration_path_review=True)
    add("deploy-sleeping-worker", "deploy", [*worker_args, f"--env-vars-file={output/'runtime-env.json'}"],
        requires_worker_origin=True, requires_image_digest=True)
    add("deploy-api-without-traffic", "deploy", ["run", "deploy", "lenslayer-api", *base, f"--service-account={runtime}",
        f"--image={image}", "--allow-unauthenticated", "--min-instances=0", "--max-instances=1", "--min=0", "--max=1",
        "--cpu-throttling", "--cpu=1", "--memory=1Gi", "--concurrency=20", "--timeout=300", "--no-traffic", "--tag=agent-release",
        f"--env-vars-file={output/'api-env.json'}", f"--set-secrets={runtime_secrets}"], requires_worker_origin=True, requires_image_digest=True)
    add("deploy-bounded-review-job", "deploy", ["run", "jobs", "deploy", "lenslayer-review-worker", *base,
        f"--service-account={runtime}", f"--image={image}", "--command=python", "--args=-m,backend.app.worker,--documents-only,--drain",
        "--tasks=1", "--parallelism=1", "--max-retries=0", "--task-timeout=30m", "--cpu=1", "--memory=2Gi",
        f"--env-vars-file={output/'review-env.json'}", f"--set-secrets={secrets}"], requires_worker_origin=True, requires_image_digest=True)
    add("create-hourly-recovery", "activate", ["scheduler", "jobs", "create", "http", "lenslayer-agent-recovery",
        f"--project={project}", f"--location={region}", "--schedule=0 * * * *", "--time-zone=Africa/Lagos", "--http-method=POST",
        f"--uri={origin}/recover", f"--oidc-service-account-email={invoker}", f"--oidc-token-audience={origin}",
        "--attempt-deadline=300s"], requires_worker_origin=True, requires_private_worker_acceptance=True, skip_if_exists=True)
    add("update-existing-hourly-recovery", "activate", ["scheduler", "jobs", "update", "http", "lenslayer-agent-recovery",
        f"--project={project}", f"--location={region}", "--schedule=0 * * * *", "--time-zone=Africa/Lagos", "--http-method=POST",
        f"--uri={origin}/recover", f"--oidc-service-account-email={invoker}", f"--oidc-token-audience={origin}",
        "--attempt-deadline=300s"], requires_worker_origin=True, requires_private_worker_acceptance=True,
        requires_existing_recovery_review=True)
    add("activate-reviewed-recovery", "activate", ["scheduler", "jobs", "resume", "lenslayer-agent-recovery",
        f"--project={project}", f"--location={region}"], requires_private_worker_acceptance=True,
        requires_recovery_target_readback=True, skip_if_enabled=True)
    add("activate-queue", "activate", ["tasks", "queues", "resume", queue, f"--project={project}", f"--location={region}"],
        requires_private_worker_acceptance=True)
    add("switch-api-after-health-and-oidc", "activate", ["run", "services", "update-traffic", "lenslayer-api", *base,
        "--to-revisions=VERIFIED_RELEASE_REVISION_REQUIRED=100"], requires_exact_release_revision=True, requires_oidc_acceptance=True)
    rollback = [
        ["gcloud", "tasks", "queues", "pause", queue, f"--project={project}", f"--location={region}"],
        ["gcloud", "scheduler", "jobs", "pause", "lenslayer-agent-recovery", f"--project={project}", f"--location={region}"],
    ]
    if previous_revision:
        rollback.append(["gcloud", "run", "services", "update-traffic", "lenslayer-api", *base,
                         f"--to-revisions={previous_revision}=100"])
    plan = {"schema_version": 1, "source_commit": commit, "image": image, "worker_origin": origin,
             "secret_versions": dict(config["secret_versions"]),
             "renders_only": True,
             "requires_fresh_provider_snapshot_check": True,
             "provider_env": provider_env, "provider_secrets": provider_secrets,
             "calendar_enabled": provider_env["LENSLAYER_PLATFORM_GOOGLE_CALENDAR_ENABLED"] == "true",
             "model_enabled": provider_env["LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED"] == "true",
            "commands": commands, "emergency_park": rollback[:2],
            "rollback_before_new_feature_data_only": rollback,
            "rollback_warning": "Never downgrade the ledger or replay Calendar uncertainty. The old API supports unlinked tasks but lacks the new context/agent routes. After new-feature use, park dispatch and inspect effects before rolling traffic and dashboard back or applying a forward fix."}
    write_json(output / "plan.json", plan)
    text = ["# Reviewed production commands (rendered only)", "", f"Source: `{commit}`", f"Image: `{image}`", "",
             "Run gated steps only after the named evidence exists. Re-render unresolved coordinates. Build from an exact Git archive, never the working directory.",
             "Before ANY mutation, use scripts.production_provider_release with a reviewed provider snapshot; use its guarded command execution for deploys. A render without a snapshot is a disabled proposal, not permission to replace existing provider state.",
            "Gate labels are review requirements, not execution enforcement. Do not batch-run this document. Keep queue/recovery paused until separately authorized activation. Inspect existing recovery before create/update; skip-if-exists does not qualify its configuration.", ""]
    for command in commands:
        gates = [k for k,v in command.items() if k.startswith("requires_") and v]
        text.extend([f"## {command['phase']}: {command['id']}", "", "Gates: " + (", ".join(gates) or "none"), "", "```sh", shlex.join(command["argv"]), "```", ""])
    (output / "commands.md").write_text("\n".join(text))
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--image-digest")
    parser.add_argument("--worker-origin")
    parser.add_argument("--previous-revision")
    parser.add_argument("--provider-profile", type=Path)
    parser.add_argument("--provider-snapshot", type=Path)
    args = parser.parse_args()
    try:
        plan = render_plan(json.loads(args.manifest.read_text()), args.output.resolve(), args.source_commit,
                           args.image_digest, args.worker_origin, args.previous_revision,
                           json.loads(args.provider_profile.read_text()) if args.provider_profile else None,
                           json.loads(args.provider_snapshot.read_text()) if args.provider_snapshot else None)
    except (ValueError, OSError) as e:
        parser.exit(1, str(e) + "\n")
    print(json.dumps({"output": str(args.output.resolve()), "commands": len(plan["commands"]), "renders_only": True}))


if __name__ == "__main__":
    main()
