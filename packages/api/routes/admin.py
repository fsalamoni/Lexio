"""Lexio API — Admin routes (module management, health, metrics, platform settings)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_admin, get_db
from packages.core.database.models.user import User
from packages.core.database.models.platform_setting import PlatformSetting
from packages.core.database.models.execution import Execution
from packages.core.database.models.document import Document
from packages.core.module_loader import module_registry, check_all_modules_health
from packages.core.config import settings

router = APIRouter()

# ── API key definitions visible to the admin UI ───────────────────────────────
# `auto_value`: value inserted automatically on first load (no user action needed)
# `guide`:      ordered list of step strings for the setup wizard
API_KEY_DEFS = [
    {
        "key": "openrouter_api_key",
        "label": "OpenRouter API Key",
        "description": "Chave para acesso aos modelos LLM (Claude Sonnet, GPT-4o, etc.) via OpenRouter.ai",
        "placeholder": "sk-or-v1-...",
        "link": "https://openrouter.ai/keys",
        "auto_value": None,
        "guide": [
            "Acesse https://openrouter.ai e crie uma conta gratuita.",
            "No menu lateral, clique em 'API Keys'.",
            "Clique em 'Create Key', dê um nome (ex: Lexio) e confirme.",
            "Copie a chave gerada — ela começa com sk-or-v1-.",
            "Cole aqui no campo abaixo e clique em 'Salvar'.",
            "Opcional: em 'Credits', adicione créditos para consumo dos modelos.",
        ],
    },
    {
        "key": "evolution_api_key",
        "label": "Evolution API Key",
        "description": "Chave para integração WhatsApp via Evolution API (bot conversacional)",
        "placeholder": "Sua chave de API da Evolution",
        "link": "https://doc.evolution-api.com",
        "auto_value": None,
        "guide": [
            "Instale a Evolution API no servidor: docker run atendai/evolution-api:latest",
            "Acesse o painel da Evolution API (porta 8080 por padrão).",
            "Vá em 'Instances' → clique em 'New Instance' → nomeie como 'lexio'.",
            "Na instância criada, copie o campo 'API Key' exibido.",
            "Cole aqui e clique em 'Salvar'.",
            "No arquivo .env, defina EVOLUTION_API_URL com a URL do servidor e WHATSAPP_ENABLED=true.",
            "Conecte o WhatsApp: na instância, clique em 'Connect' e escaneie o QR Code com o celular.",
            "Configure o webhook da instância para: http://seu-backend:8000/webhook/evolution",
        ],
    },
    {
        "key": "datajud_api_key",
        "label": "DataJud API Key (CNJ)",
        "description": "Chave para consulta de jurisprudência via DataJud — API Pública do CNJ",
        "placeholder": "cDZH...",
        "link": "https://datajud-wiki.cnj.jus.br",
        "auto_value": "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==",
        "guide": [
            "Esta chave já vem pré-configurada com a chave pública padrão do CNJ.",
            "A chave pública é atualizada periodicamente pelo CNJ.",
            "Se a consulta parar de funcionar, acesse https://datajud-wiki.cnj.jus.br/api-publica/ para obter a chave atualizada.",
            "O sistema tenta automaticamente a chave pública padrão se a configurada falhar.",
            "Para chave personalizada, acesse https://datajud-wiki.cnj.jus.br e solicite acesso.",
        ],
    },
]


def _mask(value: str | None) -> str | None:
    """Return a masked version of a secret value for display."""
    if not value or len(value) < 6:
        return None
    if len(value) <= 12:
        return value[:4] + "••••"
    return value[:6] + "•" * (len(value) - 10) + value[-4:]


# ── Module management ─────────────────────────────────────────────────────────

@router.get("/modules")
async def list_modules(admin: User = Depends(get_current_admin)):
    modules = module_registry.list_all()
    return [
        {
            "id": m.manifest.get("id", m.name),
            "name": m.name,
            "type": m.type,
            "version": m.version,
            "is_enabled": m.is_enabled,
            "is_healthy": m.is_healthy,
            "error": m.error,
            "description": m.description,
        }
        for m in modules
    ]


@router.get("/modules/health")
async def modules_health(admin: User = Depends(get_current_admin)):
    return await check_all_modules_health()


@router.post("/modules/{module_id}/toggle")
async def toggle_module(module_id: str, admin: User = Depends(get_current_admin)):
    mod = module_registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Módulo '{module_id}' não encontrado")
    new_state = not mod.is_enabled
    module_registry.set_enabled(module_id, new_state)
    return {"module_id": module_id, "is_enabled": new_state}


@router.post("/test-module/{module_id}")
async def test_module(module_id: str, admin: User = Depends(get_current_admin)):
    mod = module_registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Módulo '{module_id}' não encontrado")
    result = {
        "module_id": module_id,
        "name": mod.name,
        "type": mod.type,
        "manifest_valid": bool(mod.manifest),
        "instance_loaded": mod.instance is not None,
        "has_health_check": hasattr(mod.instance, "health_check") if mod.instance else False,
    }
    if mod.instance and hasattr(mod.instance, "health_check"):
        try:
            health = await mod.instance.health_check()
            result["health_check"] = health
        except Exception as e:
            result["health_check"] = {"error": str(e)}
    return result


# ── Platform settings (API keys) ──────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return platform settings with masked values and step-by-step guides."""
    # Load stored values
    result = await db.execute(select(PlatformSetting))
    stored: dict[str, str | None] = {row.key: row.value for row in result.scalars().all()}

    items = []
    for defn in API_KEY_DEFS:
        key = defn["key"]
        auto_value = defn.get("auto_value")

        # Auto-insert keys that have a known public value and aren't set yet
        if auto_value and key not in stored:
            row = PlatformSetting(key=key, value=auto_value)
            db.add(row)
            stored[key] = auto_value
            if hasattr(settings, key):
                object.__setattr__(settings, key, auto_value)

        db_value = stored.get(key)
        env_value = getattr(settings, key, None) or None
        active_value = db_value or env_value
        source = "banco" if db_value else ("env" if env_value else "não configurado")

        items.append({
            "key": key,
            "label": defn["label"],
            "description": defn["description"],
            "placeholder": defn["placeholder"],
            "link": defn["link"],
            "guide": defn.get("guide", []),
            "is_auto": bool(auto_value),
            "is_set": bool(active_value),
            "masked_value": _mask(active_value),
            "source": source,
        })

    await db.commit()
    return {"settings": items}


