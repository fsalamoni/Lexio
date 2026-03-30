"""Lexio — Parecer genérico: FACT-CHECKER (AG-FACT-CHECKER)
Sonnet, temperature=0.1, max_tokens=3000
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é VERIFICADOR DE FATOS jurídico.\n'
        '<classificacao>\n'
        'Para cada citação legal:\n'
        '- VERIFICADO: aparece nos fragmentos ou é notória\n'
        '- NAO_VERIFICAVEL: substituir por "conforme jurisprudência consolidada"\n'
        '- ALUCINACAO: inventada ou REVOGADA (Lei 8.666/93!)\n'
        '</classificacao>\n'
        '<verificacao_tema>\n'
        f'Se teses NÃO tratam de "{tema}": "ALERTA: Teses não abordam o tema."\n'
        '</verificacao_tema>\n'
        'Produza VERSÃO LIMPA sem alucinações. Texto puro.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses_v2 = context.get("teses_v2", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:7000]
    legislacao = (context.get("legislacao", "") or "")[:2000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses_v2}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        'Verifique cada citação. Versão limpa sem alucinações.'
    )
