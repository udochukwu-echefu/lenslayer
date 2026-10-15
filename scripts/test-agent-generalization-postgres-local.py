"""Create/stop an isolated credential-free local PostgreSQL test cluster.

Never connect to an existing server, public schema, actual environment file or
credential. Requires ordinary initdb/pg_ctl/createdb binaries already on PATH.
Runs the new graph tests plus legacy agent/Calendar/wake and migration checks.
"""
from contextlib import contextmanager
from pathlib import Path
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@contextmanager
def private_socket_directory():
    # macOS permits at most 103 pathname bytes (Linux permits more). Check the
    # actual encoded socket name, not character count or an assumed temp suffix.
    # Prefer the normal temp root, but a long TMPDIR must not break local tests.
    for parent in dict.fromkeys((tempfile.gettempdir(), "/tmp")):
        # Even an explicitly configured TMPDIR must not put live sockets where
        # repository source-fingerprint checks could try to read them.
        if Path(parent).resolve().is_relative_to(ROOT):
            continue
        with tempfile.TemporaryDirectory(prefix="llpg-", dir=parent) as directory:
            if len(os.fsencode(Path(directory) / ".s.PGSQL.55487")) > 103:
                continue
            yield directory
            return
    raise RuntimeError("No sufficiently short private Unix socket directory is available.")


def main():
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "createdb")}
    if not all(binaries.values()):
        print("SKIPPED: local PostgreSQL binaries are unavailable.")
        return 2
    # Keep data/logs in ignored workspace-owned scratch, but socket paths must
    # not inherit the checkout's length. TemporaryDirectory creates mode 0700.
    # Never remove this parent: it may contain other local disposable user data.
    scratch = ROOT / ".lenslayer"
    scratch.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="p", dir=scratch) as temporary, private_socket_directory() as sockets:
        home = Path(temporary)
        data = home / "data"
        env = {"PATH": "/opt/homebrew/bin:/usr/bin:/bin", "LC_ALL": "C", "LANG": "C", "TZ": "UTC",
               "PGPASSFILE": str(home / "no-passfile"), "PGSERVICEFILE": str(home / "no-servicefile")}

        def run(name, *args):
            reply = subprocess.run([binaries[name], *args], cwd=ROOT, env=env,
                capture_output=True, text=True, timeout=60)
            if reply.returncode:
                log = home / "server.log"
                diagnostic = log.read_text() if name == "pg_ctl" and log.exists() else ""
                raise RuntimeError(name + " failed: " + reply.stderr + diagnostic)

        run("initdb", "--pgdata", str(data), "--username", "lenslayer_local_test",
            "--auth-local", "trust", "--auth-host", "reject", "--encoding", "UTF8", "--no-locale")
        run("pg_ctl", "-D", str(data), "-l", str(home / "server.log"), "-o",
            "-F -k " + shlex.quote(sockets) + " -h '' -p 55487", "-w", "start")
        try:
            run("createdb", "-h", sockets, "-p", "55487", "-U", "lenslayer_local_test", "--no-password", "lenslayer_agent_test")
            # Discard inherited provider environment without inspecting values.
            for name in list(os.environ):
                if name.startswith(("LENSLAYER_", "OPENAI_", "DEEPSEEK_", "GROQ_", "GOOGLE_", "AWS_", "RESEND_")):
                    del os.environ[name]
            os.environ["LENSLAYER_TEST_POSTGRES_ACK"] = "create_disposable_schema"
            os.environ["LENSLAYER_TEST_POSTGRES_URL"] = (
                "postgresql+psycopg://lenslayer_local_test@/lenslayer_agent_test?" + urlencode({
                    "host": sockets, "port": 55487, "passfile": str(home / "no-passfile")}))
            os.environ["LENSLAYER_SANDBOX_GOOGLE_ACK"] = "disabled"
            os.environ["PGPASSFILE"] = env["PGPASSFILE"]
            os.environ["PGSERVICEFILE"] = env["PGSERVICEFILE"]
            import dotenv
            dotenv.load_dotenv = lambda *args, **kwargs: False
            from backend.app.config import Settings
            Settings.model_config["env_file"] = None
            modules = sys.argv[1:] or ["tests.test_agent_generalization_postgres", "tests.test_agent_postgres",
                "tests.test_platform_migrations.PostgresPlatformMigrationTests"]
            suite = unittest.TestLoader().loadTestsFromNames(modules)
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            return 0 if result.wasSuccessful() else 1
        finally:
            run("pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop")


if __name__ == "__main__":
    sys.exit(main())
