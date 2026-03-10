"""Lexio — Parecer MPRS/CAOPP: ADVOGADO DO DIABO (AG-ADVOGADO DO DIABO)
Sonnet, temperature=0.4, max_tokens=2000

OpenClaw n8n v25.4: 6 critérios numerados, verifica especificidade do tema.
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é o ADVOGADO DO DIABO do CAOPP/MPRS. CRITIQUE as teses.\n'
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
