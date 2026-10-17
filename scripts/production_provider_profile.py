"""Pure, closed-shape optional-provider release contract. No credential access."""
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from uuid import UUID

PREFIX = "LENSLAYER_PLATFORM_"
SERVICES = ("lenslayer-api", "lenslayer-agent-worker")
DEFAULTS = {
    "HOSTED_MODEL_ENABLED": "false",
    "HOSTED_MODEL_LIFETIME_CALL_LIMIT": "0",
    "HOSTED_MODEL_LIFETIME_USD_LIMIT": "0.00",
    "GOOGLE_CALENDAR_ENABLED": "false",
    "GOOGLE_CALENDAR_PILOT_ENABLED": "false",
    "GOOGLE_CALENDAR_PILOT_USER_IDS": "",
}
MODEL = {"HOSTED_MODEL_PROVIDER": "deepseek", "HOSTED_MODEL_TIMEOUT_SECONDS": "30",
         "HOSTED_MODEL_MAX_OUTPUT_TOKENS": "2048"}
CALENDAR = {"GOOGLE_CALENDAR_REDIRECT_URI": "https://app.lenslayer.online/calendar/oauth-return"}
SECRET_NAMES = {
    "HOSTED_MODEL_API_KEY": "lenslayer-hosted-model-api-key",
    "GOOGLE_CALENDAR_CLIENT_ID": "lenslayer-google-calendar-client-id",
    "GOOGLE_CALENDAR_CLIENT_SECRET": "lenslayer-google-calendar-client-secret",
    "CONNECTOR_ENCRYPTION_KEY": "lenslayer-connector-encryption-key",
    "CONNECTOR_STATE_SIGNING_KEY": "lenslayer-connector-state-signing-key",
    "CALENDAR_SESSION_BINDING_KEY": "lenslayer-calendar-session-binding-key",
}
ENV_NAMES = set(DEFAULTS) | set(MODEL) | set(CALENDAR)
MODEL_SECRETS = {"HOSTED_MODEL_API_KEY"}
CALENDAR_SECRETS = set(SECRET_NAMES) - MODEL_SECRETS


def optional_name(name):
    return name.startswith(PREFIX) and name[len(PREFIX):].startswith(
        ("HOSTED_MODEL_", "GOOGLE_CALENDAR_", "CONNECTOR_", "CALENDAR_SESSION_"))


