"""Lexio API — Anamnesis routes (onboarding + request context)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any

from packages.core.auth.dependencies import get_current_user
from packages.core.database.engine import async_session
from packages.modules.anamnesis.wizard import (
    get_wizard_state,
    complete_onboarding,
    update_profile_partial,
    build_pipeline_context,
)
from packages.modules.anamnesis.request_context import get_request_fields

router = APIRouter(prefix="/anamnesis", tags=["anamnesis"])


class OnboardingData(BaseModel):
    institution: str | None = None
    position: str | None = None
    jurisdiction: str | None = None
    experience_years: int | None = None
    primary_areas: list[str] | None = None
    specializations: list[str] | None = None
    formality_level: str | None = None
    connective_style: str | None = None
    citation_style: str | None = None
    preferred_expressions: list[str] | None = None
    avoided_expressions: list[str] | None = None
    paragraph_length: str | None = None
    default_document_type: str | None = None
    default_template: str | None = None
    signature_block: str | None = None
    header_text: str | None = None
    preferred_model: str | None = None
    detail_level: str | None = None
    argument_depth: str | None = None
    include_opposing_view: bool | None = None


class RequestContextInput(BaseModel):
    document_type_id: str
    original_request: str
    request_context: dict[str, Any] | None = None
    auto_extract: bool = True


@router.get("/wizard")
async def get_wizard(
    document_type_id: str | None = None,
    user=Depends(get_current_user),
):
    """Get wizard state — onboarding steps + profile + request fields."""
    async with async_session() as db:
        state = await get_wizard_state(db, str(user.id), document_type_id)
    return state


@router.get("/profile")
async def get_profile(user=Depends(get_current_user)):
    """Get current user profile."""
    async with async_session() as db:
        state = await get_wizard_state(db, str(user.id))
    return state.get("profile") or {}


@router.post("/onboarding")
async def submit_onboarding(
    data: OnboardingData,
    user=Depends(get_current_user),
):
    """Complete onboarding wizard (Layer 1)."""
    async with async_session() as db:
        profile = await complete_onboarding(
            db, str(user.id), data.model_dump(exclude_none=True),
        )
    return {"status": "ok", "profile": profile}


@router.patch("/profile")
async def update_profile(
    data: OnboardingData,
    user=Depends(get_current_user),
):
    """Partially update user profile."""
    async with async_session() as db:
        profile = await update_profile_partial(
            db, str(user.id), data.model_dump(exclude_none=True),
        )
        await db.commit()
    return {"status": "ok", "profile": profile}


@router.get("/request-fields/{document_type_id}")
async def get_fields(document_type_id: str):
    """Get request context fields for a document type."""
    fields = get_request_fields(document_type_id)
    return {"document_type_id": document_type_id, "fields": fields}


@router.post("/build-context")
async def build_context(
    data: RequestContextInput,
    user=Depends(get_current_user),
):
    """Build complete pipeline context from both anamnesis layers.

    Used by the document creation flow to enrich the request.
    """
    async with async_session() as db:
        context = await build_pipeline_context(
            db,
            str(user.id),
            data.document_type_id,
            data.original_request,
            data.request_context,
            data.auto_extract,
        )
    return {"context": context}
