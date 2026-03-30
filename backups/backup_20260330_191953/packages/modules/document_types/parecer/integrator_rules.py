"""Lexio Module — Parecer: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the header for the parecer."""
    org_name = context.get("org_name", "")
    user_title = context.get("user_title", "")
    template_variant = context.get("template_variant", "")

    parts = []
    if org_name:
        parts.append(org_name.upper())

    # MPRS-specific greeting
    if template_variant == "mprs_caopp":
        parts.append("Senhor Promotor de Justiça,")
    elif user_title:
        parts.append(f"Prezado(a) {user_title},")

    return "\n\n".join(parts) if parts else ""


def get_footer(context: dict) -> str:
    """Build the footer for the parecer."""
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "Porto Alegre")
    local_line = f"{cidade}, {data_str}."

    author_name = context.get("author_name", "")
    author_title = context.get("user_title", "")

    parts = [f"\n\n{local_line}"]
    if author_name:
        parts.append(author_name)
    if author_title:
        parts.append(author_title)

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the parecer text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray "Senhor Promotor" from body (added in header)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith("senhor promotor") or stripped.startswith("prezado"):
            continue
        if stripped.startswith("porto alegre,") or stripped.startswith("data:"):
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure text starts cleanly
    text = text.strip()

    return text
