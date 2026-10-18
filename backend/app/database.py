from __future__ import annotations

from collections.abc import Generator
import hashlib

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import Settings


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, settings: Settings):
        kwargs: dict[str, object] = {"pool_pre_ping": True}
        if settings.database_url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        self.engine: Engine = create_engine(settings.database_url, **kwargs)
        if self.engine.dialect.name == "sqlite":
            @event.listens_for(self.engine, "connect")
            def sqlite_fingerprint(connection, _record):
                connection.create_function("ll_sha256", 1, lambda value: hashlib.sha256((value or "").encode()).hexdigest(), deterministic=True)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def create_schema(self) -> None:
        from . import models  # noqa: F401
        from . import agent_models  # noqa: F401
        from . import connector_models  # noqa: F401
        from . import hosted_agent_models  # noqa: F401
        from . import agent_generalization_models  # noqa: F401

        Base.metadata.create_all(self.engine)

    def session(self) -> Generator[Session, None, None]:
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()
