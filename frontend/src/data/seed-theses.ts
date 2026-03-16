/**
 * Seed theses data extracted from the vectorized legal corpus (Teses/acervo_mprs).
 *
 * Each entry mirrors the ThesisData interface in firestore-service.ts and can be
 * used to populate the thesis bank on first load (Firebase mode) or as fallback
 * demo data.
 */

import type { ThesisData } from '../lib/firestore-service'

export const SEED_THESES: Omit<ThesisData, 'id' | 'created_at' | 'updated_at'>[] = [
  // ===========================================================================
  // DIREITO ADMINISTRATIVO
  // ===========================================================================
  {
    title: 'Improbidade administrativa por enriquecimento ilícito independe de dano ao erário',
    content:
      'Para fins de improbidade administrativa, basta o enriquecimento ilícito ' +
      'intencional, em desconformidade com o ordenamento jurídico, independentemente ' +
      'de prejuízo para a Administração Pública. O art. 9º da Lei nº 8.429/1992 ' +
      '(Lei de Improbidade Administrativa) tipifica condutas que importam em ' +
      'enriquecimento ilícito, não exigindo a demonstração de dano efetivo ao ' +
      'erário como elemento constitutivo do tipo.',
    summary:
      'O enriquecimento ilícito doloso configura improbidade administrativa ' +
      'independentemente de dano ao erário, conforme art. 9º da LIA.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['improbidade', 'enriquecimento ilícito', 'LIA', 'art. 9º'],
    category: 'material',
    quality_score: 92,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Nepotismo decorre diretamente dos princípios constitucionais — Súmula Vinculante 13',
    content:
      'O Supremo Tribunal Federal, no julgamento do RE 579.951-RG, firmou o ' +
      'entendimento no sentido de que a proibição ao nepotismo decorre diretamente ' +
      'dos princípios constitucionais do art. 37, caput, da Constituição Federal, ' +
      'independentemente de lei formal. A Súmula Vinculante 13 consolida que a ' +
      'nomeação de cônjuge, companheiro ou parente até o terceiro grau para cargo ' +
      'em comissão viola a Constituição Federal.',
    summary:
      'A proibição ao nepotismo decorre dos princípios do art. 37 da CF, ' +
      'conforme Súmula Vinculante 13 do STF.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['nepotismo', 'Súmula Vinculante 13', 'cargo em comissão'],
    category: 'constitucional',
    quality_score: 95,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Ofensa a princípios administrativos como modalidade autônoma de improbidade',
    content:
      'O art. 11 da Lei nº 8.429/1992 estabelece modalidade autônoma de ato de ' +
      'improbidade administrativa por ofensa aos princípios da administração ' +
      'pública, independentemente de enriquecimento ilícito ou dano ao erário. ' +
      'As sanções incluem multa civil e proibição de contratar com o Poder ' +
      'Público.',
    summary:
      'A ofensa a princípios administrativos (art. 11 da LIA) constitui ato de ' +
      'improbidade autônomo, dispensando dano ou enriquecimento.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['improbidade', 'princípios administrativos', 'art. 11', 'moralidade'],
    category: 'material',
    quality_score: 90,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Agente público para fins de improbidade — conceito amplo do art. 2º da LIA',
    content:
      'Reputa-se agente público, para os efeitos da Lei de Improbidade ' +
      'Administrativa, todo aquele que exerce, ainda que transitoriamente ou ' +
      'sem remuneração, por eleição, nomeação, designação, contratação ou ' +
      'qualquer outra forma de investidura ou vínculo, mandato, cargo, emprego ' +
      'ou função nas entidades da Administração Pública.',
    summary:
      'O conceito de agente público na LIA é amplo, abrangendo qualquer pessoa ' +
      'que exerça função pública, ainda que transitória ou sem remuneração.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['agente público', 'LIA', 'art. 2º', 'função pública'],
    category: 'material',
    quality_score: 88,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Tipologia de rachadinhas — desvio de remuneração de servidores',
    content:
      'A prática conhecida como "rachadinha" consiste no desvio de parte da ' +
      'remuneração de servidores nomeados para cargos em comissão, que devolvem ' +
      'parcela de seus vencimentos ao agente público que os nomeou. Esta conduta ' +
      'configura ato de improbidade administrativa por enriquecimento ilícito ' +
      '(art. 9º da LIA) e por dano ao erário (art. 10), além de poder configurar ' +
      'crimes de peculato (art. 312 do CP), concussão (art. 316) ou corrupção ' +
      'passiva (art. 317).',
    summary:
      'Rachadinhas configuram improbidade por enriquecimento ilícito e dano ao ' +
      'erário, além de crimes de peculato, concussão ou corrupção passiva.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['rachadinha', 'peculato', 'concussão', 'cargo em comissão'],
    category: 'material',
    quality_score: 91,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Responsabilidade objetiva da pessoa jurídica na Lei Anticorrupção',
    content:
      'A Lei nº 12.846/2013 (Lei Anticorrupção) estabelece a responsabilidade ' +
      'objetiva administrativa e civil de pessoas jurídicas pela prática de atos ' +
      'lesivos contra a administração pública. As sanções incluem multa de 0,1% ' +
      'a 20% do faturamento bruto do último exercício, excluídos os tributos.',
    summary:
      'A Lei Anticorrupção prevê responsabilidade objetiva de pessoas jurídicas ' +
      'com multa de até 20% do faturamento bruto.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['anticorrupção', 'responsabilidade objetiva', 'pessoa jurídica'],
    category: 'material',
    quality_score: 89,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Limites de gastos com folha de pagamento da Câmara Municipal',
    content:
      'O art. 29-A, §1º, da Constituição Federal estabelece que a Câmara ' +
      'Municipal não pode gastar mais de 70% de sua receita com folha de ' +
      'pagamento, incluído o gasto com o subsídio de seus vereadores. A Lei de ' +
      'Responsabilidade Fiscal (LC nº 101/2000) complementa estas limitações.',
    summary:
      'A Câmara Municipal não pode gastar mais de 70% de sua receita com ' +
      'folha de pagamento, conforme art. 29-A, §1º, da CF.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['Câmara Municipal', 'folha de pagamento', 'LRF', 'limite de gastos'],
    category: 'material',
    quality_score: 87,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO CONSTITUCIONAL
  // ===========================================================================
  {
    title: 'Audiência pública como instrumento da administração consensual',
    content:
      'A Constituição de 1988 pretendeu que a democracia se realizasse por ' +
      'meio dos representantes eleitos pelo povo, mas também diretamente. A ' +
      'audiência pública constitui instrumento fundamental da administração ' +
      'consensual, garantindo o acesso de qualquer interessado e o direito de ' +
      'participação efetiva nas decisões administrativas.',
    summary:
      'A audiência pública é instrumento constitucional da democracia ' +
      'participativa e da administração consensual.',
    legal_area_id: 'constitutional',
    document_type_id: 'parecer',
    tags: ['audiência pública', 'democracia participativa', 'administração consensual'],
    category: 'constitucional',
    quality_score: 85,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Contratação temporária por excepcional interesse público — requisitos constitucionais',
    content:
      'O STF firmou que a contratação temporária (art. 37, IX, CF) exige: ' +
      '(i) previsão legal dos casos; (ii) tempo determinado; (iii) necessidade ' +
      'temporária de excepcional interesse público; e (iv) excepcionalidade que ' +
      'justifique a não realização de concurso público.',
    summary:
      'A contratação temporária do art. 37, IX, da CF exige lei, tempo ' +
      'determinado e excepcionalidade comprovada.',
    legal_area_id: 'constitutional',
    document_type_id: 'parecer',
    tags: ['contratação temporária', 'concurso público', 'art. 37 IX'],
    category: 'constitucional',
    quality_score: 93,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Acumulação de mandato eletivo de vereador com cargo público',
    content:
      'O art. 38, inciso III, da CF dispõe que, havendo compatibilidade de ' +
      'horários, o vereador perceberá as vantagens de seu cargo, emprego ou ' +
      'função, sem prejuízo da remuneração do cargo eletivo. Inexistindo ' +
      'compatibilidade, será aplicada a regra do inciso II.',
    summary:
      'Vereador pode acumular cargo público se houver compatibilidade de ' +
      'horários, percebendo ambas as remunerações (art. 38, III, CF).',
    legal_area_id: 'constitutional',
    document_type_id: 'parecer',
    tags: ['vereador', 'acumulação', 'mandato eletivo', 'art. 38'],
    category: 'constitucional',
    quality_score: 86,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Heteroidentificação em concursos públicos — cotas raciais',
    content:
      'A comissão de heteroidentificação verifica a autodeclaração de candidatos ' +
      'que concorrem a vagas reservadas para pessoas negras (Lei nº 12.990/2014). ' +
      'A análise é baseada exclusivamente em critérios fenotípicos, devendo ' +
      'observar o contraditório, a ampla defesa e a fundamentação adequada.',
    summary:
      'A heteroidentificação em concursos usa critérios fenotípicos para ' +
      'verificar autodeclaração de candidatos a cotas raciais.',
    legal_area_id: 'constitutional',
    document_type_id: 'parecer',
    tags: ['heteroidentificação', 'cotas raciais', 'concurso público'],
    category: 'constitucional',
    quality_score: 84,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO CIVIL E PROCESSUAL CIVIL
  // ===========================================================================
  {
    title: 'Responsabilidade civil do Estado por atos de seus agentes',
    content:
      'As pessoas jurídicas de direito público e as de direito privado ' +
      'prestadoras de serviços públicos responderão pelos danos que seus ' +
      'agentes causarem a terceiros (art. 37, §6º, CF). A autoria dos atos ' +
      'estatais é imputada ao Poder Público, configurando responsabilidade ' +
      'objetiva.',
    summary:
      'O Estado responde objetivamente por danos causados por seus agentes ' +
      'no exercício da função, com direito de regresso (art. 37, §6º, CF).',
    legal_area_id: 'civil',
    document_type_id: 'parecer',
    tags: ['responsabilidade civil', 'Estado', 'responsabilidade objetiva'],
    category: 'material',
    quality_score: 91,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Multa judicial (astreintes) como meio coercitivo atípico',
    content:
      'A multa judicial (astreintes) é meio coercitivo atípico para compelir ' +
      'o devedor ao cumprimento de obrigação específica. Sua natureza é ' +
      'processual e acessória. O valor deve ser suficiente para desestimular ' +
      'o descumprimento, ajustável pelo juiz (art. 537 do CPC).',
    summary:
      'As astreintes são meio coercitivo processual para compelir o ' +
      'cumprimento de obrigação específica, ajustável pelo juiz.',
    legal_area_id: 'civil_procedure',
    document_type_id: 'peticao_inicial',
    tags: ['astreintes', 'multa judicial', 'obrigação de fazer', 'CPC'],
    category: 'processual',
    quality_score: 85,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Improbidade administrativa — transmissibilidade aos herdeiros',
    content:
      'A ação de improbidade é transmissível aos herdeiros do agente ímprobo ' +
      'falecido, nos limites da herança, para fins de ressarcimento ao erário. ' +
      'Sanções pessoais (suspensão de direitos políticos) se extinguem com a ' +
      'morte, mas as patrimoniais são transmissíveis.',
    summary:
      'A ação de improbidade se transmite aos herdeiros para fins ' +
      'patrimoniais, mas sanções pessoais se extinguem com a morte.',
    legal_area_id: 'civil_procedure',
    document_type_id: 'parecer',
    tags: ['improbidade', 'transmissibilidade', 'herdeiros', 'ressarcimento'],
    category: 'processual',
    quality_score: 89,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Acordo de Não Persecução Cível (ANPC) — reparação integral do dano',
    content:
      'O ANPC (Lei nº 14.230/2021) estabelece o ressarcimento integral do ' +
      'prejuízo ao erário como obrigação fundamental. Pode ser celebrado de ' +
      'forma conjunta ou individual com os investigados.',
    summary:
      'O ANPC exige reparação integral do dano e pode ser celebrado ' +
      'conjunta ou individualmente com os investigados.',
    legal_area_id: 'civil_procedure',
    document_type_id: 'parecer',
    tags: ['ANPC', 'acordo', 'improbidade', 'reparação'],
    category: 'processual',
    quality_score: 87,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO DO CONSUMIDOR
  // ===========================================================================
  {
    title: 'Ação coletiva de consumo — legitimidade do Ministério Público',
    content:
      'O MP possui legitimidade ativa para propor ação coletiva de consumo ' +
      'em defesa dos interesses difusos e coletivos dos consumidores (art. 82, I, ' +
      'CDC; art. 129, III, CF). Atua como substituto processual, dispensando ' +
      'identificação individualizada dos beneficiários.',
    summary:
      'O MP é legitimado para ação coletiva de consumo em defesa de ' +
      'interesses difusos e coletivos.',
    legal_area_id: 'consumer',
    document_type_id: 'peticao_inicial',
    tags: ['ação coletiva', 'consumidor', 'Ministério Público', 'direitos difusos'],
    category: 'processual',
    quality_score: 88,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO DE FAMÍLIA E SUCESSÕES
  // ===========================================================================
  {
    title: 'Atuação multifacetada do MP no inventário causa mortis',
    content:
      'A atuação do MP no inventário causa mortis é multifacetada: pode ' +
      'manifestar-se como custos legis (art. 178 do CPC) e como proponente ' +
      'da ação quando existirem interesses de incapazes, ausentes ou ' +
      'necessidade de preservação do interesse público.',
    summary:
      'O MP atua de forma multifacetada no inventário: como custos legis ' +
      'e como proponente quando há interesses de incapazes.',
    legal_area_id: 'inheritance',
    document_type_id: 'parecer',
    tags: ['inventário', 'custos legis', 'Ministério Público', 'incapazes'],
    category: 'processual',
    quality_score: 84,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Concomitância da paternidade socioafetiva e biológica',
    content:
      'O STF, no RE 898.060 (Tema 622), fixou que a existência de paternidade ' +
      'socioafetiva não impede o reconhecimento da paternidade biológica e seus ' +
      'efeitos jurídicos, incluindo registro civil, direitos alimentares e ' +
      'sucessórios — multiparentalidade.',
    summary:
      'A paternidade socioafetiva e biológica podem coexistir com efeitos ' +
      'jurídicos plenos — multiparentalidade (STF, Tema 622).',
    legal_area_id: 'family',
    document_type_id: 'parecer',
    tags: ['multiparentalidade', 'socioafetividade', 'paternidade biológica'],
    category: 'material',
    quality_score: 92,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO DO TRABALHO
  // ===========================================================================
  {
    title: 'Terceirização de serviços públicos — limites e responsabilidade',
    content:
      'A terceirização é limitada às atividades-meio, distinguindo-se de ' +
      'atividades tipicamente estatais. A Administração Pública mantém ' +
      'responsabilidade subsidiária pelos encargos trabalhistas inadimplidos ' +
      'pela empresa prestadora (TST Súmula 331; STF ADPF 324).',
    summary:
      'A terceirização de serviços públicos é limitada às atividades-meio, ' +
      'mantendo-se a responsabilidade subsidiária da Administração.',
    legal_area_id: 'labor',
    document_type_id: 'parecer',
    tags: ['terceirização', 'atividade-meio', 'responsabilidade subsidiária'],
    category: 'material',
    quality_score: 86,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO TRIBUTÁRIO
  // ===========================================================================
  {
    title: 'Imunidade tributária das entidades filantrópicas de assistência social',
    content:
      'As entidades filantrópicas são imunes às contribuições para a seguridade ' +
      'social (art. 195, §7º, CF). A natureza filantrópica faz presumir a ' +
      'impossibilidade de arcar com as contribuições, sendo possível inclusive ' +
      'a concessão de justiça gratuita a pessoa jurídica sem fins lucrativos.',
    summary:
      'Entidades filantrópicas gozam de imunidade tributária (art. 195, §7º, CF).',
    legal_area_id: 'tax',
    document_type_id: 'parecer',
    tags: ['imunidade tributária', 'entidade filantrópica', 'terceiro setor'],
    category: 'material',
    quality_score: 87,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // DIREITO EMPRESARIAL
  // ===========================================================================
  {
    title: 'Administrador judicial — possibilidade de contratação de auxiliares',
    content:
      'O administrador judicial pode requerer ao juiz a contratação de ' +
      'auxiliares quando a complexidade da função exigir (art. 22, I, "h", ' +
      'da Lei nº 11.101/2005). A remuneração deve ser compatível com o ' +
      'serviço prestado e aprovada pelo juiz.',
    summary:
      'O administrador judicial pode contratar auxiliares quando a complexidade ' +
      'da função exigir (art. 22, I, "h", Lei de Falências).',
    legal_area_id: 'business',
    document_type_id: 'parecer',
    tags: ['falência', 'administrador judicial', 'auxiliares'],
    category: 'processual',
    quality_score: 83,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Grupo econômico — controle e sincronia de atuação empresarial',
    content:
      'Grupo econômico compreende o conjunto de entidades que, sob controle ' +
      'de um indivíduo ou entidade, atuam em sincronia. O reconhecimento tem ' +
      'relevância para responsabilização solidária e desconsideração da ' +
      'personalidade jurídica.',
    summary:
      'Grupo econômico é o conjunto de entidades em sincronia sob controle comum, ' +
      'com relevância para responsabilização solidária.',
    legal_area_id: 'business',
    document_type_id: 'parecer',
    tags: ['grupo econômico', 'controle societário', 'responsabilidade solidária'],
    category: 'material',
    quality_score: 80,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // INFÂNCIA E JUVENTUDE / DIREITOS HUMANOS
  // ===========================================================================
  {
    title: 'Ação Civil Pública em defesa da infância e juventude',
    content:
      'O MP tem legitimidade para propor ACP em defesa dos direitos da criança ' +
      'e do adolescente (art. 201, V, ECA; art. 129, III, CF). A ACP pode ' +
      'garantir vagas em creches, atendimento em saúde, medidas de proteção ' +
      'contra negligência e condições adequadas em entidades de acolhimento.',
    summary:
      'O MP pode ajuizar ACP para garantir direitos de crianças e adolescentes, ' +
      'incluindo vagas em creches e proteção.',
    legal_area_id: 'civil',
    document_type_id: 'peticao_inicial',
    tags: ['ECA', 'infância', 'ACP', 'creche', 'proteção'],
    category: 'processual',
    quality_score: 88,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Pessoa com deficiência — garantias e proteção integral',
    content:
      'O Estatuto da Pessoa com Deficiência (Lei nº 13.146/2015) assegura ' +
      'o exercício dos direitos em condições de igualdade, incluindo ' +
      'acessibilidade, educação inclusiva, habilitação, direito ao trabalho ' +
      'e participação na vida pública.',
    summary:
      'O Estatuto da Pessoa com Deficiência assegura proteção integral e ' +
      'igualdade de condições.',
    legal_area_id: 'civil',
    document_type_id: 'parecer',
    tags: ['pessoa com deficiência', 'acessibilidade', 'inclusão'],
    category: 'material',
    quality_score: 86,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Transtorno do Espectro Autista — direitos e políticas públicas',
    content:
      'A Lei nº 12.764/2012 (Lei Berenice Piana) equiparou a pessoa com TEA ' +
      'à pessoa com deficiência. Garante diagnóstico precoce, atendimento ' +
      'multiprofissional, acesso a medicamentos, educação em classes regulares ' +
      'e inserção no mercado de trabalho.',
    summary:
      'A pessoa com TEA é equiparada à pessoa com deficiência e tem ' +
      'direito a atendimento integral (Lei 12.764/2012).',
    legal_area_id: 'civil',
    document_type_id: 'parecer',
    tags: ['autismo', 'TEA', 'inclusão', 'pessoa com deficiência'],
    category: 'material',
    quality_score: 85,
    usage_count: 0,
    source_type: 'imported',
  },

  // ===========================================================================
  // COMPLIANCE / CONTROLE
  // ===========================================================================
  {
    title: 'Programa de integridade no setor público — CGU',
    content:
      'O programa de integridade compreende prevenção, detecção, punição e ' +
      'remediação de fraudes e corrupção. Pilares: comprometimento da alta ' +
      'administração, análise de riscos, código de conduta, monitoramento ' +
      'contínuo e canal de denúncias. A adesão pode atenuar sanções da Lei ' +
      'Anticorrupção (art. 7º, VIII).',
    summary:
      'O programa de integridade público inclui prevenção e remediação de ' +
      'corrupção, podendo atenuar sanções da Lei Anticorrupção.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['integridade', 'compliance', 'CGU', 'anticorrupção'],
    category: 'material',
    quality_score: 83,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Controle interno municipal — criação e implantação obrigatória',
    content:
      'O controle interno é obrigação constitucional (arts. 31 e 70-75 da CF), ' +
      'visando avaliar o cumprimento das metas do PPA, a execução dos programas ' +
      'de governo e a legalidade dos atos administrativos. O MP pode recomendar ' +
      'sua criação quando ausente ou deficiente.',
    summary:
      'O controle interno municipal é obrigação constitucional, cabendo ' +
      'ao MP fiscalizar sua criação e implantação.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['controle interno', 'município', 'fiscalização', 'PPA'],
    category: 'material',
    quality_score: 82,
    usage_count: 0,
    source_type: 'imported',
  },
  {
    title: 'Marco Regulatório das Organizações da Sociedade Civil (MROSC)',
    content:
      'A Lei nº 13.019/2014 estabelece o regime de parcerias entre ' +
      'administração pública e OSCs. Instrumentos: termo de colaboração ' +
      '(proposta da administração), termo de fomento (proposta da OSC) e ' +
      'acordo de cooperação (sem transferência de recursos). Exige chamamento ' +
      'público e prestação de contas.',
    summary:
      'O MROSC estabelece regras para parcerias entre administração e OSCs, ' +
      'com chamamento público e prestação de contas obrigatórios.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    tags: ['MROSC', 'terceiro setor', 'OSC', 'chamamento público'],
    category: 'material',
    quality_score: 84,
    usage_count: 0,
    source_type: 'imported',
  },
]
