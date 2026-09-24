from __future__ import annotations

import logging

import httpx
from fastapi import BackgroundTasks

from .config import Settings


logger = logging.getLogger(__name__)
_METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/"
    "service-accounts/default/token"
)


def queue_review_worker(background_tasks: BackgroundTasks, settings: Settings) -> None:
    """Start the worker after the upload has committed and the response is ready."""
    if settings.review_worker_job:
        background_tasks.add_task(trigger_review_worker, settings)


def trigger_review_worker(settings: Settings) -> None:
    """Request one Cloud Run execution; the hourly schedule recovers failed requests."""
    job = settings.review_worker_job
    if not job:
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            token_response = client.get(
                _METADATA_TOKEN_URL,
                headers={"Metadata-Flavor": "Google"},
            )
            token_response.raise_for_status()
            token = token_response.json()["access_token"]
            response = client.post(
                f"https://run.googleapis.com/v2/{job}:run",
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
            response.raise_for_status()
    except Exception:
        logger.exception("Could not start review worker; hourly recovery will retry queued work")
