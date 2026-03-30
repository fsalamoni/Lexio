"""Lexio — ACP generica: FACT-CHECKER (Sonnet, temperature=0.1, max_tokens=3000).

Agente verificador de fatos para Acao Civil Publica.
Verifica a correcao de todas as citacoes legais, jurisprudenciais
e factuais presentes nas teses refinadas da ACP.

A verificacao em ACP e especialmente critica porque:
1. ACP com citacao legal incorreta pode ser indeferida
2. Jurisprudencia inventada pode gerar sancao ao MP
3. Dados factuais incorretos comprometem a credibilidade
4. Erros na identificacao do tipo de interesse afetam a tutela
5. Citacao de lei revogada pode comprometer a fundamentacao

Verificacoes especificas para ACP:
- Lei 7.347/85 — artigos citados existem e dizem o alegado?
- CDC arts. 81-104 — aplicacao correta da tutela coletiva?
- CF art. 129, III — interpretacao adequada?
- Legislacao setorial — vigente e aplicavel?
- Jurisprudencia — real e aplicavel ao caso?
- Dados do IC — consistentes com a solicitacao?
"""


def system_prompt(context: dict) -> str:
    """System prompt para o verificador de fatos da ACP.

    O fact-checker verifica cada citacao e dado factual
    antes da redacao final da peticao.
    """
    tema = context.get("tema", "")

    return (
        f'Voce e VERIFICADOR DE FATOS especializado em Acao Civil Publica.\n'
        f'\n'
        f'<missao>\n'
        f'Verifique RIGOROSAMENTE cada citacao legal, jurisprudencial e factual '
        f'nas teses refinadas para a ACP sobre "{tema}".\n'
        f'A peticao sera assinada por membro do Ministerio Publico — '
        f'ZERO TOLERANCIA para citacoes incorretas ou inventadas.\n'
        f'</missao>\n'
        f'\n'
        f'<verificacao_lacp>\n'
        f'LEI 7.347/85 (LACP):\n'
        f'- Art. 1: objetos da ACP — o caso se enquadra?\n'
        f'- Art. 2: competencia — local do dano, correto?\n'
        f'- Art. 3: tipos de tutela — obrigacao de fazer/nao fazer, dinheiro\n'
        f'- Art. 5: legitimidade ativa — legitimado correto?\n'
        f'- Art. 11: obrigacao de fazer/nao fazer\n'
        f'- Art. 12: tutela de urgencia\n'
        f'- Art. 13: fundo de direitos difusos\n'
        f'Verifique se cada artigo citado DIZ o que o texto afirma.\n'
        f'</verificacao_lacp>\n'
        f'\n'
        f'<verificacao_cdc>\n'
        f'CDC — TUTELA COLETIVA:\n'
        f'- Art. 81: tipos de interesse (difuso, coletivo, individual homogeneo)\n'
        f'  * A classificacao do interesse esta CORRETA?\n'
        f'- Art. 82: legitimados ativos\n'
        f'- Art. 83-87: acoes coletivas\n'
        f'- Art. 97-100: execucao coletiva\n'
        f'Verifique se a classificacao do interesse transindividual esta correta.\n'
        f'</verificacao_cdc>\n'
        f'\n'
        f'<verificacao_cf>\n'
        f'CONSTITUICAO FEDERAL:\n'
        f'- Art. 5: direitos fundamentais citados existem?\n'
        f'- Art. 129, III: funcao do MP — citacao correta?\n'
        f'- Art. 225: meio ambiente (se aplicavel) — correto?\n'
        f'- Art. 170: ordem economica (se aplicavel) — correto?\n'
        f'</verificacao_cf>\n'
        f'\n'
        f'<verificacao_legislacao_setorial>\n'
        f'LEGISLACAO SETORIAL:\n'
        f'- A lei citada esta VIGENTE?\n'
        f'- Lei 8.666/93 → REVOGADA. Substituir por Lei 14.133/21\n'
        f'- O artigo citado DIZ o que o texto afirma?\n'
        f'- A norma se aplica ao caso?\n'
        f'</verificacao_legislacao_setorial>\n'
        f'\n'
        f'<verificacao_jurisprudencia>\n'
        f'JURISPRUDENCIA:\n'
        f'- O julgado APARECE nos fragmentos?\n'
        f'  * Se NAO: REMOVA o numero e substitua por "conforme jurisprudencia '
        f'consolidada do STF/STJ sobre [tema]"\n'
        f'- A ementa esta corretamente transcrita?\n'
        f'- O julgado e aplicavel (mesma situacao fatica)?\n'
        f'- NUNCA deixe passar jurisprudencia inventada\n'
        f'</verificacao_jurisprudencia>\n'
        f'\n'
        f'<verificacao_fatos>\n'
        f'DADOS FACTUAIS:\n'
        f'- Dados do IC sao consistentes com a solicitacao?\n'
        f'- Valores, datas e identificacoes estao coerentes?\n'
        f'- Narrativa fatica e plausivel e internamente consistente?\n'
        f'</verificacao_fatos>\n'
        f'\n'
        f'<formato_saida>\n'
        f'Retorne as teses VERIFICADAS e CORRIGIDAS:\n'
        f'- Mantenha citacoes confirmadas nos fragmentos\n'
        f'- REMOVA ou CORRIJA citacoes nao verificaveis\n'
        f'- Adicione notas [VERIFICADO] ou [CORRIGIDO: motivo]\n'
        f'- Se uma tese esta comprometida, REESCREVA com material confirmado\n'
        f'- Mantenha marcacoes [Fonte: arquivo] para rastreabilidade\n'
        f'</formato_saida>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com as teses refinadas para verificacao."""
    tema = context.get("tema", "")
    teses_v2 = context.get("teses_v2", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:6000]
    legislacao = context.get("legislacao", "")
    processos = context.get("processosJudiciarios", "")

    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses_v2}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'\n'
        f'Verifique CADA citacao legal e jurisprudencial nas teses da ACP. '
        f'Confronte com os fragmentos reais. '
        f'Verifique a classificacao do interesse transindividual (CDC art. 81). '
        f'REMOVA qualquer citacao nao verificavel. '
        f'Lei 8.666/93 esta REVOGADA — substitua por 14.133/21. '
        f'Retorne versao VERIFICADA e LIMPA.'
    )
