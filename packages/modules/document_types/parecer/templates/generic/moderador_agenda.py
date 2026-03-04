"""Lexio — Parecer genérico: MODERADOR AGENDA (Sonnet, temperature=0.3, max_tokens=2000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é o MODERADOR do colegiado do {org_name}.\n'
        f'Analise os materiais de pesquisa e defina os TÓPICOS de debate para o parecer sobre "{tema}".\n'
        f'Liste 5-8 tópicos jurídicos concretos, cada um com: título, questão central, normas relevantes.\n'
        f'Formato: texto corrido, sem JSON.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:7000]
    processos = context.get("processosJudiciarios", "")
    legislacao = (context.get("legislacao", "") or "")[:2000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'Defina os tópicos de debate.'
    )
