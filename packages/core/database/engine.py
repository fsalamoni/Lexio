"""Lexio Core — Async SQLAlchemy engine + session factory."""

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from packages.core.config import settings

_async_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_async_engine() -> AsyncEngine:
    return create_async_engine(
        settings.require_non_empty("database_url", "DATABASE_URL"),
        echo=False,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )


def _get_async_engine() -> AsyncEngine:
    global _async_engine, _async_session_factory

    if _async_engine is None:
        _async_engine = _build_async_engine()
        _async_session_factory = async_sessionmaker(
            _async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    return _async_engine


def _get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_session_factory

    if _async_session_factory is None:
        _get_async_engine()

    if _async_session_factory is None:
        raise RuntimeError("Async session factory could not be initialized.")

    return _async_session_factory


class _AsyncEngineProxy:
    def __getattr__(self, name: str):
        return getattr(_get_async_engine(), name)

    def begin(self):
        return _get_async_engine().begin()

    def connect(self):
        return _get_async_engine().connect()

    async def dispose(self) -> None:
        global _async_engine, _async_session_factory

        if _async_engine is None:
            return

        await _async_engine.dispose()
        _async_engine = None
        _async_session_factory = None


class _AsyncSessionProxy:
    def __call__(self, *args, **kwargs):
        return _get_async_session_factory()(*args, **kwargs)


async_engine = _AsyncEngineProxy()
async_session = _AsyncSessionProxy()
