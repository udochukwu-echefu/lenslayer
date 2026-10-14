"""Create/stop an isolated credential-free local PostgreSQL test cluster.

Never connect to an existing server, public schema, actual environment file or
credential. Requires ordinary initdb/pg_ctl/createdb binaries already on PATH.
Runs the new graph tests plus legacy agent/Calendar/wake and migration checks.
"""
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


def main():
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "createdb")}
    if not all(binaries.values()):
        print("SKIPPED: local PostgreSQL binaries are unavailable.")
        return 2
    # Short, ignored workspace-owned Unix socket path. Keeping the cluster under
    # .lenslayer also prevents unrelated source-fingerprint tests reading sockets.
    # Never remove this parent: it may contain other local disposable user data.
    scratch = ROOT / ".lenslayer"
    scratch.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="p", dir=scratch) as temporary:
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
            "-F -k " + shlex.quote(temporary) + " -h '' -p 55487", "-w", "start")
        try:
            run("createdb", "-h", temporary, "-p", "55487", "-U", "lenslayer_local_test", "--no-password", "lenslayer_agent_test")
            # Discard inherited provider environment without inspecting values.
            for name in list(os.environ):
                if name.startswith(("LENSLAYER_", "OPENAI_", "DEEPSEEK_", "GROQ_", "GOOGLE_", "AWS_", "RESEND_")):
                    del os.environ[name]
            os.environ["LENSLAYER_TEST_POSTGRES_ACK"] = "create_disposable_schema"
            os.environ["LENSLAYER_TEST_POSTGRES_URL"] = (
                "postgresql+psycopg://lenslayer_local_test@/lenslayer_agent_test?" + urlencode({
                    "host": temporary, "port": 55487, "passfile": str(home / "no-passfile")}))
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
