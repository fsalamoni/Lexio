"""Lexio Module — Acao Civil Publica: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the header for the Acao Civil Publica.

    ACP format:
    - Excelentíssimo(a) Senhor(a) Juiz(a) de Direito
    - Vara/Comarca identification
    """
    org_name = context.get("org_name", "")
    user_title = context.get("user_title", "")
    vara = context.get("vara", "")
    comarca = context.get("comarca", "")

    parts = []

    # Standard ACP header — addressed to the judge
    enderecamento = "EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A) DE DIREITO"
    if vara:
        enderecamento += f" DA {vara.upper()}"
    if comarca:
        enderecamento += f" DA COMARCA DE {comarca.upper()}"

    parts.append(enderecamento)

    return "\n\n".join(parts)


def get_footer(context: dict) -> str:
    """Build the footer for the Acao Civil Publica.

    MP-specific closure:
    - Termos em que pede deferimento
    - Location and date
    - Promotor/Procurador signature line
    """
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "")
    comarca = context.get("comarca", cidade)
    local_line = f"{comarca}, {data_str}." if comarca else f"{data_str}."

    author_name = context.get("author_name", "")
    user_title = context.get("user_title", "Promotor(a) de Justiça")
    org_name = context.get("org_name", "")

    parts = [
        "\n\nTermos em que,",
        "pede deferimento.",
        "",
        local_line,
        "",
    ]
    if author_name:
        parts.append(author_name)
    if user_title:
        parts.append(user_title)
    if org_name:
        parts.append(org_name)

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the ACP text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray headers/closings that will be added externally
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith("excelentíssimo") or stripped.startswith("excelentissimo"):
            continue
        if stripped.startswith("termos em que") or stripped.startswith("pede deferimento"):
            continue
        if stripped.startswith("promotor") and len(stripped) < 60:
            continue
        if stripped.startswith("procurador") and len(stripped) < 60:
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure proper section headers
    text = _ensure_section_headers(text)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure text starts cleanly
    text = text.strip()

    return text


def _ensure_section_headers(text: str) -> str:
    """Ensure ACP-specific section headers are properly formatted."""
    # Normalize major section headers to uppercase
    section_patterns = [
        (r'(?i)(?:^|\n)\s*DA\s+LEGITIMIDADE', '\nDA LEGITIMIDADE'),
        (r'(?i)(?:^|\n)\s*DO\s+INQ[UÚ]ERITO\s+CIVIL', '\nDO INQUÉRITO CIVIL'),
        (r'(?i)(?:^|\n)\s*DOS\s+FATOS', '\nDOS FATOS'),
        (r'(?i)(?:^|\n)\s*DO\s+DIREITO', '\nDO DIREITO'),
        (r'(?i)(?:^|\n)\s*DA\s+TUTELA\s+DE\s+URG[EÊ]NCIA', '\nDA TUTELA DE URGÊNCIA'),
        (r'(?i)(?:^|\n)\s*DOS\s+PEDIDOS', '\nDOS PEDIDOS'),
        (r'(?i)(?:^|\n)\s*DA\s+COMPET[EÊ]NCIA', '\nDA COMPETÊNCIA'),
        (r'(?i)(?:^|\n)\s*DO\s+DANO\s+MORAL\s+COLETIVO', '\nDO DANO MORAL COLETIVO'),
    ]
    for pattern, replacement in section_patterns:
        text = re.sub(pattern, replacement, text)

    return text
