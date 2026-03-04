"""Lexio — Parecer MPRS/CAOPP: ADVOGADO DO DIABO (Sonnet, temperature=0.4, max_tokens=2000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é o ADVOGADO DO DIABO do CAOPP/MPRS.\n'
        f'Ataque CADA tese do Jurista sobre "{tema}".\n'
        f'Para cada: identifique falhas lógicas, jurisprudência contrária, exceções legais, pontos fracos.\n'
        f'Seja rigoroso. Se uma tese é sólida, diga — mas busque brechas.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Ataque cada tese.'
    )
