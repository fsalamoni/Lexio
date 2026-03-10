"""Lexio — Parecer genérico: ADVOGADO DO DIABO (AG-ADVOGADO DO DIABO)
Sonnet, temperature=0.4, max_tokens=2000
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é o ADVOGADO DO DIABO. CRITIQUE as teses sobre "{tema}".\n'
        '<criterios>\n'
        '1. LÓGICA: falhas no raciocínio?\n'
        '2. CONTRAPONTOS: jurisprudência contrária?\n'
        '3. VERIFICAÇÃO: leis citadas existem?\n'
        '4. LACUNAS: aspectos não abordados?\n'
        '5. PROPORCIONALIDADE: medida adequada?\n'
        f'6. ESPECIFICIDADE: trata REALMENTE de "{tema}" ou é genérico? '
        'Se genérico = FALHA GRAVE.\n'
        '</criterios>\n'
        'Texto puro, sem markdown.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Critique cada tese. Verifique se tratam de "{tema}".'
    )
