"""The staging review must not target production or read credential files."""
from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/prepare-staging.py"
spec = importlib.util.spec_from_file_location("staging_plan", SCRIPT)
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)


class StagingReviewTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(staging.MANIFEST.read_text())

    def test_production_resources_and_secret_values_are_rejected(self):
        for key, value in (("api_service", "lenslayer-api"), ("r2_bucket", "lenslayer-documents"),
                           ("runtime_service_account", "lenslayer-runtime"), ("model_enabled", True),
                           ("oidc_audience", "https://api.lenslayer.local")):
            with self.subTest(key=key):
                invalid = copy.deepcopy(self.config)
                invalid[key] = value
                with self.assertRaises(ValueError):
                    staging.validate_manifest(invalid)
        for value in ("latest", "password", "1,OTHER=secret"):
            invalid = copy.deepcopy(self.config)
            invalid["secret_versions"]["neon-pooled-url"] = value
            with self.assertRaises(ValueError):
                staging.validate_manifest(invalid)

    def test_url_and_manifest_injection_are_rejected(self):
        for url in ("http://localhost:3000", "https://user:password@example.com", "https://example.com/?code=secret",
                    "https://example.com/#secret", "https://example.com/unsafe-path"):
            with self.assertRaises(ValueError):
                staging.https_url(url, origin=True)
        invalid = copy.deepcopy(self.config)
        invalid["token"] = "never accepted"
        with self.assertRaises(ValueError):
            staging.validate_manifest(invalid)

    def test_plan_pins_digest_and_secrets_and_keeps_worker_disabled(self):
        config = staging.validate_manifest(self.config)
        with tempfile.TemporaryDirectory() as directory, patch.object(staging.subprocess, "run") as execute:
            plan = staging.render_plan(config, Path(directory), "sha256:" + "a" * 64)
            execute.assert_not_called()
            self.assertTrue(plan["prepared_only"])
            self.assertTrue(plan["image_digest_resolved"])
            commands = {item["id"]: item for item in plan["commands"]}
            worker = commands["prepare-disabled-agent-worker"]["argv"]
            self.assertIn("--instances=0", worker)
            self.assertIn("--args=-m,backend.app.worker,--agents-only", worker)
            self.assertTrue(commands["activate-agent-worker-after-review"]["separate_activation"])
            for name in ("deploy-api", "deploy-review-job", "prepare-disabled-agent-worker", "configure-migration"):
                arguments = commands[name]["argv"]
                self.assertIn("--image=europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:" + "a" * 64, arguments)
                binding = next(a for a in arguments if a.startswith("--set-secrets="))
                for item in binding.partition("=")[2].split(","):
                    secret = item.partition("=")[2]
                    self.assertTrue(secret.startswith("lenslayer-staging-"))
                    self.assertTrue(secret.endswith(":1"))
            api_env = json.loads((Path(directory) / "api-env.json").read_text())
            self.assertEqual(api_env["LENSLAYER_PLATFORM_ENVIRONMENT"], "production")
            self.assertEqual(api_env["LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA"], "false")
            self.assertEqual(api_env["LENSLAYER_PLATFORM_AUTH_MODE"], "oidc")
            self.assertNotIn("LENSLAYER_PLATFORM_DATABASE_URL", api_env)
            self.assertFalse(any("secret" in v.lower() for v in api_env.values()))

    def test_unresolved_image_and_missing_metadata_do_not_claim_readiness(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = staging.render_plan(staging.validate_manifest(self.config), Path(directory))
        self.assertFalse(plan["image_digest_resolved"])
        self.assertTrue(plan["unverified_dependencies"])
        self.assertTrue(any("BUILD_IMAGE_DIGEST_REQUIRED" in arg for item in plan["commands"] for arg in item["argv"]))

    def test_source_hash_never_reads_env_symlinks_or_dependency_trees(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app.py").write_text("print('test')\n")
            before = staging.source_fingerprint(root)
            for name in (".env", ".env.local", ".env.example"):
                (root / name).write_text("PRIVATE_TOKEN=this-is-not-read\n")
            (root / "node_modules").mkdir()
            (root / "node_modules/auth.json").write_text("private")
            (root / "linked-secret").symlink_to(root / ".env")
            self.assertEqual(before, staging.source_fingerprint(root))
            (root / "app.py").write_text("print('changed')\n")
            self.assertNotEqual(before, staging.source_fingerprint(root))

    def test_cloud_check_requests_names_only_and_reports_missing_staging(self):
        result = type("Result", (), {"returncode": 0, "stdout": "lenslayer-neon-pooled-url\nlenslayer-api\n"})()
        with patch.object(staging.subprocess, "run", return_value=result) as execute:
            inventory = staging.cloud_inventory(staging.validate_manifest(self.config))
        self.assertFalse(inventory["secret_values_read"])
        self.assertEqual(len(inventory["missing_staging_secret_names"]), 7)
        for call in execute.call_args_list:
            argv = call.args[0]
            self.assertIn("list", argv)
            self.assertNotIn("access", argv)
            self.assertNotIn("versions", argv)


if __name__ == "__main__":
    unittest.main()
