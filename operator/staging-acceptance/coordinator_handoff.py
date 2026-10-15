"""Explicit terminal/coordinator wrappers. Importing this module makes no calls.

All live access is opt-in in main(): existing gcloud managed auth, pinned staging
secrets, exact-principal read-only inspection, then the actual SDK observer; or
the existing Calendar GET/natural-runtime-CAS callable. Never prints exceptions.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
import warnings

HERE = Path(__file__).resolve().parent
ORIGIN = "https://lenslayer-api-staging-th7nw37zha-ew.a.run.app"
DB_SECRET = "lenslayer-staging-neon-pooled-url"
CALENDAR_FIELDS = frozenset(("google_calendar_client_id", "google_calendar_client_secret",
    "connector_encryption_key", "connector_state_signing_key",
    "calendar_session_binding_key"))
CALENDAR_REDIRECT = "https://lenslayer-dashboard-staging.udboy361.workers.dev/calendar/oauth-return"
CALENDAR_SECRET_NAMES = {field: "lenslayer-staging-" + field.replace("_", "-") for field in CALENDAR_FIELDS}
OLD_CONNECTION = "a3208ad4-3427-4acf-9946-4ac4298b6bcb"
EVENT = "llaff707c0c9064758bda6e85905917737"
RUN = "ee06a0a5-208d-422f-a147-c1417471cca5"
ACTION = "96e786d7-74f1-4f4c-82be-c4f9b5e95377"
INPUT_HASH = "850e803ffdde52e0a48ac9d40481cc8c5faedb34f742771b956c466cf599d176"
CALENDAR_HASH = "45f237882d5ad10dd8349206d05e16d7fa54f37ceeb97b89da6ef48c2eab55d1"
UUID = re.compile(r"[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\Z")


class Incomplete(Exception):
    pass


def need(condition):
    if not condition:
        raise Incomplete()


def utc(value=None):
    return datetime.fromtimestamp(time.time() if value is None else value, timezone.utc).isoformat()


def timestamp(value):
    need(isinstance(value, str) and len(value) <= 40 and "T" in value)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    need(parsed.tzinfo is not None)
    return parsed.timestamp()


def clean_child_environment():
    # No bearer, DB URL, product config, NODE_OPTIONS or paid-provider environment
    # propagates into children. Existing gcloud managed-auth configuration remains.
    allowed = ("PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "CLOUDSDK_CONFIG", "CLOUDSDK_ACTIVE_CONFIG_NAME")
    return {**{k: os.environ[k] for k in allowed if k in os.environ}, "CLOUDSDK_CORE_DISABLE_PROMPTS": "1"}


def fetch_secret(name, *, run=subprocess.run):
    need(bool(re.fullmatch(r"lenslayer-staging-[a-z0-9-]+", name)))
    result = run(["gcloud", "--project=lenslayer", "--quiet", "--verbosity=error",
                  "secrets", "versions", "access", "1", "--secret=" + name],
                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30,
                 check=False, env=clean_child_environment())
    need(result.returncode == 0 and 0 < len(result.stdout) <= 65536)
    value = result.stdout.decode("utf-8").rstrip("\r\n")
    need(bool(value) and "\x00" not in value)
    return value


def postgres_url(value, *, sqlalchemy=False):
    raw = value.replace("postgresql+psycopg://", "postgresql://", 1)
    parts = urlsplit(raw)
    need(parts.scheme in ("postgresql", "postgres") and parts.username and parts.password and parts.path not in ("", "/"))
    need(parts.hostname and parts.hostname.endswith(".neon.tech") and "-pooler" in parts.hostname and not parts.fragment)
    query = parse_qs(parts.query, strict_parsing=True)
    need(set(query) <= {"sslmode", "channel_binding", "connect_timeout"})
    need(query.get("sslmode") in (["require"], ["verify-ca"], ["verify-full"]))
    need(all(len(entries) == 1 for entries in query.values()))
    query["connect_timeout"] = ["10"]
    return urlunsplit(("postgresql+psycopg" if sqlalchemy else "postgresql", parts.netloc,
                      parts.path, urlencode({key: entries[0] for key, entries in query.items()}), ""))


# Exact SHA-256 lookup, never a token/prefix scan. Parameter values stay in the
# process and DB protocol; no SQL/debug logging or verifier output.
SCOPE_SQL = """
SELECT json_build_object('observed_at', clock_timestamp(), 'principal', json_build_object(
 'id', a.id, 'organization_id', a.organization_id, 'delegated_by_user_id', a.delegated_by_user_id,
 'token_sha256', a.token_hash, 'allowed_tools', a.allowed_tools_json::json,
 'context_ids', a.context_ids_json::json, 'assignee_ids', a.assignee_ids_json::json,
 'contract_ids', a.contract_ids_json::json, 'calendar_targets', a.calendar_targets_json::json,
 'require_approval', a.require_approval, 'max_actions_per_run', a.max_actions_per_run,
 'created_at', a.created_at, 'expires_at', a.expires_at, 'revoked_at', a.revoked_at,
 'status', 'active', 'delegator_role', m.role,
 'run_count', (SELECT count(*) FROM agent_runs r WHERE r.agent_id = a.id)))
