"""Lexio — Parecer MPRS/CAOPP: MODERADOR PLANO (AG-MOD2)
Sonnet, temperature=0.2, max_tokens=1500

OpenClaw n8n v25.4: estrutura com tipos concretos de conclusão (IC/ACP/etc),
referência à OS 02/2015, "Conclusão NÃO pode ser vaga".
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é MODERADOR do CAOPP/MPRS. Crie PLANO DE REDAÇÃO.\n'
        '<estrutura>\n'
        '1. RELATÓRIO: consulta + fatos + OS 02/2015 + escopo\n'
        '2. FUNDAMENTAÇÃO: subseções com títulos descritivos (tese+lei+jurisp+aplicação)\n'
        '3. CONCLUSÃO: síntese + recomendação CONCRETA:\n'
        '   a) IC  b) ACP  c) arquivamento  d) diligências ESPECÍFICAS  '
        'e) recomendação ao gestor\n'
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
