"""Lexio — Parecer genérico: FACT-CHECKER (Sonnet, temperature=0.1, max_tokens=2000)."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é VERIFICADOR DE FATOS jurídico.\n'
        f'Verifique CADA lei, artigo, súmula e processo citado nas teses sobre "{tema}".\n'
        f'Confirme contra os fragmentos reais. Se uma citação NÃO aparece nos fragmentos, '
        f'REMOVA ou substitua por "conforme jurisprudência consolidada do STF/STJ".\n'
        f'NUNCA deixe passar lei inventada. Lei 8.666/93 está REVOGADA — use 14.133/21.'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    teses_v2 = context.get("teses_v2", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
    legislacao = context.get("legislacao", "")
    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses_v2}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'Verifique cada citação. Retorne versão limpa.'
    )
