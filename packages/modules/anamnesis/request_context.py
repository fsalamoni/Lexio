"""Lexio Anamnesis — Layer 2: Request Context.

Handles per-request context gathering. When creating a new document,
this layer collects the specific facts, parties, desired outcome, and
situational context for that particular request.

Works in conjunction with Layer 1 (base_profile) to build complete
context for the pipeline.
"""

import logging
from typing import Any

from packages.core.llm.client import call_llm

logger = logging.getLogger("lexio.anamnesis.request")


# Request context fields per document type
REQUEST_FIELDS: dict[str, list[dict]] = {
    # Parecer
    "parecer": [
        {"key": "consulente", "label": "Consulente", "type": "text", "placeholder": "Quem está consultando?", "required": False},
        {"key": "fatos", "label": "Fatos relevantes", "type": "textarea", "placeholder": "Descreva os fatos que motivam a consulta...", "required": True},
        {"key": "questao_juridica", "label": "Questão jurídica central", "type": "textarea", "placeholder": "Qual a pergunta jurídica a ser respondida?", "required": True},
        {"key": "documentos_referencia", "label": "Documentos de referência", "type": "textarea", "placeholder": "Leis, decisões ou documentos relevantes...", "required": False},
        {"key": "resultado_desejado", "label": "Resultado desejado", "type": "select", "options": [
            {"value": "favoravel", "label": "Parecer favorável"},
            {"value": "contrario", "label": "Parecer contrário"},
            {"value": "neutro", "label": "Parecer neutro/técnico"},
        ], "required": False},
    ],

    # Petição Inicial
    "peticao_inicial": [
        {"key": "autor", "label": "Autor (qualificação)", "type": "textarea", "placeholder": "Nome completo, CPF/CNPJ, endereço...", "required": True},
        {"key": "reu", "label": "Réu (qualificação)", "type": "textarea", "placeholder": "Nome completo, CPF/CNPJ, endereço...", "required": True},
        {"key": "fatos", "label": "Fatos", "type": "textarea", "placeholder": "Narre os fatos que fundamentam o pedido...", "required": True},
        {"key": "pedidos", "label": "Pedidos pretendidos", "type": "textarea", "placeholder": "O que se pretende obter com a ação?", "required": True},
        {"key": "valor_causa", "label": "Valor da causa", "type": "text", "placeholder": "R$ ...", "required": False},
        {"key": "tutela_urgencia", "label": "Tutela de urgência", "type": "boolean", "default": False, "required": False},
        {"key": "rito", "label": "Rito processual", "type": "select", "options": [
            {"value": "ordinario", "label": "Procedimento Comum"},
            {"value": "sumario", "label": "Juizado Especial"},
            {"value": "especial", "label": "Procedimento Especial"},
        ], "required": False},
    ],

    # Contestação
    "contestacao": [
        {"key": "processo_numero", "label": "Número do processo", "type": "text", "required": False},
        {"key": "sintese_inicial", "label": "Síntese da petição inicial", "type": "textarea", "placeholder": "Resuma os pedidos e argumentos do autor...", "required": True},
        {"key": "fatos_defesa", "label": "Fatos favoráveis à defesa", "type": "textarea", "placeholder": "Fatos que favorecem a defesa...", "required": True},
        {"key": "preliminares", "label": "Preliminares a alegar", "type": "textarea", "placeholder": "Incompetência, litispendência, prescrição...", "required": False},
        {"key": "provas", "label": "Provas disponíveis", "type": "textarea", "placeholder": "Documentos, testemunhas...", "required": False},
    ],

    # Recurso
    "recurso": [
        {"key": "processo_numero", "label": "Número do processo", "type": "text", "required": False},
        {"key": "decisao_recorrida", "label": "Decisão recorrida", "type": "textarea", "placeholder": "Descreva a decisão e seus fundamentos...", "required": True},
        {"key": "tipo_recurso", "label": "Tipo de recurso", "type": "select", "options": [
            {"value": "apelacao", "label": "Apelação"},
            {"value": "agravo_instrumento", "label": "Agravo de Instrumento"},
            {"value": "embargos_declaracao", "label": "Embargos de Declaração"},
            {"value": "recurso_especial", "label": "Recurso Especial"},
            {"value": "recurso_extraordinario", "label": "Recurso Extraordinário"},
        ], "required": True},
        {"key": "erros_apontados", "label": "Erros na decisão", "type": "textarea", "placeholder": "Quais erros a decisão contém?", "required": True},
        {"key": "resultado_pretendido", "label": "Resultado pretendido", "type": "textarea", "placeholder": "Reforma total, parcial, anulação...", "required": False},
    ],

    # Sentença
    "sentenca": [
        {"key": "processo_numero", "label": "Número do processo", "type": "text", "required": False},
        {"key": "partes", "label": "Partes", "type": "textarea", "placeholder": "Autor(es) e Réu(s)...", "required": True},
        {"key": "sintese_caso", "label": "Síntese do caso", "type": "textarea", "placeholder": "Resuma os pedidos, defesa e provas produzidas...", "required": True},
        {"key": "tipo_sentenca", "label": "Tipo de sentença", "type": "select", "options": [
            {"value": "merito", "label": "Sentença de mérito"},
            {"value": "extincao", "label": "Extinção sem mérito"},
        ], "required": False},
        {"key": "resultado_pretendido", "label": "Resultado pretendido", "type": "select", "options": [
            {"value": "procedente", "label": "Procedência"},
            {"value": "improcedente", "label": "Improcedência"},
            {"value": "parcial", "label": "Procedência parcial"},
            {"value": "extincao", "label": "Extinção sem mérito"},
        ], "required": False},
    ],

    # ACP
    "acao_civil_publica": [
        {"key": "legitimado", "label": "Legitimado ativo", "type": "text", "placeholder": "Ministério Público, Defensoria...", "required": False},
        {"key": "reu", "label": "Réu", "type": "textarea", "placeholder": "Qualificação do réu...", "required": True},
        {"key": "fatos", "label": "Fatos", "type": "textarea", "placeholder": "Descreva os fatos que motivam a ACP...", "required": True},
        {"key": "interesse_tutelado", "label": "Interesse tutelado", "type": "select", "options": [
            {"value": "difuso", "label": "Direito difuso"},
            {"value": "coletivo", "label": "Direito coletivo stricto sensu"},
            {"value": "individual_homogeneo", "label": "Direito individual homogêneo"},
        ], "required": True},
        {"key": "inquerito_civil", "label": "Inquérito civil", "type": "text", "placeholder": "Número do IC, se houver", "required": False},
        {"key": "tutela_urgencia", "label": "Tutela de urgência", "type": "boolean", "default": False, "required": False},
        {"key": "pedidos", "label": "Pedidos pretendidos", "type": "textarea", "placeholder": "Obrigação de fazer/não fazer, indenização...", "required": True},
    ],
}

