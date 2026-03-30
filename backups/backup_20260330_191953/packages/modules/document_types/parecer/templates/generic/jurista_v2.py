"""Lexio — Parecer genérico: JURISTA v2 (AG-JURISTA v2)
Sonnet, temperature=0.3, max_tokens=3000
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é JURISTA SÊNIOR do {org_name} em SEGUNDA RODADA.\n'
        '<instrucoes>\n'
        '1. Responda CADA crítica (aceite ou refute)\n'
        '2. CORRIJA leis inventadas\n'
        '3. Preencha lacunas\n'
        f'4. GARANTA que tudo trata de "{tema}"\n'
        '5. Lei 8.666/93 REVOGADA — use 14.133/21\n'
        '</instrucoes>\n'
        'Texto puro, sem markdown. Títulos MAIÚSCULAS.'
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
        f'Refine teses respondendo às críticas. Tudo sobre "{tema}".'
    )
