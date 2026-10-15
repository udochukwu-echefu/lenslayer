"""Opt-in launcher portability check using only newly created local PG17 clusters.

Run explicitly with LENSLAYER_TEST_PG_LAUNCHER_ACK=create_disposable_cluster.
No inherited database URL, credential, server, application schema or .env is used.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "scripts/test-agent-generalization-postgres-local.py"

# Execute the actual launcher main(), changing only its scratch/cwd ROOT to an
# owned long-path fixture. Imports and runtime remain the real source/interpreter.
# The named unittest is a real SQL probe, not a mocked loader, runner or PG tool.
DRIVER = r'''
import importlib.util, json, os, socket, stat, subprocess, sys, types, unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

source, workspace, psql, expected_version = sys.argv[1:]
source, workspace = Path(source), Path(workspace)
spec = importlib.util.spec_from_file_location("postgres_launcher", source)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
assert launcher.ROOT == source.parents[1]
launcher.ROOT = workspace
records = []

class Probe(unittest.TestCase):
    def runTest(self):
        self.assertEqual(os.environ["LENSLAYER_TEST_POSTGRES_ACK"], "create_disposable_schema")
        self.assertEqual(os.environ["LENSLAYER_SANDBOX_GOOGLE_ACK"], "disabled")
        self.assertNotIn("LENSLAYER_SYNTHETIC_PROVIDER_KEY", os.environ)
        import dotenv
        from backend.app import config
        self.assertEqual(Path(config.__file__).resolve(), source.parents[1] / "backend/app/config.py")
        self.assertIsNone(config.Settings.model_config["env_file"])
        self.assertFalse(dotenv.load_dotenv(workspace / "synthetic-never-read.env"))
        url = urlsplit(os.environ["LENSLAYER_TEST_POSTGRES_URL"])
        query = parse_qs(url.query)
        self.assertEqual(url.scheme, "postgresql+psycopg")
        self.assertEqual(url.username, "lenslayer_local_test")
        self.assertIsNone(url.password)
        self.assertIsNone(url.hostname)
        self.assertEqual(url.path, "/lenslayer_agent_test")
        self.assertEqual(set(query), {"host", "port", "passfile"})
        self.assertEqual(query["port"], ["55487"])
        directory = Path(query["host"][0])
        socket_path = directory / ".s.PGSQL.55487"
        self.assertTrue(stat.S_ISSOCK(socket_path.stat().st_mode))
        self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual(directory.stat().st_uid, os.getuid())
        self.assertEqual(os.environ["PGPASSFILE"], query["passfile"][0])
        cluster = Path(query["passfile"][0]).parent
        self.assertEqual(cluster.parent, workspace / ".lenslayer")
        self.assertFalse(Path(query["passfile"][0]).exists())
        self.assertFalse(Path(os.environ["PGSERVICEFILE"]).exists())
        schema = "ll_agent_test_" + uuid4().hex
        sql = f"""BEGIN; CREATE SCHEMA {schema}; SET LOCAL search_path={schema};
            CREATE TABLE launcher_probe (value integer); INSERT INTO launcher_probe VALUES (7);
            SELECT json_build_object('database',current_database(), 'role',current_user,
                'schema',current_schema(), 'value',value,
                'version',current_setting('server_version_num'),
                'listen',current_setting('listen_addresses'),
                'sockets',current_setting('unix_socket_directories'),
                'data',current_setting('data_directory'), 'address',inet_server_addr(),
                'hba_safe',(SELECT bool_and(CASE WHEN type='local' THEN auth_method='trust'
                    ELSE auth_method='reject' END) FROM pg_hba_file_rules))
            FROM launcher_probe; ROLLBACK;"""
        reply = subprocess.run([psql, "--no-psqlrc", "--no-password", "-h", str(directory),
            "-p", "55487", "-U", "lenslayer_local_test", "-d", "lenslayer_agent_test",
            "-qAt", "--set=ON_ERROR_STOP=1", "-c", sql], cwd=workspace,
            env={"PATH":"/opt/homebrew/bin:/usr/bin:/bin", "LC_ALL":"C",
                 "PGPASSFILE":query["passfile"][0], "PGSERVICEFILE":os.environ["PGSERVICEFILE"]},
            capture_output=True, text=True, timeout=10)
        self.assertEqual(reply.returncode, 0, reply.stderr)
        proof = json.loads(reply.stdout)
        self.assertEqual(proof["database"], "lenslayer_agent_test")
        self.assertEqual(proof["role"], "lenslayer_local_test")
        self.assertEqual(proof["schema"], schema)
        self.assertEqual(proof["value"], 7)
        self.assertEqual(proof["version"], expected_version)
        self.assertEqual(proof["listen"], "")
        self.assertIsNone(proof["address"])
        self.assertEqual(proof["sockets"], str(directory))
        self.assertTrue(proof["hba_safe"])
        self.assertEqual(Path(proof["data"]), cluster / "data")
        pid_file = cluster / "data/postmaster.pid"
        pid = int(pid_file.read_text().splitlines()[0])
        os.kill(pid, 0)
        records.append({"pid":pid, "socket":str(socket_path), "cluster":str(cluster),
            "socket_bytes":len(os.fsencode(socket_path)), "proof":proof})
        if os.environ.get("LAUNCHER_PROBE_FAIL") == "yes":
            self.fail("Synthetic suite failure to verify launcher shutdown")

module = types.ModuleType("launcher_sql_probe")
module.Probe = Probe
sys.modules[module.__name__] = module
sys.argv = [str(source), "launcher_sql_probe.Probe"]
try:
    code = launcher.main()
    shutdown = []
    for record in records:
        try: os.kill(record["pid"], 0); alive = True
        except ProcessLookupError: alive = False
        with socket.socket(socket.AF_UNIX) as probe:
            try: probe.connect(record["socket"]); connected = True
            except FileNotFoundError: connected = False
        shutdown.append({"alive":alive, "connected":connected,
            "socket_exists":Path(record["socket"]).exists(),
            "socket_directory_exists":Path(record["socket"]).parent.exists(),
            "cluster_exists":Path(record["cluster"]).exists()})
    print(json.dumps({"exit_code":code, "records":records, "shutdown":shutdown}))
except Exception as error:
    print(json.dumps({"launcher_error":str(error), "records":records}))
'''


@unittest.skipUnless(os.environ.get("LENSLAYER_TEST_PG_LAUNCHER_ACK") == "create_disposable_cluster",
                     "Disposable local launcher regression not explicitly opted in")
class PostgresLauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "createdb", "psql")}
        if os.name != "posix" or not all(cls.binaries.values()) or os.geteuid() == 0:
            raise unittest.SkipTest("Non-root Unix runtime and local PG17 tools required")
        versions = []
        for binary in cls.binaries.values():
            result = subprocess.run([binary, "--version"], env={"PATH": os.environ["PATH"], "LC_ALL": "C"},
                                    capture_output=True, text=True, check=True, timeout=5)
            match = re.search(r"\(PostgreSQL\) (17)\.(\d+)", result.stdout)
            if match is None:
                raise unittest.SkipTest("This concrete regression requires official PG17 tools")
            versions.append(170000 + int(match[2]))
        if len(set(versions)) != 1:
            raise RuntimeError("Refusing mismatched PostgreSQL tool versions")
        cls.version = str(versions[0])

    def exercise(self, fail=False, long_tmp=False):
        scratch = ROOT / ".lenslayer"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="launcher-regression-", dir=scratch) as temporary:
            workspace = Path(temporary) / ("long-checkout-" + "x" * 100)
            workspace.mkdir()
            owned = workspace / ".lenslayer"
            owned.mkdir()
            sentinel = owned / "preserve-unrelated-data"
            sentinel.write_text("synthetic sentinel")
            env = {"PATH": os.environ["PATH"], "LC_ALL": "C", "LANG": "C", "TZ": "UTC",
                   "LENSLAYER_SYNTHETIC_PROVIDER_KEY": "synthetic-never-use",
                   "LAUNCHER_PROBE_FAIL": "yes" if fail else "no"}
            preferred = Path(temporary) / ("long-temp-" + "t" * 100) if long_tmp else Path(tempfile.gettempdir())
            if long_tmp:
                preferred.mkdir()
            env["TMPDIR"] = str(preferred)
            try:
                reply = subprocess.run([sys.executable, "-c", DRIVER, str(LAUNCHER), str(workspace),
                    self.binaries["psql"], self.version], cwd=ROOT, env=env,
                    capture_output=True, text=True, timeout=40)
                self.assertEqual(reply.returncode, 0, reply.stderr)
                result = json.loads(reply.stdout.splitlines()[-1])
                self.assertNotIn("launcher_error", result, result)
                self.assertEqual(result["exit_code"], 1 if fail else 0, reply.stderr)
                self.assertEqual(len(result["records"]), 1, reply.stderr)
                record = result["records"][0]
                self.assertLessEqual(record["socket_bytes"], 103)
                self.assertGreater(len(os.fsencode(owned / "p12345678/.s.PGSQL.55487")), 103)
                self.assertEqual(result["shutdown"], [{"alive":False, "connected":False,
                    "socket_exists":False, "socket_directory_exists":False, "cluster_exists":False}])
                self.assertEqual(sentinel.read_text(), "synthetic sentinel")
                self.assertEqual(list(owned.iterdir()), [sentinel])
                if long_tmp:
                    self.assertEqual(list(preferred.iterdir()), [])
                print("LAUNCHER_PROOF " + json.dumps({"suite_failed":fail, "long_tmp":long_tmp,
                    "runtime":sys.version.split()[0], "version":self.version,
                    "old_socket_bytes":len(os.fsencode(owned / "p12345678/.s.PGSQL.55487")),
                    "socket_bytes":record["socket_bytes"], "shutdown":result["shutdown"]}))
            finally:
                # On a driver timeout, stop only a cluster inside this fixture's
                # uniquely owned directory before its TemporaryDirectory cleanup.
                for data in owned.glob("p*/data"):
                    if (data / "postmaster.pid").exists():
                        subprocess.run([self.binaries["pg_ctl"], "-D", str(data), "-m", "fast", "-w", "stop"],
                                       env={"PATH":os.environ["PATH"]}, capture_output=True, timeout=15, check=True)

    def test_long_checkout_and_long_temp_path_start_and_remove_private_socket(self):
        self.exercise(long_tmp=True)

    def test_suite_failure_still_stops_cluster_and_preserves_scratch_parent(self):
        self.exercise(fail=True)

    def test_configured_source_temp_root_keeps_live_sockets_out_of_source_tree(self):
        spec = importlib.util.spec_from_file_location("socket_allocator", LAUNCHER)
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        with patch.object(launcher.tempfile, "gettempdir", return_value=str(ROOT)):
            with launcher.private_socket_directory() as directory:
                allocated = Path(directory)
                self.assertFalse(allocated.resolve().is_relative_to(ROOT))
                self.assertEqual(allocated.stat().st_mode & 0o777, 0o700)
                self.assertLessEqual(len(os.fsencode(allocated / ".s.PGSQL.55487")), 103)
            self.assertFalse(allocated.exists())


if __name__ == "__main__":
    unittest.main()
