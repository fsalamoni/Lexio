"""Lexio Anamnesis — Multi-step wizard logic.

Orchestrates the two anamnesis layers:
- Layer 1 (base_profile): Professional profile + preferences (persisted, set once)
- Layer 2 (request_context): Per-request facts, parties, desired outcome

The wizard can be used in full (step-by-step) or quick (auto-extract) mode.
"""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from packages.modules.anamnesis.base_profile import (
    get_profile,
    create_or_update_profile,
    get_onboarding_steps,
    profile_to_context,
)
from packages.modules.anamnesis.request_context import (
    get_request_fields,
    build_enriched_request,
    auto_extract_context,
)

logger = logging.getLogger("lexio.anamnesis.wizard")


async def get_wizard_state(
    db: AsyncSession,
    user_id: str,
    document_type_id: str | None = None,
) -> dict[str, Any]:
    """Get the current wizard state for a user.

    Returns:
        {
            "onboarding_completed": bool,
            "onboarding_steps": [...],
            "profile": {...} or None,
            "request_fields": [...] (if document_type_id provided),
        }
    """
    profile = await get_profile(db, user_id)

    state = {
        "onboarding_completed": profile.onboarding_completed if profile else False,
        "onboarding_steps": get_onboarding_steps(),
        "profile": _profile_to_dict(profile) if profile else None,
    }

    if document_type_id:
        state["request_fields"] = get_request_fields(document_type_id)

    return state


async def complete_onboarding(
    db: AsyncSession,
    user_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Complete the onboarding wizard (Layer 1).

    Can be called step-by-step or all at once.
    """
    data["onboarding_completed"] = True
    profile = await create_or_update_profile(db, user_id, data)
    await db.commit()

    logger.info(f"Onboarding completed for user {user_id}")
    return _profile_to_dict(profile)


async def update_profile_partial(
    db: AsyncSession,
    user_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Partially update a user profile (e.g., saving a single step)."""
    profile = await create_or_update_profile(db, user_id, data)
    await db.flush()
    return _profile_to_dict(profile)


async def build_pipeline_context(
    db: AsyncSession,
    user_id: str,
    document_type_id: str,
    original_request: str,
    request_context: dict[str, Any] | None = None,
    auto_extract: bool = True,
) -> dict[str, Any]:
    """Build the complete pipeline context from both anamnesis layers.

    This is called when creating a new document. It combines:
    - Layer 1: User profile preferences → style instructions
    - Layer 2: Request context → enriched request
    - Auto-extraction: If no structured context provided, use LLM

    Returns context dict ready for pipeline injection.
    """
    # Layer 1: Profile
    profile = await get_profile(db, user_id)
    profile_ctx = profile_to_context(profile)

    # Layer 2: Request context
    if not request_context and auto_extract:
        # Auto-extract from free-form request
        logger.info(f"Auto-extracting request context for doc type '{document_type_id}'")
        request_context = await auto_extract_context(
            original_request, document_type_id
        )

    # Build enriched request
    enriched_request = build_enriched_request(
        original_request,
        request_context or {},
        document_type_id,
    )

    # Merge everything into pipeline context
    context = {
        **profile_ctx,
        "msgOriginal": original_request,
        "msgEnriquecida": enriched_request,
        "request_context": request_context or {},
        "org_name": profile.institution if profile else "",
        "user_title": profile.position if profile else "",
    }

    return context


def _profile_to_dict(profile) -> dict[str, Any]:
    """Convert UserProfile model to serializable dict."""
    if not profile:
        return {}

    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "institution": profile.institution,
        "position": profile.position,
        "jurisdiction": profile.jurisdiction,
        "experience_years": profile.experience_years,
        "primary_areas": profile.primary_areas,
        "specializations": profile.specializations,
        "formality_level": profile.formality_level,
        "connective_style": profile.connective_style,
        "citation_style": profile.citation_style,
        "preferred_expressions": profile.preferred_expressions,
        "avoided_expressions": profile.avoided_expressions,
        "paragraph_length": profile.paragraph_length,
        "default_document_type": profile.default_document_type,
        "default_template": profile.default_template,
        "signature_block": profile.signature_block,
        "header_text": profile.header_text,
        "preferred_model": profile.preferred_model,
        "detail_level": profile.detail_level,
        "argument_depth": profile.argument_depth,
        "include_opposing_view": profile.include_opposing_view,
        "onboarding_completed": profile.onboarding_completed,
    }
