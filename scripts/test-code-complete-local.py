"""Combined reviewed release/lineage/legacy/retention tests, synthetic-only.

Uses installed private dependencies. No dotenv, inherited product settings,
DNS/TCP provider effects, existing-server target or cloud call. --postgres creates
and stops only the existing launcher's own temporary local cluster.
"""
import importlib.util
from pathlib import Path
import socket
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    from backend.app.config import Settings
    Settings.model_config["env_file"] = None
    Settings.settings_customise_sources = classmethod(lambda cls, settings_cls, init_settings, **kwargs: (init_settings,))
    original_connect = socket.socket.connect

    def local_connect(sock, address):
        if sock.family != socket.AF_UNIX:
            raise AssertionError("Combined tests forbid DNS/TCP/provider effects")
        return original_connect(sock, address)

    socket.socket.connect = local_connect
    socket.getaddrinfo = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("DNS forbidden"))
    if sys.argv[1:] == ["--postgres"]:
        spec = importlib.util.spec_from_file_location("complete_pg_launcher", ROOT / "scripts/test-agent-generalization-postgres-local.py")
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        sys.argv = [sys.argv[0], "tests.test_migration_lineage.PostgresLineageTests",
                    "tests.test_platform_migrations.PostgresPlatformMigrationTests",
                    "tests.test_source_retention.PostgresRetentionTests"]
        return launcher.main()
    if sys.argv[1:]:
        raise SystemExit("Only --postgres is supported; no external database target")
    names = ["tests.test_migration_lineage.SQLiteLineageTests", "tests.test_migration_lineage.HistoricalIdentityTests",
             "tests.test_legacy_compatibility", "tests.test_source_retention.SQLiteRetentionTests",
             "tests.test_production_release", "tests.test_worker_deployment", "tests.test_model_session_migration",
             "tests.test_platform_migrations.SQLitePlatformMigrationTests", "tests.test_production_integrations.ResendOutboxTests"]
    suite = unittest.TestLoader().loadTestsFromNames(names)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
