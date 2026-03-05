"""Lexio Anamnesis — Layer 1: Professional Profile.

Handles user onboarding — collecting professional background, writing
preferences, and default settings that persist across all document
generation requests.
"""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.database.models.user_profile import UserProfile

logger = logging.getLogger("lexio.anamnesis.profile")


# Onboarding wizard steps
ONBOARDING_STEPS = [
    {
        "step": 1,
        "title": "Perfil Profissional",
        "description": "Informações sobre sua atuação profissional",
        "fields": [
            {"key": "institution", "label": "Instituição", "type": "text", "placeholder": "Ex: Ministério Público do Estado do RS", "required": False},
            {"key": "position", "label": "Cargo/Função", "type": "text", "placeholder": "Ex: Promotor de Justiça", "required": False},
            {"key": "jurisdiction", "label": "Jurisdição/Comarca", "type": "text", "placeholder": "Ex: Comarca de Porto Alegre", "required": False},
            {"key": "experience_years", "label": "Anos de experiência", "type": "number", "required": False},
        ],
    },
    {
        "step": 2,
        "title": "Áreas de Atuação",
        "description": "Selecione suas áreas de atuação e especialidades",
        "fields": [
            {"key": "primary_areas", "label": "Áreas principais", "type": "multiselect",
             "options": [
                 {"value": "administrative", "label": "Direito Administrativo"},
                 {"value": "constitutional", "label": "Direito Constitucional"},
                 {"value": "civil", "label": "Direito Civil"},
                 {"value": "tax", "label": "Direito Tributário"},
                 {"value": "labor", "label": "Direito do Trabalho"},
             ], "required": False},
            {"key": "specializations", "label": "Especializações", "type": "tags", "placeholder": "Digite e pressione Enter", "required": False},
        ],
    },
    {
        "step": 3,
        "title": "Preferências de Redação",
        "description": "Como você prefere que seus documentos sejam redigidos",
        "fields": [
            {"key": "formality_level", "label": "Nível de formalidade", "type": "select",
             "options": [
                 {"value": "formal", "label": "Formal (linguagem jurídica clássica)"},
                 {"value": "semiformal", "label": "Semiformal (claro e objetivo, sem excesso)"},
             ], "required": False},
            {"key": "connective_style", "label": "Estilo de conectivos", "type": "select",
             "options": [
                 {"value": "classico", "label": "Clássico (destarte, outrossim, mormente)"},
                 {"value": "moderno", "label": "Moderno (portanto, além disso, especialmente)"},
             ], "required": False},
            {"key": "paragraph_length", "label": "Tamanho dos parágrafos", "type": "select",
             "options": [
                 {"value": "curto", "label": "Curto (3-5 linhas)"},
                 {"value": "medio", "label": "Médio (5-10 linhas)"},
                 {"value": "longo", "label": "Longo (10+ linhas)"},
             ], "required": False},
            {"key": "citation_style", "label": "Estilo de citações", "type": "select",
             "options": [
                 {"value": "inline", "label": "Inline (no corpo do texto)"},
                 {"value": "footnote", "label": "Notas de rodapé"},
                 {"value": "abnt", "label": "ABNT"},
             ], "required": False},
        ],
    },
    {
        "step": 4,
        "title": "Preferências de IA",
        "description": "Configure como a IA deve trabalhar para você",
        "fields": [
            {"key": "detail_level", "label": "Nível de detalhamento", "type": "select",
             "options": [
                 {"value": "conciso", "label": "Conciso (direto ao ponto)"},
                 {"value": "detalhado", "label": "Detalhado (análise completa)"},
                 {"value": "exaustivo", "label": "Exaustivo (todas as possibilidades)"},
             ], "required": False},
            {"key": "argument_depth", "label": "Profundidade argumentativa", "type": "select",
             "options": [
                 {"value": "superficial", "label": "Superficial (principais argumentos)"},
                 {"value": "moderado", "label": "Moderado (argumentos e contra-argumentos)"},
                 {"value": "profundo", "label": "Profundo (análise exaustiva com múltiplas perspectivas)"},
             ], "required": False},
            {"key": "include_opposing_view", "label": "Incluir visão contrária", "type": "boolean", "default": True, "required": False},
        ],
    },
]


async def get_profile(db: AsyncSession, user_id: str) -> UserProfile | None:
    """Get user profile by user_id."""
    stmt = select(UserProfile).where(UserProfile.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_or_update_profile(
    db: AsyncSession,
    user_id: str,
    data: dict[str, Any],
) -> UserProfile:
    """Create or update user profile with given data."""
    profile = await get_profile(db, user_id)

    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)

    # Update fields
    allowed_fields = {
        "institution", "position", "jurisdiction", "experience_years",
        "primary_areas", "specializations",
        "formality_level", "connective_style", "citation_style",
        "preferred_expressions", "avoided_expressions", "paragraph_length",
        "default_document_type", "default_template",
        "signature_block", "header_text",
        "preferred_model", "detail_level", "argument_depth",
        "include_opposing_view",
    }

    for key, value in data.items():
        if key in allowed_fields and hasattr(profile, key):
            setattr(profile, key, value)

    if data.get("onboarding_completed"):
        profile.onboarding_completed = True

    await db.flush()
    return profile


def get_onboarding_steps() -> list[dict]:
    """Return the onboarding wizard step definitions."""
    return ONBOARDING_STEPS


def profile_to_context(profile: UserProfile | None) -> dict[str, Any]:
    """Convert a user profile to pipeline context variables.

    These variables are injected into prompt templates via {key} placeholders.
    """
    if not profile:
        return {}

    ctx = {
        "user_institution": profile.institution or "",
        "user_position": profile.position or "",
        "user_jurisdiction": profile.jurisdiction or "",
        "user_formality": profile.formality_level or "formal",
        "user_connective_style": profile.connective_style or "classico",
        "user_citation_style": profile.citation_style or "inline",
        "user_paragraph_length": profile.paragraph_length or "medio",
        "user_detail_level": profile.detail_level or "detalhado",
        "user_argument_depth": profile.argument_depth or "moderado",
        "user_include_opposing": profile.include_opposing_view if profile.include_opposing_view is not None else True,
        "user_signature": profile.signature_block or "",
        "user_header": profile.header_text or "",
    }

    # Preference instructions for prompts
    style_instructions = []
    if profile.formality_level == "semiformal":
        style_instructions.append("Use linguagem clara e objetiva, evitando arcaísmos desnecessários.")
    if profile.connective_style == "moderno":
        style_instructions.append("Prefira conectivos modernos (portanto, além disso) aos clássicos (destarte, outrossim).")
    if profile.paragraph_length == "curto":
        style_instructions.append("Mantenha parágrafos curtos (3-5 linhas).")
    elif profile.paragraph_length == "longo":
        style_instructions.append("Parágrafos podem ser mais extensos quando necessário para desenvolvimento completo.")

    if profile.preferred_expressions:
        style_instructions.append(f"Expressões preferidas: {', '.join(profile.preferred_expressions[:10])}")
    if profile.avoided_expressions:
        style_instructions.append(f"Expressões a EVITAR: {', '.join(profile.avoided_expressions[:10])}")

    ctx["user_style_instructions"] = "\n".join(style_instructions) if style_instructions else ""

    return ctx