FROM agent_principals a LEFT JOIN organization_memberships m
 ON m.organization_id = a.organization_id AND m.user_id = a.delegated_by_user_id
WHERE a.token_hash = %s AND a.organization_id = %s AND a.created_at >= %s
 AND a.revoked_at IS NULL AND a.expires_at > clock_timestamp() + interval '30 seconds'
 AND a.expires_at <= a.created_at + interval '1 hour'
LIMIT 2
"""


def read_principal(db_url, token, org, started_at, *, connect=None):
    # Even an empty libpq service name triggers service-file lookup. Omit it and
    # reject ambient service selection instead of reading an owner's service file.
    need(not os.environ.get("PGSERVICE") and not os.environ.get("PGSERVICEFILE"))
    if connect is None:
        import psycopg
        connect = psycopg.connect
    digest = hashlib.sha256(token.encode()).hexdigest()
    connection = connect(postgres_url(db_url), autocommit=True, connect_timeout=10,
        passfile="/dev/null")
    try:
        with connection.cursor() as cursor:
            cursor.execute("BEGIN READ ONLY")
            cursor.execute("SHOW transaction_read_only")
            need(cursor.fetchone() == ("on",))
            # Neon transaction pooling rejects these libpq startup options.
            # Apply bounds inside the verified read-only transaction instead.
            cursor.execute("SET LOCAL statement_timeout = '5s'")
            cursor.execute("SET LOCAL lock_timeout = '2s'")
            cursor.execute("SET LOCAL idle_in_transaction_session_timeout = '10s'")
            cursor.execute(SCOPE_SQL, (digest, org, datetime.fromtimestamp(started_at, timezone.utc)))
            rows = cursor.fetchall()
            need(len(rows) == 1 and len(rows[0]) == 1)
            envelope = rows[0][0]
            need(isinstance(envelope, dict) and set(envelope) == {"principal", "observed_at"})
            p = envelope["principal"]
            need(isinstance(p, dict) and p.get("token_sha256") == digest and p.get("organization_id") == org)
            need(started_at <= timestamp(p["created_at"]) <= timestamp(envelope["observed_at"]))
            need(0 < timestamp(p["expires_at"]) - timestamp(p["created_at"]) <= 3600)
            envelope["token"] = token
            return envelope
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


@contextmanager
def terminal_signals():
    previous = {}
    def stop(*_):
        raise KeyboardInterrupt()
    try:
        for name in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGTSTP, signal.SIGALRM):
            previous[name] = signal.signal(name, stop)
        signal.alarm(600)
        yield
    finally:
        signal.alarm(0)
        for name, handler in previous.items():
            signal.signal(name, handler)


def hidden_token(kind="sdk"):
    need(sys.stdin.isatty())
    # getpass restores termios in finally. Never permit its echoing fallback.
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        token = getpass.getpass("Fresh credential (hidden): " if kind == "sdk" else "Independent Google read-only access token (hidden): ")
    if kind == "sdk": need(bool(re.fullmatch(r"ll_agent_[A-Za-z0-9_-]{32,128}", token)))
    else: need(bool(re.fullmatch(r"[A-Za-z0-9._~+/-]{10,4096}", token)) and not token.startswith("ll_agent_"))
    return token


class PrivateProgress:
    def __init__(self, path):
        path = Path(path)
        need(path.is_absolute() and path.name not in ("", ".", ".."))
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            info = os.fstat(parent)
            need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)
            fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        finally:
            os.close(parent)
        self.stream = os.fdopen(fd, "w", encoding="utf-8")

    def emit(self, record):
        # Only internally reconstructed records reach this sink, never raw child
        # output, exceptions, SQL rows or secret values.
        line = json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
        self.stream.write(line)
        self.stream.flush()
        print(line, end="", flush=True)

    def close(self):
        self.stream.close()


def observer_record(raw, principal, baseline):
    need(isinstance(raw, dict))
    if raw.get("complete") is False:
        return {"phase": "incomplete", "complete": False, "reason": "observer_incomplete"}
    need(raw.get("agent_id") == principal["id"] and UUID.fullmatch(raw["agent_id"]))
    if raw.get("phase") == "baseline_positive":
        need(baseline is None)
        when = raw["observed_at"]
        need(timestamp(principal["created_at"]) <= timestamp(when) < timestamp(principal["expires_at"]) - 5)
        return {"phase": "baseline_positive", "observed_at": when, "agent_id": raw["agent_id"],
                "owner_next_step": "Revoke only this new agent in the existing owner UI; observer continues automatically."}
    need(baseline is not None and raw.get("complete") is True and raw.get("sdk_denial_observed") is True)
    need(type(raw.get("status")) is int and raw["status"] in (401, 403))
    need(raw.get("owner_revocation_metadata_still_required") is True and raw.get("writes_performed") is False and raw.get("completed_graph_repeated") is False)
    # PostgreSQL keeps microseconds; JS Date evidence is millisecond precision.
    need(raw.get("baseline_at") == baseline["observed_at"] and raw.get("expires_at") and abs(timestamp(raw["expires_at"]) - timestamp(principal["expires_at"])) < .001)
    need(timestamp(raw["baseline_at"]) < timestamp(raw["denied_at"]) < timestamp(raw["expires_at"]) - 5)
    need(timestamp(raw["server_date"]) < timestamp(raw["expires_at"]) - 5 and abs(timestamp(raw["server_date"]) - timestamp(raw["denied_at"])) <= 10)
    need(type(raw.get("polls")) is int and 1 <= raw["polls"] <= 600)
    hashes = raw.get("sdk_source_sha256")
    need(isinstance(hashes, dict) and {"sdk/src/client.ts", "sdk/src/transport.ts"} <= set(hashes))
    need(all(re.fullmatch(r"sdk/src/(?:index|client|transport|errors|events|polling|types)\.ts", key) and isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) for key, value in hashes.items()))
    return {"phase": "denial_observed", "complete": True, "status": raw["status"],
            "agent_id": raw["agent_id"], "baseline_at": raw["baseline_at"], "denied_at": raw["denied_at"],
            "server_date": raw["server_date"], "expires_at": raw["expires_at"],
            "sdk_source_sha256": hashes, "owner_revocation_metadata_still_required": True}


def run_observer(envelope, args, started_at, sink, *, popen=subprocess.Popen):
    command = ["node", str(HERE / "sdk-revocation.mjs"), "--base-url", ORIGIN,
        "--org", args.org, "--context", args.context, "--assignee", args.assignee,
        "--fresh-after", utc(started_at), "--wait-seconds", str(args.wait_seconds),
        "--ack", "authorized-staging-read-only"]
    payload = (json.dumps(envelope, separators=(",", ":")) + "\n").encode()
    need(len(payload) <= 8192)
    child = popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                  env=clean_child_environment(), close_fds=True)
    selector = selectors.DefaultSelector()
    baseline, final, buffer = None, None, b""
    try:
        child.stdin.write(payload)
        child.stdin.close()
        payload = b""
        envelope["token"] = ""
        selector.register(child.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + args.wait_seconds + 15
        while selector.get_map():
            need(time.monotonic() < deadline)
            for key, _ in selector.select(min(1, max(0, deadline - time.monotonic()))):
                chunk = os.read(key.fd, 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                buffer += chunk
                need(len(buffer) <= 16384)
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    need(final is None)
                    record = observer_record(json.loads(line), envelope["principal"], baseline)
                    if record["phase"] == "baseline_positive": baseline = record
                    else: final = record
                    if record["phase"] == "baseline_positive": sink.emit(record)
        need(not buffer and final is not None)
        code = child.wait(timeout=max(.1, deadline - time.monotonic()))
        need(code == 0 and final.get("complete") is True)
        sink.emit(final)
    finally:
        envelope["token"] = ""
        envelope["principal"]["token_sha256"] = ""
        selector.close()
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
        if not child.stdin.closed: child.stdin.close()
        child.stdout.close()


def sdk_handoff(args, sink, *, prompt=hidden_token, secret=fetch_secret, inspect=read_principal, observer=run_observer):
    started = time.time()  # Owner starts this Terminal command BEFORE clicking Create.
    need(all(UUID.fullmatch(value) for value in (args.org, args.context, args.assignee)))
    need(type(args.wait_seconds) is int and 1 <= args.wait_seconds <= 600)
    sink.emit({"phase": "waiting_for_credential", "started_at": utc(started)})
    token, db_url, envelope = "", "", None
    try:
        token = prompt()
        need(bool(re.fullmatch(r"ll_agent_[A-Za-z0-9_-]{32,128}", token)))
        need(time.time() - started < 600)
        db_url = secret(DB_SECRET)  # SDK mode fetches ONLY this exact version-1 secret.
        envelope = inspect(db_url, token, args.org, started)
        token, db_url = "", ""
        observer(envelope, args, started, sink)
    finally:
        token, db_url = "", ""
        if envelope:
            envelope["token"] = ""
            envelope["principal"]["token_sha256"] = ""


def calendar_pins(path):
    # Root provides ONLY names from existing deployment metadata, not values.
    path = Path(path)
    need(path.is_file() and path.stat().st_size <= 8192 and not path.is_symlink())
    metadata = json.loads(path.read_text())
    need(isinstance(metadata, dict) and set(metadata) == {"secret_refs", "google_calendar_redirect_uri", "database_secret", "observed_revision"})
    need(metadata["google_calendar_redirect_uri"] == CALENDAR_REDIRECT)
    need(metadata["database_secret"] == "projects/lenslayer/secrets/" + DB_SECRET + "/versions/1")
    need(metadata["observed_revision"] == "lenslayer-api-staging-00007-hrc")
    pins = metadata["secret_refs"]
    need(isinstance(pins, dict) and set(pins) == CALENDAR_FIELDS)
    names = {}
    for field, reference in pins.items():
        need(isinstance(reference, str))
        match = re.fullmatch(r"projects/lenslayer/secrets/(lenslayer-staging-[a-z0-9-]+)/versions/1", reference)
        need(match is not None)
        names[field] = match.group(1)
        need(names[field] == CALENDAR_SECRET_NAMES[field])
    need(len(set(names.values())) == len(CALENDAR_FIELDS) and DB_SECRET not in names.values())
    return names


def build_calendar_runtime(values):
    # Script execution sets sys.path to this operator directory, not repo root.
    root = str(HERE.parents[1])
    if root not in sys.path: sys.path.insert(0, root)
    from unittest.mock import patch
    with patch("dotenv.load_dotenv", return_value=False):
        from backend.app.config import Settings
        from backend.app.database import Database
    class PinnedSettings(Settings):
        @classmethod
        def settings_customise_sources(cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings):
            return (init_settings,)
    settings = PinnedSettings(_env_file=None, environment="staging", auto_create_schema=False,
        database_url=postgres_url(values["database_url"], sqlalchemy=True), google_calendar_enabled=True,
        email_backend="disabled", hosted_agents_enabled=False, hosted_model_enabled=False,
        hosted_model_lifetime_call_limit=0, connector_http_timeout_seconds=5,
        google_calendar_redirect_uri=CALENDAR_REDIRECT,
        **{field: values[field] for field in CALENDAR_FIELDS})
    database = Database(settings)  # Engine only; never create_schema/application/worker.
    return database, settings


def calendar_target(database, org):
    from sqlalchemy import text
    with database.engine.connect() as conn:
        with conn.begin():
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text("SET LOCAL statement_timeout = '5s'"))
            rows = conn.execute(text("SELECT settings_json FROM integration_connections WHERE id = :id AND organization_id = :org AND provider = 'google_calendar' AND status = 'active'"),
                {"id": "75a57c6d-2b10-4b25-9a4c-a96658ff4abe", "org": org}).all()
            need(len(rows) == 1)
            target = json.loads(rows[0][0]).get("calendar_ids")
            need(isinstance(target, list) and len(target) == 1 and isinstance(target[0], str))
            return target[0]


def calendar_handoff(args, sink, *, secret=fetch_secret, build=build_calendar_runtime, target=calendar_target, qualify=None):
    need(args.ack == "existing-staging-grant-get-only-runtime-cas")
    need(UUID.fullmatch(args.org) and type(args.wait_seconds) is int and 0 <= args.wait_seconds <= 300)
    names = calendar_pins(args.pins_file)
    if qualify is None:
        spec = importlib.util.spec_from_file_location("handoff_calendar_renewal", HERE / "calendar_renewal.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        qualify = module.qualify_existing
    values, database, settings = {}, None, None
    try:
        values["database_url"] = secret(DB_SECRET)
        for field in sorted(CALENDAR_FIELDS): values[field] = secret(names[field])
        database, settings = build(values)
        # Read target ID from exact current connection metadata, never a personal
        # calendar identifier argument/environment/file. No encrypted token selected.
        calendar_id = target(database, args.org)
        finding = qualify(database, settings, args.org, calendar_id, ack=args.ack, wait_seconds=args.wait_seconds)
        need(finding.get("complete") is True and finding.get("renewed_grant_event_get_verified") is True and finding.get("provider_event_writes") is False)
        before, after = finding["credential_revision_before"], finding["credential_revision_after"]
        need(type(before) is int and type(after) is int and 0 <= before <= after <= before + 1)
        refreshed = finding["natural_refresh_persisted_by_runtime_cas"]
        need(type(refreshed) is bool and refreshed == (after == before + 1))
        sink.emit({"phase": "calendar_get_verified", "complete": True,
            "renewed_grant_event_get_verified": True, "credential_revision_before": before,
            "credential_revision_after": after, "natural_refresh_persisted_by_runtime_cas": refreshed,
            "independent_api_inspector_qualified": False, "calendar_ownership_verified": False,
            "provider_account_subject_equality_proved": False, "provider_event_writes": False,
            "observed_at": utc()})
    finally:
        values.clear()
        settings = None
        if database is not None: database.dispose()


INSPECTOR_SQL = """
SELECT a.input_json, a.input_sha256, a.approved_input_sha256, a.dispatch_intent_json,
       a.output_id, a.status, a.approval_status, a.attempts, r.id, r.organization_id,
       c.id, c.provider, c.settings_json
