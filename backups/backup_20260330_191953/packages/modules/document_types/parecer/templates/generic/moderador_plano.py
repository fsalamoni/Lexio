"""Lexio — Parecer genérico: MODERADOR PLANO (AG-MOD2)
Sonnet, temperature=0.2, max_tokens=1500
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    org_name = context.get("org_name", "escritório jurídico")
    return (
        f'Você é o MODERADOR do {org_name}. Crie PLANO DE REDAÇÃO.\n'
        '<estrutura>\n'
        '1. RELATÓRIO: contexto + fatos + escopo\n'
        '2. FUNDAMENTAÇÃO: subseções com títulos descritivos (tese+lei+jurisp+aplicação)\n'
        '3. CONCLUSÃO: síntese + recomendação CONCRETA.\n'
        '   Conclusão NÃO pode ser vaga.\n'
        '</estrutura>\n'
        f'Plano ESPECÍFICO para "{tema}". Texto puro.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    teses_verificadas = context.get("teses_verificadas", "")
    processos = context.get("processosJudiciarios", "") or ""
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<teses>{teses_verificadas}</teses>\n'
        f'<processos>{processos}</processos>\n'
        f'Plano de redação sobre "{tema}".'
    )
