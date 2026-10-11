"""Dependency-free validation shared by startup and the pre-deployment guard."""
import re
from urllib.parse import urlsplit


def validate_worker_wake_target(origin, queue_name, invoker_email):
    queue = re.fullmatch(r"projects/([a-z0-9-]+)/locations/([a-z0-9-]+)/queues/([A-Za-z0-9_-]+)", queue_name)
    url = urlsplit(origin)
    if (not queue or url.scheme != "https" or not url.hostname or not url.hostname.endswith(".run.app")
            or url.username or url.password or url.port or url.path not in {"", "/"} or url.query or url.fragment):
        raise ValueError("On-demand agents require a Cloud Tasks queue and an HTTPS Cloud Run origin")
    if not re.fullmatch(r"[A-Za-z0-9-]+@" + re.escape(queue.group(1)) + r"\.iam\.gserviceaccount\.com", invoker_email):
        raise ValueError("The worker invoker must be a service account in the queue project")
