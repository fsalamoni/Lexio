"""Lexio — Parecer genérico: TRIAGEM (Haiku, temperature=0.1, max_tokens=400)."""


def system_prompt(context: dict) -> str:
    return (
        'Você é o TRIADOR jurídico. Extraia o tema jurídico da solicitação.\n'
        '<regras>\n'
        '- O "tema" DEVE refletir EXATAMENTE o assunto perguntado\n'
        '- NUNCA use frases genéricas\n'
        '</regras>\n'
        'Responda APENAS JSON: {"tema":"...","palavras_chave":["..."],"area_direito":"...","tipo_ilicito":"...","subtemas":["..."]}'
    )


def user_prompt(context: dict) -> str:
    return (
        f'<solicitacao>{context.get("msgOriginal", "")}</solicitacao>\n'
        f'Extraia o tema.'
    )
