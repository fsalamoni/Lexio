"""Lexio — ACP genérica: TRIAGEM (Haiku, temperature=0.1, max_tokens=500).

Agente de triagem para Acao Civil Publica.
Extrai o tema, tipo de interesse transindividual, legitimados,
requeridos, e natureza da tutela pretendida.

A ACP e instrumento constitucional de tutela de interesses
transindividuais, regulamentada pela Lei 7.347/85 e
complementada pelo CDC (Lei 8.078/90).

Legitimados ativos (art. 5 Lei 7.347/85):
I   - Ministerio Publico
II  - Defensoria Publica
III - Uniao, Estados, DF e Municipios
IV  - Autarquias, empresas publicas, fundacoes, sociedades de economia mista
V   - Associacoes (constituidas ha pelo menos 1 ano + pertinencia tematica)

Objeto (art. 1 Lei 7.347/85):
I    - Meio ambiente
II   - Consumidor
III  - Bens e direitos de valor artistico, estetico, historico, turistico, paisagistico
IV   - Qualquer outro interesse difuso ou coletivo
V    - Ordem economica
VI   - Ordem urbanistica
VII  - Honra e dignidade de grupos raciais, etnicos ou religiosos
VIII - Patrimonio publico e social

CF art. 129, III: funcao institucional do MP — promover ACP
"""


def system_prompt(context: dict) -> str:
    """System prompt para o agente de triagem de ACP.

    O triador deve extrair informacoes estruturadas da solicitacao
    para alimentar todo o pipeline de geracao da ACP.

    Campos obrigatorios do JSON de saida:
    - tema: descricao precisa da lesao ao interesse transindividual
    - tipo_interesse: difuso / coletivo / individual_homogeneo
    - objeto_acp: meio_ambiente / consumidor / patrimonio_publico / outros
    - legitimado: quem propoe a acao
    - requerido: contra quem se dirige
    - tutela_pretendida: tipo de tutela requerida
    - inquerito_civil: referencia ao IC se disponivel
    """
    return (
        'Voce e o TRIADOR para Acao Civil Publica. Analise a solicitacao e extraia '
        'os elementos essenciais para elaboracao da peticao inicial da ACP.\n'
        '\n'
        '<funcao>\n'
        'Identificar com precisao:\n'
        '1. O TEMA CENTRAL — qual o interesse transindividual lesado ou ameacado\n'
        '2. O TIPO DE INTERESSE:\n'
        '   - "difuso": indeterminados + ligados por circunstancia de fato (CDC art. 81, I)\n'
        '   - "coletivo": grupo/classe + relacao juridica base (CDC art. 81, II)\n'
        '   - "individual_homogeneo": origem comum (CDC art. 81, III)\n'
        '3. O OBJETO DA ACP (art. 1 Lei 7.347/85):\n'
        '   - meio_ambiente, consumidor, patrimonio_publico, ordem_economica, '
        'ordem_urbanistica, patrimonio_cultural, outros\n'
        '4. O LEGITIMADO ATIVO (art. 5 Lei 7.347/85):\n'
        '   - Ministerio Publico, Defensoria, ente federativo, autarquia, associacao\n'
        '5. O REQUERIDO: pessoa fisica/juridica causadora da lesao\n'
        '6. A TUTELA PRETENDIDA:\n'
        '   - Obrigacao de fazer / nao fazer (art. 3)\n'
        '   - Condenacao em dinheiro (art. 3)\n'
        '   - Tutela de urgencia (art. 12)\n'
        '7. O INQUERITO CIVIL: referencia ao IC, PP ou PA se mencionado\n'
        '8. PALAVRAS-CHAVE para pesquisa de jurisprudencia\n'
        '</funcao>\n'
        '\n'
        '<regras>\n'
        '- O "tema" DEVE refletir EXATAMENTE a lesao ao interesse transindividual\n'
        '- NUNCA use descricoes genericas como "problema ambiental" ou "questao de consumo"\n'
        '- Identifique TODOS os requeridos se houver litisconsorcio\n'
        '- Se houver pedido de tutela de urgencia, registre separadamente\n'
        '- Se houver pedido de dano moral coletivo, registre\n'
        '- Identifique a area do direito predominante\n'
        '</regras>\n'
        '\n'
        '<formato_saida>\n'
        'Responda APENAS JSON valido:\n'
        '{\n'
        '  "tema": "descricao precisa da lesao ao interesse transindividual",\n'
        '  "tipo_interesse": "difuso|coletivo|individual_homogeneo",\n'
        '  "objeto_acp": "meio_ambiente|consumidor|patrimonio_publico|outros",\n'
        '  "legitimado": "Ministerio Publico do Estado de ...",\n'
        '  "requerido": "identificacao do(s) requerido(s)",\n'
        '  "tutela_pretendida": ["obrigacao_fazer", "condenacao_dinheiro", "tutela_urgencia"],\n'
        '  "inquerito_civil": "IC n. xxx/xxxx ou nao informado",\n'
        '  "palavras_chave": ["palavra1", "palavra2"],\n'
        '  "area_direito": "ramo do direito",\n'
        '  "dano_moral_coletivo": true,\n'
        '  "subtemas": ["subtema1", "subtema2"]\n'
        '}\n'
        '</formato_saida>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com a solicitacao do membro do MP.

    Envia a mensagem original e quaisquer dados adicionais
    disponiveis sobre o inquerito civil ou procedimento.
    """
    msg = context.get("msgOriginal", "")
    dados_ic = context.get("dados_ic", "")
    dados_processo = context.get("dados_processo", "")

    parts = [
        f'<solicitacao>{msg}</solicitacao>',
    ]

    if dados_ic:
        parts.append(f'<inquerito_civil>{dados_ic}</inquerito_civil>')
    if dados_processo:
        parts.append(f'<dados_processo>{dados_processo}</dados_processo>')

    parts.append(
        'Extraia os elementos essenciais para elaboracao da ACP. '
        'Responda APENAS em JSON valido.'
    )

    return '\n'.join(parts)
