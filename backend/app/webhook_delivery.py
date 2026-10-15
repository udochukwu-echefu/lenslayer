"""Historical HMAC wire format, bounded HTTPS, no redirects or environment proxy.

Resolve once, reject every non-public address, and pin the actual TLS connection
to a checked address while retaining the original hostname for SNI/verification.
The historical check-then-resolve-again HTTP transport is not copied here.
"""
from __future__ import annotations

import hashlib
import hmac
from http.client import HTTPSConnection
import ipaddress
import socket
import ssl
import time
from urllib.parse import urlsplit, urlunsplit

import certifi

SIGNATURE_HEADER = "X-LensLayer-Signature"
TIMEOUT_SECONDS = 10.0


class WebhookTargetError(ValueError):
    pass


def signature(secret: str, timestamp: int, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode("ascii") + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


class _PinnedHTTPSConnection(HTTPSConnection):
    def __init__(self, hostname: str, port: int, address: str):
        super().__init__(hostname, port, timeout=TIMEOUT_SECONDS,
                         context=ssl.create_default_context(cafile=certifi.where()))
        self._address = address

    def connect(self):
        raw = socket.create_connection((self._address, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def send_webhook(target_url: str, secret: str, event_type: str, delivery_id: str, body: bytes) -> int:
    parts = urlsplit(target_url)
    if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
            or parts.fragment or any(c.isspace() or ord(c) < 32 for c in target_url)):
        raise WebhookTargetError("Webhook target must be public HTTPS without credentials or fragment.")
    port = parts.port or 443
    addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, port, type=socket.SOCK_STREAM)}
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise WebhookTargetError("Webhook target must resolve only to public addresses.")
    if not secret:
        raise WebhookTargetError("Webhook signing key is unavailable.")
    timestamp = int(time.time())
    connection = _PinnedHTTPSConnection(parts.hostname, port, sorted(addresses)[0])
    try:
        connection.request("POST", urlunsplit(("", "", parts.path or "/", parts.query, "")), body=body,
            headers={"Content-Type": "application/json", "User-Agent": "LensLayer-Webhooks/1",
                     "X-LensLayer-Event": event_type, "X-LensLayer-Delivery": delivery_id,
                     SIGNATURE_HEADER: signature(secret, timestamp, body)})
        response = connection.getresponse()
        # No response body is needed, retained, logged or followed on redirects.
        if not 200 <= response.status < 300:
            raise WebhookTargetError("Webhook endpoint did not accept delivery.")
        return response.status
    finally:
        connection.close()
