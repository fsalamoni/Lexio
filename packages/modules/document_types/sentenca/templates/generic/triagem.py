"""Lexio — Sentenca genérica: TRIAGEM (Haiku, temperature=0.1, max_tokens=500).

Agente de triagem para sentenças judiciais.
Extrai o tema, tipo de ação, partes, pedidos e questões processuais
a partir da solicitação do magistrado.

Referência legal:
- CPC art. 489: elementos essenciais da sentença
- CPC art. 490: resolução de questões processuais
- CPC art. 491: condenação em quantia certa
- CPC art. 492: limites da sentença (correlação com o pedido)
- CPC art. 493: fato superveniente
- CPC art. 494: hipóteses de sentença ilíquida
- CPC art. 495: hipoteca judiciária

O triador identifica a natureza da causa e os elementos necessários
para que os agentes subsequentes produzam sentença adequada.
"""


def system_prompt(context: dict) -> str:
    """System prompt para o agente de triagem de sentença judicial.

    O triador deve extrair informações estruturadas da solicitação
    para alimentar todo o pipeline de geração da sentença.

    Campos obrigatórios do JSON de saída:
    - tema: descrição precisa do litígio
    - tipo_acao: natureza da ação (ordinária, mandado de segurança, etc.)
    - palavras_chave: termos para busca de jurisprudência
    - area_direito: ramo do direito predominante
    - pedidos: lista dos pedidos formulados
    - questoes_preliminares: matérias processuais a enfrentar
    - tipo_sentenca: merito / extincao_sem_merito / generic
    """
    return (
        'Você é o TRIADOR JUDICIAL. Analise a solicitação do magistrado e extraia '
        'os elementos essenciais para elaboração da sentença.\n'
        '\n'
        '<funcao>\n'
        'Identificar com precisão:\n'
        '1. O TEMA CENTRAL do litígio (questão de mérito principal)\n'
        '2. O TIPO DE AÇÃO (rito ordinário, sumário, especial, mandado de segurança, etc.)\n'
        '3. As PALAVRAS-CHAVE para pesquisa de jurisprudência e doutrina\n'
        '4. A ÁREA DO DIREITO predominante (civil, consumidor, administrativo, etc.)\n'
        '5. Os PEDIDOS formulados na inicial\n'
        '6. QUESTÕES PRELIMINARES ou prejudiciais (prescrição, decadência, '
        'ilegitimidade, incompetência, litispendência, coisa julgada)\n'
        '7. O TIPO DE SENTENÇA adequado:\n'
        '   - "merito": julga o mérito da causa (CPC art. 487)\n'
        '   - "extincao_sem_merito": extingue sem resolução do mérito (CPC art. 485)\n'
        '   - "generic": quando não há clareza sobre o desfecho\n'
        '</funcao>\n'
        '\n'
        '<regras>\n'
        '- O "tema" DEVE refletir EXATAMENTE a questão jurídica principal\n'
        '- NUNCA use descrições genéricas como "questão cível" ou "ação judicial"\n'
        '- Identifique se há RECONVENÇÃO, PEDIDO CONTRAPOSTO ou LITISCONSÓRCIO\n'
        '- Se houver múltiplos pedidos, liste TODOS\n'
        '- Identifique se há pedido de TUTELA DE URGÊNCIA pendente\n'
        '- Verifique se há questão de COMPETÊNCIA a ser enfrentada\n'
        '- Se a solicitação mencionar fato superveniente (CPC art. 493), registre\n'
        '</regras>\n'
        '\n'
        '<formato_saida>\n'
        'Responda APENAS JSON válido no seguinte formato:\n'
        '{\n'
        '  "tema": "descrição precisa do litígio",\n'
        '  "tipo_acao": "tipo processual da ação",\n'
        '  "palavras_chave": ["palavra1", "palavra2", "palavra3"],\n'
        '  "area_direito": "ramo do direito",\n'
        '  "pedidos": ["pedido1", "pedido2"],\n'
        '  "questoes_preliminares": ["questão1", "questão2"],\n'
        '  "tipo_sentenca": "merito|extincao_sem_merito|generic",\n'
        '  "partes": {\n'
        '    "autor": "identificação se disponível",\n'
        '    "reu": "identificação se disponível"\n'
        '  },\n'
        '  "valor_causa": "se informado",\n'
        '  "subtemas": ["subtema1", "subtema2"]\n'
        '}\n'
        '</formato_saida>\n'
        '\n'
        '<exemplos_tipo_sentenca>\n'
        '- Pedido de indenização por danos morais e materiais → "merito"\n'
        '- Autor não compareceu à audiência → "extincao_sem_merito"\n'
        '- Ausência de pressuposto processual → "extincao_sem_merito"\n'
        '- Cobrança com contestação de mérito → "merito"\n'
        '- Caso sem informação suficiente sobre desfecho → "generic"\n'
        '</exemplos_tipo_sentenca>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com a solicitação do magistrado.

    Envia a mensagem original e quaisquer dados adicionais
    disponíveis sobre o processo para extração estruturada.
    """
    msg = context.get("msgOriginal", "")
    dados_processo = context.get("dados_processo", "")

    parts = [
        f'<solicitacao>{msg}</solicitacao>',
    ]

    if dados_processo:
        parts.append(f'<dados_processo>{dados_processo}</dados_processo>')

    parts.append(
        'Extraia os elementos essenciais para elaboração da sentença. '
        'Responda APENAS em JSON válido.'
    )

    return '\n'.join(parts)
