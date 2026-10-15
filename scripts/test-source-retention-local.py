"""Focused retention tests with no dotenv, external target or network effects."""
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
            raise AssertionError("Retention tests forbid network effects")
        return original_connect(sock, address)
    socket.socket.connect = local_connect
    socket.getaddrinfo = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("DNS forbidden"))
    if sys.argv[1:] == ["--postgres"]:
        spec = importlib.util.spec_from_file_location("retention_pg", ROOT / "scripts/test-agent-generalization-postgres-local.py")
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        sys.argv = [sys.argv[0], "tests.test_source_retention.PostgresRetentionTests"]
        return launcher.main()
    if sys.argv[1:]:
        raise SystemExit("Only --postgres is supported; never an external database URL")
    suite = unittest.TestLoader().loadTestsFromNames(["tests.test_source_retention.SQLiteRetentionTests",
        "tests.test_legacy_compatibility", "tests.test_production_integrations.ResendOutboxTests"])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