# Default fields for unknown document types
DEFAULT_REQUEST_FIELDS = [
    {"key": "fatos", "label": "Fatos", "type": "textarea", "placeholder": "Descreva os fatos relevantes...", "required": True},
    {"key": "questao_juridica", "label": "Questão jurídica", "type": "textarea", "placeholder": "Qual a questão jurídica?", "required": True},
    {"key": "resultado_desejado", "label": "Resultado desejado", "type": "textarea", "placeholder": "O que se pretende?", "required": False},
]


def get_request_fields(document_type_id: str) -> list[dict]:
    """Return the context fields for a given document type."""
    return REQUEST_FIELDS.get(document_type_id, DEFAULT_REQUEST_FIELDS)


def build_enriched_request(
    original_request: str,
    request_context: dict[str, Any],
    document_type_id: str,
) -> str:
    """Build enriched request text from original request + structured context.

    Combines the free-form request with structured fields into a rich
    prompt that gives the pipeline maximum context.
    """
    parts = [f"SOLICITAÇÃO ORIGINAL:\n{original_request}"]

    fields = get_request_fields(document_type_id)
    field_map = {f["key"]: f["label"] for f in fields}

    structured_parts = []
    for key, value in request_context.items():
        if value and key in field_map:
            label = field_map[key]
            if isinstance(value, bool):
                value = "Sim" if value else "Não"
            structured_parts.append(f"{label}: {value}")

    if structured_parts:
        parts.append("\nCONTEXTO ESTRUTURADO:")
        parts.extend(structured_parts)

    return "\n".join(parts)


async def auto_extract_context(
    original_request: str,
    document_type_id: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Use LLM to auto-extract structured context from free-form request.

    This is used when the user skips the wizard and just types a request.
    The LLM extracts what it can into structured fields.
    """
    fields = get_request_fields(document_type_id)
    field_descriptions = "\n".join(
        f"- {f['key']}: {f['label']}" for f in fields
    )

    result = await call_llm(
        system=(
            "Você é um assistente jurídico. Analise a solicitação e extraia "
            "informações estruturadas nos campos abaixo.\n"
            "Retorne APENAS um JSON válido com as chaves encontradas.\n"
            "Se não encontrar informação para um campo, omita-o.\n\n"
            f"Campos disponíveis:\n{field_descriptions}"
        ),
        user=f"Solicitação:\n{original_request}",
        model=model or "anthropic/claude-3.5-haiku",
        max_tokens=1000,
        temperature=0.1,
    )

    # Try to parse JSON from response
    import json
    content = result["content"].strip()

    # Extract JSON block if wrapped in markdown
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()

    try:
        extracted = json.loads(content)
        if isinstance(extracted, dict):
            return extracted
    except (json.JSONDecodeError, IndexError):
        logger.warning(f"Failed to parse auto-extracted context: {content[:200]}")

    return {}
