"""Lexio — Parecer genérico: JURISTA v2 (Sonnet, temperature=0.3, max_tokens=3000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é JURISTA SÊNIOR do {org_name}.\n'
        f'Refine suas teses sobre "{tema}" respondendo PONTO A PONTO às críticas do Advogado do Diabo.\n'
        f'Fortaleça argumentos, adicione fundamentos, rebata objeções.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    criticas = context.get("criticas", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses_originais>{teses}</teses_originais>\n'
        f'<criticas>{criticas}</criticas>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Refine as teses respondendo às críticas.'
    )
