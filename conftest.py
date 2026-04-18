"""Root conftest.py — Stubs unavailable packages so tests run offline.

When running inside Docker (the normal case), all packages are installed and
this file has no effect. When running on the host without a venv, this lets
pytest collect and run tests that exercise pure-Python logic.
"""

import sys
import types
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# Stub module factory
# ---------------------------------------------------------------------------

def _make_stub(name: str) -> types.ModuleType:
    """
    Create a stub module that:
    - Has proper module identity (types.ModuleType so parent/child linking works)
    - Returns MagicMock for any attribute access (so 'from x import y' works)
    - Can be used as a base class (via __mro_entries__ returning (object,))
    """
    m = types.ModuleType(name)
    m.__package__ = name
    m.__path__ = []          # treat as package
    m.__spec__ = None  # type: ignore
    m.__file__ = None  # type: ignore

    # Allow any attribute to be imported from this module
    def _getattr(attr: str):
        mock = MagicMock(name=f"{name}.{attr}")
        # Make mock usable as a base class
        mock.__mro_entries__ = lambda bases: (object,)
        setattr(m, attr, mock)
        return mock

    m.__getattr__ = _getattr  # type: ignore
    return m


def _stub_package(top: str, *subs: str):
    """
    Register stubs for `top` and all `subs` if the real top-level package
    is not installed. Also wire parent.child attributes.
    """
    try:
        __import__(top)
        return  # real package installed — skip
    except ImportError:
        pass

    all_names = [top] + [f"{top}.{s}" for s in subs]
    for name in all_names:
        if name not in sys.modules:
            sys.modules[name] = _make_stub(name)

    # Wire parent → child attributes so `import x.y.z` works
    for name in all_names:
        parts = name.split(".")
        if len(parts) > 1:
            parent = sys.modules.get(".".join(parts[:-1]))
            if parent is not None:
                setattr(parent, parts[-1], sys.modules[name])


# ---------------------------------------------------------------------------
# SQLAlchemy (most imports come from here)
# ---------------------------------------------------------------------------
_stub_package(
    "sqlalchemy",
    "ext", "ext.asyncio",
    "orm", "orm.decl_api",
    "dialects", "dialects.postgresql",
    "sql", "sql.sqltypes",
    "future", "pool",
)

# ---------------------------------------------------------------------------
# pydantic + pydantic_settings
# ---------------------------------------------------------------------------
_stub_package("pydantic", "fields", "v1")
_stub_package("pydantic_settings")

# pydantic_settings.BaseSettings must be a real class so `class Settings(BaseSettings)` works
try:
    from pydantic_settings import BaseSettings  # noqa: F401
except (ImportError, Exception):
    class _BaseSettings:
        model_config: dict = {}
        def __init__(self, **kwargs): pass
        def __init_subclass__(cls, **kwargs): super().__init_subclass__(**kwargs)

    _ps = sys.modules.get("pydantic_settings")
    if _ps is not None:
        _ps.BaseSettings = _BaseSettings  # type: ignore

# pydantic.Field
try:
    from pydantic import Field  # noqa: F401
except (ImportError, Exception):
    _pd = sys.modules.get("pydantic")
    if _pd is not None:
        _pd.Field = lambda *a, **kw: None  # type: ignore

# pydantic.BaseModel
try:
    from pydantic import BaseModel  # noqa: F401
except (ImportError, Exception):
    _pd = sys.modules.get("pydantic")
    if _pd is not None:
        class _BaseModel:
            def __init__(self, **kw): pass
            def __init_subclass__(cls, **kw): super().__init_subclass__(**kw)
        _pd.BaseModel = _BaseModel  # type: ignore

# ---------------------------------------------------------------------------
# FastAPI / Starlette
# ---------------------------------------------------------------------------
_stub_package(
    "fastapi",
    "middleware", "middleware.cors",
    "responses", "staticfiles", "security",
    "exceptions", "routing",
)
_stub_package("starlette", "middleware", "requests", "routing", "responses")
_stub_package("uvicorn")
_stub_package("websockets")

# ---------------------------------------------------------------------------
# Other deps
# ---------------------------------------------------------------------------
_stub_package("asyncpg")
_stub_package("httpx")
_stub_package("bcrypt")
_stub_package("pypdf")
_stub_package("docx", "shared", "styles", "oxml", "enum", "enum.text", "text")
_stub_package("slowapi", "util", "errors", "middleware")

# ---------------------------------------------------------------------------
# PyJWT — available in system pip on the current machine; stub only if missing
# ---------------------------------------------------------------------------
try:
    import jwt  # noqa: F401
except ImportError:
    _jwt_mod = _make_stub("jwt")
    _jwt_mod.encode = lambda payload, key, algorithm=None: "stub.jwt.token"  # type: ignore
    _jwt_mod.decode = lambda token, key, algorithms=None: {  # type: ignore
        "sub": "00000000-0000-0000-0000-000000000002",
        "org": "00000000-0000-0000-0000-000000000001",
        "role": "admin",
        "exp": 9_999_999_999,
    }
    _jwt_mod.ExpiredSignatureError = Exception
    _jwt_mod.InvalidTokenError = Exception
    sys.modules["jwt"] = _jwt_mod

# ---------------------------------------------------------------------------
# packages.core.config — stub settings object so modules that do
# `from packages.core.config import settings` get a usable object
# even without pydantic-settings or a .env file.
# ---------------------------------------------------------------------------
try:
    import packages.core.config  # noqa: F401
except Exception:
    cfg = types.ModuleType("packages.core.config")

    class _Settings:  # minimal stand-in
        app_name = "Lexio"
        app_version = "1.0.0"
        jwt_secret = "test-secret-key-for-offline-tests"
        jwt_algorithm = "HS256"
        jwt_expire_minutes = 1440
        default_org_slug = "lexio-demo"
        default_org_name = "Lexio Demo"
        cors_origins = "http://localhost:3000"
        openrouter_api_key = "sk-or-v1-TEST"
        openrouter_base_url = "https://openrouter.ai/api/v1/chat/completions"
        model_triage = "anthropic/claude-3.5-haiku"
        model_main = "anthropic/claude-sonnet-4"
        qdrant_url = "http://localhost:6333"
        qdrant_api_key = "test"
        ollama_url = "http://localhost:11434"
        embed_model = "mxbai-embed-large"
        database_url = "sqlite+aiosqlite:///test.db"
        datajud_api_key = "test"
        datajud_url = "http://localhost"
        searxng_url = "http://localhost/search"
        secret_key = "test"
        evolution_api_url = "http://localhost:8080"
        evolution_api_key = ""
        evolution_instance = "test"
        whatsapp_enabled = False
        whatsapp_prefix = "/lexio"

    cfg.settings = _Settings()  # type: ignore
    cfg.Settings = _Settings  # type: ignore

    # Register in sys.modules under every expected path
    for _key in ("packages.core.config",):
        sys.modules[_key] = cfg
