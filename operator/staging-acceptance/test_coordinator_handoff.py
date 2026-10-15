"""Offline wrapper tests. All gcloud/DB/provider boundaries are injected fakes."""
from contextlib import redirect_stdout
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pty
import select
import signal
import stat
import subprocess
import sys
import tempfile
import termios
import time
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch
import warnings

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("coordinator_handoff", HERE / "coordinator_handoff.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
TOKEN = "ll_agent_" + "x" * 43
ORG = "11111111-1111-4111-8111-111111111111"
AGENT = "22222222-2222-4222-8222-222222222222"
CONTEXT = "33333333-3333-4333-8333-333333333333"
ASSIGNEE = "44444444-4444-4444-8444-444444444444"
DSN = "postgresql://synthetic:synthetic-password@ep-synthetic-pooler.eu.neon.tech/db?sslmode=require"
NOW = time.time()
INSPECTOR_TOKEN = "synthetic-independent-access-only"
COORDINATES = json.loads((HERE / "fixtures/calendar-runtime-coordinates.json").read_text())
CALENDAR = json.loads((HERE / "fixtures/disposable-calendar.json").read_text())["calendar_id"]


def inspector_fixture():
    return {"calendar_id": CALENDAR, "expected": {"id": h.EVENT, "status": "confirmed", "visibility": "private",
        "summary": "[STAGING SYNTHETIC] Private Calendar acceptance — 15 Oct 2026", "description": "Synthetic only",
        "start": {"dateTime": "2026-10-15T09:00:00+00:00"}, "end": {"dateTime": "2026-10-15T09:15:00+00:00"},
        "reminders": {"useDefault": False}, "extendedProperties": {"private": {
        "lenslayer_organization": ORG, "lenslayer_connection": h.OLD_CONNECTION, "lenslayer_calendar": h.CALENDAR_HASH,
        "lenslayer_run": h.RUN, "lenslayer_action": h.ACTION, "lenslayer_input": h.INPUT_HASH}}}}


def inspector_receipt():
    return {"complete": True, "independent_api_fields_verified": True, "owned_secondary_verified": True,
        "exactly_one_event_verified": True, "inspector_project_and_scopes_require_external_evidence": True,
        "renewed_product_grant_qualified": False, "same_google_account_subject_proved": False,
        "production_session_binding_verified": False, "writes_performed": False}


def envelope(token=TOKEN, started=NOW):
    return {"token": token, "observed_at": h.utc(started + 1), "principal": {
        "id": AGENT, "organization_id": ORG, "delegated_by_user_id": ASSIGNEE,
        "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
        "allowed_tools": ["context.retrieve", "workspace.context_tasks.create"],
        "context_ids": [CONTEXT], "assignee_ids": [ASSIGNEE], "contract_ids": [], "calendar_targets": [],
        "require_approval": True, "max_actions_per_run": 1, "status": "active", "revoked_at": None,
        "created_at": h.utc(started + .1), "expires_at": h.utc(started + 300),
        "delegator_role": "owner", "run_count": 0}}


class Sink:
    def __init__(self): self.records = []
    def emit(self, record): self.records.append(record)


class Connection:
    def __init__(self, rows=None, readonly="on"):
        doc = envelope()
        doc.pop("token")
        self.rows = [(doc,)] if rows is None else rows
        self.readonly, self.queries, self.closed, self.rolled_back = readonly, [], False, False
    def cursor(self): return self
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute(self, sql, params=None): self.queries.append((sql, params))
    def fetchone(self): return (self.readonly,)
    def fetchall(self): return self.rows
    def rollback(self): self.rolled_back = True
    def close(self): self.closed = True


class WrapperTests(unittest.TestCase):
    def test_gcloud_only_exact_named_version_one_no_secret_argv_env_or_stderr(self):
        calls = []
        def run(command, **kwargs):
            calls.append((command, kwargs))
            return NS(returncode=0, stdout=b"synthetic-secret-value\n")
        with patch.dict(os.environ, {"PRODUCT_BEARER": TOKEN, "NODE_OPTIONS": "not-propagated"}):
            result = h.fetch_secret(h.DB_SECRET, run=run)
        self.assertEqual(result, "synthetic-secret-value")
        command, kwargs = calls[0]
        self.assertEqual(command[-3:], ["access", "1", "--secret=" + h.DB_SECRET])
        self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
        self.assertLessEqual(kwargs["timeout"], 30)
        self.assertNotIn("PRODUCT_BEARER", kwargs["env"])
        self.assertNotIn("NODE_OPTIONS", kwargs["env"])
        self.assertNotIn(result, str(command) + str(kwargs["env"]))

    def test_readonly_transaction_enforced_and_digest_parameterized(self):
        connection, arguments = Connection(), []
        result = h.read_principal(DSN, TOKEN, ORG, NOW, connect=lambda *a, **kw: arguments.append((a, kw)) or connection)
        self.assertEqual(result["token"], TOKEN)
        self.assertEqual(connection.queries[0], ("BEGIN READ ONLY", None))
        self.assertEqual(connection.queries[1], ("SHOW transaction_read_only", None))
        self.assertNotIn(TOKEN, str(connection.queries))
        self.assertEqual(next(params for sql, params in connection.queries if sql == h.SCOPE_SQL)[0], hashlib.sha256(TOKEN.encode()).hexdigest())
        self.assertNotIn("options", arguments[0][1])
        self.assertIn(("SET LOCAL statement_timeout = '5s'", None), connection.queries)
        self.assertNotIn("service", arguments[0][1])
        self.assertEqual(arguments[0][1]["passfile"], "/dev/null")
        self.assertTrue(connection.rolled_back and connection.closed)

    def test_ambient_service_files_are_refused_before_connecting(self):
        for key in ("PGSERVICE", "PGSERVICEFILE"):
            with self.subTest(key=key), patch.dict(os.environ, {key: "synthetic-service"}):
                connect = unittest.mock.Mock()
                with self.assertRaises(h.Incomplete):
                    h.read_principal(DSN, TOKEN, ORG, NOW, connect=connect)
                with self.assertRaises(h.Incomplete):
                    h.read_inspector_fixture(DSN, ORG, connect=connect)
                connect.assert_not_called()

    def test_readonly_off_aborts_before_principal_select(self):
        connection = Connection(readonly="off")
        with self.assertRaises(h.Incomplete): h.read_principal(DSN, TOKEN, ORG, NOW, connect=lambda *a, **kw: connection)
        self.assertEqual(len(connection.queries), 2)
        self.assertTrue(connection.rolled_back and connection.closed)

    def test_missing_duplicate_old_or_long_lived_principal_rejected(self):
        for case in ("none", "duplicate", "old", "long"):
            document = envelope(); document.pop("token")
            if case == "old": document["principal"]["created_at"] = h.utc(NOW - 1)
            if case == "long": document["principal"]["expires_at"] = h.utc(NOW + 3601)
            rows = [] if case == "none" else [(document,), (document,)] if case == "duplicate" else [(document,)]
            connection = Connection(rows)
            with self.subTest(case=case), self.assertRaises(h.Incomplete):
                h.read_principal(DSN, TOKEN, ORG, NOW, connect=lambda *a, **kw: connection)
            self.assertTrue(connection.rolled_back and connection.closed)

    def test_sdk_human_only_supplies_token_and_fetches_one_secret(self):
        calls, sink = [], Sink()
        args = NS(org=ORG, context=CONTEXT, assignee=ASSIGNEE, wait_seconds=180)
        def inspect(url, token, org, started):
            self.assertEqual((url, token, org), (DSN, TOKEN, ORG))
            return envelope(token, started)
        def observer(doc, options, started, progress):
            self.assertEqual(doc["token"], TOKEN)
            self.assertLess(abs(started - time.time()), 1)
            self.assertEqual(options.wait_seconds, 180)
        h.sdk_handoff(args, sink, prompt=lambda: TOKEN,
            secret=lambda name: calls.append(name) or DSN, inspect=inspect, observer=observer)
        self.assertEqual(calls, [h.DB_SECRET])
        self.assertEqual(sink.records[0]["phase"], "waiting_for_credential")
        self.assertNotIn(TOKEN, json.dumps(sink.records))

    def test_json_or_nonbearer_human_input_rejected_before_secret_access(self):
        for token in (json.dumps({"token": TOKEN}), "not-a-bearer"):
            calls = []
            with self.assertRaises(h.Incomplete):
                h.sdk_handoff(NS(org=ORG, context=CONTEXT, assignee=ASSIGNEE, wait_seconds=10), Sink(),
                    prompt=lambda: token, secret=lambda name: calls.append(name))
            self.assertEqual(calls, [])

    def test_getpass_never_uses_echoing_fallback(self):
        def unsafe(*args):
            warnings.warn("no tty", h.getpass.GetPassWarning)
            self.fail("fallback must not continue")
        with patch.object(h.sys.stdin, "isatty", return_value=True), patch.object(h.getpass, "getpass", unsafe):
            with self.assertRaises(h.getpass.GetPassWarning): h.hidden_token()

    def test_progress_requires_explicit_private_parent_and_exclusive_file(self):
        with tempfile.TemporaryDirectory(dir=HERE) as directory:
            path = Path(directory) / "progress.jsonl"
            with redirect_stdout(io.StringIO()):
                sink = h.PrivateProgress(path)
                sink.emit({"phase": "waiting_for_credential"})
                sink.close()
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError): h.PrivateProgress(path)
            os.chmod(directory, 0o755)
            with self.assertRaises(h.Incomplete): h.PrivateProgress(Path(directory) / "other.jsonl")

    def test_child_progress_untrusted_extra_fields_never_forwarded(self):
        p = envelope()["principal"]
        raw = {"phase": "baseline_positive", "agent_id": AGENT, "observed_at": h.utc(NOW + 2), "secret": TOKEN}
        result = h.observer_record(raw, p, None)
        self.assertNotIn(TOKEN, json.dumps(result))
        bad = {**raw, "observed_at": TOKEN}
        with self.assertRaises((h.Incomplete, ValueError)): h.observer_record(bad, p, None)
        self.assertEqual(h.observer_record({"complete": False, "reason": TOKEN}, p, None)["reason"], "observer_incomplete")

    def test_dsn_requires_pooled_neon_tls_and_forbids_options_service_files(self):
        self.assertTrue(h.postgres_url(DSN, sqlalchemy=True).startswith("postgresql+psycopg://"))
        self.assertIn("connect_timeout=10", h.postgres_url(DSN))
        for bad in (DSN.replace("-pooler", ""), DSN.replace("neon.tech", "evil.invalid"),
                    DSN.replace("sslmode=require", "sslmode=disable"), DSN + "&service=somefile", DSN + "&options=anything"):
            with self.assertRaises(h.Incomplete): h.postgres_url(bad)

    def test_calendar_pins_are_names_only_exact_fields_all_version_one(self):
        with tempfile.TemporaryDirectory(dir=HERE) as directory:
            path = Path(directory) / "pins.json"
            pins = json.loads(json.dumps(COORDINATES))
            path.write_text(json.dumps(pins))
            self.assertEqual(set(h.calendar_pins(path)), h.CALENDAR_FIELDS)
            for bad in ({**pins, "unrelated": "value"}, {**pins, "google_calendar_redirect_uri": "https://evil.invalid/callback"},
                        {**pins, "secret_refs": {**pins["secret_refs"], "google_calendar_redirect_uri": "invented-secret"}},
                        {**pins, "secret_refs": {key: value.replace("/versions/1", "/versions/latest") for key, value in pins["secret_refs"].items()}}):
                path.write_text(json.dumps(bad))
                with self.assertRaises(h.Incomplete): h.calendar_pins(path)

    def test_invalid_cli_arguments_never_echo_a_mistakenly_pasted_bearer(self):
        child = subprocess.run([sys.executable, "-B", str(HERE / "coordinator_handoff.py"),
            "sdk", "--token", TOKEN], capture_output=True, text=True, timeout=5)
        self.assertEqual(child.returncode, 1)
        self.assertNotIn(TOKEN, child.stdout + child.stderr)
        self.assertFalse(json.loads(child.stdout)["complete"])

    def test_calendar_fetches_five_refs_plus_db_and_public_redirect_no_sixth_secret(self):
        with tempfile.TemporaryDirectory(dir=HERE) as directory:
            path = Path(directory) / "pins.json"
            pins = COORDINATES
            path.write_text(json.dumps(pins))
            calls, disposed, sink = [], [], Sink()
            database, settings = NS(dispose=lambda: disposed.append(True)), object()
            def qualify(db, conf, org, calendar, **kw):
                self.assertIs(db, database); self.assertIs(conf, settings)
                self.assertEqual(kw, {"ack": "existing-staging-grant-get-only-runtime-cas", "wait_seconds": 0})
                return {"complete": True, "renewed_grant_event_get_verified": True, "provider_event_writes": False,
                        "credential_revision_before": 0, "credential_revision_after": 1,
                        "natural_refresh_persisted_by_runtime_cas": True, "untrusted_secret": TOKEN}
            h.calendar_handoff(NS(org=ORG, pins_file=path, wait_seconds=0, ack="existing-staging-grant-get-only-runtime-cas"), sink,
                secret=lambda name: calls.append(name) or "synthetic-secret", build=lambda values: (database, settings),
                target=lambda db, org: "synthetic-private-calendar", qualify=qualify)
            self.assertEqual(len(calls), 6); self.assertEqual(calls[0], h.DB_SECRET)
            self.assertEqual(set(calls[1:]), set(h.CALENDAR_SECRET_NAMES.values()))
            self.assertNotIn("google_calendar_redirect_uri", h.CALENDAR_FIELDS)
            self.assertEqual(disposed, [True])
            self.assertNotIn(TOKEN, json.dumps(sink.records))
            self.assertNotIn("synthetic-secret", json.dumps(sink.records))
            self.assertTrue(sink.records[0]["natural_refresh_persisted_by_runtime_cas"])

    def test_inspector_token_only_handoff_fetches_db_only_and_clears_bearer(self):
        calls, sink, documents = [], Sink(), []
        def run(document, progress):
            self.assertEqual(document["token"], INSPECTOR_TOKEN)
            documents.append(document)
            progress.emit(h.inspector_record({**inspector_receipt(), "hostile": INSPECTOR_TOKEN}))
        h.inspector_handoff(NS(org=ORG, ack="owner-witnessed-existing-independent-readonly-grant"), sink,
            prompt=lambda: INSPECTOR_TOKEN, secret=lambda name: calls.append(name) or DSN,
            inspect=lambda url, org: inspector_fixture(), inspector=run)
        self.assertEqual(calls, [h.DB_SECRET])
        self.assertEqual(documents[0]["token"], "")
        self.assertNotIn(INSPECTOR_TOKEN, json.dumps(sink.records))
        self.assertFalse(sink.records[-1]["renewed_product_grant_qualified"])
        self.assertFalse(sink.records[-1]["same_google_account_subject_proved"])

    def test_inspector_hostile_progress_reconstructed_and_false_boundaries_enforced(self):
        self.assertNotIn(INSPECTOR_TOKEN, json.dumps(h.inspector_record({**inspector_receipt(), "token": INSPECTOR_TOKEN})))
        for field, value in (("same_google_account_subject_proved", True), ("renewed_product_grant_qualified", True),
                             ("writes_performed", True), ("owned_secondary_verified", INSPECTOR_TOKEN), ("complete", False)):
            with self.subTest(field=field), self.assertRaises(h.Incomplete):
                h.inspector_record({**inspector_receipt(), field: value})

    def test_inspector_fixture_query_is_exact_readonly_never_selects_new_grant_or_tokens(self):
        expected = inspector_fixture()["expected"]
        body = "synthetic immutable input"
        digest = hashlib.sha256(body.encode()).hexdigest()
        rows = [(body, digest, digest, json.dumps(expected), "aff707c0-c906-4758-bda6-e85905917737",
                 "succeeded", "approved", 1, h.RUN, ORG, h.OLD_CONNECTION, "google_calendar", json.dumps({"calendar_ids": [CALENDAR]}))]
        connection = Connection(rows)
        with patch.object(h, "INPUT_HASH", digest):
            expected["extendedProperties"]["private"]["lenslayer_input"] = digest
            rows[0] = (*rows[0][:3], json.dumps(expected), *rows[0][4:])
            result = h.read_inspector_fixture(DSN, ORG, connect=lambda *a, **kw: connection)
        self.assertEqual(result["expected"]["id"], h.EVENT)
        self.assertTrue(connection.closed and connection.rolled_back)
        self.assertEqual(connection.queries[:2], [("BEGIN READ ONLY", None), ("SHOW transaction_read_only", None)])
        self.assertEqual(next(params for sql, params in connection.queries if sql == h.INSPECTOR_SQL), (h.OLD_CONNECTION, h.ACTION, h.RUN, ORG))
        self.assertNotIn("calendar_credentials", h.INSPECTOR_SQL)
        self.assertNotIn("75a57c6d", h.INSPECTOR_SQL)

    def test_inspector_fails_readonly_off_and_unbound_intent(self):
        for connection in (Connection(readonly="off"), Connection(rows=[])):
            with self.assertRaises(h.Incomplete): h.read_inspector_fixture(DSN, ORG, connect=lambda *a, **kw: connection)
            self.assertTrue(connection.closed and connection.rolled_back)

    def test_inspector_pipe_rejects_hostile_duplicate_oversized_and_nonzero_receipts(self):
        good = json.dumps(inspector_receipt()) + "\n"
        for output, code in ((good + good, 0), ("x" * 9000, 0), (INSPECTOR_TOKEN + "\n", 0), (good, 1)):
            def popen(command, **kwargs):
                self.assertNotIn(INSPECTOR_TOKEN, str(command) + str(kwargs["env"]))
                program = "import sys; sys.stdin.buffer.read(); sys.stdout.write(" + repr(output) + "); sys.exit(" + str(code) + ")"
                return subprocess.Popen([sys.executable, "-B", "-c", program], **kwargs)
            sink, document = Sink(), {**inspector_fixture(), "token": INSPECTOR_TOKEN, "ack": "existing-independent-read-only-grant"}
            with self.subTest(code=code, size=len(output)), self.assertRaises((h.Incomplete, ValueError)):
                h.run_inspector(document, sink, popen=popen)
            self.assertEqual(sink.records, [])
            self.assertEqual(document["token"], "")


