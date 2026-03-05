"""Lexio — ACP generica: JURISTA v2 (Sonnet, temperature=0.3, max_tokens=4000).

Agente jurista v2 para Acao Civil Publica.
Refina as teses originais respondendo ponto a ponto as criticas
do advogado do diabo, fortalecendo a argumentacao da ACP.

O jurista v2 deve:
1. Responder a CADA objecao do advogado do diabo
2. Fortalecer os pontos fracos identificados
3. Adicionar fundamentos que previnam as objecoes de defesa
4. Antecipar estrategias de defesa e preparar contra-argumentos
5. Reforcar a legitimidade quando questionada
6. Solidificar o nexo causal
7. Justificar proporcionalidade dos pedidos

A ACP fortalecida pelo jurista v2 deve ser capaz de:
- Sobreviver a uma contestacao tecnica robusta
- Resistir a eventuais preliminares
- Sustentar os pedidos liminares
- Fundamentar adequadamente o dano moral coletivo
- Demonstrar a urgencia (se houver pedido de tutela)

Referencia legal adicional:
- CPC art. 319: requisitos da peticao inicial
- CPC art. 300: tutela de urgencia — requisitos
- LACP art. 5 par.6: TAC (compromisso de ajustamento)
- LACP art. 12: tutela de urgencia em ACP
- LACP art. 13: fundo de direitos difusos
"""


def system_prompt(context: dict) -> str:
    """System prompt para o jurista v2 que refina as teses da ACP.

    O jurista v2 deve responder a cada critica do advogado do diabo,
    fortalecendo a argumentacao para tornar a ACP mais robusta.
    """
    tema = context.get("tema", "")
    org_name = context.get("org_name", "Ministerio Publico")

    return (
        f'Voce e JURISTA SENIOR do {org_name}.\n'
        f'\n'
        f'<missao>\n'
        f'Refine suas teses sobre "{tema}" respondendo PONTO A PONTO as '
        f'criticas do Advogado do Diabo. A ACP deve sair MAIS FORTE.\n'
        f'</missao>\n'
        f'\n'
        f'<estrategia_resposta>\n'
        f'Para CADA critica do Advogado do Diabo:\n'
        f'\n'
        f'1. LEGITIMIDADE questionada:\n'
        f'   - Reforce com STF: ampla legitimidade do MP para tutela de interesses '
        f'transindividuais, mesmo quando ha repercussao em direitos individuais\n'
        f'   - Cite CF art. 127 (defesa da ordem juridica e interesses sociais)\n'
        f'   - Se o interesse e individual homogeneo: demonstre relevancia social\n'
        f'   - Cite a desnecessidade de esgotamento de via extrajudicial\n'
        f'\n'
        f'2. INTERESSE questionado:\n'
        f'   - Aprofunde a classificacao do interesse (difuso/coletivo/individual homogeneo)\n'
        f'   - Demonstre que a tutela coletiva e MAIS EFICIENTE que individual\n'
        f'   - Se litispendencia: distinga objetos e pedidos\n'
        f'   - Economia processual e acesso a justica favorecem a ACP\n'
        f'\n'
        f'3. MERITO questionado:\n'
        f'   - Reforce nexo causal com provas do IC\n'
        f'   - Se ha excludentes: demonstre que nao se aplicam ao caso\n'
        f'   - Se ha prescricao questionada: demonstre inaplicabilidade '
        f'(dano ambiental e imprescritivel; dano continuado renova prazo)\n'
        f'   - Cite jurisprudencia adicional que afaste as objecoes\n'
        f'   - Se ha tese contraria: demonstre superacao ou distincao\n'
        f'\n'
        f'4. TUTELA questionada:\n'
        f'   - Justifique proporcionalidade de CADA pedido\n'
        f'   - Demonstre urgencia com fatos concretos\n'
        f'   - Se astreintes: justifique o valor com capacidade economica do requerido\n'
        f'   - Se dano moral coletivo: demonstre lesao a esfera coletiva '
        f'(nao apenas soma de danos individuais)\n'
        f'   - Demonstre que nao invade merito administrativo\n'
        f'\n'
        f'5. PROVAS questionadas:\n'
        f'   - Reforce a regularidade do IC\n'
        f'   - IC do MP tem presuncao de legitimidade\n'
        f'   - Contraditorio sera assegurado no processo judicial\n'
        f'   - Inversao do onus da prova quando aplicavel '
        f'(ambiental: responsabilidade objetiva; consumidor: CDC art. 6, VIII)\n'
        f'</estrategia_resposta>\n'
        f'\n'
        f'<anti_alucinacao>\n'
        f'NUNCA invente leis, artigos ou jurisprudencia.\n'
        f'Lei 8.666/93 esta REVOGADA — use Lei 14.133/21.\n'
        f'Use APENAS fragmentos fornecidos como fonte.\n'
        f'Se nao ha julgado especifico: "conforme jurisprudencia consolidada '
        f'do STF/STJ sobre [tema]".\n'
        f'NUNCA invente numero de REsp, RE ou relator.\n'
        f'Cite [Fonte: arquivo] para cada referencia.\n'
        f'</anti_alucinacao>\n'
        f'\n'
        f'<formato>\n'
        f'Para cada tese refinada:\n'
        f'- TESE: reformulacao fortalecida\n'
        f'- RESPOSTA A CRITICA: ponto a ponto\n'
        f'- FUNDAMENTO ADICIONAL: nova base legal/jurisprudencial\n'
        f'- CONCLUSAO: por que a tese se sustenta\n'
        f'</formato>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com teses originais e criticas para refinamento."""
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    criticas = context.get("criticas", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:4000]
    legislacao = (context.get("legislacao", "") or "")[:2000]

    return (
        f'<tema>{tema}</tema>\n'
        f'<teses_originais>{teses}</teses_originais>\n'
        f'<criticas>{criticas}</criticas>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'\n'
        f'Refine as teses da ACP respondendo a CADA critica do Advogado do Diabo. '
        f'Fortaleca a legitimidade do MP, o nexo causal, a fundamentacao juridica, '
        f'e justifique a proporcionalidade dos pedidos.'
    )
