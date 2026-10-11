"""An unconfigured/staging wake target must block a production rollout early."""
import subprocess
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.check_on_demand_deployment import check_cloud_worker, validate_production_worker


class ProductionWorkerGuardTests(unittest.TestCase):
    def test_actual_production_coordinates_pass_and_defaults_or_staging_do_not(self):
        values = dict(project="lenslayer", region="europe-west1", service="lenslayer-agent-worker",
            queue="lenslayer-agent-work", origin="https://lenslayer-agent-worker-example.a.run.app", invoker="lenslayer-agent-wake")
        validate_production_worker(**values)
        for change in ({"origin": "REVIEW_REQUIRED"}, {"origin": "https://lenslayer-agent-worker-staging-example.a.run.app"},
                       {"queue": "lenslayer-agent-work-staging"}, {"service": "lenslayer-review-worker"},
                       {"origin": "https://lenslayer-agent-worker-example.a.run.app/drain"},
                       {"invoker": "lenslayer-runtime"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_production_worker(**{**values, **change})

    def test_default_pipeline_target_exits_before_any_build_or_migration(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run([sys.executable, "-m", "scripts.check_on_demand_deployment",
            "--project=lenslayer", "--region=europe-west1", "--service=lenslayer-agent-worker",
            "--queue=lenslayer-agent-work", "--origin=REVIEW_REQUIRED", "--invoker=lenslayer-agent-wake"],
            cwd=root, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertIn("before build/migration", result.stderr)

    def test_cloud_preflight_requires_recovery_private_invocation_and_no_idle_instances(self):
        values = dict(project="lenslayer", region="europe-west1", service="lenslayer-agent-worker",
            queue="lenslayer-agent-work", origin="https://lenslayer-agent-worker-example.a.run.app", invoker="lenslayer-agent-wake")
        state = [
            {"state": "RUNNING", "rateLimits": {"maxConcurrentDispatches": 1, "maxDispatchesPerSecond": 1}},
            {"state": "ENABLED", "schedule": "0 * * * *", "httpTarget": {"uri": values['origin'] + "/recover",
                "httpMethod": "POST", "oidcToken": {"audience": values['origin'],
                "serviceAccountEmail": "lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com"}}},
            {"status": {"url": values['origin']}, "spec": {"template": {"metadata": {"annotations": {
                "autoscaling.knative.dev/minScale": "0", "run.googleapis.com/cpu-throttling": "true"}}}}},
            {"bindings": [{"role": "roles/run.invoker", "members": ["serviceAccount:lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com"]}]},
        ]
        def run_case(data):
            with patch('scripts.check_on_demand_deployment.subprocess.run', side_effect=[
                subprocess.CompletedProcess([], 0, json.dumps(item), '') for item in data]) as run:
                check_cloud_worker(**values)
                self.assertTrue(all('describe' in c.args[0] or 'get-iam-policy' in c.args[0] for c in run.call_args_list))
        run_case(state)
        for i, key, value in ((0, 'state', 'PAUSED'), (1, 'state', 'PAUSED'), (1, 'schedule', '* * * * *')):
            changed = copy.deepcopy(state); changed[i][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError): run_case(changed)
        changed = copy.deepcopy(state)
        changed[2]['spec']['template']['metadata']['annotations']['autoscaling.knative.dev/minScale'] = '1'
        with self.assertRaises(ValueError): run_case(changed)
        changed = copy.deepcopy(state); changed[3]['bindings'][0]['members'].append('allUsers')
        with self.assertRaises(ValueError): run_case(changed)


if __name__ == "__main__":
    unittest.main()
