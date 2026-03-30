"""Lexio Module — Recurso: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}

# Appeal type configurations
RECURSO_CONFIGS = {
    "apelacao": {
        "titulo": "APELAÇÃO CÍVEL",
        "destinatario": "EGRÉGIO TRIBUNAL DE JUSTIÇA DO ESTADO",
        "enderecamento": "Excelentíssimo(a) Senhor(a) Desembargador(a) Relator(a)",
        "referencia_origem": "Juízo da {vara} Vara {comarca}",
    },
    "agravo_instrumento": {
        "titulo": "AGRAVO DE INSTRUMENTO",
        "destinatario": "EGRÉGIO TRIBUNAL DE JUSTIÇA DO ESTADO",
        "enderecamento": "Excelentíssimo(a) Senhor(a) Desembargador(a) Relator(a)",
        "referencia_origem": "Decisão interlocutória proferida pelo Juízo da {vara} Vara {comarca}",
    },
    "embargos_declaracao": {
        "titulo": "EMBARGOS DE DECLARAÇÃO",
        "destinatario": "ao Juízo que proferiu a decisão embargada",
        "enderecamento": "Excelentíssimo(a) Senhor(a) Juiz(a) de Direito",
        "referencia_origem": "Sentença/Decisão proferida nos autos do processo {numero_processo}",
    },
    "generic": {
        "titulo": "RECURSO",
        "destinatario": "EGRÉGIO TRIBUNAL",
        "enderecamento": "Excelentíssimo(a) Senhor(a) Julgador(a)",
        "referencia_origem": "Decisão proferida nos autos do processo {numero_processo}",
    },
}

# Required sections for validation
REQUIRED_SECTIONS = [
    "DOS FATOS",
    "DO CABIMENTO",
    "DAS RAZÕES DO RECURSO",
    "DOS PEDIDOS",
]


def get_header(context: dict) -> str:
    """Build the header for the recurso based on appeal type."""
    org_name = context.get("org_name", "")
    user_title = context.get("user_title", "")
    template_variant = context.get("template_variant", "generic")
    numero_processo = context.get("numero_processo", "")
    recorrente = context.get("recorrente", "")
    recorrido = context.get("recorrido", "")
    comarca = context.get("comarca", "")
    vara = context.get("vara", "")

    config = RECURSO_CONFIGS.get(template_variant, RECURSO_CONFIGS["generic"])

    parts = []

    # Destinatario / Enderecamento
    parts.append(config["enderecamento"])
    parts.append("")

    # Titulo do recurso
    parts.append(config["titulo"])
    parts.append("")

    # Processo info
    if numero_processo:
        parts.append(f"Processo n.: {numero_processo}")
    if recorrente:
        parts.append(f"Recorrente: {recorrente}")
    if recorrido:
        parts.append(f"Recorrido: {recorrido}")
    if comarca:
        origin_ref = config["referencia_origem"].format(
            vara=vara or "___",
            comarca=comarca,
            numero_processo=numero_processo or "___",
        )
        parts.append(f"Origem: {origin_ref}")

    parts.append("")

    # Org name and greeting
    if org_name:
        greeting = (
            f"{recorrente or 'A parte recorrente'}, por seu advogado que esta subscreve, "
            f"inscrito na OAB conforme instrumento de mandato anexo, "
            f"vem, respeitosamente, perante esse {config['destinatario']}, "
            f"interpor o presente"
        )
        parts.append(greeting)
        parts.append("")
        parts.append(config["titulo"])
        parts.append("")
        parts.append(
            "com fundamento nos dispositivos legais adiante expostos, "
            "pelas razões de fato e de direito a seguir aduzidas."
        )

    return "\n".join(parts)


def get_footer(context: dict) -> str:
    """Build the footer for the recurso."""
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "Porto Alegre")
    local_line = f"{cidade}, {data_str}."

    author_name = context.get("author_name", "")
    author_title = context.get("user_title", "")
    oab = context.get("oab", "")

    parts = [f"\n\nNestes termos,\npede deferimento.\n\n{local_line}"]
    if author_name:
        parts.append(f"\n{author_name}")
    if author_title:
        parts.append(author_title)
    if oab:
        parts.append(f"OAB/{oab}")

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the recurso text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray greetings/headers that will be added externally
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith("excelentíssimo") or stripped.startswith("excelentissimo"):
            continue
        if stripped.startswith("egrégio") or stripped.startswith("egregio"):
            continue
        if stripped.startswith("nestes termos") and "deferimento" in stripped:
            continue
        if re.match(r'^(porto alegre|são paulo|rio de janeiro|brasília),\s+\d', stripped):
            continue
        if stripped.startswith("data:"):
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure section headers are properly formatted in uppercase
    section_patterns = [
        (r'(?i)\b(dos?\s+fatos?)\b', 'DOS FATOS'),
        (r'(?i)\b(do\s+cabimento)\b', 'DO CABIMENTO'),
        (r'(?i)\b(da\s+admissibilidade)\b', 'DA ADMISSIBILIDADE'),
        (r'(?i)\b(das?\s+razões?\s+do\s+recurso)\b', 'DAS RAZÕES DO RECURSO'),
        (r'(?i)\b(dos?\s+pedidos?)\b', 'DOS PEDIDOS'),
        (r'(?i)\b(do\s+prequestionamento)\b', 'DO PREQUESTIONAMENTO'),
    ]
    for pattern, replacement in section_patterns:
        text = re.sub(pattern, replacement, text)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure text starts cleanly
    text = text.strip()

    return text