def snapshot_digest(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_snapshot(snapshot):
    if (not isinstance(snapshot, dict) or set(snapshot) != {"schema_version", "services"}
            or type(snapshot["schema_version"]) is not int or snapshot["schema_version"] != 1
            or not isinstance(snapshot["services"], dict) or set(snapshot["services"]) != set(SERVICES)):
        raise ValueError("Review a complete production API/worker provider snapshot")
    for name, service in snapshot["services"].items():
        if (not isinstance(service, dict) or set(service) != {"revision", "env", "secrets"}
                or not isinstance(service["revision"], str)
                or not re.fullmatch(re.escape(name) + r"-[0-9]{5}-[a-z0-9]+", service["revision"])):
            raise ValueError("Snapshot must pin existing production revisions")
        validate_projection(service["env"], service["secrets"])
    return snapshot


def validate_projection(env, secrets):
    if (not isinstance(env, dict) or not isinstance(secrets, dict)
            or set(env) - ENV_NAMES or set(secrets) - set(SECRET_NAMES)
            or any(not isinstance(v, str) for v in env.values())):
        raise ValueError("Unsupported optional provider configuration")
    for key, reference in secrets.items():
        if (not isinstance(reference, str)
                or not re.fullmatch(re.escape(SECRET_NAMES[key]) + r":[1-9][0-9]*", reference)):
            raise ValueError("Optional secrets require exact production names and numeric versions")


def provider_settings(profile=None, snapshot=None, commit=None):
    """Omitted snapshot is render-only, never sufficient for a deployment."""
    if snapshot is not None:
        validate_snapshot(snapshot)
    if profile is None:
        env, secrets = dict(DEFAULTS), {}
    else:
        if (not isinstance(profile, dict)
                or set(profile) != {"schema_version", "source_commit", "snapshot_sha256", "env", "secrets"}
                or type(profile["schema_version"]) is not int or profile["schema_version"] != 1
                or snapshot is None or profile["source_commit"] != commit
                or profile["snapshot_sha256"] != snapshot_digest(snapshot)):
            raise ValueError("Provider profile must bind reviewed source and exact snapshot")
        env, secrets = profile["env"], profile["secrets"]
        validate_projection(env, secrets)
        if not set(DEFAULTS) <= set(env):
            raise ValueError("Explicit provider flags and lifetime limits are required")
        for key in ("HOSTED_MODEL_ENABLED", "GOOGLE_CALENDAR_ENABLED", "GOOGLE_CALENDAR_PILOT_ENABLED"):
            if env[key] not in {"true", "false"}:
                raise ValueError("Provider flags must be literal true/false")
        calls = env["HOSTED_MODEL_LIFETIME_CALL_LIMIT"]
        usd = env["HOSTED_MODEL_LIFETIME_USD_LIMIT"]
        if not re.fullmatch(r"[0-3]", calls) or not re.fullmatch(r"[01]\.[0-9]{2}", usd):
            raise ValueError("Use explicit bounded call and decimal USD limits")
        try:
            budget = Decimal(usd)
        except InvalidOperation:
            raise ValueError("Invalid lifetime USD limit") from None
        model = env["HOSTED_MODEL_ENABLED"] == "true"
        calendar = env["GOOGLE_CALENDAR_ENABLED"] == "true"
        expected = set(DEFAULTS)
        required_secrets = set()
        if model:
            if (budget <= 0 or budget > Decimal("1.00") or int(calls) < 1
                    or Decimal(calls) * Decimal("0.319488") > budget
                    or any(env.get(k) != v for k, v in MODEL.items())):
                raise ValueError("Only bounded DeepSeek planning within USD1 total is supported")
            expected |= set(MODEL)
            required_secrets |= MODEL_SECRETS
        elif usd != "0.00" or calls != "0":
            raise ValueError("Disabled model must have explicit zero limits")
        if calendar:
            ids = env["GOOGLE_CALENDAR_PILOT_USER_IDS"].split(",")
            try:
                valid_ids = all(str(UUID(value)) == value for value in ids)
            except ValueError:
                valid_ids = False
            if (env["GOOGLE_CALENDAR_PILOT_ENABLED"] != "true" or len(ids) != 1
                    or not valid_ids or any(env.get(k) != v for k, v in CALENDAR.items())):
                raise ValueError("Calendar requires one explicit owner-pilot UUID and canonical callback")
            expected |= set(CALENDAR)
            required_secrets |= CALENDAR_SECRETS
        elif env["GOOGLE_CALENDAR_PILOT_ENABLED"] != "false" or env["GOOGLE_CALENDAR_PILOT_USER_IDS"]:
            raise ValueError("Disabled Calendar cannot retain a live pilot")
        if set(env) != expected or set(secrets) != required_secrets:
            raise ValueError("Bind exactly the selected provider configuration; no unused credentials")
    # Existing optional configuration is never silently discarded, reduced or changed.
    # Missing legacy zero-default keys are harmless; any other existing value/ref
    # must be faithfully preserved by a reviewed profile.
    if snapshot is not None:
        for service in snapshot["services"].values():
            active = bool(service["secrets"]) or any(v != DEFAULTS.get(k) for k, v in service["env"].items())
            if active and profile is None:
                raise ValueError("Existing optional configuration requires a reviewed provider profile")
            if active and (any(env.get(k) != v for k, v in service["env"].items())
                           or any(secrets.get(k) != v for k, v in service["secrets"].items())):
                raise ValueError("Reviewed profile must preserve existing optional configuration exactly")
    return {PREFIX + k: v for k, v in env.items()}, {PREFIX + k: v for k, v in secrets.items()}
