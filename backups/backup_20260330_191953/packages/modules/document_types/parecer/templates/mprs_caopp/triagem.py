"""Lexio — Parecer MPRS/CAOPP: TRIAGEM (Haiku, temperature=0.1, max_tokens=400)."""


def system_prompt(context: dict) -> str:
    return (
        'Você é o TRIADOR do CAOPP/MPRS. Extraia o tema jurídico da solicitação.\n'
        '<regras>\n'
        '- O "tema" DEVE refletir EXATAMENTE o assunto perguntado\n'
        '- Se menciona "nepotismo cruzado", tema DEVE conter "nepotismo cruzado"\n'
        '- NUNCA use frases genéricas\n'
        '</regras>\n'
        'Responda APENAS JSON: {"tema":"...","palavras_chave":["..."],"area_direito":"...","tipo_ilicito":"...","subtemas":["..."]}'
    )


def user_prompt(context: dict) -> str:
    return (
        f'<solicitacao>{context.get("msgOriginal", "")}</solicitacao>\n'
        f'Extraia o tema.'
    )
