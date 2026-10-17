"""Guard existing-service deployments with reviewed nonsecret provider metadata.

Only explicit CLI execution invokes gcloud. Importing/rendering/testing is pure.
Consumes projected nonsecret metadata; never requests Secret Manager payloads.
"""
import argparse
import ast
from decimal import Decimal
import importlib.util
import json
from pathlib import Path
import subprocess

from scripts.production_provider_profile import (
    ENV_NAMES, PREFIX, SECRET_NAMES, SERVICES, optional_name, provider_settings,
    validate_snapshot,
)

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_COMMANDS = {"configure-migration", "migrate-with-recovery-point",
                    "deploy-sleeping-worker", "deploy-api-without-traffic", "deploy-bounded-review-job"}


def validate_review_path(path):
    """Keep reviewed IDs/references out of Dockerfile's COPY . . context.

    The existing .dockerignore excludes output/. External review directories are
    also supported. No input or source file is removed by this helper.
    """
    resolved = path.resolve()
    if resolved.is_relative_to(ROOT) and not resolved.is_relative_to(ROOT / "output"):
        raise ValueError("Review files/render output must be outside source or under Docker-excluded output/")


def read_service(name, run=subprocess.run):
    """Read names/references first; fetch values ONLY for known nonsecret flags.

    Do not replace the explicit projection with --format=json: an incorrectly
    configured literal credential must never be read into this process.
    These are gcloud output projections, not server-side API field masks.
    """
    if name not in SERVICES:
        raise ValueError("Only the reviewed production API/worker may be inspected")
    base = ["gcloud", "run", "services", "describe", name, "--project=lenslayer", "--region=europe-west1"]

    def read(extra, *, listing=False):
        command = (["gcloud", "run", "services", "list", "--project=lenslayer", "--region=europe-west1"]
                   if listing else base)
        result = run([*command, *extra], capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise ValueError("Cannot verify production service metadata; refusing rollout")
        return result.stdout

    projection = ("json(metadata.name,metadata.generation,status.observedGeneration,status.traffic,"
                  "status.latestReadyRevisionName,status.latestCreatedRevisionName,"
                  "spec.template.spec.containers[].env[].name,"
                  "spec.template.spec.containers[].env[].valueFrom.secretKeyRef,spec.template.spec.volumes)")
    data = json.loads(read(["--format=" + projection]))
    status = data.get("status", {})
    revision = status.get("latestReadyRevisionName")
    traffic = [t for t in status.get("traffic", []) if t.get("percent", 0)]
    if (data.get("metadata", {}).get("name") != name or not revision
            or revision != status.get("latestCreatedRevisionName")
            or data.get("metadata", {}).get("generation") != status.get("observedGeneration")
            or len(traffic) != 1 or traffic[0].get("percent") != 100
            or traffic[0].get("revisionName") != revision):
        raise ValueError("Service must have one settled reviewed latest revision")
    template = data.get("spec", {}).get("template", {}).get("spec", {})
    containers = template.get("containers", [])
    if len(containers) != 1 or template.get("volumes"):
        raise ValueError("Review unsupported multi-container/volume configuration separately")
    env, secrets, seen = {}, {}, set()
    for entry in containers[0].get("env", []):
        key = entry.get("name", "")
        if not optional_name(key):
            continue
        suffix = key[len(PREFIX):]
        if suffix in seen:
            raise ValueError("Duplicate provider configuration")
        seen.add(suffix)
        if suffix in SECRET_NAMES:
            ref = entry.get("valueFrom", {}).get("secretKeyRef", {})
            if set(ref) != {"name", "key"}:
                raise ValueError("Provider credential must be a numeric Secret Manager reference, never literal")
            secrets[suffix] = ref["name"] + ":" + ref["key"]
        elif suffix in ENV_NAMES:
            if entry.get("valueFrom"):
                raise ValueError("Provider flags must be reviewable nonsecret values")
            # --filter is a LIST flag, not a describe flag. Flatten before
            # filtering; output only this service's known nonsecret env row.
            value = read(["--flatten=spec.template.spec.containers[].env[]",
                          "--filter=metadata.name~^" + name + "$ AND spec.template.spec.containers.env.name~^" + key + "$",
                          "--format=value(spec.template.spec.containers.env.value)"], listing=True)
            env[suffix] = value.rstrip("\n")
        else:
            raise ValueError("Unreviewed optional provider field; refusing replacement")
    if json.loads(read(["--format=" + projection])) != data:
        raise ValueError("Service changed while reading nonsecret provider metadata")
    return {"revision": revision, "env": env, "secrets": secrets}


def check_current(snapshot, names=SERVICES, reader=read_service):
    validate_snapshot(snapshot)
    for name in names:
        if reader(name) != snapshot["services"][name]:
            raise ValueError("Stale provider snapshot; re-review current revisions and configuration")


def verify_provider_source(env, source=None):
    """Block enabled execution until the companion backend contract is integrated.

    AST inspection deliberately avoids importing Settings or reading environment.
    This structural check is not runtime/provider acceptance, which root still owns.
    """
    if not any(env[PREFIX + key] == "true" for key in ("HOSTED_MODEL_ENABLED", "GOOGLE_CALENDAR_ENABLED")):
        return
    tree = ast.parse(source if source is not None else (ROOT / "backend/app/config.py").read_text())
    fields = {node.target.id: node.value for node in ast.walk(tree)
              if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)}
    expected = {}
    if env[PREFIX + "HOSTED_MODEL_ENABLED"] == "true":
        expected.update({"hosted_model_lifetime_usd_limit": (0, 1), "hosted_model_lifetime_call_limit": (0, 3)})
    for key, bounds in expected.items():
        node = fields.get(key)
        keywords = {}
        if isinstance(node, ast.Call):
            for kw in node.keywords:
                value = kw.value
                decimal_text = {"default": "0", "ge": "0", "le": "1.00"}.get(kw.arg)
                if (key == "hosted_model_lifetime_usd_limit" and decimal_text is not None
                        and isinstance(value, ast.Call) and isinstance(value.func, ast.Name)
                        and value.func.id == "Decimal" and len(value.args) == 1 and not value.keywords
                        and isinstance(value.args[0], ast.Constant)
                        and value.args[0].value == decimal_text):
                    # Recognize only the exact bounded source constants. Never
                    # evaluate a source expression, import Settings, or call its code.
                    keywords[kw.arg] = Decimal(decimal_text)
                else:
                    keywords[kw.arg] = ast.literal_eval(value)
        if (keywords.get("default") != 0 or keywords.get("ge") != bounds[0] or keywords.get("le") != bounds[1]):
            raise ValueError("Bounded model backend source contract is not integrated")
    if env[PREFIX + "GOOGLE_CALENDAR_ENABLED"] == "true":
        enabled, ids = fields.get("google_calendar_pilot_enabled"), fields.get("google_calendar_pilot_user_ids")
        if (isinstance(ids, ast.Call) and isinstance(ids.func, ast.Name) and ids.func.id == "Field"
                and not ids.args and {kw.arg for kw in ids.keywords} <= {"default", "description"}
                and len({kw.arg for kw in ids.keywords}) == len(ids.keywords)):
            # Accept only the actual literal empty default, optionally accompanied
            # by a literal description; never execute Field or a default factory.
            keywords = {kw.arg: kw.value for kw in ids.keywords}
            description = keywords.get("description")
            if description is None or (isinstance(description, ast.Constant) and isinstance(description.value, str)):
                ids = keywords.get("default")
        if not isinstance(enabled, ast.Constant) or enabled.value is not False or not isinstance(ids, ast.Constant) or ids.value != "":
            raise ValueError("Private Calendar pilot backend source contract is not integrated")


