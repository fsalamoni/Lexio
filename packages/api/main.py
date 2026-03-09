"""Lexio API Gateway — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from packages.core.config import settings
from packages.core.database.engine import async_engine, async_session
from packages.core.database.base import Base
from packages.core.module_loader import discover_and_load_modules, module_registry
from packages.core.websocket import progress_manager

from packages.api.routes import auth, documents, document_types, legal_areas, uploads, stats, health, webhooks, admin, anamnesis, thesis_bank

# Ensure models are imported for table creation
from packages.core.database.models.user_profile import UserProfile  # noqa: F401
from packages.core.database.models.thesis import Thesis  # noqa: F401
from packages.core.database.models.whatsapp_session import WhatsAppSession  # noqa: F401
from packages.core.database.models.platform_setting import PlatformSetting  # noqa: F401

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("lexio.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    # Create tables
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified")

    # Load admin-managed API keys from DB (override env values)
    from packages.api.routes.admin import load_settings_from_db
    async with async_session() as _db:
        await load_settings_from_db(_db)
    logger.info("Platform settings loaded from DB")

    # Load modules
    await discover_and_load_modules()
    logger.info(
        f"Modules loaded: {module_registry.healthy_count}/{module_registry.total_count} healthy"
    )

    # Initialize WhatsApp bot module (registers event listeners)
    from packages.modules.whatsapp_bot import create_module as create_whatsapp_bot
    whatsapp_bot = create_whatsapp_bot()
    await whatsapp_bot.initialize()

    yield

    # Shutdown
    await async_engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Lexio — SaaS de produção jurídica com IA",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(document_types.router, prefix="/api/v1/document-types", tags=["Document Types"])
app.include_router(legal_areas.router, prefix="/api/v1/legal-areas", tags=["Legal Areas"])
app.include_router(uploads.router, prefix="/api/v1/uploads", tags=["Uploads"])
app.include_router(stats.router, prefix="/api/v1/stats", tags=["Stats"])
app.include_router(webhooks.router, prefix="/webhook", tags=["Webhooks"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(anamnesis.router, prefix="/api/v1", tags=["Anamnesis"])
app.include_router(thesis_bank.router, prefix="/api/v1/theses", tags=["Thesis Bank"])


# WebSocket for pipeline progress
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/document/{document_id}")
async def ws_document_progress(ws: WebSocket, document_id: str):
    await progress_manager.connect(document_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        progress_manager.disconnect(document_id, ws)


# DOCX download
@app.get("/api/v1/documents/{document_id}/download")
async def download_docx(document_id: str):
    from sqlalchemy import select
    from packages.core.database.models.document import Document
    import uuid

    async with async_session() as db:
        stmt = select(Document).where(Document.id == uuid.UUID(document_id))
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()

    if not doc or not doc.docx_path:
        from fastapi import HTTPException
        raise HTTPException(404, "DOCX not found")

    from pathlib import Path
    path = Path(doc.docx_path)
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(404, "DOCX file not found on disk")

    return FileResponse(
        str(path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.name,
    )
