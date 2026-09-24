import unittest
from unittest.mock import MagicMock, patch

from backend.app.config import Settings
from backend.app.review_trigger import trigger_review_worker


class ReviewTriggerTests(unittest.TestCase):
    def test_invokes_cloud_run_job_with_metadata_token(self):
        settings = Settings(
            _env_file=None,
            review_worker_job="projects/lenslayer/locations/europe-west1/jobs/lenslayer-review-worker",
        )
        client = MagicMock()
        client.get.return_value.json.return_value = {"access_token": "test-token"}
        with patch("backend.app.review_trigger.httpx.Client") as factory:
            factory.return_value.__enter__.return_value = client
            trigger_review_worker(settings)

        client.get.assert_called_once()
        client.post.assert_called_once_with(
            "https://run.googleapis.com/v2/projects/lenslayer/locations/europe-west1/jobs/lenslayer-review-worker:run",
            headers={"Authorization": "Bearer test-token"},
            json={},
        )

    def test_failed_trigger_does_not_fail_the_upload(self):
        settings = Settings(_env_file=None, review_worker_job="projects/p/locations/r/jobs/j")
        with patch("backend.app.review_trigger.httpx.Client", side_effect=OSError("unavailable")):
            with self.assertLogs("backend.app.review_trigger", level="ERROR"):
                trigger_review_worker(settings)


if __name__ == "__main__":
    unittest.main()
