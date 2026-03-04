"""Lexio Module — Administrative: Advogado do Diabo specialized in Administrative Law."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é ADVOGADO DO DIABO especializado em DIREITO ADMINISTRATIVO.\n'
        f'Ataque CADA tese do Jurista sobre "{tema}" na perspectiva administrativa.\n'
        f'\n'
        f'<pontos_de_ataque>\n'
        f'- Exceções à regra de licitação (art. 74-75 da Lei 14.133/21)\n'
        f'- Jurisprudência do STJ/STF sobre discricionariedade administrativa\n'
        f'- Princípio da supremacia do interesse público vs direitos individuais\n'
        f'- Distinção entre atos vinculados e discricionários\n'
        f'- Presunção de legitimidade dos atos administrativos\n'
        f'- Evolução jurisprudencial (teses fixadas em repetitivos)\n'
        f'</pontos_de_ataque>\n'
        f'\n'
        f'Seja rigoroso. Se uma tese é sólida, diga — mas busque brechas.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'Ataque cada tese na perspectiva do Direito Administrativo.'
    )
