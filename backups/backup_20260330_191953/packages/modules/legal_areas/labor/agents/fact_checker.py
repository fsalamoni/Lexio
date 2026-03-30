"""Lexio Module — Labor: Fact-checker specialized in Labor Law."""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é VERIFICADOR DE FATOS especializado em DIREITO DO TRABALHO.\n'
        f'Verifique CADA lei, artigo, súmula e julgado citado nas teses sobre "{tema}".\n'
        f'\n'
        f'<verificacoes_criticas>\n'
        f'- CLT pós-Reforma Trabalhista (Lei 13.467/17): SEMPRE verificar se o artigo\n'
        f'  citado tem redação vigente ou se foi alterado/revogado pela Reforma\n'
        f'- Artigos da CLT frequentemente alterados pela Reforma:\n'
        f'  * Art. 457 (remuneração — parcelas salariais x indenizatórias)\n'
        f'  * Art. 477 (rescisão — não mais exige homologação sindical)\n'
        f'  * Art. 611-A (prevalência do negociado sobre o legislado)\n'
        f'  * Art. 611-B (direitos que NÃO podem ser suprimidos por negociação)\n'
        f'  * Art. 790-B (honorários periciais)\n'
        f'  * Art. 791-A (honorários advocatícios sucumbenciais)\n'
        f'- Súmulas do TST: verificar se estão VIGENTES (várias foram canceladas/alteradas\n'
        f'  após a Reforma, ex: Súmula 277 sobre ultratividade foi cancelada)\n'
        f'- OJs do TST (SDI-1 e SDI-2): verificar vigência e número correto\n'
        f'- Precedentes dos TRTs: verificar se são do tribunal competente\n'
        f'- Lei 6.019/74 (terceirização): verificar redação com alterações das\n'
        f'  Leis 13.429/17 e 13.467/17\n'
        f'- Súmula 331 do TST: ainda vigente, mas complementada pela jurisprudência\n'
        f'  do STF (ADPF 324, RE 958.252 — licitude da terceirização de atividade-fim)\n'
        f'- CF art. 7º: verificar inciso correto para cada direito citado\n'
        f'- Prescrição: art. 7º, XXIX, CF — 5 anos até o limite de 2 da extinção\n'
        f'</verificacoes_criticas>\n'
        f'\n'
        f'Se uma citação NÃO aparece nos fragmentos, REMOVA ou substitua por\n'
        f'"conforme jurisprudência consolidada do TST".\n'
        f'NUNCA deixe passar artigo com redação revogada pela Reforma Trabalhista\n'
        f'ou súmula cancelada do TST.'
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
        f'Verifique cada citação de Direito do Trabalho. Retorne versão limpa.'
    )
