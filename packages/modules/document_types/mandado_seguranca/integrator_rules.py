"""Lexio Module — Mandado de Segurança: Integration rules (header/footer + post-processing)."""

import re
from datetime import datetime

MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
    5: "maio", 6: "junho", 7: "julho", 8: "agosto",
    9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def get_header(context: dict) -> str:
    """Build the document header."""
    return ""


def get_footer(context: dict) -> str:
    """Build the document footer."""
    return ""


def post_process(text: str, context: dict) -> str:
    """Apply post-processing rules."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
