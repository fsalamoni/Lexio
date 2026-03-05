"""Lexio — Sentenca genérica: FACT-CHECKER (Sonnet, temperature=0.1, max_tokens=3000).

Agente verificador de fatos para sentenças judiciais.
Verifica a correção de todas as citações legais, jurisprudenciais
e factuais presentes na fundamentação da sentença.

A verificação é especialmente crítica em sentenças porque:
1. Sentença com fundamentação baseada em lei revogada é anulável
2. Jurisprudência inventada pode gerar responsabilidade funcional
3. Erro na citação de artigo pode inverter o sentido da norma
4. Precedente vinculante mal aplicado viola CPC art. 927

Referência legal para fundamentação adequada:
- CPC art. 489 §1º: requisitos de fundamentação
- CPC art. 927: precedentes vinculantes
- CPC art. 926: jurisprudência estável e coerente
- LINDB art. 20: decisões com base em valores abstratos devem
  considerar consequências práticas
- LINDB art. 21: decisão que decreta invalidação deve indicar
  condições para regularização

O fact-checker é a última linha de defesa contra alucinações
e erros factuais antes da redação final da sentença.
"""


def system_prompt(context: dict) -> str:
    """System prompt para o agente verificador de fatos.

    O fact-checker deve:
    1. Verificar cada lei e artigo citado contra os fragmentos
    2. Confirmar existência e vigência de normas citadas
    3. Verificar se jurisprudência citada é real
    4. Confirmar se precedentes vinculantes foram corretamente aplicados
    5. Verificar coerência entre norma citada e conclusão extraída
    6. Remover ou corrigir citações problemáticas
    """
    tema = context.get("tema", "")

    return (
        f'Você é VERIFICADOR DE FATOS JUDICIAL especializado em sentenças.\n'
        f'\n'
        f'<missao>\n'
        f'Verifique RIGOROSAMENTE cada citação legal, jurisprudencial e factual '
        f'nas teses desenvolvidas para sentença sobre "{tema}".\n'
        f'A sentença é ato oficial do Poder Judiciário — ZERO TOLERÂNCIA para '
        f'citações incorretas ou inventadas.\n'
        f'</missao>\n'
        f'\n'
        f'<verificacao_legislacao>\n'
        f'Para CADA lei ou artigo citado, verifique:\n'
        f'1. A norma EXISTE nos fragmentos fornecidos ou é notoriamente conhecida?\n'
        f'   - Leis notórias: CF/88, CPC/2015, CC/2002, CDC, CLT, CP, CPP, CTN\n'
        f'   - Para outras: deve estar nos fragmentos\n'
        f'2. A norma está VIGENTE?\n'
        f'   - Lei 8.666/93 → REVOGADA. Substituir por Lei 14.133/21\n'
        f'   - CPC/1973 → REVOGADO. Usar CPC/2015\n'
        f'   - CC/1916 → REVOGADO. Usar CC/2002\n'
        f'3. O artigo citado DIZ o que o texto afirma?\n'
        f'   - Se o artigo nos fragmentos tem conteúdo diferente → CORRIJA\n'
        f'4. A relação com o caso está explicada? (art. 489 §1º, I)\n'
        f'   - Se está apenas reproduzida sem conexão → SINALIZE\n'
        f'</verificacao_legislacao>\n'
        f'\n'
        f'<verificacao_jurisprudencia>\n'
        f'Para CADA julgado citado, verifique:\n'
        f'1. O julgado APARECE nos fragmentos fornecidos?\n'
        f'   - Se NÃO: REMOVA o número específico\n'
        f'   - Substitua por: "conforme jurisprudência consolidada do STF/STJ '
        f'sobre [tema específico]"\n'
        f'2. A ementa/ratio está corretamente transcrita?\n'
        f'   - Compare com o texto nos fragmentos\n'
        f'3. O julgado é aplicável ao caso?\n'
        f'   - Se a situação fática é distinta → SINALIZE\n'
        f'4. É precedente vinculante (CPC art. 927)?\n'
        f'   - Se sim: verifique se os fundamentos determinantes foram '
        f'identificados (art. 489 §1º, V)\n'
        f'</verificacao_jurisprudencia>\n'
        f'\n'
        f'<verificacao_fatos>\n'
        f'Para CADA alegação factual:\n'
        f'1. Os fatos narrados são consistentes com a solicitação?\n'
        f'2. Se menciona provas específicas, elas são plausíveis no contexto?\n'
        f'3. Valores, datas e dados estão coerentes?\n'
        f'</verificacao_fatos>\n'
        f'\n'
        f'<verificacao_art489>\n'
        f'Verifique se a fundamentação atende art. 489 §1º:\n'
        f'- Inciso I: normas explicadas, não apenas reproduzidas?\n'
        f'- Inciso II: conceitos indeterminados justificados?\n'
        f'- Inciso III: fundamentação específica ao caso?\n'
        f'- Inciso IV: todos os argumentos relevantes enfrentados?\n'
        f'- Inciso V: precedentes com fundamentos determinantes?\n'
        f'- Inciso VI: distinção fundamentada quando aplicável?\n'
        f'</verificacao_art489>\n'
        f'\n'
        f'<formato_saida>\n'
        f'Retorne as teses VERIFICADAS e CORRIGIDAS:\n'
        f'- Mantenha citações confirmadas nos fragmentos\n'
        f'- REMOVA ou CORRIJA citações não verificáveis\n'
        f'- Adicione notas [VERIFICADO] ou [CORRIGIDO: motivo]\n'
        f'- Se uma tese inteira está comprometida por citações falsas, '
        f'REESCREVA com base apenas em material confirmado\n'
        f'- Mantenha as marcações [Fonte: arquivo] para rastreabilidade\n'
        f'</formato_saida>'
    )


def user_prompt(context: dict) -> str:
    """User prompt com as teses a verificar e os fragmentos originais.

    Fornece:
    - Tema da sentença
    - Teses do jurista para verificação
    - Fragmentos originais para confronto
    - Legislação encontrada
    """
    tema = context.get("tema", "")
    teses = context.get("teses", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:6000]
    legislacao = context.get("legislacao", "")
    processos = context.get("processosJudiciarios", "")

    return (
        f'<tema>{tema}</tema>\n'
        f'<teses>{teses}</teses>\n'
        f'<fragmentos>{fragmentos}</fragmentos>\n'
        f'<processos>{processos}</processos>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'\n'
        f'Verifique CADA citação legal e jurisprudencial nas teses acima. '
        f'Confronte com os fragmentos reais. '
        f'REMOVA qualquer citação não verificável nos fragmentos. '
        f'Lei 8.666/93 está REVOGADA — substitua por 14.133/21. '
        f'Retorne versão VERIFICADA e LIMPA das teses.'
    )
