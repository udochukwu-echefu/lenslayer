#!/usr/bin/env python3
"""Render a reviewable staging plan; never provision, migrate or deploy anything.

Optional cloud checks read resource names/version metadata only. No secret value,
real .env, local auth file, customer document or subscription credential is read.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "deploy/staging/manifest.json"
CORE_SECRETS = {
    "neon-pooled-url": "LENSLAYER_PLATFORM_DATABASE_URL",
    "r2-access-key-id": "LENSLAYER_PLATFORM_S3_ACCESS_KEY_ID",
    "r2-secret-access-key": "LENSLAYER_PLATFORM_S3_SECRET_ACCESS_KEY",
    "cloudmersive-api-key": "LENSLAYER_PLATFORM_CLOUDMERSIVE_API_KEY",
    "resend-api-key": "LENSLAYER_PLATFORM_RESEND_API_KEY",
    "groq-api-key": "GROQ_API_KEY",
}
CALENDAR_SECRETS = {
    "google-calendar-client-id": "LENSLAYER_PLATFORM_GOOGLE_CALENDAR_CLIENT_ID",
    "google-calendar-client-secret": "LENSLAYER_PLATFORM_GOOGLE_CALENDAR_CLIENT_SECRET",
    "connector-encryption-key": "LENSLAYER_PLATFORM_CONNECTOR_ENCRYPTION_KEY",
    "connector-state-signing-key": "LENSLAYER_PLATFORM_CONNECTOR_STATE_SIGNING_KEY",
}
EXCLUDED_DIRS = {
    ".git", ".agents", ".codex", ".aws", ".venv", "node_modules", ".next",
    ".open-next", ".wrangler", ".lenslayer", "__pycache__", ".pytest_cache",
    "dist", "coverage", "landing-backups", "output", ".hosted-ui-qa",
    "playwright-report", "test-results",
}
FIELDS = {
    "schema_version", "project_id", "region", "artifact_repository", "image_name",
    "api_service", "migration_job", "review_job", "agent_worker_pool",
    "runtime_service_account", "dashboard_worker", "dashboard_origin",
    "oidc_issuer", "oidc_audience", "oidc_jwks_url", "r2_bucket", "r2_endpoint",
    "resend_from_email", "calendar_enabled", "model_enabled", "secret_versions",
}


def https_url(value: object, *, origin: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError("URLs must be strings")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or any(c.isspace() for c in value)
            or (origin and parsed.path not in {"", "/"})):
        raise ValueError("Use an HTTPS URL without credentials, query or fragment")
    return value.rstrip("/") if origin else value


def validate_manifest(raw: object) -> dict:
    if not isinstance(raw, dict) or set(raw) != FIELDS or raw["schema_version"] != 1:
        raise ValueError("Unexpected staging manifest fields/version")
    config = dict(raw)
    for key in ("project_id", "artifact_repository", "image_name"):
        if not isinstance(config[key], str) or not re.fullmatch(r"[a-z][a-z0-9-]{2,62}", config[key]):
            raise ValueError(f"Invalid {key}")
    if config["image_name"] != "platform-staging":
        raise ValueError("Use the staging image namespace")
    if not re.fullmatch(r"[a-z]+-[a-z]+[0-9]", config["region"]):
        raise ValueError("Invalid region")
    for key in ("api_service", "migration_job", "review_job", "agent_worker_pool",
                "dashboard_worker", "r2_bucket"):
        value = config[key]
        if not isinstance(value, str) or not re.fullmatch(r"lenslayer-[a-z0-9-]+-staging", value):
            raise ValueError(f"{key} must name an isolated LensLayer staging resource")
    if len({config[k] for k in ("api_service", "migration_job", "review_job", "agent_worker_pool")}) != 4:
        raise ValueError("Staging API, migration, review and agent resources must be distinct")
    if not re.fullmatch(r"lenslayer-staging-[a-z][a-z0-9-]{0,12}", config["runtime_service_account"]):
        raise ValueError("Use a dedicated staging service account")
    for key in ("dashboard_origin", "r2_endpoint"):
        config[key] = https_url(config[key], origin=True)
    for key in ("oidc_issuer", "oidc_audience", "oidc_jwks_url"):
        config[key] = https_url(config[key])
    if "staging" not in config["oidc_audience"]:
        raise ValueError("Use an explicitly separate staging OIDC audience")
    if urlsplit(config["dashboard_origin"]).hostname.split(".")[0] != config["dashboard_worker"]:
        raise ValueError("Dashboard origin must match its staging Worker name")
    if type(config["calendar_enabled"]) is not bool or type(config["model_enabled"]) is not bool:
        raise ValueError("Calendar/model switches must be explicit booleans")
    if config["model_enabled"]:
        raise ValueError("This reviewed staging plan keeps product model calls disabled")
    sender = config["resend_from_email"]
    if not isinstance(sender, str) or "staging" not in sender.lower() or any(c in sender for c in "\r\n,"):
        raise ValueError("Use a single explicit staging email sender")
    secrets = config["secret_versions"]
    required = set(CORE_SECRETS) | {"neon-direct-url"}
    if config["calendar_enabled"]:
        required |= set(CALENDAR_SECRETS)
    if not isinstance(secrets, dict) or set(secrets) != required:
        raise ValueError("Provide only the exact required staging secret version references")
    if any(not isinstance(v, str) or not re.fullmatch(r"[1-9][0-9]*", v) for v in secrets.values()):
        raise ValueError("Pin numeric secret versions; latest and secret values are not accepted")
    return config


def source_fingerprint(root: Path = ROOT) -> str:
    digest = hashlib.sha256()
    for parent, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS and not (Path(parent) / d).is_symlink())
        for name in sorted(files):
            path = Path(parent) / name
            if (path.is_symlink() or name.startswith(".env")
                    or name.endswith((".pyc", ".log")) or name == ".DS_Store"):
                continue
            digest.update(path.relative_to(root).as_posix().encode() + b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()


def secret_ref(config: dict, suffix: str) -> str:
    return f"lenslayer-staging-{suffix}:{config['secret_versions'][suffix]}"


def environment(config: dict) -> dict[str, str]:
    return {
        # Staging uses the same fail-closed configuration checks as production.
        "LENSLAYER_PLATFORM_ENVIRONMENT": "production",
        "LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA": "false",
        "LENSLAYER_PLATFORM_AUTH_MODE": "oidc",
        "LENSLAYER_PLATFORM_OIDC_ISSUER": config["oidc_issuer"],
        "LENSLAYER_PLATFORM_OIDC_AUDIENCE": config["oidc_audience"],
        "LENSLAYER_PLATFORM_OIDC_JWKS_URL": config["oidc_jwks_url"],
        "LENSLAYER_PLATFORM_OIDC_EMAIL_CLAIM": "https://lenslayer.app/email",
        "LENSLAYER_PLATFORM_OIDC_NAME_CLAIM": "https://lenslayer.app/name",
        "LENSLAYER_PLATFORM_OIDC_EMAIL_VERIFIED_CLAIM": "https://lenslayer.app/email_verified",
        "LENSLAYER_PLATFORM_OIDC_REQUIRE_VERIFIED_EMAIL": "true",
        "LENSLAYER_PLATFORM_CORS_ORIGINS": config["dashboard_origin"],
        "LENSLAYER_PLATFORM_DASHBOARD_URL": config["dashboard_origin"],
        "LENSLAYER_PLATFORM_OBJECT_STORAGE_BACKEND": "s3",
        "LENSLAYER_PLATFORM_S3_BUCKET": config["r2_bucket"],
        "LENSLAYER_PLATFORM_S3_ENDPOINT_URL": config["r2_endpoint"],
        "LENSLAYER_PLATFORM_S3_REGION": "auto",
        "LENSLAYER_PLATFORM_MALWARE_SCAN_BACKEND": "cloudmersive",
        "LENSLAYER_PLATFORM_EMAIL_BACKEND": "resend",
        "LENSLAYER_PLATFORM_RESEND_FROM_EMAIL": config["resend_from_email"],
        "LENSLAYER_PLATFORM_WORKER_HEALTH_MAX_AGE_SECONDS": "60",
        "LENSLAYER_PLATFORM_WORKER_POLL_SECONDS": "2",
        "LENSLAYER_PLATFORM_HOSTED_AGENTS_ENABLED": "true",
        "LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED": "false",
        "LENSLAYER_PLATFORM_HOSTED_AGENT_LEASE_SECONDS": "180",
        "LENSLAYER_PLATFORM_HOSTED_AGENT_WAIT_SECONDS": "15",
        "GROQ_MODEL": "openai/gpt-oss-120b",
        "GROQ_MAX_TOKENS": "8192",
        **({"LENSLAYER_PLATFORM_GOOGLE_CALENDAR_REDIRECT_URI":
            config["dashboard_origin"] + "/calendar/oauth-return"} if config["calendar_enabled"] else {}),
    }


def render_plan(config: dict, output: Path, image_digest: str | None = None) -> dict:
    if image_digest is not None and not re.fullmatch(r"sha256:[0-9a-f]{64}", image_digest):
        raise ValueError("Supply the actual built staging image sha256 digest")
    source_id = "review-" + source_fingerprint()[:24]
    registry = f"{config['region']}-docker.pkg.dev/{config['project_id']}/{config['artifact_repository']}/{config['image_name']}"
    image = registry + "@" + (image_digest or "BUILD_IMAGE_DIGEST_REQUIRED")
    account = f"{config['runtime_service_account']}@{config['project_id']}.iam.gserviceaccount.com"
    common = [f"--project={config['project_id']}", f"--region={config['region']}", f"--service-account={account}"]
    mapping = dict(CORE_SECRETS)
    if config["calendar_enabled"]:
        mapping.update(CALENDAR_SECRETS)
    bindings = ",".join(f"{env}={secret_ref(config, suffix)}" for suffix, env in sorted(mapping.items()))
    env = environment(config)
    runtime_env = output / "runtime-env.json"
    api_env = output / "api-env.json"
    api_values = {**env, "LENSLAYER_PLATFORM_REVIEW_WORKER_JOB":
                  f"projects/{config['project_id']}/locations/{config['region']}/jobs/{config['review_job']}"}
    write_json(runtime_env, env)
    write_json(api_env, api_values)
    commands = [
        {"id": "build-image", "cwd": str(ROOT), "argv": ["gcloud", "builds", "submit",
            f"--project={config['project_id']}", "--config=deploy/gcp/cloudbuild.staging.yaml",
            "--substitutions=" + ",".join((f"_REGION={config['region']}",
                f"_ARTIFACT_REPOSITORY={config['artifact_repository']}", f"_SOURCE_ID={source_id}"))]},
        {"id": "resolve-image-digest", "cwd": str(ROOT), "argv": ["gcloud", "artifacts", "docker", "images", "describe",
            registry + ":" + source_id, f"--project={config['project_id']}", "--format=value(image_summary.digest)"]},
        {"id": "configure-migration", "cwd": str(ROOT), "argv": ["gcloud", "run", "jobs", "deploy", config["migration_job"],
            *common, f"--image={image}", "--command=alembic", "--args=-c,backend/alembic.ini,upgrade,head",
            "--set-env-vars=LENSLAYER_PLATFORM_ENVIRONMENT=migration,LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA=false",
            "--set-secrets=LENSLAYER_PLATFORM_DATABASE_URL=" + secret_ref(config, "neon-direct-url"),
            "--tasks=1", "--parallelism=1", "--max-retries=0", "--task-timeout=10m"]},
        {"id": "migrate-empty-staging-database", "cwd": str(ROOT), "argv": ["gcloud", "run", "jobs", "execute", config["migration_job"],
            f"--project={config['project_id']}", f"--region={config['region']}", "--wait"]},
        {"id": "deploy-api", "cwd": str(ROOT), "argv": ["gcloud", "run", "deploy", config["api_service"], *common,
            f"--image={image}", "--allow-unauthenticated", "--min-instances=0", "--max-instances=1",
            "--cpu=1", "--memory=1Gi", "--concurrency=20", "--timeout=300",
            f"--env-vars-file={api_env}", f"--set-secrets={bindings}", "--labels=environment=staging,application=lenslayer"]},
        {"id": "deploy-review-job", "cwd": str(ROOT), "argv": ["gcloud", "run", "jobs", "deploy", config["review_job"], *common,
            f"--image={image}", "--command=python", "--args=-m,backend.app.worker,--drain",
            "--tasks=1", "--parallelism=1", "--max-retries=1", "--task-timeout=30m", "--cpu=1", "--memory=2Gi",
            f"--env-vars-file={runtime_env}", f"--set-secrets={bindings}", "--labels=environment=staging,application=lenslayer"]},
        {"id": "prepare-disabled-agent-worker", "cwd": str(ROOT), "argv": ["gcloud", "run", "worker-pools", "deploy", config["agent_worker_pool"], *common,
            f"--image={image}", "--instances=0", "--command=python", "--args=-m,backend.app.worker,--agents-only",
            "--cpu=1", "--memory=1Gi", f"--env-vars-file={runtime_env}", f"--set-secrets={bindings}",
            "--labels=environment=staging,application=lenslayer"]},
        {"id": "allow-staging-review-invocation", "cwd": str(ROOT), "argv": ["gcloud", "run", "jobs", "add-iam-policy-binding", config["review_job"],
            f"--project={config['project_id']}", f"--region={config['region']}", f"--member=serviceAccount:{account}", "--role=roles/run.invoker"]},
        {"id": "activate-agent-worker-after-review", "cwd": str(ROOT), "separate_activation": True,
            "argv": ["gcloud", "run", "worker-pools", "update", config["agent_worker_pool"],
                f"--project={config['project_id']}", f"--region={config['region']}", "--instances=1"]},
        {"id": "pause-agent-worker", "cwd": str(ROOT), "argv": ["gcloud", "run", "worker-pools", "update", config["agent_worker_pool"],
            f"--project={config['project_id']}", f"--region={config['region']}", "--instances=0"]},
    ]
    return {"schema_version": 1, "prepared_only": True, "source_id": source_id,
            "image_digest_resolved": image_digest is not None, "project": config["project_id"],
            "required_secret_names": sorted("lenslayer-staging-" + s for s in config["secret_versions"]),
            "commands": commands, "calendar_enabled": config["calendar_enabled"], "model_enabled": False,
            "dashboard_worker": config["dashboard_worker"], "dashboard_origin": config["dashboard_origin"],
            "unverified_dependencies": ["empty staging PostgreSQL database and dedicated DB credentials",
                "private staging R2 bucket and bucket-scoped credentials", "staging runtime service account and secret/IAM grants",
                "staging OIDC API audience, dashboard client and callback allowlist", "Cloudflare staging Worker secrets",
                "provider scanning/email/analysis secret versions", "cloud budgets and worker activation approval"]}


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    path.chmod(0o600)


def cloud_inventory(config: dict) -> dict:
    # These exact read-only commands never request Secret Manager secret values.
    commands = {
        "secret_names": ["gcloud", "secrets", "list", f"--project={config['project_id']}", "--format=value(name)"],
        "service_names": ["gcloud", "run", "services", "list", f"--project={config['project_id']}",
                          f"--region={config['region']}", "--format=value(metadata.name)"],
        "job_names": ["gcloud", "run", "jobs", "list", f"--project={config['project_id']}",
                      f"--region={config['region']}", "--format=value(metadata.name)"],
    }
    results = {}
    for key, argv in commands.items():
        result = subprocess.run(argv, capture_output=True, text=True, timeout=45, check=False)
        results[key] = {"available": result.returncode == 0,
                        "names": result.stdout.splitlines() if result.returncode == 0 else []}
    present = set(results["secret_names"]["names"])
    results["missing_staging_secret_names"] = sorted("lenslayer-staging-" + s for s in config["secret_versions"]
                                                    if "lenslayer-staging-" + s not in present)
    results["secret_values_read"] = False
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--image-digest", help="Actual built staging image sha256 digest; never a mutable tag")
    parser.add_argument("--check-cloud", action="store_true", help="Read names-only cloud inventory; no changes")
    args = parser.parse_args()
    try:
        config = validate_manifest(json.loads(args.manifest.read_text()))
        output = args.output_dir.resolve()
        if output == ROOT or ROOT in output.parents:
            raise ValueError("Put the generated review bundle outside source control")
        output.mkdir(parents=True, mode=0o700, exist_ok=True)
        plan = render_plan(config, output, args.image_digest)
        if args.check_cloud:
            plan["inventory"] = cloud_inventory(config)
        write_json(output / "plan.json", plan)
        lines = ["# LensLayer staging deployment review", "", "Prepared only. No cloud mutation or secret value read.", "",
                 f"Source fingerprint: `{plan['source_id']}`. Image digest resolved: `{plan['image_digest_resolved']}`.", "",
                 "Provision the dependencies in docs/deployment/agent-staging-review.md before executing these commands.", "",
                 "The agent worker is initially disabled. Activating one instance incurs continuous compute charges.", ""]
        for command in plan["commands"]:
            lines.extend(["## " + command["id"], "", "```sh", "cd " + shlex.quote(command["cwd"]),
                          shlex.join(command["argv"]), "```", ""])
        (output / "review.md").write_text("\n".join(lines))
        (output / "review.md").chmod(0o600)
        print(json.dumps({"prepared_only": True, "plan": str(output / "plan.json"),
                          "review": str(output / "review.md"), "image_digest_resolved": plan["image_digest_resolved"],
                          "inventory_checked": args.check_cloud,
                          "missing_staging_secret_names": plan.get("inventory", {}).get("missing_staging_secret_names")}))
        return 0
    except (ValueError, OSError, subprocess.SubprocessError):
        print("Staging preparation failed. Check the manifest and writable output location; no deployment was attempted.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
