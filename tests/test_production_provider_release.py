"""Synthetic-only provider release regressions. Never invokes gcloud or providers."""
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import Mock, patch

from scripts import production_provider_profile as profiles
from scripts import production_provider_release as release

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "a" * 40
DIGEST = "sha256:" + "b" * 64
ORIGIN = "https://lenslayer-agent-worker-synthetic-ew.a.run.app"
P = profiles.PREFIX


def snapshot():
    return {"schema_version": 1, "services": {
        name: {"revision": name + "-00011-test", "env": {}, "secrets": {}} for name in profiles.SERVICES}}


def profile(state, model=True, calendar=True):
    env, secrets = dict(profiles.DEFAULTS), {}
    if model:
        env.update(profiles.MODEL)
        env.update(HOSTED_MODEL_ENABLED="true", HOSTED_MODEL_LIFETIME_CALL_LIMIT="3", HOSTED_MODEL_LIFETIME_USD_LIMIT="1.00")
        secrets.update({key: profiles.SECRET_NAMES[key] + ":7" for key in profiles.MODEL_SECRETS})
    if calendar:
        env.update(profiles.CALENDAR)
        env.update(GOOGLE_CALENDAR_ENABLED="true", GOOGLE_CALENDAR_PILOT_ENABLED="true",
                   GOOGLE_CALENDAR_PILOT_USER_IDS="00000000-0000-4000-8000-000000000001")
        secrets.update({key: profiles.SECRET_NAMES[key] + ":8" for key in profiles.CALENDAR_SECRETS})
    return {"schema_version": 1, "source_commit": COMMIT, "snapshot_sha256": profiles.snapshot_digest(state),
            "env": env, "secrets": secrets}


