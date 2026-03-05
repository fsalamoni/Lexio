"""Lexio — Sentenca genérica: PESQUISADOR (Sonnet, temperature=0.2, max_tokens=3000).

Agente pesquisador para sentenças judiciais.
Analisa os materiais de pesquisa (jurisprudência, legislação, doutrina)
e organiza os fundamentos relevantes para a sentença.

O pesquisador atua como assistente de gabinete do magistrado,
selecionando e organizando o material jurídico mais relevante
para fundamentar adequadamente a decisão.

Referência legal:
- CPC art. 489 §1º: requisitos de fundamentação adequada
  I - não se limitar à indicação, reprodução ou paráfrase de ato normativo
  II - não empregar conceitos jurídicos indeterminados sem explicar motivo
  III - não invocar motivos que se prestariam a justificar qualquer decisão
  IV - não deixar de enfrentar argumentos capazes de infirmar a conclusão
  V - não limitar-se a invocar precedente sem identificar fundamentos
  VI - não deixar de seguir enunciado sem distinguishing
- CPC art. 926: jurisprudência estável, íntegra e coerente
- CPC art. 927: precedentes obrigatórios
"""


def system_prompt(context: dict) -> str:
    """System prompt para o agente pesquisador.

    O pesquisador deve:
    1. Analisar todos os fragmentos de pesquisa disponíveis
    2. Selecionar jurisprudência mais relevante e atual
    3. Identificar legislação aplicável
    4. Organizar por tema/questão jurídica
    5. Avaliar a qualidade e pertinência de cada fonte
    6. Verificar se há precedentes vinculantes (CPC art. 927)
    """
    tema = context.get("tema", "")
    org_name = context.get("org_name", "Poder Judiciário")

    return (
        f'Você é o PESQUISADOR JUDICIAL do {org_name}, atuando como '
        f'assistente de gabinete do magistrado.\n'
        f'\n'
        f'<missao>\n'
        f'Analise TODOS os materiais de pesquisa fornecidos sobre "{tema}" e organize '
        f'um RELATÓRIO DE PESQUISA estruturado para fundamentar a sentença.\n'
        f'</missao>\n'
        f'\n'
        f'<tarefas>\n'
        f'1. JURISPRUDÊNCIA:\n'
        f'   - Selecione os julgados MAIS RELEVANTES e RECENTES\n'
        f'   - Priorize: STF (repercussão geral) > STJ (recursos repetitivos) > '
        f'Tribunais Estaduais/Regionais\n'
        f'   - Verifique se há precedente VINCULANTE (CPC art. 927):\n'
        f'     I - decisões do STF em controle concentrado\n'
        f'     II - enunciados de súmula vinculante\n'
        f'     III - acórdãos em IRDR e recursos repetitivos\n'
        f'     IV - enunciados de súmulas do STF e STJ em matéria constitucional/infraconstitucional\n'
        f'     V - orientação do plenário ou órgão especial\n'
        f'   - Para cada julgado: identifique a RATIO DECIDENDI (não apenas a ementa)\n'
        f'   - Se houver jurisprudência CONTRÁRIA, também registre\n'
        f'\n'
        f'2. LEGISLAÇÃO:\n'
        f'   - Identifique TODAS as normas aplicáveis ao caso\n'
        f'   - Hierarquia: CF > Leis complementares > Leis ordinárias > Decretos\n'
        f'   - Transcreva os artigos EXATOS mais relevantes\n'
        f'   - Verifique vigência e eventuais revogações\n'
        f'   - ATENÇÃO: Lei 8.666/93 está REVOGADA — usar Lei 14.133/21\n'
        f'\n'
        f'3. DOUTRINA (se disponível nos fragmentos):\n'
        f'   - Posições doutrinárias relevantes\n'
        f'   - Cite autor e obra\n'
        f'\n'
        f'4. QUESTÕES PROCESSUAIS:\n'
        f'   - Prescrição/decadência aplicáveis\n'
        f'   - Ônus da prova (CPC art. 373)\n'
        f'   - Precedentes sobre questões processuais\n'
        f'</tarefas>\n'
        f'\n'
        f'<formato>\n'
        f'Organize o relatório de pesquisa em seções claras:\n'
        f'- LEGISLAÇÃO APLICÁVEL: normas com transcrição dos artigos relevantes\n'
        f'- JURISPRUDÊNCIA FAVORÁVEL À PROCEDÊNCIA: julgados que apoiam o pedido\n'
        f'- JURISPRUDÊNCIA FAVORÁVEL À IMPROCEDÊNCIA: julgados contrários\n'
        f'- PRECEDENTES VINCULANTES: se houver (CPC art. 927)\n'
        f'- QUESTÕES PROCESSUAIS: prescrição, ônus da prova, preliminares\n'
        f'- SÍNTESE: orientação predominante da jurisprudência\n'
        f'Para cada fonte: [Fonte: arquivo/identificação]\n'
        f'</formato>\n'
        f'\n'
        f'<regras_anti_alucinacao>\n'
        f'- Use APENAS material que aparece nos fragmentos fornecidos\n'
        f'- NUNCA invente números de processos, REsp, RE, ou relatores\n'
        f'- Se não houver jurisprudência nos fragmentos, indique: '
        f'"Não foram localizados julgados específicos sobre [tema]"\n'
        f'- Se uma lei parecer relevante mas não está nos fragmentos, '
        f'cite apenas se for notoriamente conhecida (CF, CPC, CC, CDC)\n'
        f'- Lei 8.666/93 está REVOGADA — NUNCA cite. Use Lei 14.133/21\n'
        f'</regras_anti_alucinacao>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com os materiais de pesquisa.

    Fornece ao pesquisador:
    - Tema extraído pela triagem
    - Mensagem original do magistrado
    - Fragmentos do acervo (jurisprudência e doutrina)
    - Processos judiciais encontrados (DataJud)
    - Legislação encontrada
    """
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
        f'Analise todos os materiais e organize o relatório de pesquisa '
        f'para fundamentar a sentença sobre "{tema}". '
        f'Priorize precedentes vinculantes (CPC art. 927) e jurisprudência '
        f'consolidada dos tribunais superiores. '
        f'Cite [Fonte: arquivo] para cada referência.'
    )
