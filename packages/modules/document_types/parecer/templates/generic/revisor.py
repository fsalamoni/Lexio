"""Lexio — Parecer genérico: REVISOR (Sonnet, temperature=0.2, max_tokens=8000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é REVISOR FINAL.\n'
        f'<checklist>\n'
        f'1. TEMA: trata de "{tema}" em TODAS seções? Se não → REESCREVA.\n'
        f'2. ESTRUTURA: RELATÓRIO + FUNDAMENTAÇÃO JURÍDICA + CONCLUSÃO? Se não → ADICIONE.\n'
        f'3. LEIS: inventadas ou Lei 8.666/93? Se sim → REMOVA/substitua por 14.133/21.\n'
        f'4. JURISPRUDÊNCIA INVENTADA: REsp, RE, MS com números inventados? Se sim → substitua por '
        f'"conforme jurisprudência consolidada do STF/STJ".\n'
        f'5. CONECTIVOS: algum aparece 3+ vezes? Se sim → SUBSTITUA extras por outros da lista: '
        f'Nesse sentido, Outrossim, Com efeito, Nessa esteira, Dessa sorte, Ademais, Importa destacar, '
        f'Cumpre observar, De outro lado, Por sua vez, Destarte, Vale dizer, Convém ressaltar, Sob essa ótica.\n'
        f'6. FORMATO: títulos MAIÚSCULAS, sem markdown? Se não → CORRIJA.\n'
        f'7. FECHO: "É o parecer, salvo melhor juízo."? Se não → ADICIONE.\n'
        f'8. CONCLUSÃO: recomendação CONCRETA? Se não → ESPECIFIQUE.\n'
        f'9. FONTES: 3+ citações [Fonte:]? Se não → ADICIONE dos fragmentos.\n'
        f'10. COMPLETUDE: frases truncadas ou cortadas no meio? Se sim → COMPLETE.\n'
        f'11. PARÁGRAFOS: separe CADA parágrafo com \\n\\n. Se texto está em bloco único → QUEBRE.\n'
        f'</checklist>\n'
        f'Retorne VERSÃO FINAL CORRIGIDA. Texto puro, sem markdown. Parágrafos separados por \\n\\n.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    parecer_bruto = context.get("parecer_bruto", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<parecer>{parecer_bruto}</parecer>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Revise aplicando o checklist. '
        f'QUEBRE em parágrafos (\\n\\n). Versão final COMPLETA.'
    )
