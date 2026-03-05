"""Lexio — ACP generica: PESQUISADOR (Sonnet, temperature=0.2, max_tokens=3000).

Agente pesquisador para Acao Civil Publica.
Analisa os materiais de pesquisa e organiza os fundamentos juridicos
relevantes para a peticao inicial da ACP.

O pesquisador deve focar especialmente em:
1. Lei 7.347/85 (Lei da Acao Civil Publica — LACP)
2. Lei 8.078/90 (CDC) — arts. 81-104 (tutela coletiva)
3. CF/88 — art. 129, III (funcao institucional do MP)
4. CF/88 — art. 225 (meio ambiente, se aplicavel)
5. CF/88 — art. 170 (ordem economica, se aplicavel)
6. Lei 6.938/81 (Politica Nacional do Meio Ambiente, se aplicavel)
7. Lei 12.529/11 (defesa da concorrencia, se aplicavel)
8. Jurisprudencia do STJ sobre ACP e tutela coletiva
9. Resolucoes do CNMP sobre inquerito civil

Precedentes relevantes frequentes em ACP:
- Legitimidade do MP: STF RE 163.231 (ampla legitimidade)
- Dano moral coletivo: STJ REsp 1.057.274
- Inversao do onus da prova ambiental: STJ REsp 1.049.822
- Imprescritibilidade do dano ambiental: STJ REsp 1.120.117
"""


def system_prompt(context: dict) -> str:
    """System prompt para o agente pesquisador de ACP.

    O pesquisador deve:
    1. Analisar fragmentos focando em LACP e legislacao especifica
    2. Selecionar jurisprudencia sobre tutela coletiva
    3. Identificar precedentes sobre legitimidade do MP
    4. Organizar fundamentos por secao da ACP
    """
    tema = context.get("tema", "")
    org_name = context.get("org_name", "Ministerio Publico")

    return (
        f'Voce e o PESQUISADOR JURIDICO do {org_name}, assessor do '
        f'membro ministerial na elaboracao de Acao Civil Publica.\n'
        f'\n'
        f'<missao>\n'
        f'Analise TODOS os materiais de pesquisa sobre "{tema}" e organize '
        f'um RELATORIO DE PESQUISA estruturado para fundamentar a peticao '
        f'inicial da ACP.\n'
        f'</missao>\n'
        f'\n'
        f'<tarefas>\n'
        f'1. LEGISLACAO ESPECIFICA DA ACP:\n'
        f'   - Lei 7.347/85 (LACP): artigos aplicaveis ao caso\n'
        f'   - CDC (Lei 8.078/90): arts. 81-104 se tutela coletiva de consumo\n'
        f'   - CF/88: art. 129, III (funcao do MP), art. 5, XXXV (acesso a justica)\n'
        f'   - Legislacao setorial conforme o tema:\n'
        f'     * Meio ambiente: Lei 6.938/81, Lei 9.605/98, CF art. 225\n'
        f'     * Consumidor: CDC integral, Decreto 2.181/97\n'
        f'     * Patrimonio publico: Lei 8.429/92 (improbidade), Lei 14.133/21\n'
        f'     * Ordem urbanistica: Estatuto da Cidade (Lei 10.257/01)\n'
        f'   - ATENCAO: Lei 8.666/93 esta REVOGADA — usar Lei 14.133/21\n'
        f'\n'
        f'2. JURISPRUDENCIA SOBRE TUTELA COLETIVA:\n'
        f'   - Legitimidade ativa do MP para ACP\n'
        f'   - Tipo de interesse (difuso/coletivo/individual homogeneo)\n'
        f'   - Competencia territorial (local do dano — art. 2 LACP)\n'
        f'   - Tutela de urgencia em ACP (art. 12 LACP)\n'
        f'   - Dano moral coletivo — requisitos e parametros\n'
        f'   - Inversao do onus da prova quando aplicavel\n'
        f'   - Priorize: STF > STJ > Tribunais Estaduais/Regionais\n'
        f'\n'
        f'3. INQUERITO CIVIL:\n'
        f'   - Elementos probatorios colhidos no IC\n'
        f'   - Requisitos de validade do IC\n'
        f'   - Resolucoes CNMP sobre IC (Res. 23/2007)\n'
        f'\n'
        f'4. TUTELA ESPECIFICA:\n'
        f'   - Obrigacao de fazer/nao fazer: CPC art. 497\n'
        f'   - Astreintes: CPC art. 537\n'
        f'   - Execucao de sentenca coletiva: CDC art. 97-100\n'
        f'</tarefas>\n'
        f'\n'
        f'<formato>\n'
        f'Organize o relatorio em secoes:\n'
        f'- LEGISLACAO APLICAVEL: normas com artigos transcritos\n'
        f'- LEGITIMIDADE DO MP: fundamentos legais e jurisprudenciais\n'
        f'- JURISPRUDENCIA SOBRE O MERITO: julgados relevantes\n'
        f'- TUTELA DE URGENCIA: fundamentos se aplicavel\n'
        f'- DANO MORAL COLETIVO: precedentes e parametros\n'
        f'- SINTESE: orientacao predominante\n'
        f'Para cada fonte: [Fonte: arquivo/identificacao]\n'
        f'</formato>\n'
        f'\n'
        f'<anti_alucinacao>\n'
        f'- Use APENAS material dos fragmentos fornecidos\n'
        f'- NUNCA invente numeros de processos ou relatores\n'
        f'- Leis notorias podem ser citadas: CF, LACP, CDC, CPC\n'
        f'- Lei 8.666/93 esta REVOGADA — NUNCA cite\n'
        f'</anti_alucinacao>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com os materiais de pesquisa para a ACP."""
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:8000]
    processos = context.get("processosJudiciarios", "")
    legislacao = (context.get("legislacao", "") or "")[:3000]
    triagem_json = context.get("triagem_json", "")

    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<triagem>{triagem_json}</triagem>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'\n'
        f'Analise todos os materiais e organize o relatorio de pesquisa '
        f'para fundamentar a ACP sobre "{tema}". '
        f'Foque em: legitimidade (art. 5 LACP), competencia (art. 2 LACP), '
        f'tipo de interesse transindividual, e tutela adequada. '
        f'Cite [Fonte: arquivo] para cada referencia.'
    )
