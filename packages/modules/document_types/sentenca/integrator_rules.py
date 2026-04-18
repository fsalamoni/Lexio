"""Lexio Module — Sentenca: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the header for the sentença.

    Sentence format:
    - PODER JUDICIÁRIO header
    - Comarca/Vara identification
    - Process number
    - Parties identification
    """
    org_name = context.get("org_name", "")
    comarca = context.get("comarca", "")
    vara = context.get("vara", "")
    processo_numero = context.get("processo_numero", "")

    parts = []

    # Judicial header
    parts.append("PODER JUDICIÁRIO")
    if org_name:
        parts.append(org_name.upper())
    if comarca:
        parts.append(f"Comarca de {comarca}")
    if vara:
        parts.append(vara)

    # Process number
    if processo_numero:
        parts.append(f"\nProcesso nº {processo_numero}")

    # Sentence title
    parts.append("\nSENTENÇA")

    return "\n".join(parts)


def get_footer(context: dict) -> str:
    """Build the footer for the sentença.

    Judicial closure:
    - Publique-se. Registre-se. Intimem-se.
    - Location and date
    - Judge signature line
    """
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "")
    comarca = context.get("comarca", cidade)
    local_line = f"{comarca}, {data_str}." if comarca else f"{data_str}."

    author_name = context.get("author_name", "")
    user_title = context.get("user_title", "Juiz(a) de Direito")

    parts = [
        "\n\nPublique-se. Registre-se. Intimem-se.",
        "",
        local_line,
        "",
    ]
    if author_name:
        parts.append(author_name)
    if user_title:
        parts.append(user_title)

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the sentença text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray judicial closings from body (added in footer)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().lower()
        # Remove duplicate headers/closings that will be added externally
        if stripped.startswith("poder judiciário"):
            continue
        if stripped == "sentença":
            continue
        if stripped.startswith("publique-se") and "registre-se" in stripped:
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure proper section headers for RELATÓRIO, FUNDAMENTAÇÃO, DISPOSITIVO
    text = _ensure_section_headers(text)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure text starts cleanly
    text = text.strip()

    return text


def _ensure_section_headers(text: str) -> str:
    """Ensure the three mandatory sections have proper headers."""
    # Normalize section headers to uppercase without numbering
    text = re.sub(
        r'(?i)(?:^|\n)\s*(?:I[\.\s\-]*)?RELAT[ÓO]RIO',
        '\nRELATÓRIO',
        text,
    )
    text = re.sub(
        r'(?i)(?:^|\n)\s*(?:II[\.\s\-]*)?FUNDAMENTA[ÇC][ÃA]O',
        '\nFUNDAMENTAÇÃO',
        text,
    )
    text = re.sub(
        r'(?i)(?:^|\n)\s*(?:III[\.\s\-]*)?DISPOSITIVO',
        '\nDISPOSITIVO',
        text,
    )
    return text
