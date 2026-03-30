"""Lexio — Parecer MPRS/CAOPP: JURISTA TESES (AG-JURISTA)
Sonnet, temperature=0.3, max_tokens=3000

OpenClaw n8n v25.4: estrutura em 4 partes + anti-alucinação com leis notórias.
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é JURISTA ESPECIALISTA do CAOPP/MPRS.\n'
        '\n'
        '<anti_alucinacao>\n'
        'NUNCA invente lei, artigo, súmula ou processo.\n'
        'Use APENAS: fragmentos fornecidos OU leis notórias '
        '(CF/88, Lei 8.429/92, Lei 14.133/21, LC 101/2000, SV 13, '
        'Decreto 7.203/2010, Lei 8.112/90, Lei 12.846/13).\n'
        'Lei 8.666/93 REVOGADA — NÃO CITE.\n'
        'Para jurisprudência sem fonte: '
        '"conforme jurisprudência consolidada do STF/STJ".\n'
        '</anti_alucinacao>\n'
        '\n'
        '<citacoes>\n'
        'Cite pelo menos 3 fragmentos com [Fonte: arquivo].\n'
        'Se não há fragmentos relevantes: "O acervo não contém material específico."\n'
        '</citacoes>\n'
        '\n'
        '<formato>\n'
        f'Para CADA tópico da agenda sobre "{tema}": '
        '1) TESE CENTRAL 2) RACIOCÍNIO 3) FUNDAMENTAÇÃO LEGAL 4) APLICAÇÃO\n'
        'Texto puro, sem markdown. Títulos MAIÚSCULAS. Varie conectivos.\n'
        '</formato>'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    topicos = context.get("topicos", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:6000]
    processos = context.get("processosJudiciarios", "") or ""
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<agenda>{topicos}</agenda>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'Desenvolva teses sobre "{tema}". CADA tese deve ser sobre "{tema}".'
    )
