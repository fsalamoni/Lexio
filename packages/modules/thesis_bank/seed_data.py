"""Lexio Thesis Bank — Seed data extracted from the vectorized legal corpus.

This module contains pre-extracted legal theses derived from analyzing the
vectorized documents in the Teses/ Qdrant collections (acervo_mprs).

The corpus includes pareceres (legal opinions), jurisprudência (case law),
doutrina (legal scholarship), petições (petitions), and modelos (templates)
primarily from the Ministério Público do Rio Grande do Sul (MPRS) and
related institutions.

Each thesis is a self-contained, reusable legal argument that can be
referenced when generating new legal documents.
"""

from __future__ import annotations

SEED_THESES: list[dict] = [
    # =========================================================================
    # DIREITO ADMINISTRATIVO
    # =========================================================================
    {
        "title": "Improbidade administrativa por enriquecimento ilícito independe de dano ao erário",
        "content": (
            "Para fins de improbidade administrativa, basta o enriquecimento ilícito "
            "intencional, em desconformidade com o ordenamento jurídico, independentemente "
            "de prejuízo para a Administração Pública. O art. 9º da Lei nº 8.429/1992 "
            "(Lei de Improbidade Administrativa) tipifica condutas que importam em "
            "enriquecimento ilícito, não exigindo a demonstração de dano efetivo ao "
            "erário como elemento constitutivo do tipo. Conforme a doutrina de Fernando "
            "Fonseca Gajardoni, Luana Pedrosa de Figueiredo Cruz, Luiz Manoel Gomes "
            "Júnior e Rogerio Favreto, o enriquecimento ilícito, por si só, configura "
            "ato de improbidade quando praticado com dolo, sendo desnecessária a prova "
            "de lesão patrimonial ao ente público."
        ),
        "summary": (
            "O enriquecimento ilícito doloso configura improbidade administrativa "
            "independentemente de dano ao erário, conforme art. 9º da LIA."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["improbidade", "enriquecimento ilícito", "LIA", "art. 9º", "dano ao erário"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "art. 9º", "description": "Atos que importam em enriquecimento ilícito"},
            {"law": "Constituição Federal", "article": "art. 37, §4º", "description": "Sanções por improbidade administrativa"},
        ],
        "precedents": [
            {"court": "STJ", "case_number": "REsp 1.185.835/RJ", "summary": "Desnecessidade de dano ao erário para configuração de enriquecimento ilícito"},
        ],
        "quality_score": 92,
        "source_type": "imported",
    },
    {
        "title": "Nepotismo decorre diretamente dos princípios constitucionais — Súmula Vinculante 13",
        "content": (
            "O Supremo Tribunal Federal, no julgamento do RE 579.951-RG, firmou o "
            "entendimento no sentido de que a proibição ao nepotismo decorre diretamente "
            "dos princípios constitucionais do art. 37, caput, da Constituição Federal, "
            "independentemente de lei formal. A Súmula Vinculante 13 consolida que a "
            "nomeação de cônjuge, companheiro ou parente em linha reta, colateral ou por "
            "afinidade, até o terceiro grau, inclusive, da autoridade nomeante ou de "
            "servidor da mesma pessoa jurídica investido em cargo de direção, chefia ou "
            "assessoramento, para o exercício de cargo em comissão ou de confiança ou, "
            "ainda, de função gratificada na administração pública direta e indireta em "
            "qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos "
            "Municípios, compreendido o ajuste mediante designações recíprocas, viola a "
            "Constituição Federal."
        ),
        "summary": (
            "A proibição ao nepotismo decorre dos princípios do art. 37 da CF, "
            "conforme Súmula Vinculante 13 do STF."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["nepotismo", "Súmula Vinculante 13", "cargo em comissão", "princípios administrativos"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 37, caput", "description": "Princípios da administração pública"},
            {"law": "Súmula Vinculante 13", "article": "", "description": "Vedação ao nepotismo"},
        ],
        "precedents": [
            {"court": "STF", "case_number": "RE 579.951-RG", "summary": "Proibição ao nepotismo independe de lei formal"},
        ],
        "quality_score": 95,
        "source_type": "imported",
    },
    {
        "title": "Ofensa a princípios administrativos como modalidade autônoma de improbidade",
        "content": (
            "O art. 11 da Lei nº 8.429/1992 estabelece modalidade autônoma de ato de "
            "improbidade administrativa por ofensa aos princípios da administração "
            "pública, independentemente de enriquecimento ilícito ou dano ao erário. "
            "A jurisprudência consolidou que as sanções impostas por violação ao caput "
            "do art. 11 — incluindo multa civil e proibição de contratar com o Poder "
            "Público ou dele receber benefícios ou incentivos fiscais — aplicam-se "
            "quando comprovada a conduta dolosa do agente público que atente contra os "
            "princípios da legalidade, impessoalidade, moralidade, publicidade e "
            "eficiência, ainda que não haja demonstração de prejuízo patrimonial."
        ),
        "summary": (
            "A ofensa a princípios administrativos (art. 11 da LIA) constitui ato de "
            "improbidade autônomo, dispensando dano ou enriquecimento."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["improbidade", "princípios administrativos", "art. 11", "moralidade", "dolo"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "art. 11, caput", "description": "Atos que atentam contra princípios"},
            {"law": "Constituição Federal", "article": "art. 37, caput", "description": "Princípios da administração pública"},
        ],
        "precedents": [],
        "quality_score": 90,
        "source_type": "imported",
    },
    {
        "title": "Agente público para fins de improbidade — conceito amplo do art. 2º da LIA",
        "content": (
            "Reputa-se agente público, para os efeitos da Lei de Improbidade "
            "Administrativa, todo aquele que exerce, ainda que transitoriamente ou "
            "sem remuneração, por eleição, nomeação, designação, contratação ou "
            "qualquer outra forma de investidura ou vínculo, mandato, cargo, emprego "
            "ou função nas entidades da Administração Pública. Este conceito amplo "
            "abrange não apenas servidores efetivos e comissionados, mas também "
            "agentes políticos, particulares em colaboração e qualquer pessoa que "
            "exerça função pública, assegurando a máxima efetividade do sistema de "
            "responsabilização por atos de improbidade."
        ),
        "summary": (
            "O conceito de agente público na LIA é amplo, abrangendo qualquer pessoa "
            "que exerça função pública, ainda que transitória ou sem remuneração."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["agente público", "LIA", "art. 2º", "conceito amplo", "função pública"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "art. 2º", "description": "Conceito de agente público"},
        ],
        "precedents": [],
        "quality_score": 88,
        "source_type": "imported",
    },
    {
        "title": "Tipologia de rachadinhas — desvio de remuneração de servidores",
        "content": (
            "A prática conhecida como 'rachadinha' consiste no desvio de parte da "
            "remuneração de servidores nomeados para cargos em comissão, que devolvem "
            "parcela de seus vencimentos ao agente público que os nomeou. Esta conduta "
            "configura, simultaneamente, ato de improbidade administrativa por "
            "enriquecimento ilícito (art. 9º da LIA) e por dano ao erário (art. 10), "
            "além de poder configurar os crimes de peculato (art. 312 do CP), "
            "concussão (art. 316 do CP) ou corrupção passiva (art. 317 do CP). "
            "A investigação deve abranger a análise de movimentações financeiras, "
            "patrimônio dos envolvidos e depoimentos de servidores nomeados."
        ),
        "summary": (
            "Rachadinhas configuram improbidade por enriquecimento ilícito e dano ao "
            "erário, além de crimes de peculato, concussão ou corrupção passiva."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["rachadinha", "peculato", "concussão", "cargo em comissão", "desvio"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "arts. 9º e 10", "description": "Enriquecimento ilícito e dano ao erário"},
            {"law": "Código Penal", "article": "arts. 312, 316, 317", "description": "Peculato, concussão, corrupção passiva"},
        ],
        "precedents": [],
        "quality_score": 91,
        "source_type": "imported",
    },
    {
        "title": "Responsabilidade objetiva da pessoa jurídica na Lei Anticorrupção",
        "content": (
            "A Lei nº 12.846/2013 (Lei Anticorrupção) estabelece a responsabilidade "
            "objetiva administrativa e civil de pessoas jurídicas pela prática de atos "
            "lesivos contra a administração pública. As sanções previstas incluem multa "
            "de 0,1% a 20% do faturamento bruto do último exercício anterior à "
            "instauração do processo administrativo, excluídos os tributos, a qual "
            "nunca será inferior à vantagem auferida, quando possível sua estimação. "
            "A responsabilização independe de culpa ou dolo da pessoa jurídica, "
            "bastando a demonstração do nexo causal entre a conduta e o resultado "
            "lesivo à administração pública."
        ),
        "summary": (
            "A Lei Anticorrupção prevê responsabilidade objetiva de pessoas jurídicas "
            "com multa de até 20% do faturamento bruto."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["anticorrupção", "responsabilidade objetiva", "pessoa jurídica", "multa"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 12.846/2013", "article": "art. 6º, I", "description": "Sanções administrativas"},
        ],
        "precedents": [],
        "quality_score": 89,
        "source_type": "imported",
    },
    {
        "title": "Limites de gastos com folha de pagamento da Câmara Municipal",
        "content": (
            "O art. 29-A, §1º, da Constituição Federal estabelece que a Câmara "
            "Municipal não pode gastar mais de 70% de sua receita com folha de "
            "pagamento, incluído o gasto com o subsídio de seus vereadores. Ademais, "
            "o art. 37 da CF/88 determina que a administração pública direta e "
            "indireta de qualquer dos Poderes da União, dos Estados, do Distrito "
            "Federal e dos Municípios obedecerá aos princípios de legalidade, "
            "impessoalidade, moralidade, publicidade e eficiência. A Lei de "
            "Responsabilidade Fiscal (LC nº 101/2000) complementa estas limitações "
            "com controles adicionais sobre despesas com pessoal."
        ),
        "summary": (
            "A Câmara Municipal não pode gastar mais de 70% de sua receita com "
            "folha de pagamento, conforme art. 29-A, §1º, da CF."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["Câmara Municipal", "folha de pagamento", "LRF", "limite de gastos"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 29-A, §1º", "description": "Limite de gastos da Câmara Municipal"},
            {"law": "Constituição Federal", "article": "art. 37", "description": "Princípios da administração pública"},
            {"law": "LC nº 101/2000", "article": "", "description": "Lei de Responsabilidade Fiscal"},
        ],
        "precedents": [],
        "quality_score": 87,
        "source_type": "imported",
    },
    {
        "title": "Autorização de uso de bem público — distinção de concessão e permissão",
        "content": (
            "A autorização de uso de bem público tem como objetivo a utilização de "
            "determinado bem para o desenvolvimento de dada atividade individual, "
            "tratando-se de ato precário e discricionário. Distingue-se da concessão "
            "de uso, que pressupõe interesse público predominante e possui maior "
            "estabilidade, e da permissão de uso, que igualmente é precária mas exige "
            "interesse coletivo. A autorização é cabível para utilizações de interesse "
            "de particulares, desde que não prejudiquem a comunidade nem embaracem "
            "o serviço público, conforme lição doutrinária consolidada em direito "
            "administrativo."
        ),
        "summary": (
            "A autorização de uso de bem público é ato precário e discricionário, "
            "distinto da concessão e permissão de uso."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["bens públicos", "autorização de uso", "concessão", "permissão", "ato precário"],
        "category": "material",
        "legal_basis": [
            {"law": "Código Civil", "article": "art. 99", "description": "Classificação dos bens públicos"},
        ],
        "precedents": [],
        "quality_score": 82,
        "source_type": "imported",
    },
    {
        "title": "Administrador judicial — possibilidade de contratação de auxiliares",
        "content": (
            "Caso o administrador judicial não consiga desempenhar pessoalmente a "
            "função, seja em razão da complexidade de determinada atuação diária "
            "ou da necessidade de conhecimentos específicos sobre o ativo, pode "
            "requerer ao juiz a contratação de auxiliares (art. 22, I, 'h', da "
            "Lei nº 11.101/2005). A remuneração desses auxiliares deve ser "
            "compatível com o serviço prestado e aprovada pelo juiz, observados "
            "os limites estabelecidos na legislação falimentar, com vistas a "
            "assegurar a eficiência da administração da massa e a preservação "
            "dos interesses dos credores."
        ),
        "summary": (
            "O administrador judicial pode requerer auxiliares quando a "
            "complexidade da função exigir, conforme art. 22, I, 'h', da Lei "
            "de Falências."
        ),
        "legal_area_id": "business",
        "document_type_id": "parecer",
        "tags": ["falência", "administrador judicial", "auxiliares", "recuperação judicial"],
        "category": "processual",
        "legal_basis": [
            {"law": "Lei nº 11.101/2005", "article": "art. 22, I, 'h'", "description": "Atribuições do administrador judicial"},
        ],
        "precedents": [],
        "quality_score": 83,
        "source_type": "imported",
    },
    {
        "title": "Grupo econômico — controle e sincronia de atuação empresarial",
        "content": (
            "Na definição proposta por João Guilherme Muniz (2013), grupo econômico "
            "compreende o conjunto de empresas e entidades empresariais ou societárias "
            "que, sob a batuta de um indivíduo ou entidade, atuem em sincronia para "
            "lograr objetivos comuns. A posse de capital suficiente para exercer o "
            "controle das atividades de administração da sociedade é elemento "
            "caracterizador do grupo. O reconhecimento do grupo econômico tem "
            "relevância para fins de responsabilização solidária, desconsideração "
            "da personalidade jurídica e análise de poder de mercado, sendo "
            "fundamental em ações de improbidade administrativa envolvendo "
            "empresas relacionadas."
        ),
        "summary": (
            "Grupo econômico é o conjunto de entidades que atuam em sincronia sob "
            "controle comum, com relevância para responsabilização solidária."
        ),
        "legal_area_id": "business",
        "document_type_id": "parecer",
        "tags": ["grupo econômico", "controle societário", "responsabilidade solidária"],
        "category": "material",
        "legal_basis": [
            {"law": "Código Civil", "article": "art. 50", "description": "Desconsideração da personalidade jurídica"},
        ],
        "precedents": [],
        "quality_score": 80,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO CONSTITUCIONAL
    # =========================================================================
    {
        "title": "Audiência pública como instrumento da administração consensual",
        "content": (
            "A Constituição de 1988 pretendeu que a democracia se realizasse por "
            "meio dos representantes eleitos pelo povo, mas também diretamente, "
            "nas formas por ela permitidas. A audiência pública constitui instrumento "
            "fundamental da administração consensual, garantindo o acesso de qualquer "
            "interessado e o direito de participação efetiva nas decisões "
            "administrativas. No capítulo referente ao Meio Ambiente, a Constituição "
            "consagrou pela primeira vez a necessidade de participação popular "
            "nos processos decisórios ambientais, modelo que se estendeu a "
            "diversas áreas da atuação estatal."
        ),
        "summary": (
            "A audiência pública é instrumento constitucional da democracia "
            "participativa e da administração consensual."
        ),
        "legal_area_id": "constitutional",
        "document_type_id": "parecer",
        "tags": ["audiência pública", "democracia participativa", "administração consensual"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 1º, parágrafo único", "description": "Soberania popular"},
            {"law": "Constituição Federal", "article": "art. 225", "description": "Proteção ambiental e participação popular"},
        ],
        "precedents": [],
        "quality_score": 85,
        "source_type": "imported",
    },
    {
        "title": "Direito à vida como princípio fundamental inviolável",
        "content": (
            "A Constituição Federal garante aos brasileiros e estrangeiros que "
            "residam no País a inviolabilidade do direito à vida como princípio "
            "fundamental, elevado pela Carta Política para um degrau mais alto "
            "entre os direitos constitucionais, sendo dever do Estado preservar "
            "a vida e a subsistência do cidadão. Este direito fundamental irradia "
            "seus efeitos sobre todo o ordenamento jurídico, servindo como "
            "parâmetro interpretativo para a legislação infraconstitucional e "
            "impondo ao Poder Público o dever de adotar medidas positivas para "
            "sua efetivação."
        ),
        "summary": (
            "O direito à vida é princípio fundamental inviolável, impondo ao "
            "Estado dever de preservação ativa."
        ),
        "legal_area_id": "constitutional",
        "document_type_id": "parecer",
        "tags": ["direito à vida", "princípio fundamental", "inviolabilidade", "dignidade"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 5º, caput", "description": "Inviolabilidade do direito à vida"},
        ],
        "precedents": [],
        "quality_score": 90,
        "source_type": "imported",
    },
    {
        "title": "Contratação temporária por excepcional interesse público — requisitos constitucionais",
        "content": (
            "O Supremo Tribunal Federal firmou entendimento de que a contratação "
            "temporária por necessidade de excepcional interesse público, prevista "
            "no art. 37, IX, da Constituição Federal, exige: (i) previsão legal "
            "dos casos de contratação; (ii) tempo determinado; (iii) necessidade "
            "temporária de excepcional interesse público; e (iv) excepcionalidade "
            "que justifique a não realização de concurso público. A contratação "
            "para atendimento de atividades ordinárias e permanentes do Estado "
            "não se enquadra nesta hipótese constitucional, devendo ser suprida "
            "por concurso público regular."
        ),
        "summary": (
            "A contratação temporária do art. 37, IX, da CF exige lei, tempo "
            "determinado e excepcionalidade comprovada."
        ),
        "legal_area_id": "constitutional",
        "document_type_id": "parecer",
        "tags": ["contratação temporária", "concurso público", "interesse público", "art. 37 IX"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 37, IX", "description": "Contratação temporária"},
            {"law": "Constituição Federal", "article": "art. 37, II", "description": "Obrigatoriedade de concurso público"},
        ],
        "precedents": [
            {"court": "STF", "case_number": "RE 910.552/MG", "summary": "Requisitos da contratação temporária"},
        ],
        "quality_score": 93,
        "source_type": "imported",
    },
    {
        "title": "Acumulação de mandato eletivo de vereador com cargo público",
        "content": (
            "O art. 38, inciso III, da Constituição Federal dispõe sobre a "
            "acumulação de mandato eletivo de vereador com cargo público, "
            "estabelecendo que, havendo compatibilidade de horários, o vereador "
            "perceberá as vantagens de seu cargo, emprego ou função, sem prejuízo "
            "da remuneração do cargo eletivo. Inexistindo compatibilidade, será "
            "aplicada a regra do inciso II do mesmo artigo. A interpretação deste "
            "dispositivo deve observar o teto remuneratório constitucional e os "
            "princípios da moralidade e eficiência administrativa."
        ),
        "summary": (
            "Vereador pode acumular cargo público se houver compatibilidade de "
            "horários, percebendo ambas as remunerações (art. 38, III, CF)."
        ),
        "legal_area_id": "constitutional",
        "document_type_id": "parecer",
        "tags": ["vereador", "acumulação", "mandato eletivo", "cargo público", "art. 38"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 38, III", "description": "Acumulação de mandato com cargo público"},
        ],
        "precedents": [],
        "quality_score": 86,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO CIVIL
    # =========================================================================
    {
        "title": "Responsabilidade civil do Estado por atos de seus agentes",
        "content": (
            "As pessoas jurídicas de direito público e as de direito privado "
            "prestadoras de serviços públicos responderão pelos danos que seus "
            "agentes, nessa qualidade, causarem a terceiros, sendo assegurado o "
            "direito de regresso contra o responsável nos casos de dolo ou culpa, "
            "nos termos do art. 37, §6º, da Constituição Federal. A jurisprudência "
            "consolidou que a autoria dos atos estatais deve ser imputada ao Poder "
            "Público, e não aos agentes que são meros instrumentos utilizados para "
            "a consecução dos objetivos públicos, configurando responsabilidade "
            "objetiva do ente estatal."
        ),
        "summary": (
            "O Estado responde objetivamente por danos causados por seus agentes "
            "no exercício da função, com direito de regresso (art. 37, §6º, CF)."
        ),
        "legal_area_id": "civil",
        "document_type_id": "parecer",
        "tags": ["responsabilidade civil", "Estado", "agentes públicos", "responsabilidade objetiva"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 37, §6º", "description": "Responsabilidade civil do Estado"},
        ],
        "precedents": [],
        "quality_score": 91,
        "source_type": "imported",
    },
    {
        "title": "Multa judicial (astreintes) como meio coercitivo atípico",
        "content": (
            "A multa judicial, também denominada astreintes, constitui meio "
            "coercitivo atípico destinado a compelir o devedor ao cumprimento de "
            "obrigação específica determinada judicialmente. Sua natureza é "
            "processual e acessória, não se confundindo com a indenização por "
            "perdas e danos. O valor da multa deve ser suficientemente "
            "significativo para desestimular o descumprimento, podendo ser "
            "majorado ou reduzido pelo juiz conforme as circunstâncias do caso "
            "concreto, nos termos do art. 537 do CPC."
        ),
        "summary": (
            "As astreintes são meio coercitivo processual para compelir o "
            "cumprimento de obrigação específica, ajustável pelo juiz."
        ),
        "legal_area_id": "civil_procedure",
        "document_type_id": "peticao_inicial",
        "tags": ["astreintes", "multa judicial", "obrigação de fazer", "execução", "CPC"],
        "category": "processual",
        "legal_basis": [
            {"law": "CPC", "article": "art. 537", "description": "Multa periódica para cumprimento de obrigação"},
        ],
        "precedents": [],
        "quality_score": 85,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO DO CONSUMIDOR
    # =========================================================================
    {
        "title": "Ação coletiva de consumo — legitimidade do Ministério Público",
        "content": (
            "O Ministério Público possui legitimidade ativa para propor ação "
            "coletiva de consumo em defesa dos interesses difusos e coletivos "
            "dos consumidores, nos termos do art. 82, I, do Código de Defesa "
            "do Consumidor e do art. 129, III, da Constituição Federal. No "
            "cumprimento de sentença, o MP pode requerer providências executivas "
            "para garantir a efetividade da condenação, inclusive a pagar quantia "
            "certa, atuando como substituto processual dos consumidores lesados. "
            "A atuação ministerial nesta seara visa à tutela de direitos "
            "transindividuais, dispensando a identificação individualizada dos "
            "beneficiários."
        ),
        "summary": (
            "O MP é legitimado para ação coletiva de consumo em defesa de "
            "interesses difusos e coletivos, atuando como substituto processual."
        ),
        "legal_area_id": "consumer",
        "document_type_id": "peticao_inicial",
        "tags": ["ação coletiva", "consumidor", "Ministério Público", "legitimidade", "direitos difusos"],
        "category": "processual",
        "legal_basis": [
            {"law": "CDC", "article": "art. 82, I", "description": "Legitimidade do MP em ações coletivas"},
            {"law": "Constituição Federal", "article": "art. 129, III", "description": "Funções institucionais do MP"},
        ],
        "precedents": [],
        "quality_score": 88,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO DE FAMÍLIA E SUCESSÕES
    # =========================================================================
    {
        "title": "Atuação multifacetada do MP no inventário causa mortis",
        "content": (
            "A atuação do Ministério Público na área processual, especialmente "
            "no inventário causa mortis, é multifacetada, o que significa que seu "
            "trabalho pode se manifestar de diferentes formas. Sua forma mais "
            "emblemática é a participação na condição de custos legis, conforme "
            "previsto no art. 178 do CPC. Contudo, é importante ressaltar que esta "
            "não é a única função, pois o Ministério Público pode atuar como "
            "proponente da ação quando existirem interesses de incapazes, "
            "ausentes ou quando houver necessidade de preservação do interesse "
            "público, legitimando sua intervenção obrigatória."
        ),
        "summary": (
            "O MP atua de forma multifacetada no inventário: como custos legis "
            "(art. 178 CPC) e como proponente quando há interesses de incapazes."
        ),
        "legal_area_id": "inheritance",
        "document_type_id": "parecer",
        "tags": ["inventário", "custos legis", "Ministério Público", "incapazes", "sucessões"],
        "category": "processual",
        "legal_basis": [
            {"law": "CPC", "article": "art. 178", "description": "Intervenção do MP como custos legis"},
            {"law": "CPC", "article": "art. 626", "description": "Inventário e partilha"},
        ],
        "precedents": [],
        "quality_score": 84,
        "source_type": "imported",
    },
    {
        "title": "Concomitância da paternidade socioafetiva e biológica",
        "content": (
            "O reconhecimento jurídico da concomitância da paternidade "
            "socioafetiva e biológica e suas consequências jurídicas representa "
            "evolução significativa no direito de família brasileiro. O Supremo "
            "Tribunal Federal, no julgamento do RE 898.060 (Tema 622), fixou a "
            "tese de que a existência de paternidade socioafetiva não impede o "
            "reconhecimento da paternidade biológica e seus efeitos jurídicos, "
            "incluindo registro civil, direitos alimentares e sucessórios, "
            "consagrando a possibilidade de multiparentalidade no ordenamento "
            "jurídico brasileiro."
        ),
        "summary": (
            "A paternidade socioafetiva e biológica podem coexistir com efeitos "
            "jurídicos plenos — multiparentalidade (STF, Tema 622)."
        ),
        "legal_area_id": "family",
        "document_type_id": "parecer",
        "tags": ["multiparentalidade", "socioafetividade", "paternidade biológica", "filiação"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 226, §7º", "description": "Princípio da paternidade responsável"},
            {"law": "Código Civil", "article": "art. 1.593", "description": "Parentesco natural e civil"},
        ],
        "precedents": [
            {"court": "STF", "case_number": "RE 898.060", "summary": "Multiparentalidade — Tema 622 de repercussão geral"},
        ],
        "quality_score": 92,
        "source_type": "imported",
    },
    {
        "title": "Testamento — nulidade, revogação, rompimento e caducidade",
        "content": (
            "O testamento válido e eficaz pode ser afetado por diferentes "
            "vicissitudes: invalidação (nulidade ou anulabilidade por vício de "
            "forma ou conteúdo), revogação (ato de vontade do testador), "
            "rompimento (superveniência de descendente) ou caducidade (ineficácia "
            "por causa superveniente). Para a transferência de bens via testamento, "
            "exige-se expressa autorização do juízo sucessório competente. Quando "
            "o testamento for invalidado, revogado, rompido ou caduco, e a "
            "sentença tenha sido reconhecida pelo juízo, a herança segue as "
            "regras da sucessão legítima."
        ),
        "summary": (
            "O testamento pode ser invalidado, revogado, rompido ou tornado "
            "caduco, revertendo à sucessão legítima."
        ),
        "legal_area_id": "inheritance",
        "document_type_id": "parecer",
        "tags": ["testamento", "nulidade", "revogação", "caducidade", "sucessão legítima"],
        "category": "material",
        "legal_basis": [
            {"law": "Código Civil", "article": "arts. 1.857 a 1.990", "description": "Da sucessão testamentária"},
        ],
        "precedents": [],
        "quality_score": 83,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO DO TRABALHO / PREVIDENCIÁRIO
    # =========================================================================
    {
        "title": "Piso nacional da enfermagem — constitucionalidade e aplicação",
        "content": (
            "O piso salarial nacional para enfermeiros, técnicos de enfermagem "
            "e auxiliares de enfermagem, instituído pela Lei nº 14.434/2022, "
            "foi objeto de análise pelo Supremo Tribunal Federal na ADI 7.222. "
            "A implementação do piso deve observar a capacidade orçamentária dos "
            "entes federativos, especialmente dos municípios, que podem necessitar "
            "de complementação financeira da União para viabilizar o pagamento. "
            "O Ministério Público tem atuação relevante na fiscalização do "
            "cumprimento desta obrigação legal, podendo instaurar procedimentos "
            "para averiguar a correta implementação do piso."
        ),
        "summary": (
            "O piso nacional da enfermagem deve observar a capacidade orçamentária "
            "dos entes, com possível complementação da União."
        ),
        "legal_area_id": "labor",
        "document_type_id": "parecer",
        "tags": ["piso enfermagem", "saúde", "capacidade orçamentária", "ADI 7.222"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 14.434/2022", "article": "", "description": "Piso salarial da enfermagem"},
        ],
        "precedents": [
            {"court": "STF", "case_number": "ADI 7.222", "summary": "Constitucionalidade do piso da enfermagem"},
        ],
        "quality_score": 84,
        "source_type": "imported",
    },
    {
        "title": "Imunidade tributária das entidades filantrópicas de assistência social",
        "content": (
            "As entidades filantrópicas são imunes às contribuições para a seguridade "
            "social, nos termos do art. 195, §7º, da Constituição Federal, que utiliza "
            "a expressão 'isentas' quando a regra constitucional que estabelece renúncia "
            "fiscal se denomina imunidade. O art. 146 da Constituição Federal reforça "
            "que cabe à lei complementar regular as limitações constitucionais ao poder "
            "de tributar e estabelecer normas gerais em matéria de legislação tributária. "
            "A natureza filantrópica faz presumir que a entidade não pode arcar com as "
            "contribuições, sendo possível inclusive a concessão dos benefícios da "
            "justiça gratuita a pessoa jurídica sem fins lucrativos."
        ),
        "summary": (
            "Entidades filantrópicas gozam de imunidade tributária (art. 195, §7º, CF), "
            "presumindo-se a impossibilidade de arcar com contribuições sociais."
        ),
        "legal_area_id": "tax",
        "document_type_id": "parecer",
        "tags": ["imunidade tributária", "entidade filantrópica", "contribuição social", "terceiro setor"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 195, §7º", "description": "Imunidade das entidades filantrópicas"},
            {"law": "Constituição Federal", "article": "art. 146", "description": "Lei complementar tributária"},
        ],
        "precedents": [],
        "quality_score": 87,
        "source_type": "imported",
    },
    # =========================================================================
    # LICITAÇÕES E CONTRATOS
    # =========================================================================
    {
        "title": "Contratação de shows e artistas pelo Poder Público — tipologia",
        "content": (
            "A contratação de shows e artistas pelo Poder Público deve observar "
            "os princípios da legalidade, impessoalidade, moralidade e eficiência, "
            "não podendo servir como instrumento de promoção pessoal de agentes "
            "públicos. A tipologia de irregularidades inclui: sobrepreço e "
            "superfaturamento, direcionamento da contratação, fracionamento "
            "indevido do objeto, ausência de pesquisa de preços adequada, "
            "pagamentos antecipados sem garantia e ausência de fiscalização "
            "da execução contratual. O Tribunal de Contas e o Ministério "
            "Público devem exercer controle rigoroso sobre estas contratações."
        ),
        "summary": (
            "Contratação de shows pelo Poder Público exige observância dos "
            "princípios administrativos e controle contra sobrepreço e "
            "direcionamento."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["licitação", "shows", "sobrepreço", "contratação direta", "controle externo"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 14.133/2021", "article": "arts. 74 e 75", "description": "Inexigibilidade e dispensa de licitação"},
        ],
        "precedents": [],
        "quality_score": 81,
        "source_type": "imported",
    },
    {
        "title": "Dispensa de licitação — requisitos legais e formalidades",
        "content": (
            "A dispensa de licitação, prevista no art. 75 da Lei nº 14.133/2021 "
            "(Nova Lei de Licitações), é hipótese excepcional que exige o "
            "cumprimento de formalidades específicas para sua validade, incluindo: "
            "justificativa fundamentada da autoridade competente, pesquisa de "
            "preços de mercado, ratificação pela autoridade superior e publicação "
            "na imprensa oficial. O descumprimento destas formalidades pode "
            "configurar ato de improbidade administrativa e crime previsto na "
            "legislação penal. O fundamento legal deve ser expresso e adequado "
            "ao caso concreto."
        ),
        "summary": (
            "A dispensa de licitação exige justificativa, pesquisa de preços, "
            "ratificação e publicação, sob pena de improbidade."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["dispensa", "licitação", "formalidades", "Lei 14.133/2021", "pesquisa de preços"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 14.133/2021", "article": "art. 75", "description": "Hipóteses de dispensa de licitação"},
        ],
        "precedents": [],
        "quality_score": 86,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITO PROCESSUAL CIVIL
    # =========================================================================
    {
        "title": "Improbidade administrativa — transmissibilidade aos herdeiros",
        "content": (
            "A ação de improbidade administrativa é transmissível aos herdeiros "
            "do agente ímprobo falecido, nos limites da herança, para fins de "
            "ressarcimento ao erário. O STJ consolidou o entendimento de que o "
            "falecimento do réu não extingue a ação de improbidade, devendo ser "
            "promovida a habilitação da viúva meeira e demais herdeiros no polo "
            "passivo da demanda. As sanções de natureza pessoal (como suspensão "
            "de direitos políticos) se extinguem com a morte, mas as de natureza "
            "patrimonial (ressarcimento e multa civil) são transmissíveis."
        ),
        "summary": (
            "A ação de improbidade se transmite aos herdeiros para fins "
            "patrimoniais, mas sanções pessoais se extinguem com a morte."
        ),
        "legal_area_id": "civil_procedure",
        "document_type_id": "parecer",
        "tags": ["improbidade", "transmissibilidade", "herdeiros", "ressarcimento", "morte do réu"],
        "category": "processual",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "art. 8º", "description": "Ressarcimento integral do dano"},
            {"law": "Constituição Federal", "article": "art. 5º, XLV", "description": "Intranscendência da pena"},
        ],
        "precedents": [
            {"court": "STJ", "case_number": "REsp 732.777/MG", "summary": "Habilitação de herdeiros em ação de improbidade"},
        ],
        "quality_score": 89,
        "source_type": "imported",
    },
    {
        "title": "Acordo de Não Persecução Cível (ANPC) — reparação integral do dano",
        "content": (
            "O Acordo de Não Persecução Cível (ANPC), introduzido pela "
            "Lei nº 14.230/2021, estabelece o ressarcimento integral do prejuízo "
            "ao erário como obrigação fundamental. Do ponto de vista prático, o "
            "ANPC pode ser celebrado de forma conjunta, englobando todos os "
            "investigados em um único compromisso, ou de forma individual com "
            "cada investigado separadamente. A definição do valor da reparação "
            "do dano é elemento essencial do acordo, devendo-se considerar o "
            "prejuízo efetivo causado ao erário e as circunstâncias do caso."
        ),
        "summary": (
            "O ANPC exige reparação integral do dano e pode ser celebrado "
            "conjunta ou individualmente com os investigados."
        ),
        "legal_area_id": "civil_procedure",
        "document_type_id": "parecer",
        "tags": ["ANPC", "acordo", "improbidade", "reparação", "negociação"],
        "category": "processual",
        "legal_basis": [
            {"law": "Lei nº 14.230/2021", "article": "art. 17-B", "description": "Acordo de Não Persecução Cível"},
        ],
        "precedents": [],
        "quality_score": 87,
        "source_type": "imported",
    },
    # =========================================================================
    # SAÚDE PÚBLICA
    # =========================================================================
    {
        "title": "Saneamento básico — universalização como dever constitucional",
        "content": (
            "A atuação do Estado e do Município deve objetivar a universalização "
            "dos serviços de abastecimento de água e de esgotamento sanitário, "
            "com redução das desigualdades regionais e melhoria da qualidade de "
            "vida, nos termos do art. 241 da Constituição Federal e da legislação "
            "de regência. A interrupção recorrente no fornecimento de água configura "
            "violação ao direito fundamental à saúde e à dignidade humana, "
            "legitimando a atuação do Ministério Público para garantir a "
            "continuidade do serviço essencial."
        ),
        "summary": (
            "A universalização do saneamento básico é dever constitucional, e a "
            "interrupção do fornecimento de água viola direitos fundamentais."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["saneamento básico", "água", "universalização", "serviço essencial", "saúde"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 241", "description": "Gestão associada de serviços públicos"},
            {"law": "Lei nº 11.445/2007", "article": "", "description": "Política Nacional de Saneamento Básico"},
        ],
        "precedents": [],
        "quality_score": 83,
        "source_type": "imported",
    },
    {
        "title": "Conselhos municipais de saúde — participação e controle social",
        "content": (
            "Os conselhos municipais de saúde constituem instâncias de controle "
            "social do Sistema Único de Saúde (SUS), com composição paritária "
            "entre representantes do governo, profissionais de saúde e usuários, "
            "conforme previsto na Lei nº 8.142/1990. A orientação aos membros dos "
            "conselhos é fundamental para o exercício efetivo da participação "
            "social, incluindo a fiscalização da aplicação de recursos, o "
            "acompanhamento da execução da política de saúde e a deliberação "
            "sobre estratégias para o aprimoramento do SUS no âmbito municipal."
        ),
        "summary": (
            "Conselhos municipais de saúde exercem controle social do SUS com "
            "composição paritária e poder deliberativo."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["conselho de saúde", "SUS", "controle social", "participação popular"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.142/1990", "article": "", "description": "Participação da comunidade no SUS"},
            {"law": "Lei nº 8.080/1990", "article": "", "description": "Lei Orgânica da Saúde"},
        ],
        "precedents": [],
        "quality_score": 80,
        "source_type": "imported",
    },
    # =========================================================================
    # DIREITOS HUMANOS / ACESSIBILIDADE
    # =========================================================================
    {
        "title": "Pessoa com deficiência — garantias e proteção integral",
        "content": (
            "O Estatuto da Pessoa com Deficiência (Lei nº 13.146/2015) estabelece "
            "o sistema de proteção integral à pessoa com deficiência, assegurando "
            "o exercício dos direitos e das liberdades fundamentais em condições "
            "de igualdade com as demais pessoas. A lei garante acessibilidade, "
            "educação inclusiva, habilitação e reabilitação, direito ao trabalho, "
            "assistência social e participação na vida pública. O descumprimento "
            "destas garantias pelo Poder Público ou por particulares configura "
            "violação de direitos fundamentais, ensejando a atuação do Ministério "
            "Público na tutela individual e coletiva."
        ),
        "summary": (
            "O Estatuto da Pessoa com Deficiência assegura proteção integral e "
            "igualdade de condições, com tutela pelo MP."
        ),
        "legal_area_id": "civil",
        "document_type_id": "parecer",
        "tags": ["pessoa com deficiência", "acessibilidade", "inclusão", "Estatuto", "direitos humanos"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 13.146/2015", "article": "", "description": "Estatuto da Pessoa com Deficiência"},
            {"law": "Constituição Federal", "article": "art. 227, §1º, II", "description": "Proteção à pessoa com deficiência"},
        ],
        "precedents": [],
        "quality_score": 86,
        "source_type": "imported",
    },
    {
        "title": "Transtorno do Espectro Autista — direitos e políticas públicas",
        "content": (
            "A Lei nº 12.764/2012 (Lei Berenice Piana) instituiu a Política "
            "Nacional de Proteção dos Direitos da Pessoa com Transtorno do "
            "Espectro Autista (TEA), equiparando-a à pessoa com deficiência "
            "para todos os efeitos legais. A pessoa com TEA tem direito a "
            "diagnóstico precoce, atendimento multiprofissional, acesso a "
            "medicamentos e nutrientes, educação em classes regulares quando "
            "possível, e inserção no mercado de trabalho. O poder público deve "
            "garantir políticas públicas específicas, com atenção integral às "
            "necessidades de saúde, educação e assistência social."
        ),
        "summary": (
            "A pessoa com TEA é equiparada à pessoa com deficiência e tem "
            "direito a atendimento integral (Lei 12.764/2012)."
        ),
        "legal_area_id": "civil",
        "document_type_id": "parecer",
        "tags": ["autismo", "TEA", "inclusão", "saúde", "educação", "pessoa com deficiência"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 12.764/2012", "article": "", "description": "Política Nacional de Proteção dos Direitos da Pessoa com TEA"},
            {"law": "Lei nº 13.146/2015", "article": "", "description": "Estatuto da Pessoa com Deficiência"},
        ],
        "precedents": [],
        "quality_score": 85,
        "source_type": "imported",
    },
    # =========================================================================
    # TERCEIRO SETOR / FUNDAÇÕES
    # =========================================================================
    {
        "title": "Marco Regulatório das Organizações da Sociedade Civil (MROSC)",
        "content": (
            "A Lei nº 13.019/2014 (Marco Regulatório das Organizações da "
            "Sociedade Civil) estabelece o regime jurídico das parcerias entre "
            "a administração pública e as organizações da sociedade civil, "
            "substituindo o modelo anterior de convênios. Os instrumentos de "
            "parceria incluem o termo de colaboração (proposta pela administração), "
            "o termo de fomento (proposta pela organização) e o acordo de "
            "cooperação (sem transferência de recursos). A lei exige chamamento "
            "público, prestação de contas e avaliação de resultados, fortalecendo "
            "a transparência e o controle social."
        ),
        "summary": (
            "O MROSC estabelece regras para parcerias entre administração pública "
            "e OSCs, com chamamento público e prestação de contas obrigatórios."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["MROSC", "terceiro setor", "OSC", "termo de colaboração", "chamamento público"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 13.019/2014", "article": "", "description": "Marco Regulatório das OSCs"},
        ],
        "precedents": [],
        "quality_score": 84,
        "source_type": "imported",
    },
    {
        "title": "Fundações de apoio — regime tributário e requisitos legais",
        "content": (
            "As fundações de apoio vinculadas a instituições federais de ensino "
            "superior estão sujeitas a requisitos específicos definidos no art. 12 "
            "da legislação de regência, incluindo: (a) não remunerar dirigentes, "
            "salvo exceções legais; (b) aplicar os recursos na manutenção e "
            "desenvolvimento dos objetivos sociais; (c) manter escrituração "
            "completa de receitas e despesas, conservando os documentos por 5 anos. "
            "Os rendimentos em aplicações financeiras também devem ser destinados "
            "ao cumprimento das finalidades institucionais, observando-se a "
            "imunidade tributária prevista no art. 150, VI, 'c', da Constituição "
            "Federal."
        ),
        "summary": (
            "Fundações de apoio devem observar requisitos legais estritos, "
            "incluindo não remunerar dirigentes e aplicar recursos nos objetivos sociais."
        ),
        "legal_area_id": "tax",
        "document_type_id": "parecer",
        "tags": ["fundação de apoio", "imunidade tributária", "terceiro setor", "ensino superior"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 8.958/1994", "article": "art. 12", "description": "Fundações de apoio a IFES"},
            {"law": "Constituição Federal", "article": "art. 150, VI, 'c'", "description": "Imunidade tributária"},
        ],
        "precedents": [],
        "quality_score": 82,
        "source_type": "imported",
    },
    # =========================================================================
    # CONTROLE INTERNO / COMPLIANCE
    # =========================================================================
    {
        "title": "Programa de integridade no setor público — CGU",
        "content": (
            "O programa de integridade para o setor público, conforme orientação "
            "da Controladoria-Geral da União (CGU), compreende o conjunto de "
            "medidas institucionais voltadas para a prevenção, detecção, punição "
            "e remediação de fraudes e atos de corrupção. Os pilares fundamentais "
            "incluem: comprometimento da alta administração, instância de "
            "integridade autônoma, análise de riscos, regras e instrumentos "
            "(código de conduta, políticas internas), monitoramento contínuo, "
            "comunicação e treinamento, e canal de denúncias. A adesão a "
            "programas de integridade pode constituir atenuante na aplicação "
            "de sanções da Lei Anticorrupção."
        ),
        "summary": (
            "O programa de integridade público inclui prevenção, detecção e "
            "remediação de corrupção, podendo atenuar sanções da Lei Anticorrupção."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["integridade", "compliance", "CGU", "anticorrupção", "controle interno"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 12.846/2013", "article": "art. 7º, VIII", "description": "Atenuante por programa de integridade"},
            {"law": "Decreto nº 8.420/2015", "article": "", "description": "Regulamentação da Lei Anticorrupção"},
        ],
        "precedents": [],
        "quality_score": 83,
        "source_type": "imported",
    },
    {
        "title": "Controle interno municipal — criação e implantação obrigatória",
        "content": (
            "A criação e instalação de sistema de controle interno é obrigação "
            "constitucional de todos os Poderes da União, Estados, Distrito Federal "
            "e Municípios, conforme art. 31 e 70 a 75 da Constituição Federal. "
            "O controle interno visa avaliar o cumprimento das metas previstas no "
            "plano plurianual, a execução dos programas de governo e dos orçamentos, "
            "comprovar a legalidade dos atos da administração e apoiar o controle "
            "externo. O Ministério Público pode recomendar a criação e a efetiva "
            "implantação do sistema quando ausente ou deficiente."
        ),
        "summary": (
            "O controle interno municipal é obrigação constitucional, cabendo "
            "ao MP fiscalizar sua criação e efetiva implantação."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["controle interno", "município", "fiscalização", "PPA", "orçamento"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "arts. 31 e 70-75", "description": "Controle interno e externo"},
        ],
        "precedents": [],
        "quality_score": 82,
        "source_type": "imported",
    },
    # =========================================================================
    # PROCESSUAL PENAL
    # =========================================================================
    {
        "title": "Perda de bens acrescidos ilicitamente — natureza extrapenal",
        "content": (
            "A perda de bens acrescidos ilicitamente ao patrimônio do agente "
            "público constitui efeito extrapenal da condenação por improbidade "
            "administrativa, com natureza ressarcitória e não punitiva. A medida "
            "alcança todos os bens que excedam a variação patrimonial compatível "
            "com a renda lícita do agente durante o período investigado. A "
            "indisponibilidade de bens pode ser decretada cautelarmente, "
            "inclusive sobre bens de terceiros beneficiários dos atos ímprobos, "
            "para garantir a efetividade da futura decisão de mérito."
        ),
        "summary": (
            "A perda de bens ilícitos tem natureza ressarcitória e pode ser "
            "garantida cautelarmente por indisponibilidade."
        ),
        "legal_area_id": "criminal_procedure",
        "document_type_id": "parecer",
        "tags": ["perda de bens", "indisponibilidade", "medida cautelar", "improbidade"],
        "category": "processual",
        "legal_basis": [
            {"law": "Lei nº 8.429/1992", "article": "art. 7º", "description": "Indisponibilidade de bens"},
            {"law": "Lei nº 8.429/1992", "article": "art. 12, I", "description": "Perda de bens acrescidos ilicitamente"},
        ],
        "precedents": [],
        "quality_score": 85,
        "source_type": "imported",
    },
    # =========================================================================
    # INFÂNCIA E JUVENTUDE
    # =========================================================================
    {
        "title": "Ação Civil Pública em defesa da infância e juventude",
        "content": (
            "O Ministério Público tem legitimidade para propor Ação Civil Pública "
            "em defesa dos direitos da criança e do adolescente, com fundamento "
            "no art. 201, V, do Estatuto da Criança e do Adolescente (ECA) e "
            "no art. 129, III, da Constituição Federal. A ACP pode ter por objeto "
            "obrigações de fazer ou não fazer, inclusive para garantir vagas em "
            "creches e escolas, atendimento em saúde, medidas de proteção contra "
            "negligência e maus-tratos, e condições adequadas em entidades de "
            "acolhimento institucional. A tutela antecipada é cabível quando "
            "demonstrada a urgência na proteção dos direitos infanto-juvenis."
        ),
        "summary": (
            "O MP pode ajuizar ACP para garantir direitos de crianças e "
            "adolescentes, incluindo vagas em creches, saúde e proteção."
        ),
        "legal_area_id": "civil",
        "document_type_id": "peticao_inicial",
        "tags": ["ECA", "infância", "ACP", "creche", "acolhimento", "proteção"],
        "category": "processual",
        "legal_basis": [
            {"law": "ECA", "article": "art. 201, V", "description": "Legitimidade do MP para ACP"},
            {"law": "Constituição Federal", "article": "art. 129, III", "description": "Funções institucionais do MP"},
            {"law": "Constituição Federal", "article": "art. 227", "description": "Proteção integral à criança"},
        ],
        "precedents": [],
        "quality_score": 88,
        "source_type": "imported",
    },
    # =========================================================================
    # SERVIDORES PÚBLICOS
    # =========================================================================
    {
        "title": "Antecipação de vencimentos de servidores públicos — ilegalidade",
        "content": (
            "A antecipação de vencimentos ou subsídios de agentes públicos fora "
            "das hipóteses legais constitui irregularidade administrativa, devendo "
            "ser verificada a existência de base legal para a prática e, "
            "especialmente, se há ofensa ao princípio da legalidade e às normas "
            "de gestão fiscal. A remuneração dos servidores públicos somente pode "
            "ser paga na data prevista em lei, não cabendo ao gestor público "
            "autorizar adiantamentos que comprometam o fluxo de caixa do ente "
            "público ou que configurem tratamento desigual entre servidores."
        ),
        "summary": (
            "A antecipação de vencimentos sem base legal configura irregularidade "
            "administrativa e ofensa ao princípio da legalidade."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["vencimentos", "servidor público", "antecipação", "legalidade", "gestão fiscal"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 37, X", "description": "Remuneração de servidores"},
            {"law": "LC nº 101/2000", "article": "", "description": "Lei de Responsabilidade Fiscal"},
        ],
        "precedents": [],
        "quality_score": 79,
        "source_type": "imported",
    },
    {
        "title": "Férias de prefeito — base de cálculo e limites constitucionais",
        "content": (
            "A concessão de férias anuais remuneradas e adicional de um terço "
            "aos gestores municipais deve observar a viabilidade orçamentária "
            "e financeira, bem como o teto remuneratório constitucional. A base "
            "de cálculo do adicional de férias do prefeito deve considerar "
            "exclusivamente o subsídio, não sendo admitida a inclusão de "
            "parcelas indenizatórias ou remuneratórias atípicas. A análise "
            "deve levar em conta a realidade financeira do município e os "
            "limites da Lei de Responsabilidade Fiscal para despesas com "
            "pessoal."
        ),
        "summary": (
            "Férias de prefeito devem observar teto constitucional e viabilidade "
            "orçamentária, com base de cálculo limitada ao subsídio."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["prefeito", "férias", "teto remuneratório", "subsídio", "LRF"],
        "category": "material",
        "legal_basis": [
            {"law": "Constituição Federal", "article": "art. 37, XI", "description": "Teto remuneratório"},
            {"law": "Constituição Federal", "article": "art. 7º, XVII", "description": "Direito a férias com adicional de 1/3"},
        ],
        "precedents": [],
        "quality_score": 78,
        "source_type": "imported",
    },
    # =========================================================================
    # SISTEMA ELETRÔNICO / FREE FLOW
    # =========================================================================
    {
        "title": "Sistema de pedágio em fluxo livre (free flow) — legalidade",
        "content": (
            "O sistema de pedágio em fluxo livre (free flow) substitui as "
            "praças de pedágio tradicionais por pórticos eletrônicos que "
            "realizam a cobrança automaticamente. A implantação deste sistema "
            "deve observar os princípios da legalidade, eficiência e proteção "
            "do usuário, garantindo-se formas acessíveis de pagamento, prazo "
            "razoável para quitação, transparência na cobrança e mecanismos "
            "adequados de contestação. O Ministério Público deve acompanhar "
            "a implantação para assegurar que os direitos dos usuários "
            "sejam preservados."
        ),
        "summary": (
            "O pedágio em fluxo livre deve garantir acessibilidade, "
            "transparência e mecanismos de contestação aos usuários."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["pedágio", "free flow", "concessão", "usuário", "transparência"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 13.103/2015", "article": "", "description": "Lei do motorista profissional"},
            {"law": "CDC", "article": "art. 6º, III", "description": "Direito à informação do consumidor"},
        ],
        "precedents": [],
        "quality_score": 77,
        "source_type": "imported",
    },
    # =========================================================================
    # HETEROIDENTIFICAÇÃO / CONCURSOS
    # =========================================================================
    {
        "title": "Heteroidentificação em concursos públicos — cotas raciais",
        "content": (
            "A comissão de heteroidentificação em concursos públicos constitui "
            "instrumento de verificação da autodeclaração de candidatos que "
            "concorrem às vagas reservadas para pessoas negras (pretas e pardas), "
            "conforme previsto na Lei nº 12.990/2014. A análise deve ser baseada "
            "exclusivamente em critérios fenotípicos, ou seja, na aparência "
            "física do candidato, e não em sua ancestralidade ou genótipo. "
            "O procedimento deve observar o contraditório, a ampla defesa e "
            "a fundamentação adequada das decisões, sob pena de nulidade."
        ),
        "summary": (
            "A heteroidentificação em concursos usa critérios fenotípicos para "
            "verificar autodeclaração de candidatos a cotas raciais."
        ),
        "legal_area_id": "constitutional",
        "document_type_id": "parecer",
        "tags": ["heteroidentificação", "cotas raciais", "concurso público", "igualdade", "ação afirmativa"],
        "category": "constitucional",
        "legal_basis": [
            {"law": "Lei nº 12.990/2014", "article": "", "description": "Cotas raciais em concursos federais"},
        ],
        "precedents": [],
        "quality_score": 84,
        "source_type": "imported",
    },
    # =========================================================================
    # TERCEIRIZAÇÃO
    # =========================================================================
    {
        "title": "Terceirização de serviços públicos — limites e responsabilidade",
        "content": (
            "A terceirização de serviços públicos encontra limites na Constituição "
            "e na legislação infraconstitucional. Os recursos estatais não são "
            "infinitos, devendo ser possibilitada a alocação no que realmente "
            "importa ao Estado, sendo esta priorização definida em termos "
            "políticos. A decisão sobre qual atividade pode ser terceirizada "
            "deve ser feita de forma técnica, distinguindo-se atividades "
            "tipicamente estatais (que não podem ser terceirizadas) das "
            "atividades-meio e de apoio. A Administração Pública mantém "
            "responsabilidade subsidiária pelos encargos trabalhistas "
            "inadimplidos pela empresa prestadora."
        ),
        "summary": (
            "A terceirização de serviços públicos é limitada às atividades-meio, "
            "mantendo-se a responsabilidade subsidiária da Administração."
        ),
        "legal_area_id": "labor",
        "document_type_id": "parecer",
        "tags": ["terceirização", "atividade-meio", "responsabilidade subsidiária", "serviço público"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 13.429/2017", "article": "", "description": "Lei da Terceirização"},
            {"law": "TST Súmula 331", "article": "", "description": "Responsabilidade subsidiária na terceirização"},
        ],
        "precedents": [
            {"court": "STF", "case_number": "ADPF 324", "summary": "Licitude da terceirização de atividades-fim"},
        ],
        "quality_score": 86,
        "source_type": "imported",
    },
    # =========================================================================
    # DOAÇÃO DE BENS PÚBLICOS
    # =========================================================================
    {
        "title": "Doação de bens públicos — requisitos e finalidade pública",
        "content": (
            "A doação de bens públicos a particulares ou a entidades privadas "
            "é ato excepcional que exige autorização legislativa específica, "
            "avaliação prévia do bem, demonstração do interesse público na "
            "alienação e cumprimento das formalidades legais. A doação deve "
            "ser destinada a fins de interesse social, sendo vedada a doação "
            "pura e simples que não atenda a finalidade pública. O "
            "descumprimento das condições estabelecidas na lei autorizativa "
            "pode ensejar a reversão do bem ao patrimônio público."
        ),
        "summary": (
            "A doação de bens públicos exige autorização legislativa, avaliação "
            "prévia e demonstração de interesse público."
        ),
        "legal_area_id": "administrative",
        "document_type_id": "parecer",
        "tags": ["doação", "bens públicos", "autorização legislativa", "patrimônio público"],
        "category": "material",
        "legal_basis": [
            {"law": "Lei nº 14.133/2021", "article": "art. 76", "description": "Alienação de bens públicos"},
            {"law": "Constituição Federal", "article": "art. 37", "description": "Princípios da administração pública"},
        ],
        "precedents": [],
        "quality_score": 80,
        "source_type": "imported",
    },
]
