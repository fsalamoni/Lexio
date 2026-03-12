"""Lexio — Agravo de Instrumento genérica: TRIAGEM (Haiku, temperature=0.1, max_tokens=600).

Agente de triagem para Agravo de Instrumento.
Extrai o tema, decisão interlocutória agravada, hipótese de cabimento,
efeito suspensivo e demais elementos necessários à interposição.

O Agravo de Instrumento é recurso cabível contra decisões
interlocutórias, regulamentado pelo CPC/2015 arts. 1.015-1.020.

Hipóteses de cabimento (art. 1.015 CPC — rol taxativo/mitigado):
I    — tutelas provisórias
II   — mérito do processo
III  — rejeição da alegação de convenção de arbitragem
IV   — incidente de desconsideração da personalidade jurídica
V    — rejeição do pedido de gratuidade ou acolhimento de revogação
VI   — exibição ou posse de documento ou coisa
VII  — exclusão de litisconsorte
VIII — rejeição do pedido de limitação do litisconsórcio
IX   — admissão ou inadmissão de intervenção de terceiros
X    — concessão, modificação ou revogação do efeito suspensivo aos ED
XI   — redistribuição do ônus da prova
XII  — (VETADO)
XIII — outros casos expressamente referidos em lei
Parágrafo único — decisões interlocutórias proferidas na fase de
liquidação de sentença ou cumprimento de sentença, no processo de
execução e no processo de inventário

Taxatividade mitigada (Tema 988 STJ):
"O rol do art. 1.015 do CPC é de taxatividade mitigada, por isso admite
a interposição de agravo de instrumento quando verificada a urgência
decorrente da inutilidade do julgamento da questão no recurso de apelação."
"""


def system_prompt(context: dict) -> str:
    return (
        'Você é o TRIADOR para Agravo de Instrumento. Analise a solicitação e extraia '
        'os elementos essenciais para interposição do recurso.\n'
        '\n'
        '<função>\n'
        'Identificar com precisão:\n'
        '1. A DECISÃO INTERLOCUTÓRIA AGRAVADA — descrição precisa\n'
        '   - Qual decisão, de que juízo, em qual processo\n'
        '   - Data da intimação (para contagem do prazo de 15 dias — art. 1.003 CPC)\n'
        '2. A HIPÓTESE DE CABIMENTO (art. 1.015 CPC):\n'
        '   - Inciso específico do art. 1.015\n'
        '   - Se taxatividade mitigada (Tema 988 STJ): demonstrar urgência\n'
        '3. O PEDIDO DE EFEITO SUSPENSIVO / TUTELA RECURSAL:\n'
        '   - Art. 1.019, I CPC: relator pode deferir efeito suspensivo\n'
        '   - Art. 1.019, I CPC: relator pode deferir tutela antecipada recursal\n'
        '   - Demonstrar: probabilidade de provimento + risco de dano grave\n'
        '4. O JUÍZO DE ORIGEM — juiz que proferiu a decisão\n'
        '5. AS PARTES — agravante e agravado\n'
        '6. O PROCESSO DE ORIGEM — número, vara, comarca\n'
        '7. O TRIBUNAL COMPETENTE — TJ ou TRF\n'
        '</função>\n'
        '\n'
        '<regras>\n'
        '- O "tema" DEVE refletir EXATAMENTE a decisão interlocutória impugnada\n'
        '- NUNCA use descrições genéricas como "recurso contra decisão"\n'
        '- Identifique se a decisão se enquadra no rol do art. 1.015\n'
        '- Se não se enquadra expressamente: verificar taxatividade mitigada\n'
        '- Verifique o prazo de 15 dias úteis (art. 1.003, §5º CPC)\n'
        '- Identifique se há necessidade de efeito suspensivo ou tutela recursal\n'
        '</regras>\n'
        '\n'
        '<formato_saida>\n'
        'Responda APENAS JSON válido:\n'
        '{\n'
        '  "tema": "descrição precisa da decisão interlocutória agravada",\n'
        '  "decisao_agravada": "teor resumido da decisão",\n'
        '  "juizo_origem": "vara e comarca/seção judiciária",\n'
        '  "numero_processo_origem": "número do processo",\n'
        '  "agravante": "parte que interpõe o recurso",\n'
        '  "agravado": "parte contrária",\n'
        '  "hipotese_cabimento": "inciso do art. 1.015 CPC ou taxatividade mitigada",\n'
        '  "efeito_suspensivo": {"necessario": true, "fundamento": "..."},\n'
        '  "tutela_recursal": {"necessaria": false, "fundamento": ""},\n'
        '  "prazo": "data da intimação — verificar se dentro dos 15 dias úteis",\n'
        '  "tribunal_competente": "TJ/TRF + Estado/Região",\n'
        '  "palavras_chave": ["palavra1", "palavra2"],\n'
        '  "area_direito": "cível|trabalhista|tributário|outro",\n'
        '  "subtemas": ["subtema1", "subtema2"],\n'
        '  "observacoes": "alertas sobre cabimento ou prazo"\n'
        '}\n'
        '</formato_saida>'
    )


def user_prompt(context: dict) -> str:
    msg = context.get("msgOriginal", "")
    numero_processo = context.get("numero_processo", "")
    parts = [f'<solicitacao>{msg}</solicitacao>']
    if numero_processo:
        parts.append(f'<numero_processo>{numero_processo}</numero_processo>')
    parts.append(
        'Extraia os elementos essenciais para interposição do Agravo de Instrumento. '
        'Responda APENAS em JSON válido.'
    )
    return '\n'.join(parts)
