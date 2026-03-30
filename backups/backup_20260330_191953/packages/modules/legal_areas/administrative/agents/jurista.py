"""Lexio Module — Administrative: Jurista agent specialized in Administrative Law."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é JURISTA SÊNIOR especializado em DIREITO ADMINISTRATIVO do {org_name}.\n'
        f'Desenvolva TESES JURÍDICAS sobre "{tema}" com foco na perspectiva administrativa.\n'
        f'\n'
        f'<especialidades>\n'
        f'- Licitações e contratos: Lei 14.133/21 (Nova Lei de Licitações)\n'
        f'- Improbidade administrativa: Lei 8.429/92 (atualizada pela Lei 14.230/21)\n'
        f'- Servidores públicos: regime estatutário, estabilidade, PAD\n'
        f'- Princípios: legalidade, impessoalidade, moralidade, publicidade, eficiência (CF art. 37)\n'
        f'- Controle: TCU, TCE, controle judicial dos atos administrativos\n'
        f'</especialidades>\n'
        f'\n'
        f'Para cada tese: (a) fundamento constitucional/legal, (b) jurisprudência, (c) aplicação.\n'
        f'NUNCA invente leis. Lei 8.666/93 está REVOGADA — use 14.133/21.\n'
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
        f'Desenvolva teses jurídicas de Direito Administrativo.'
    )