def load_renderer():
    spec = importlib.util.spec_from_file_location("production_renderer", ROOT / "scripts/prepare-production.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def guarded_release(config, output, commit, digest, origin, snapshot, profile=None,
                    command_id=None, migration_approval=None, reader=read_service,
                    execute=subprocess.run, check_source=verify_provider_source):
    if snapshot is None:
        raise ValueError("An explicit reviewed provider snapshot is mandatory before any cloud mutation")
    renderer = load_renderer()
    # Validation precedes all cloud reads and mutations, even with no command selected.
    plan = renderer.render_plan(config, output, commit, digest, origin,
                                provider_profile=profile, provider_snapshot=snapshot)
    check_source(plan["provider_env"])
    if command_id is not None and command_id not in ALLOWED_COMMANDS:
        raise ValueError("Only bounded non-activation release commands are supported")
    if command_id in {"configure-migration", "migrate-with-recovery-point"} and migration_approval != "backup+staging+path-reviewed:" + commit:
        raise ValueError("Explicit source-bound backup/staging/migration-path approval is required")
    if command_id is not None and (digest is None or origin is None):
        raise ValueError("Resolve immutable image digest and private worker origin before mutation")
    # Recheck both services immediately before migration/initial preflight; before
    # each deployment check its original target (the worker may already be updated).
    names = SERVICES
    if command_id == "deploy-sleeping-worker":
        names = ("lenslayer-agent-worker",)
    elif command_id == "deploy-api-without-traffic":
        names = ("lenslayer-api",)
    elif command_id == "deploy-bounded-review-job":
        names = ()  # No optional credentials; only the validated core renderer output.
    check_current(snapshot, names, reader)
    if command_id is not None:
        command = next(c for c in plan["commands"] if c["id"] == command_id)
        # Do not echo command arguments, environment, IDs or snapshot to logs.
        execute(command["argv"], check=True, timeout=2400)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "deploy/gcp/production-release.json")
    parser.add_argument("--provider-snapshot", type=Path)
    parser.add_argument("--capture-snapshot", type=Path,
                        help="Read nonsecret service metadata to a local review file; no deployment")
    parser.add_argument("--provider-profile", type=Path)
    parser.add_argument("--source-commit")
    parser.add_argument("--build-source-commit")
    parser.add_argument("--worker-origin")
    parser.add_argument("--project", default="lenslayer")
    parser.add_argument("--dashboard-origin", default="https://app.lenslayer.online")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--image-digest-file", type=Path)
    parser.add_argument("--command-id", choices=sorted(ALLOWED_COMMANDS))
    parser.add_argument("--migration-approval")
    args = parser.parse_args()
    try:
        if args.capture_snapshot:
            if (args.provider_snapshot or args.provider_profile or args.command_id or args.output
                    or args.source_commit or args.build_source_commit or args.image_digest_file
                    or args.migration_approval or args.worker_origin or args.project != "lenslayer"
                    or args.dashboard_origin != "https://app.lenslayer.online"):
                raise ValueError("Snapshot capture is a separate read-only operation")
            validate_review_path(args.capture_snapshot)
            snapshot = {"schema_version": 1, "services": {name: read_service(name) for name in SERVICES}}
            validate_snapshot(snapshot)
            # Exclusive creation avoids overwriting an already reviewed input.
            with args.capture_snapshot.open("x") as handle:
                handle.write(json.dumps(snapshot, indent=2) + "\n")
            print("Nonsecret provider snapshot captured for owner review; no deployment performed.")
            return
        if not args.source_commit or not args.output or not args.worker_origin or not args.provider_snapshot:
            raise ValueError("Source, output, worker origin and reviewed snapshot are required")
        for path in (args.output, args.provider_snapshot, args.provider_profile):
            if path is not None and str(path) != "NONE":
                validate_review_path(path)
        if (args.build_source_commit != args.source_commit or args.project != "lenslayer"
                or args.dashboard_origin != "https://app.lenslayer.online"):
            raise ValueError("Cloud Build source must equal the reviewed source commit")
        profile = json.loads(args.provider_profile.read_text()) if args.provider_profile and str(args.provider_profile) != "NONE" else None
        config = json.loads(args.manifest.read_text())
        load_renderer().validate_manifest(config)
        # Preserve the existing production queue/recovery/private-worker preflight.
        from scripts.check_on_demand_deployment import validate_production_worker, check_cloud_worker
        worker = dict(project="lenslayer", region="europe-west1", service="lenslayer-agent-worker",
                      queue="lenslayer-agent-work", origin=args.worker_origin, invoker="lenslayer-agent-wake")
        validate_production_worker(**worker)
        check_cloud_worker(**worker)
        guarded_release(config, args.output, args.source_commit,
                        args.image_digest_file.read_text().strip() if args.image_digest_file else None,
                        args.worker_origin, json.loads(args.provider_snapshot.read_text()), profile,
                        args.command_id, args.migration_approval)
    except (ValueError, OSError, subprocess.SubprocessError):
        parser.exit(1, "Provider release refused: review source, pins, profile, snapshot and migration gates. No credential values are reported.\n")
    print("Reviewed provider release check completed.")


if __name__ == "__main__":
    main()