class SettingsPatch(BaseModel):
    updates: dict[str, str]


@router.patch("/settings")
async def update_settings(
    body: SettingsPatch,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update platform settings, persist to DB and apply immediately."""
    allowed_keys = {d["key"] for d in API_KEY_DEFS}
    invalid = set(body.updates.keys()) - allowed_keys
    if invalid:
        raise HTTPException(400, f"Chaves inválidas: {', '.join(invalid)}")

    updated = []
    for key, value in body.updates.items():
        clean = value.strip()

        result = await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = clean or None
        else:
            row = PlatformSetting(key=key, value=clean or None)
            db.add(row)

        # Apply immediately — no restart needed
        if clean and hasattr(settings, key):
            object.__setattr__(settings, key, clean)

        updated.append(key)

    await db.commit()
    return {"updated": updated, "message": "Configurações salvas e aplicadas com sucesso."}


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users in the admin's organization."""
    result = await db.execute(
        select(User)
        .where(User.organization_id == admin.organization_id)
        .order_by(User.created_at.asc())
    )
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "title": u.title,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


class UserPatch(BaseModel):
    role: str | None = None       # "admin" | "user" | "viewer"
    is_active: bool | None = None


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserPatch,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user role or active status. Admin cannot modify themselves."""
    import uuid as _uuid
    result = await db.execute(
        select(User).where(
            User.id == _uuid.UUID(user_id),
            User.organization_id == admin.organization_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if target.id == admin.id:
        raise HTTPException(400, "Não é possível alterar sua própria conta")
    if body.role is not None:
        if body.role not in ("admin", "user", "viewer"):
            raise HTTPException(400, "Role inválido. Use: admin, user, viewer")
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    await db.commit()
    return {
        "id": str(target.id),
        "role": target.role,
        "is_active": target.is_active,
        "message": "Usuário atualizado com sucesso",
    }


@router.get("/pipeline-logs")
async def pipeline_logs(
    limit: int = Query(30, ge=1, le=100),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return recent pipeline execution logs for the organization."""
    result = await db.execute(
        select(Execution, Document.document_type_id, Document.tema, Document.status)
        .join(Document, Execution.document_id == Document.id)
        .where(Execution.organization_id == admin.organization_id)
        .order_by(desc(Execution.created_at))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": str(e.id),
            "document_id": str(e.document_id),
            "document_type": doc_type,
            "tema": tema,
            "doc_status": doc_status,
            "agent_name": e.agent_name,
            "phase": e.phase,
            "model": e.model,
            "tokens_in": e.tokens_in,
            "tokens_out": e.tokens_out,
            "cost_usd": e.cost_usd,
            "duration_ms": e.duration_ms,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e, doc_type, tema, doc_status in rows
    ]


@router.post("/reindex")
async def reindex_documents(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-index all completed org documents into Qdrant (lexio_documents collection)."""
    """Re-index all completed org documents into Qdrant (memoria_pessoal collection)."""
    import logging as _logging
    from packages.core.search.indexer import index_document

    _log = _logging.getLogger("lexio.api.admin")

    result = await db.execute(
        select(Document).where(
            Document.organization_id == admin.organization_id,
            Document.texto_completo.isnot(None),
            Document.status.in_(["concluido", "aprovado"]),
        )
    )
    docs = result.scalars().all()

    indexed = 0
    total_chunks = 0
    errors: list[str] = []

    for doc in docs:
        try:
            chunks = await index_document(
                content=doc.texto_completo.encode("utf-8"),
                content_type="text/plain",
                filename=f"{doc.document_type_id}_{str(doc.id)[:8]}.txt",
                organization_id=str(admin.organization_id),
                document_id=str(doc.id),
                collection="lexio_documents",
            )
            total_chunks += chunks
            indexed += 1
        except Exception as exc:
            errors.append(str(doc.id))
            _log.warning(f"Reindex failed for {doc.id}: {exc}")

    return {
        "indexed_documents": indexed,
        "total_documents": len(docs),
        "total_chunks": total_chunks,
        "errors": len(errors),
        "message": f"{indexed}/{len(docs)} documentos reindexados ({total_chunks} chunks)",
    }


async def load_settings_from_db(db: AsyncSession) -> None:
    """Called at startup to override env settings with DB-stored values."""
    try:
        result = await db.execute(select(PlatformSetting))
        for row in result.scalars().all():
            if row.value and hasattr(settings, row.key):
                object.__setattr__(settings, row.key, row.value)
    except Exception:
        pass