FROM agent_actions a JOIN agent_runs r ON r.id = a.run_id
JOIN integration_connections c ON c.id = %s AND c.organization_id = r.organization_id
WHERE a.id = %s AND r.id = %s AND r.organization_id = %s
LIMIT 2
"""


def read_inspector_fixture(db_url, org, *, connect=None):
    need(not os.environ.get("PGSERVICE") and not os.environ.get("PGSERVICEFILE"))
    if connect is None:
        import psycopg
        connect = psycopg.connect
    connection = connect(postgres_url(db_url), autocommit=True, connect_timeout=10,
        passfile="/dev/null")
    try:
        with connection.cursor() as cursor:
            cursor.execute("BEGIN READ ONLY")
            cursor.execute("SHOW transaction_read_only")
            need(cursor.fetchone() == ("on",))
            cursor.execute("SET LOCAL statement_timeout = '5s'")
            cursor.execute("SET LOCAL lock_timeout = '2s'")
            cursor.execute("SET LOCAL idle_in_transaction_session_timeout = '10s'")
            cursor.execute(INSPECTOR_SQL, (OLD_CONNECTION, ACTION, RUN, org))
            rows = cursor.fetchall()
            need(len(rows) == 1 and len(rows[0]) == 13)
            body, input_hash, approved_hash, intent, output, status, approval, attempts, run, organization, old, provider, settings = rows[0]
            need(isinstance(body, str) and hashlib.sha256(body.encode()).hexdigest() == input_hash == approved_hash == INPUT_HASH)
            need(status == "succeeded" and approval == "approved" and type(attempts) is int and attempts == 1)
            need(run == RUN and organization == org and old == OLD_CONNECTION and provider == "google_calendar")
            expected = json.loads(intent)
            calendar_ids = json.loads(settings).get("calendar_ids")
            need(isinstance(calendar_ids, list) and len(calendar_ids) == 1 and isinstance(calendar_ids[0], str))
            calendar = calendar_ids[0]
            need(hashlib.sha256(calendar.encode()).hexdigest() == CALENDAR_HASH)
            need(expected["id"] == EVENT == "ll" + output.replace("-", ""))
            provenance = expected["extendedProperties"]["private"]
            need(provenance.get("lenslayer_organization") == org and provenance.get("lenslayer_connection") == OLD_CONNECTION and provenance.get("lenslayer_calendar") == CALENDAR_HASH)
            need(provenance.get("lenslayer_run") == RUN and provenance.get("lenslayer_action") == ACTION and provenance.get("lenslayer_input") == INPUT_HASH)
            return {"calendar_id": calendar, "expected": expected}
    finally:
        try: connection.rollback()
        finally: connection.close()


def inspector_record(raw):
    need(isinstance(raw, dict) and raw.get("complete") is True)
    for field in ("independent_api_fields_verified", "owned_secondary_verified", "exactly_one_event_verified", "inspector_project_and_scopes_require_external_evidence"):
        need(raw.get(field) is True)
    for field in ("renewed_product_grant_qualified", "same_google_account_subject_proved", "production_session_binding_verified", "writes_performed"):
        need(raw.get(field) is False)
    return {"phase": "independent_inspector_verified", "complete": True,
        "independent_api_fields_verified": True, "owned_secondary_verified": True,
        "exactly_one_event_verified": True, "renewed_product_grant_qualified": False,
        "same_google_account_subject_proved": False, "production_session_binding_verified": False,
        "inspector_project_and_scopes_require_external_evidence": True, "writes_performed": False,
        "observed_at": utc()}


def run_inspector(envelope, sink, *, popen=subprocess.Popen):
    # Bounded single-receipt output; no raw child data reaches progress.
    payload = (json.dumps(envelope, separators=(",", ":")) + "\n").encode()
    need(len(payload) <= 65536)
    child = popen(["node", str(HERE / "calendar-inspector.mjs")], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=clean_child_environment(), close_fds=True)
    selector = selectors.DefaultSelector()
    try:
        child.stdin.write(payload)
        child.stdin.close()
        payload = b""
        envelope["token"] = ""
        selector.register(child.stdout, selectors.EVENT_READ)
        output, deadline = b"", time.monotonic() + 25
        while selector.get_map():
            need(time.monotonic() < deadline)
            for key, _ in selector.select(min(1, max(0, deadline - time.monotonic()))):
                chunk = os.read(key.fd, 4096)
                if not chunk: selector.unregister(key.fileobj)
                else:
                    output += chunk
                    need(len(output) <= 8192)
        child.wait(timeout=max(.1, deadline - time.monotonic()))
        need(child.returncode == 0 and len(output) <= 8192 and output.count(b"\n") == 1)
        sink.emit(inspector_record(json.loads(output)))
    finally:
        envelope["token"] = ""
        payload = b""
        selector.close()
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
        if not child.stdin.closed: child.stdin.close()
        child.stdout.close()


def inspector_handoff(args, sink, *, prompt=None, secret=fetch_secret, inspect=read_inspector_fixture, inspector=run_inspector):
    need(UUID.fullmatch(args.org) and args.ack == "owner-witnessed-existing-independent-readonly-grant")
    sink.emit({"phase": "waiting_for_inspector_token", "observed_at": utc()})
    token, db_url, envelope = "", "", None
    try:
        token = (prompt or (lambda: hidden_token("inspector")))()
        need(bool(re.fullmatch(r"[A-Za-z0-9._~+/-]{10,4096}", token)) and not token.startswith("ll_agent_"))
        db_url = secret(DB_SECRET)  # No Calendar/product/provider credential reads.
        envelope = inspect(db_url, args.org)
        envelope.update(token=token, ack="existing-independent-read-only-grant")
        token, db_url = "", ""
        inspector(envelope, sink)
    finally:
        token, db_url = "", ""
        if envelope: envelope["token"] = ""


def main():
    sink = None
    try:
        class Parser(argparse.ArgumentParser):
            def error(self, message):
                # argparse normally echoes unrecognized arguments, potentially
                # including a mistakenly pasted bearer. Never echo argv errors.
                raise Incomplete()
        parser = Parser(add_help=False)
        parser.add_argument("mode", choices=("sdk", "calendar", "inspector"))
        parser.add_argument("--org", required=True)
        parser.add_argument("--progress", required=True, help="New absolute file in an existing owned mode-0700 directory")
        parser.add_argument("--context")
        parser.add_argument("--assignee")
        parser.add_argument("--wait-seconds", type=int, default=180)
        parser.add_argument("--pins-file", help="Names-only Calendar version-1 references from root metadata")
        parser.add_argument("--ack")
        args = parser.parse_args()
        sink = PrivateProgress(args.progress)
        with terminal_signals():
            if args.mode == "sdk": sdk_handoff(args, sink)
            elif args.mode == "calendar": calendar_handoff(args, sink)
            else: inspector_handoff(args, sink)
        return 0
    except (Exception, KeyboardInterrupt):
        record = {"phase": "incomplete", "complete": False, "reason": "handoff_incomplete_no_retry"}
        if sink: sink.emit(record)
        else: print(json.dumps(record), flush=True)
        return 1
    finally:
        if sink: sink.close()


if __name__ == "__main__":
    raise SystemExit(main())