class RealWrapperTTYTests(unittest.TestCase):
    def test_token_only_inspector_real_getpass_actual_node_gets_clean_exit_and_interrupt(self):
        for ending in ("success", "sigint", "sigterm"):
            with self.subTest(ending=ending), tempfile.TemporaryDirectory(dir=HERE) as directory:
                progress = str(Path(directory) / "inspector.jsonl")
                code = f'''
import importlib.util, subprocess
from types import SimpleNamespace as NS
spec=importlib.util.spec_from_file_location("fixture", {str(Path(__file__).resolve())!r})
t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t); h=t.h
sink=h.PrivateProgress({progress!r})
def popen(command,**kw):
    assert t.INSPECTOR_TOKEN not in str(command)+str(kw['env'])
    program="""import {{inspectIndependent}} from '"""+(h.HERE/'calendar-inspector.mjs').as_uri()+"""';
import {{hiddenJSON}} from '"""+(h.HERE/'io.mjs').as_uri()+"""';
const e=await hiddenJSON(); let n=0;
const result=await inspectIndependent(e,{{fetchImpl:async(url,init)=>{{
if(init.method!=='GET'||!url.startsWith('https://www.googleapis.com/calendar/v3/')) throw Error('unsafe');
const data=++n===1?{{id:e.calendar_id,accessRole:'owner',primary:false}}:n===2?e.expected:{{items:[{{id:e.expected.id}}]}};
return new Response(JSON.stringify(data));}}}}); console.log(JSON.stringify(result));"""
    return subprocess.Popen(['node','--input-type=module','-e',program],**kw)
try:
    with h.terminal_signals():
        h.inspector_handoff(NS(org=t.ORG,ack='owner-witnessed-existing-independent-readonly-grant'),sink,
            secret=lambda name:t.DSN,inspect=lambda url,org:t.inspector_fixture(),
            inspector=lambda *a:h.run_inspector(*a,popen=popen))
except (Exception,KeyboardInterrupt): sink.emit({{"phase":"incomplete","complete":False}})
finally: sink.close()
'''
                master, slave = pty.openpty()
                before = termios.tcgetattr(slave)
                child = subprocess.Popen([sys.executable, "-B", "-c", code], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
                transcript = b""
                try:
                    deadline = time.monotonic() + 5
                    while b"access token (hidden):" not in transcript and time.monotonic() < deadline:
                        if select.select([master], [], [], .1)[0]: transcript += os.read(master, 4096)
                    self.assertIn(b"access token (hidden):", transcript)
                    self.assertFalse(termios.tcgetattr(slave)[3] & termios.ECHO)
                    if ending == "success": os.write(master, INSPECTOR_TOKEN.encode() + b"\n")
                    else: child.send_signal(signal.SIGINT if ending == "sigint" else signal.SIGTERM)
                    deadline = time.monotonic() + 5
                    while child.poll() is None and time.monotonic() < deadline:
                        if select.select([master], [], [], .05)[0]: transcript += os.read(master, 4096)
                    child.wait(timeout=.5)
                    while select.select([master], [], [], 0)[0]: transcript += os.read(master, 4096)
                    self.assertEqual(child.returncode, 0)
                    self.assertEqual(before, termios.tcgetattr(slave))
                    self.assertNotIn(INSPECTOR_TOKEN.encode(), transcript)
                    records = [json.loads(line) for line in Path(progress).read_text().splitlines()]
                    self.assertEqual(records[0]["phase"], "waiting_for_inspector_token")
                    self.assertEqual(records[-1]["phase"], "independent_inspector_verified" if ending == "success" else "incomplete")
                    self.assertNotIn(INSPECTOR_TOKEN, json.dumps(records))
                    self.assertNotIn(CALENDAR, json.dumps(records))
                finally:
                    if child.poll() is None: child.kill(); child.wait(timeout=3)
                    os.close(master); os.close(slave)

    def test_token_only_terminal_handoff_actual_sdk_pipe_and_signal_cleanup(self):
        # Parent is the real wrapper/getpass/progress/pipe implementation; only
        # gcloud and DB inspection are replaced. Child is the actual SDK observer
        # with fetch injected, never a live HTTP call. No production test flags.
        test_module = str(Path(__file__).resolve())
        for ending in ("success", "ctrl-c", "sigterm"):
            with self.subTest(ending=ending), tempfile.TemporaryDirectory(dir=HERE) as directory:
                progress = str(Path(directory) / "progress.jsonl")
                code = f'''
import importlib.util, json, subprocess, sys, time
from types import SimpleNamespace as NS
spec=importlib.util.spec_from_file_location("test_fixture", {test_module!r})
t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
h=t.h
args=NS(org=t.ORG,context=t.CONTEXT,assignee=t.ASSIGNEE,wait_seconds=3)
sink=h.PrivateProgress({progress!r})
def inspect(url,token,org,started):
    result=t.envelope(token,started)
    result["observed_at"]=h.utc()
    result["principal"]["created_at"]=result["observed_at"]
    return result
def popen(command,**kw):
    assert t.TOKEN not in str(command)+str(kw.get("env"))
    assert command[command.index("--base-url")+1] == h.ORIGIN
    program="""import {{observe}} from '"""+(h.HERE/'sdk-revocation.mjs').as_uri()+"""';
import {{hiddenJSON}} from '"""+(h.HERE/'io.mjs').as_uri()+"""';
const e=await hiddenJSON(); let now=Date.now(), count=0;
const tools=[{{name:'context.retrieve',version:'1',requires_approval:false}},{{name:'workspace.context_tasks.create',version:'1',requires_approval:true}}];
const result=await observe(e,{{baseUrl:'"""+h.ORIGIN+"""',org:'"""+t.ORG+"""',context:'"""+t.CONTEXT+"""',assignee:'"""+t.ASSIGNEE+"""',freshAfter:process.argv[1],waitSeconds:3,ack:'authorized-staging-read-only'}},
{{clock:()=>now,sleep:async(ms)=>{{now+=ms;}},fetchImpl:async()=>new Response(JSON.stringify(count++?{{detail:'denied'}}:tools),{{status:count===1?200:401,headers:{{date:new Date(now).toUTCString()}}}})}});
console.log(JSON.stringify(result));"""
    return subprocess.Popen(['node','--input-type=module','-e',program,command[command.index('--fresh-after')+1]],**kw)
try:
    with h.terminal_signals():
        h.sdk_handoff(args,sink,secret=lambda name:t.DSN,inspect=inspect,
            observer=lambda *a:h.run_observer(*a,popen=popen))
except (Exception,KeyboardInterrupt):
    sink.emit({{"phase":"incomplete","complete":False,"reason":"handoff_incomplete_no_retry"}})
finally:
    sink.close()
'''
                master, slave = pty.openpty()
                before = termios.tcgetattr(slave)
                child = subprocess.Popen([sys.executable, "-B", "-c", code], stdin=slave, stdout=slave,
                    stderr=slave, close_fds=True)
                transcript = b""
                try:
                    deadline = time.monotonic() + 5
                    while b"Fresh credential (hidden):" not in transcript and time.monotonic() < deadline:
                        if select.select([master], [], [], .1)[0]: transcript += os.read(master, 4096)
                    self.assertIn(b"Fresh credential (hidden):", transcript)
                    self.assertFalse(termios.tcgetattr(slave)[3] & termios.ECHO)
                    if ending == "success": os.write(master, TOKEN.encode() + b"\n")  # No human JSON.
                    # getpass retains ISIG; emulate the foreground terminal's
                    # SIGINT because this isolated PTY has no foreground group.
                    elif ending == "ctrl-c": child.send_signal(signal.SIGINT)
                    else: child.send_signal(signal.SIGTERM)
                    # Drain the actual terminal while the wrapper writes its
                    # source-bound finding; macOS PTYs have small output buffers.
                    deadline = time.monotonic() + 5
                    while child.poll() is None and time.monotonic() < deadline:
                        if select.select([master], [], [], .05)[0]: transcript += os.read(master, 4096)
                    child.wait(timeout=.5)
                    while select.select([master], [], [], 0)[0]: transcript += os.read(master, 4096)
                    self.assertEqual(termios.tcgetattr(slave), before)
                    self.assertNotIn(TOKEN.encode(), transcript)
                    self.assertNotIn(b"synthetic-password", transcript)
                    records = [json.loads(line) for line in Path(progress).read_text().splitlines()]
                    self.assertEqual(records[0]["phase"], "waiting_for_credential")
                    self.assertEqual(records[-1]["phase"], "denial_observed" if ending == "success" else "incomplete", records)
                    if ending == "success": self.assertEqual(records[1]["phase"], "baseline_positive")
                    self.assertNotIn(TOKEN, json.dumps(records))
                finally:
                    if child.poll() is None: child.kill(); child.wait(timeout=3)
                    os.close(master); os.close(slave)


if __name__ == "__main__":
    unittest.main()
