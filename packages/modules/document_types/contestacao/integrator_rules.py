"""Lexio Module — Contestacao: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

# Month names in Portuguese
MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the header for the contestação.

    Follows the standard Brazilian judicial defense format:
    - Directed to the presiding judge
    - References the case number and parties
    """
    numero_processo = context.get("numero_processo", "")
    vara = context.get("vara", "")
    comarca = context.get("comarca", "")
    autor = context.get("autor", "")
    reu = context.get("reu", "")

    parts = []

    # Judicial greeting — standard format for contestação
    greeting = "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO"
    if vara:
        greeting += f" DA {vara.upper()}"
    if comarca:
        greeting += f" DA COMARCA DE {comarca.upper()}"
    parts.append(greeting)

    # Process reference
    if numero_processo:
        parts.append(f"Processo n.º {numero_processo}")

    # Parties
    if autor and reu:
        parts.append(f"Autor: {autor}")
        parts.append(f"Réu: {reu}")
    elif autor:
        parts.append(f"Autor: {autor}")

    # Opening paragraph identifying the defendant
    opening_lines = []
    if reu:
        opening_lines.append(
            f"{reu.upper()}, já qualificado(a) nos autos do processo em epígrafe, "
            f"vem, respeitosamente, à presença de Vossa Excelência, por intermédio "
            f"de seu(sua) advogado(a) signatário(a), com fundamento nos arts. 335 e "
            f"seguintes do Código de Processo Civil (Lei n.º 13.105/2015), apresentar"
        )
    else:
        opening_lines.append(
            "O(A) Réu(Ré), já qualificado(a) nos autos do processo em epígrafe, "
            "vem, respeitosamente, à presença de Vossa Excelência, por intermédio "
            "de seu(sua) advogado(a) signatário(a), com fundamento nos arts. 335 e "
            "seguintes do Código de Processo Civil (Lei n.º 13.105/2015), apresentar"
        )
    opening_lines.append("")
    opening_lines.append("CONTESTAÇÃO")
    opening_lines.append("")
    opening_lines.append("pelos fatos e fundamentos jurídicos a seguir expostos.")
    parts.append("\n".join(opening_lines))

    return "\n\n".join(parts)


def get_footer(context: dict) -> str:
    """Build the footer for the contestação."""
    now = datetime.now()
    data_str = f"{now.day} de {MESES[now.month]} de {now.year}"

    cidade = context.get("cidade", "")
    if cidade:
        local_line = f"{cidade}, {data_str}."
    else:
        local_line = data_str + "."

    author_name = context.get("author_name", "")
    author_title = context.get("user_title", "")
    oab = context.get("oab", "")

    parts = [f"\n\n{local_line}"]
    parts.append("")
    parts.append("_" * 40)
    if author_name:
        parts.append(author_name)
    if author_title:
        parts.append(author_title)
    if oab:
        parts.append(f"OAB/{oab}")

    return "\n".join(parts)


def post_process(text: str, context: dict) -> str:
    """Clean up the contestação text before integration."""

    # Remove any markdown artifacts
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = text.replace('```', '')

    # Remove stray header elements from body (added externally)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip().lower()
        # Remove duplicated header elements that may appear in the body
        if stripped.startswith("excelentíssimo") or stripped.startswith("excelentissimo"):
            continue
        if stripped.startswith("processo n"):
            continue
        if stripped == "contestação" or stripped == "contestacao":
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    # Ensure proper section formatting — section titles in uppercase
    section_patterns = [
        (r'(?i)(da\s+síntese\s+da\s+inicial)', 'DA SÍNTESE DA INICIAL'),
        (r'(?i)(das\s+preliminares)', 'DAS PRELIMINARES'),
        (r'(?i)(do\s+mérito)', 'DO MÉRITO'),
        (r'(?i)(dos\s+pedidos)', 'DOS PEDIDOS'),
        (r'(?i)(da\s+reconvenção)', 'DA RECONVENÇÃO'),
        (r'(?i)(das\s+provas)', 'DAS PROVAS'),
    ]
    for pattern, replacement in section_patterns:
        text = re.sub(pattern, replacement, text)

    # Ensure proper paragraph separation
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Ensure text starts cleanly
    text = text.strip()

    return text
