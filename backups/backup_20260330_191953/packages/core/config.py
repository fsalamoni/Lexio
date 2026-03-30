"""Lexio Core — Configuration via pydantic-settings."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # LLM (OpenRouter)
    openrouter_api_key: str = Field(default="sk-or-v1-XXXXX")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1/chat/completions")
    model_triage: str = Field(default="anthropic/claude-3.5-haiku")
    model_main: str = Field(default="anthropic/claude-sonnet-4")

    # Qdrant
    qdrant_url: str = Field(default="http://qdrant:6333")
    qdrant_api_key: str = Field(default="")
    qdrant_collection: str = Field(default="acervo_juridico")
    qdrant_collections: str = Field(default="acervo_juridico,memoria_pessoal")

    # Ollama (embeddings)
    ollama_url: str = Field(default="http://ollama:11434")
    embed_model: str = Field(default="mxbai-embed-large")

    # PostgreSQL (must be set via DATABASE_URL env var)
    database_url: str = Field(default="postgresql+asyncpg://lexio:changeme@postgres:5432/lexio")

    # DataJud (CNJ)
    datajud_api_key: str = Field(default="cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==")
    datajud_url: str = Field(default="https://api-publica.datajud.cnj.jus.br/api_publica_tjrs/_search")

    # SearXNG
    searxng_url: str = Field(default="http://searxng:8080/search")

    # JWT Auth (must be overridden — these defaults are insecure, set via env vars in production)
    jwt_secret: str = Field(default="INSECURE-change-this-in-production")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expire_minutes: int = Field(default=1440)

    # App
    app_name: str = Field(default="Lexio")
    app_version: str = Field(default="1.0.0")
    secret_key: str = Field(default="INSECURE-change-this-in-production")
    cors_origins: str = Field(default="http://localhost:3000,http://localhost:5173")

    # Default Organization
    default_org_name: str = Field(default="Lexio Demo")
    default_org_slug: str = Field(default="lexio-demo")

    # Evolution API (WhatsApp)
    evolution_api_url: str = Field(default="http://evolution:8080")
    evolution_api_key: str = Field(default="")
    evolution_instance: str = Field(default="lexio")
    whatsapp_enabled: bool = Field(default=False)
    # Prefixo para iniciar conversa com o Lexio bot.
    # Mensagens sem prefixo de usuários sem sessão ativa são ignoradas.
    # Permite coexistir com outros bots no mesmo número (ex: bot que usa "!").
    whatsapp_prefix: str = Field(default="/lexio")

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