class ProviderReleaseTests(unittest.TestCase):
    def setUp(self):
        self.renderer = release.load_renderer()
        self.config = json.loads(self.renderer.MANIFEST.read_text())
        self.temp = tempfile.TemporaryDirectory(prefix="lenslayer-provider-test-")
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name) / "rendered"
        self.state = snapshot()
        self.profile = profile(self.state)

    def render(self, reviewed=None, state=None):
        return self.renderer.render_plan(self.config, self.output, COMMIT, DIGEST, ORIGIN,
                                         provider_profile=reviewed, provider_snapshot=state)

    def guard(self, **overrides):
        args = dict(config=self.config, output=self.output, commit=COMMIT, digest=DIGEST, origin=ORIGIN,
                    snapshot=self.state, profile=self.profile, reader=lambda name: copy.deepcopy(self.state["services"][name]),
                    execute=Mock(), check_source=Mock())
        args.update(overrides)
        return release.guarded_release(**args)

    def test_fresh_renderer_defaults_disabled_zero_and_no_provider_bindings(self):
        plan = self.render()
        for filename in ["runtime-env.json", "api-env.json", "bootstrap-env.json", "review-env.json"]:
            env = json.loads((self.output / filename).read_text())
            for key, value in profiles.DEFAULTS.items():
                self.assertEqual(env[P + key], value)
        self.assertFalse(plan["model_enabled"])
        self.assertFalse(plan["calendar_enabled"])
        self.assertEqual(plan["provider_secrets"], {})
        self.assertTrue(plan["requires_fresh_provider_snapshot_check"])

    def test_explicit_valid_bounded_model_and_owner_pilot(self):
        plan = self.render(self.profile, self.state)
        self.assertTrue(plan["model_enabled"])
        self.assertTrue(plan["calendar_enabled"])
        self.assertEqual(plan["provider_env"][P + "HOSTED_MODEL_PROVIDER"], "deepseek")
        self.assertEqual(plan["provider_env"][P + "HOSTED_MODEL_LIFETIME_USD_LIMIT"], "1.00")
        self.assertEqual(len(plan["provider_secrets"]), 6)
        for filename in ["runtime-env.json", "api-env.json"]:
            env = json.loads((self.output / filename).read_text())
            self.assertTrue(plan["provider_env"].items() <= env.items())

    def test_model_only_calendar_only_and_explicit_disabled_profiles(self):
        for model, calendar in [(True, False), (False, True), (False, False)]:
            with self.subTest(model=model, calendar=calendar):
                plan = self.render(profile(self.state, model, calendar), self.state)
                self.assertEqual(plan["model_enabled"], model)
                self.assertEqual(plan["calendar_enabled"], calendar)

    def test_document_job_and_bootstrap_never_get_product_provider_credentials(self):
        plan = self.render(self.profile, self.state)
        commands = {c["id"]: c for c in plan["commands"]}
        for command_id in ["deploy-bounded-review-job", "bootstrap-private-worker", "configure-migration"]:
            for key in profiles.SECRET_NAMES:
                self.assertNotIn(P + key + "=", " ".join(commands[command_id]["argv"]))
        for filename in ["review-env.json", "bootstrap-env.json"]:
            env = json.loads((self.output / filename).read_text())
            self.assertEqual(env[P + "HOSTED_MODEL_ENABLED"], "false")
            self.assertEqual(env[P + "GOOGLE_CALENDAR_PILOT_USER_IDS"], "")

    def test_missing_profile_refuses_active_env_or_even_unconsumed_binding_before_output(self):
        for active in [{"env": {"HOSTED_MODEL_ENABLED": "true"}},
                       {"secrets": {"HOSTED_MODEL_API_KEY": "lenslayer-hosted-model-api-key:9"}}]:
            state = snapshot()
            state["services"]["lenslayer-api"].update(active)
            with self.subTest(active=active), self.assertRaises(ValueError):
                self.render(state=state)
        self.assertFalse(self.output.exists())

    def test_exact_preservation_of_active_approved_configuration(self):
        state = snapshot()
        for service in state["services"].values():
            service.update(env=copy.deepcopy(self.profile["env"]), secrets=copy.deepcopy(self.profile["secrets"]))
        reviewed = profile(state)
        plan = self.render(reviewed, state)
        self.assertEqual(plan["provider_env"], {P + k: v for k, v in reviewed["env"].items()})
        for mutate in [lambda p: p["env"].update(HOSTED_MODEL_LIFETIME_CALL_LIMIT="2"),
                       lambda p: p["secrets"].update(HOSTED_MODEL_API_KEY="lenslayer-hosted-model-api-key:10")]:
            changed = copy.deepcopy(reviewed)
            mutate(changed)
            with self.assertRaises(ValueError):
                self.render(changed, state)

    def test_profile_requires_exact_source_snapshot_and_closed_schema(self):
        for key, value in [("source_commit", "c" * 40), ("snapshot_sha256", "d" * 64),
                           ("schema_version", True), ("extra", "unreviewed")]:
            changed = copy.deepcopy(self.profile)
            changed[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.render(changed, self.state)
        with self.assertRaises(ValueError):
            self.render(self.profile)

    def test_invalid_model_flags_provider_and_cost_call_limits_refused(self):
        cases = [("HOSTED_MODEL_ENABLED", True), ("HOSTED_MODEL_ENABLED", "TRUE"),
                 ("HOSTED_MODEL_PROVIDER", "openai"), ("HOSTED_MODEL_PROVIDER", "staging"),
                 ("HOSTED_MODEL_LIFETIME_CALL_LIMIT", "4"), ("HOSTED_MODEL_LIFETIME_CALL_LIMIT", "-1"),
                 ("HOSTED_MODEL_LIFETIME_CALL_LIMIT", "0"), ("HOSTED_MODEL_LIFETIME_CALL_LIMIT", "03"),
                 ("HOSTED_MODEL_LIFETIME_USD_LIMIT", "1.01"), ("HOSTED_MODEL_LIFETIME_USD_LIMIT", "0.00"),
                 ("HOSTED_MODEL_LIFETIME_USD_LIMIT", "0.95"), ("HOSTED_MODEL_LIFETIME_USD_LIMIT", "NaN"),
                 ("HOSTED_MODEL_LIFETIME_USD_LIMIT", "1e0"), ("HOSTED_MODEL_TIMEOUT_SECONDS", "31"),
                 ("HOSTED_MODEL_MAX_OUTPUT_TOKENS", "4096"), ("HOSTED_MODEL_AUTO_REFILL", "true")]
        for key, value in cases:
            reviewed = copy.deepcopy(self.profile)
            reviewed["env"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.render(reviewed, self.state)

    def test_private_calendar_must_be_one_uuid_pilot_and_canonical_callback(self):
        for key, value in [("GOOGLE_CALENDAR_PILOT_ENABLED", "false"),
                           ("GOOGLE_CALENDAR_PILOT_USER_IDS", ""),
                           ("GOOGLE_CALENDAR_PILOT_USER_IDS", "owner@example.invalid"),
                           ("GOOGLE_CALENDAR_PILOT_USER_IDS", "00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002"),
                           ("GOOGLE_CALENDAR_REDIRECT_URI", "https://app-staging.lenslayer.online/calendar/oauth-return")]:
            reviewed = copy.deepcopy(self.profile)
            reviewed["env"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.render(reviewed, self.state)

    def test_exact_numeric_secret_refs_no_latest_cross_project_staging_or_values(self):
        for key in profiles.SECRET_NAMES:
            for value in [profiles.SECRET_NAMES[key] + ":latest", profiles.SECRET_NAMES[key] + ":0",
                          profiles.SECRET_NAMES[key] + ":01", profiles.SECRET_NAMES[key] + ":7,OTHER=bad:1",
                          "projects/elsewhere/secrets/key:7", "lenslayer-staging-key:7", "synthetic-literal-not-a-secret"]:
                reviewed = copy.deepcopy(self.profile)
                reviewed["secrets"][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.render(reviewed, self.state)

    def test_missing_extra_or_unused_credentials_are_refused(self):
        for key in profiles.SECRET_NAMES:
            reviewed = copy.deepcopy(self.profile)
            del reviewed["secrets"][key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.render(reviewed, self.state)
        reviewed = profile(self.state, False, False)
        reviewed["secrets"]["HOSTED_MODEL_API_KEY"] = "lenslayer-hosted-model-api-key:7"
        with self.assertRaises(ValueError):
            self.render(reviewed, self.state)

    def test_unknown_current_flags_and_incomplete_staging_snapshot_refused(self):
        for mutate in [lambda s: s["services"].pop("lenslayer-api"),
                       lambda s: s["services"]["lenslayer-api"].update(revision="lenslayer-api-staging-00011-test"),
                       lambda s: s["services"]["lenslayer-api"]["env"].update(HOSTED_MODEL_AUTO_REFILL="true")]:
            state = snapshot()
            mutate(state)
            with self.assertRaises(ValueError):
                self.render(state=state)

    def test_missing_stale_or_invalid_review_never_executes(self):
        execute = Mock()
        for overrides in [dict(snapshot=None), dict(profile=None, snapshot={**self.state, "extra": True}),
                          dict(reader=lambda name: {**self.state["services"][name], "revision": name + "-00012-new"})]:
            with self.subTest(overrides=list(overrides)), self.assertRaises(ValueError):
                self.guard(command_id="deploy-sleeping-worker", execute=execute, **overrides)
        execute.assert_not_called()

    def test_guard_executes_exact_renderer_command_after_target_recheck(self):
        execute, reader = Mock(), Mock(side_effect=lambda name: copy.deepcopy(self.state["services"][name]))
        plan = self.guard(command_id="deploy-sleeping-worker", execute=execute, reader=reader)
        reader.assert_called_once_with("lenslayer-agent-worker")
        expected = next(c["argv"] for c in plan["commands"] if c["id"] == "deploy-sleeping-worker")
        execute.assert_called_once_with(expected, check=True, timeout=2400)

    def test_migration_gates_and_unresolved_images_abort_without_mutation(self):
        execute = Mock()
        for overrides in [dict(command_id="configure-migration"),
                          dict(command_id="migrate-with-recovery-point", migration_approval="old-approval"),
                          dict(command_id="deploy-sleeping-worker", digest=None),
                          dict(command_id="activate-queue")]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.guard(execute=execute, **overrides)
        execute.assert_not_called()
        plan = self.guard(command_id="configure-migration", migration_approval="backup+staging+path-reviewed:" + COMMIT, execute=execute)
        self.assertIn("--max-retries=0", execute.call_args.args[0])
        self.assertTrue(next(c for c in plan["commands"] if c["id"] == "migrate-with-recovery-point")["requires_verified_backup"])

    def test_provider_profile_cannot_override_core_pins_or_runtime_safety(self):
        for key, value in [("oidc_issuer", "https://attacker.invalid/"),
                           ("dashboard_origin", "https://app-staging.lenslayer.online"),
                           ("r2_endpoint", "https://attacker.invalid")]:
            config = copy.deepcopy(self.config)
            config[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.guard(config=config)
        plan = self.render(self.profile, self.state)
        for command in plan["commands"]:
            args = command["argv"]
            if args[1:3] == ["run", "deploy"]:
                for flag in ["--min=0", "--min-instances=0", "--max=1", "--cpu-throttling", "--image=" + plan["image"]]:
                    self.assertIn(flag, args)
            if command["id"] == "deploy-sleeping-worker":
                for flag in ["--no-allow-unauthenticated", "--invoker-iam-check", "--concurrency=1", "--scaling=auto"]:
                    self.assertIn(flag, args)
                self.assertIn("lenslayer-neon-pooled-url:4", " ".join(args))
        env = json.loads((self.output / "runtime-env.json").read_text())
        self.assertEqual(env[P + "AGENT_WORKER_DRAIN_SECONDS"], "120")

    def test_enabled_execution_requires_integrated_bounded_backend_source(self):
        env, _ = profiles.provider_settings(self.profile, self.state, COMMIT)
        with self.assertRaises(ValueError):
            release.verify_provider_source(env, "class Settings: pass")
        source = '''class Settings:
    hosted_model_lifetime_usd_limit: float = Field(default=0, ge=0, le=1.00)
    hosted_model_lifetime_call_limit: int = Field(default=0, ge=0, le=3)
    google_calendar_pilot_enabled: bool = False
    google_calendar_pilot_user_ids: str = ""
'''
        release.verify_provider_source(env, source)
        for changed in [source.replace("le=3", "le=4"), source.replace("default=0", "default=1", 1),
                        source.replace("bool = False", "bool = True")]:
            with self.assertRaises(ValueError):
                release.verify_provider_source(env, changed)

    def test_cloudbuild_uses_guarded_shared_renderer_and_no_direct_service_mutations(self):
        text = (ROOT / "deploy/gcp/cloudbuild.yaml").read_text()
        self.assertIn("--build-source-commit=$COMMIT_SHA", text)
        self.assertEqual(text.count("scripts.production_provider_release"), 6)
        self.assertNotIn("--set-env-vars", text)
        self.assertNotIn("--set-secrets", text)
        for command in release.ALLOWED_COMMANDS:
            self.assertIn("--command-id=" + command, text)
        self.assertNotIn("configure-hourly-agent-recovery", text)
        self.assertIn("--migration-approval=${_MIGRATION_APPROVAL}", text)
        self.assertEqual(text.count("--output=/workspace/output/provider-release"), 6)

    def test_model_source_guard_accepts_only_exact_bounded_decimal_constructors(self):
        env, _ = profiles.provider_settings(profile(self.state, True, False), self.state, COMMIT)
        source = '''class Settings:
    hosted_model_lifetime_usd_limit: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("1.00"), allow_inf_nan=False)
    hosted_model_lifetime_call_limit: int = Field(default=0, ge=0, le=3)
'''
        release.verify_provider_source(env, source)
        release.verify_provider_source(env, source.replace("ge=0", 'ge=Decimal("0")', 1))
        for replacement in ['Decimal("0.01")', 'Decimal("0.00")', 'Decimal(0)',
                            'Decimal(value="0")', 'Decimal("0", context=None)',
                            'decimal.Decimal("0")', 'Other("0")',
                            'Decimal(__import__("not_executed"))']:
            with self.subTest(default=replacement), self.assertRaises(ValueError):
                release.verify_provider_source(env, source.replace('default=Decimal("0")', "default=" + replacement))
        for replacement in ['Decimal("1.01")', 'Decimal("Infinity")', 'Decimal("NaN")',
                            'Decimal("1")', 'Decimal(1.00)', 'Decimal("1.00") + 1']:
            with self.subTest(cap=replacement), self.assertRaises(ValueError):
                release.verify_provider_source(env, source.replace('le=Decimal("1.00")', "le=" + replacement))
        with self.assertRaises(ValueError):
            release.verify_provider_source(env, source.replace("le=3", 'le=Decimal("3")'))

    def test_calendar_source_guard_accepts_only_literal_empty_field_default(self):
        env, _ = profiles.provider_settings(self.profile, self.state, COMMIT)
        source = '''class Settings:
    hosted_model_lifetime_usd_limit: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("1.00"), allow_inf_nan=False)
    hosted_model_lifetime_call_limit: int = Field(default=0, ge=0, le=3)
    google_calendar_pilot_enabled: bool = False
    google_calendar_pilot_user_ids: str = Field(default="", description=("Canonical local " "user UUIDs."))
'''
        release.verify_provider_source(env, source)
        release.verify_provider_source(env, source.replace(', description=("Canonical local " "user UUIDs.")', ''))
        for replacement in ['Field(default="not-empty")', 'Field(default=str())', 'Field(default="" + "")',
                            'Field(default_factory=str)', 'Other(default="")', 'schema.Field(default="")',
                            'Field("")', 'Field(default="", description=str())',
                            'Field(default="", **{})', 'Field(default="", default="")']:
            with self.subTest(field=replacement), self.assertRaises(ValueError):
                release.verify_provider_source(env, source.replace('Field(default="", description=("Canonical local " "user UUIDs."))', replacement))
        with self.assertRaises(ValueError):
            release.verify_provider_source(env, source.replace("bool = False", "bool = True"))

    def test_actual_guarded_cli_preflight_uses_only_required_nonsecret_projections(self):
        state = [
            {"state": "RUNNING", "rateLimits": {"maxConcurrentDispatches": 1, "maxDispatchesPerSecond": 1},
             "retryConfig": {"maxAttempts": 8, "minBackoff": "10s", "maxBackoff": "300s", "maxRetryDuration": "86400s"}},
            {"state": "ENABLED", "schedule": "0 * * * *", "timeZone": "Africa/Lagos", "attemptDeadline": "300s",
             "httpTarget": {"uri": ORIGIN + "/recover", "httpMethod": "POST", "oidcToken": {
                 "audience": ORIGIN, "serviceAccountEmail": "lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com"}}},
            {"status": {"url": ORIGIN}, "metadata": {"annotations": {"run.googleapis.com/maxScale": "1"}},
             "spec": {"template": {"metadata": {"annotations": {"autoscaling.knative.dev/maxScale": "1"}},
                                   "spec": {"containerConcurrency": 1}}}},
            {"bindings": [{"role": "roles/run.invoker", "members": [
                "serviceAccount:lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com"]}]},
        ]
        snapshot_path = Path(self.temp.name) / "snapshot.json"
        snapshot_path.write_text(json.dumps(self.state))
        image_path = Path(self.temp.name) / "digest.txt"
        image_path.write_text(DIGEST)
        args = ["production_provider_release", "--source-commit=" + COMMIT, "--build-source-commit=" + COMMIT,
                "--worker-origin=" + ORIGIN, "--output=" + str(self.output),
                "--provider-snapshot=" + str(snapshot_path), "--provider-profile=NONE",
                "--command-id=deploy-sleeping-worker", "--image-digest-file=" + str(image_path)]
        with patch.object(sys, "argv", args), patch.object(release, "guarded_release") as guarded, \
                patch("scripts.check_on_demand_deployment.subprocess.run", side_effect=[
                    SimpleNamespace(returncode=0, stdout=json.dumps(item)) for item in state]) as run, \
                patch("builtins.print"):
            release.main()
        self.assertEqual(run.call_count, 4)
        guarded.assert_called_once()
        queries = []
        for call in run.call_args_list:
            argv = call.args[0]
            self.assertIn("--project=lenslayer", argv)
            formats = [arg for arg in argv if arg.startswith("--format=")]
            self.assertEqual(len(formats), 1)
            self.assertTrue(formats[0].startswith("--format=json("))
            self.assertNotIn("--format=json", argv)
            for forbidden in ["containers", "env", "headers", "body", "secret", "key", "etag"]:
                self.assertNotIn(forbidden, formats[0])
            queries.append(set(formats[0][len("--format=json("):-1].split(",")))
        self.assertEqual(queries[0], {"state", "rateLimits.maxConcurrentDispatches", "rateLimits.maxDispatchesPerSecond",
                                    "retryConfig.maxAttempts", "retryConfig.minBackoff", "retryConfig.maxBackoff", "retryConfig.maxRetryDuration"})
        self.assertEqual(queries[1], {"state", "schedule", "timeZone", "attemptDeadline", "httpTarget.uri", "httpTarget.httpMethod",
                                    "httpTarget.oidcToken.audience", "httpTarget.oidcToken.serviceAccountEmail"})
        self.assertEqual(queries[2], {"status.url", "spec.template.spec.containerConcurrency",
            *('metadata.annotations."run.googleapis.com/' + key + '"' for key in ["invoker-iam-disabled", "scalingMode", "minScale", "maxScale"]),
            *('spec.template.metadata.annotations."' + key + '"' for key in ["autoscaling.knative.dev/minScale", "autoscaling.knative.dev/maxScale", "run.googleapis.com/cpu-throttling"])})
        self.assertEqual(queries[3], {"bindings[].role", "bindings[].members"})

    def test_review_inputs_and_generated_ids_cannot_be_copied_into_container(self):
        release.validate_review_path(ROOT / "output/provider-review/profile.json")
        for path in [ROOT / "profile.json", ROOT / "deploy/profile.json", ROOT / ".completion/profile.json"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                release.validate_review_path(path)
        self.assertIn("output/", (ROOT / ".dockerignore").read_text().splitlines())

    def test_metadata_drift_unready_and_split_traffic_refuse_before_value_reads(self):
        name = "lenslayer-api"
        data = {"metadata": {"name": name, "generation": 1},
                "status": {"latestReadyRevisionName": name + "-00011-test", "latestCreatedRevisionName": name + "-00011-test",
                           "observedGeneration": 1, "traffic": [{"revisionName": name + "-00011-test", "percent": 100}]},
                "spec": {"template": {"spec": {"containers": [{"env": []}]}}}}
        for mutate in [lambda d: d["status"].update(observedGeneration=0),
                       lambda d: d["status"].update(latestCreatedRevisionName=name + "-00012-new"),
                       lambda d: d["status"].update(traffic=[{"revisionName": name + "-00010-old", "percent": 100}]),
                       lambda d: d["spec"]["template"]["spec"].update(volumes=[{"name": "unsupported"}]),
                       lambda d: d["spec"]["template"]["spec"]["containers"].append({})]:
            invalid = copy.deepcopy(data)
            mutate(invalid)
            run = Mock(return_value=SimpleNamespace(returncode=0, stdout=json.dumps(invalid)))
            with self.assertRaises(ValueError):
                release.read_service(name, run)
            self.assertEqual(run.call_count, 1)
        changed = copy.deepcopy(data)
        changed["metadata"]["generation"] = 2
        run = Mock(side_effect=[SimpleNamespace(returncode=0, stdout=json.dumps(data)),
                                SimpleNamespace(returncode=0, stdout=json.dumps(changed))])
        with self.assertRaises(ValueError):
            release.read_service(name, run)

    def test_live_reader_projection_excludes_credential_values_and_detects_drift(self):
        name = "lenslayer-api"
        data = {"metadata": {"name": name, "generation": 1},
                "status": {"latestReadyRevisionName": name + "-00011-test", "latestCreatedRevisionName": name + "-00011-test",
                           "observedGeneration": 1, "traffic": [{"revisionName": name + "-00011-test", "percent": 100}]},
                "spec": {"template": {"spec": {"containers": [{"env": [
                    {"name": P + "HOSTED_MODEL_ENABLED"},
                    {"name": P + "HOSTED_MODEL_API_KEY", "valueFrom": {"secretKeyRef": {"name": "lenslayer-hosted-model-api-key", "key": "7"}}}]}]}}}}
        run = Mock(side_effect=[SimpleNamespace(returncode=0, stdout=json.dumps(data)),
                                SimpleNamespace(returncode=0, stdout="true\n"),
                                SimpleNamespace(returncode=0, stdout=json.dumps(data))])
        actual = release.read_service(name, run)
        self.assertEqual(actual["env"], {"HOSTED_MODEL_ENABLED": "true"})
        self.assertEqual(actual["secrets"], {"HOSTED_MODEL_API_KEY": "lenslayer-hosted-model-api-key:7"})
        for call in run.call_args_list:
            args = call.args[0]
            self.assertNotIn("--format=json", args)
            if "--format=value(spec.template.spec.containers.env.value)" in args:
                self.assertEqual(args[:4], ["gcloud", "run", "services", "list"])
                self.assertIn("--filter=metadata.name~^lenslayer-api$ AND spec.template.spec.containers.env.name~^" + P + "HOSTED_MODEL_ENABLED$", args)
            else:
                projection = next(arg for arg in args if arg.startswith("--format="))
                self.assertIn("spec.template.spec.containers[].env[].name", projection)
                self.assertIn("spec.template.spec.containers[].env[].valueFrom.secretKeyRef", projection)
                self.assertNotIn("spec.template.spec.containers.env.", projection)
                self.assertNotIn("env[].value,", projection)
                self.assertNotIn("env[].value)", projection)
        data["spec"]["template"]["spec"]["containers"][0]["env"][1].pop("valueFrom")
        run = Mock(return_value=SimpleNamespace(returncode=0, stdout=json.dumps(data)))
        with self.assertRaises(ValueError):
            release.read_service(name, run)


if __name__ == "__main__":
    unittest.main()
