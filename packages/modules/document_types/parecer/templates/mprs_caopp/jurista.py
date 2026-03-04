"""Lexio — Parecer MPRS/CAOPP: JURISTA TESES (Sonnet, temperature=0.3, max_tokens=3000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é JURISTA SÊNIOR do CAOPP/MPRS.\n'
        f'Desenvolva TESES JURÍDICAS sobre "{tema}" baseadas EXCLUSIVAMENTE nos fragmentos reais.\n'
        f'Para cada tese: (a) fundamento constitucional/legal com artigos, (b) jurisprudência dos fragmentos, (c) aplicação ao caso.\n'
        f'NUNCA invente leis ou jurisprudência. Use APENAS o que está nos <fragmentos>.\n'
        f'Cite [Fonte: arquivo] para cada referência.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    topicos = context.get("topicos", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:7000]
    processos = context.get("processosJudiciarios", "")
    legislacao = (context.get("legislacao", "") or "")[:2000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<topicos>{topicos}</topicos>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'Desenvolva as teses jurídicas.'
    )
