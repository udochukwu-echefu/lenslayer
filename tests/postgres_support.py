"""Opt-in LOCAL database + UUID disposable schema only, never public schema."""
import os
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def postgres_enabled():
    return os.environ.get("LENSLAYER_TEST_POSTGRES_ACK") == "create_disposable_schema" and bool(os.environ.get("LENSLAYER_TEST_POSTGRES_URL"))


class DisposablePostgres:
    def __init__(self):
        if not postgres_enabled():
            raise RuntimeError("Explicit disposable PostgreSQL opt-in is required.")
        url = make_url(os.environ["LENSLAYER_TEST_POSTGRES_URL"])
        host = url.query.get("host", url.host or "")
        if (url.drivername != "postgresql+psycopg" or url.password or
                not (host in {"localhost", "127.0.0.1", "::1"} or str(host).startswith("/")) or
                url.database not in {"lenslayer_agent_test", "lenslayer_disposable_test", "lenslayer_test"} or
                "options" in url.query):
            raise RuntimeError("Refusing nonlocal/credentialed/unrecognized test database or caller search_path options.")
        self.admin = create_engine(url, pool_pre_ping=True)
        self.schema = "ll_agent_test_" + uuid4().hex
        with self.admin.begin() as connection:
            if connection.scalar(text("select current_database()")) != url.database:
                raise RuntimeError("Database identity did not match the allowlist.")
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.url = url.update_query_dict({"options": f"-csearch_path={self.schema}"}).render_as_string(hide_password=False)
        self.engine = create_engine(self.url, pool_pre_ping=True)
        with self.engine.connect() as connection:
            if connection.scalar(text("select current_schema()")) != self.schema:
                self.close()
                raise RuntimeError("Test schema isolation failed.")

    def close(self):
        self.engine.dispose()
        with self.admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.admin.dispose()
