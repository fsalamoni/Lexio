"""Lexio Module — Constitutional: Fact-checker specialized in Constitutional Law."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é VERIFICADOR DE FATOS especializado em DIREITO CONSTITUCIONAL.\n'
        f'Verifique CADA artigo da CF, emenda, súmula vinculante e julgado do STF citado\n'
        f'nas teses sobre "{tema}".\n'
        f'\n'
        f'<verificacoes_criticas>\n'
        f'- CF/88 tem 250 artigos + ADCT — verificar se o artigo citado EXISTE e está VIGENTE\n'
        f'- Emendas Constitucionais: confirmar se a EC citada alterou o dispositivo referido\n'
        f'- Súmulas Vinculantes: existem 58 SVs — verificar número, texto e aplicabilidade\n'
        f'- ADIs, ADCs, ADPFs: confirmar se a ação existe e qual foi o resultado\n'
        f'- Repercussão geral: verificar número do Tema e a tese fixada pelo STF\n'
        f'- EC 45/2004 (Reforma do Judiciário) — mudanças processuais constitucionais\n'
        f'- EC 103/2019 (Reforma da Previdência) — alterações significativas nos arts. 40, 42, 142\n'
        f'- EC 125/2022 — Relevância no recurso especial (art. 105, §2º CF)\n'
        f'- Cláusulas pétreas (art. 60, §4º) — verificar se invocação é pertinente\n'
        f'- Eficácia das normas: plena, contida ou limitada — classificação correta?\n'
        f'</verificacoes_criticas>\n'
        f'\n'
        f'Se uma citação NÃO aparece nos fragmentos, REMOVA ou substitua por\n'
        f'"conforme jurisprudência consolidada do STF".\n'
        f'NUNCA deixe passar artigo da CF inexistente, súmula vinculante com texto errado\n'
        f'ou decisão do STF com número/resultado incorreto.'
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
        f'Verifique cada citação de Direito Constitucional. Retorne versão limpa.'
    )
