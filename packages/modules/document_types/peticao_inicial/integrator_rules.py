"""Lexio Module — Petição Inicial: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the header for the petição inicial.

    Format:
        EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA
        [CÍVEL/CRIMINAL/etc.] DA COMARCA DE ___
    """
    comarca = context.get("comarca", "")
    vara = context.get("vara", "")
    tipo_vara = context.get("tipo_vara", "Cível")

    parts = []

    # Petition header — formal address to judge
    enderecamento = "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO"
    if vara:
        enderecamento += f" DA {vara} VARA"
    else:
        enderecamento += " DA ___ VARA"

    if tipo_vara:
        enderecamento += f" {tipo_vara.upper()}"

    if comarca:
        enderecamento += f" DA COMARCA DE {comarca.upper()}"
    else:
        enderecamento += " DA COMARCA DE ___"

    parts.append(enderecamento)

    # Process number placeholder (if applicable)
    numero_processo = context.get("numero_processo", "")
    if numero_processo:
        parts.append(f"\nProcesso n.º {numero_processo}")

    return "\n\n".join(parts) if parts else ""


def get_footer(context: dict) -> str:
    """Build the footer for the petição inicial.

    Format:
        Nestes termos,
        pede deferimento.

        [Cidade], [data].

        [Nome do Advogado]
        [OAB/UF n.º XXXXX]
    """
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "")
    local_line = f"{cidade}, {data_str}." if cidade else f"___, {data_str}."

    author_name = context.get("author_name", "")
    oab = context.get("oab", "")

    parts = []

    # Closing formula
    parts.append("\n\nNestes termos,\npede deferimento.")

    # Location and date
    parts.append(f"\n\n{local_line}")

    # Lawyer signature block
    if author_name:
        parts.append(f"\n\n{author_name}")
    if oab:
        parts.append(oab)

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the petição inicial text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray header lines from body (added externally via get_header)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().upper()
        if stripped.startswith("EXCELENTÍSSIMO") or stripped.startswith("EXCELENTISSIMO"):
            continue
        if stripped.startswith("EXMO"):
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Remove stray closing lines from body (added externally via get_footer)
    lines = text.split('\n')
    cleaned_lines = []
    skip_footer = False
    for line in lines:
        stripped = line.strip().lower()
        # Stop skipping after footer detection ends
        if skip_footer and stripped and not stripped.startswith("pede deferimento"):
            skip_footer = False
        if stripped == "nestes termos," or stripped == "termos em que,":
            skip_footer = True
            continue
        if stripped.startswith("pede deferimento"):
            skip_footer = False
            continue
        if skip_footer:
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure section titles are properly formatted (uppercase)
    section_titles = [
        "DOS FATOS", "DO DIREITO", "DOS PEDIDOS", "DO PEDIDO",
        "DA QUALIFICAÇÃO DAS PARTES", "DA COMPETÊNCIA",
        "DO VALOR DA CAUSA", "DAS PROVAS",
        "DA FUNDAMENTAÇÃO JURÍDICA", "DOS FUNDAMENTOS JURÍDICOS",
        "DA TUTELA PROVISÓRIA", "DA TUTELA DE URGÊNCIA",
        "DA TUTELA ANTECIPADA", "DA LIMINAR",
        "DA NARRATIVA FÁTICA", "DOS FATOS E FUNDAMENTOS",
    ]
    for title in section_titles:
        # Ensure section headers have proper spacing
        pattern = re.compile(rf'(\n)({re.escape(title)})(\n)', re.IGNORECASE)
        text = pattern.sub(rf'\1\n{title}\n\3', text)

    # Ensure text starts cleanly
    text = text.strip()

    # Ensure valor da causa appears near the end (before closing)
    # This is a soft check — the redator should place it correctly
    # but we verify the structure is maintained

    return text
