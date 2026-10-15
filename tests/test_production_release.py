import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("production_plan", ROOT / "scripts/prepare-production.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ProductionReleaseTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(release.MANIFEST.read_text())

    def test_refuses_cross_environment_authority_and_floating_secrets(self):
        for key, value in [("dashboard_origin", "https://lenslayer-dashboard-staging.udboy361.workers.dev"),
                           ("oidc_audience", "https://api.lenslayer.staging"),
                           ("r2_endpoint", "https://attacker.invalid"),
                           ("project_id", "unreviewed-project")]:
            with self.subTest(key=key):
                config = copy.deepcopy(self.config)
                config[key] = value
                with self.assertRaises(ValueError):
                    release.validate_manifest(config)
        for value in ["latest", "0", "1,OTHER_SECRET=unreviewed:2", 1]:
            config = copy.deepcopy(self.config)
            config["secret_versions"]["r2-secret-access-key"] = value
            with self.assertRaises(ValueError):
                release.validate_manifest(config)
        config = copy.deepcopy(self.config)
        config["secret_versions"]["hosted-model-api-key"] = "1"
        with self.assertRaises(ValueError):
            release.validate_manifest(config)

    def test_no_live_activation_with_unresolved_identity_or_uncertified_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            plan = release.render_plan(self.config, Path(temp), "a" * 40)
            commands = {c["id"]: c for c in plan["commands"]}
            self.assertTrue(plan["renders_only"])
            self.assertTrue(commands["migrate-with-recovery-point"]["requires_verified_backup"])
            self.assertTrue(commands["migrate-with-recovery-point"]["requires_staging_acceptance"])
            self.assertTrue(commands["activate-queue"]["requires_private_worker_acceptance"])
            self.assertTrue(commands["switch-api-after-health-and-oidc"]["requires_exact_release_revision"])
            self.assertTrue(commands["switch-api-after-health-and-oidc"]["requires_oidc_acceptance"])
            self.assertIn("IMAGE_DIGEST_REQUIRED", plan["image"])
            self.assertIn("WORKER_ORIGIN_REQUIRED", plan["worker_origin"])
            self.assertEqual(len(plan["emergency_park"]), 2)
            self.assertFalse(plan["calendar_enabled"])
            self.assertFalse(plan["model_enabled"])

    def test_all_deployed_services_sleep_and_review_job_exits(self):
        with tempfile.TemporaryDirectory() as temp:
            plan = release.render_plan(self.config, Path(temp), "a" * 40, "sha256:" + "b" * 64,
                "https://lenslayer-agent-worker-th7nw37zha-ew.a.run.app", "lenslayer-api-00007-2jm")
            for command in plan["commands"]:
                argv = command["argv"]
                if argv[1:3] == ["run", "deploy"]:
                    self.assertIn("--min-instances=0", argv)
                    self.assertIn("--min=0", argv)
                    self.assertIn("--cpu-throttling", argv)
                    self.assertIn("--max-instances=1", argv)
                if command["id"] in {"bootstrap-private-worker", "deploy-sleeping-worker"}:
                    self.assertIn("--no-allow-unauthenticated", argv)
                    self.assertIn("--invoker-iam-check", argv)
                    self.assertIn("--scaling=auto", argv)
                    self.assertIn("--concurrency=1", argv)
                if command["id"] == "deploy-bounded-review-job":
                    self.assertIn("--args=-m,backend.app.worker,--documents-only,--drain", argv)
                    self.assertIn("--max-retries=0", argv)
            env = json.loads((Path(temp) / "runtime-env.json").read_text())
            self.assertEqual(env["LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED"], "false")
            self.assertFalse(any("SECRET" in k or "API_KEY" in k for k in env))
            self.assertNotIn("alembic", str(plan["emergency_park"]))

    def test_rejects_arbitrary_worker_hosts_credentials_and_mutable_images(self):
        for origin in ["https://lenslayer-agent-worker-staging-th7nw37zha-ew.a.run.app",
                       "https://lenslayer-agent-worker-fake.run.app.attacker.invalid",
                       "https://secret@lenslayer-agent-worker-th7nw37zha-ew.a.run.app",
                       "https://lenslayer-agent-worker-th7nw37zha-ew.a.run.app/?key=secret"]:
            with self.subTest(origin=origin), tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError):
                    release.render_plan(self.config, Path(temp), "a" * 40, worker_origin=origin)
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                release.render_plan(self.config, Path(temp), "a" * 40, digest="latest")


if __name__ == "__main__":
    unittest.main()
