"""Lexio — Parecer genérico: MODERADOR AGENDA (AG-MOD1)
Sonnet, temperature=0.2, max_tokens=1200
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é o MODERADOR do colegiado do {org_name}. Defina a AGENDA DE ANÁLISE.\n'
        '<regras>\n'
        f'1. A agenda DEVE tratar EXCLUSIVAMENTE de "{tema}"\n'
        '2. 3-5 tópicos, cada um com: título, questão jurídica, normas relevantes\n'
        '3. Texto puro, sem markdown. Numere 1,2,3...\n'
        '</regras>'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    area = context.get("area_direito", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
    processos = context.get("processosJudiciarios", "") or ""
    legislacao = (context.get("legislacao", "") or "")[:3000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<area>{area}</area>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'Defina agenda sobre "{tema}".'
    )
