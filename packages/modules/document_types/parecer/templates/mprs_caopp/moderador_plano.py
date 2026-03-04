"""Lexio — Parecer MPRS/CAOPP: MODERADOR PLANO (Sonnet, temperature=0.3, max_tokens=2000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é o MODERADOR do colegiado CAOPP/MPRS.\n'
        f'Com base nas teses verificadas sobre "{tema}", monte o PLANO DE REDAÇÃO do parecer.\n'
        f'Estruture: RELATÓRIO (o que descrever), FUNDAMENTAÇÃO JURÍDICA (seções e ordem dos argumentos), '
        f'CONCLUSÃO (recomendações concretas).\n'
        f'Indique para cada seção: quais normas citar, quais fragmentos usar, qual conclusão parcial.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses_verificadas = context.get("teses_verificadas", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses_verificadas>{teses_verificadas}</teses_verificadas>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Monte o plano de redação.'
    )
