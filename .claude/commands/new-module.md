# /new-module — Criar novo módulo Lexio

Crie um novo módulo para o Lexio seguindo esta estrutura:

## Tipo: document_type
```
packages/modules/document_types/{nome}/
  __init__.py          → MODULE_CLASS + create_module()
  manifest.json        → id, name, type, version, entry_point, enabled
  document_type.py     → Implementa BaseDocumentType
  quality_rules.py     → QUALITY_RULES list
  integrator_rules.py  → get_header(), get_footer(), post_process()
  templates/
    generic/           → Prompts parametrizados
      triagem.py, moderador_agenda.py, jurista.py, etc.
  CLAUDE.md           → Contexto IA deste módulo
```

## Tipo: legal_area
```
packages/modules/legal_areas/{nome}/
  __init__.py          → MODULE_CLASS + create_module()
  manifest.json        → id, name, type, version, entry_point, enabled
  area.py              → Implementa BaseLegalArea
  agents/
    jurista.py         → system_prompt() + user_prompt()
    advogado_diabo.py
    fact_checker.py
  guides/
    {topic}.md         → Guias de referência normativa
  CLAUDE.md           → Contexto IA deste módulo
```

## Checklist
1. Criar diretórios e arquivos conforme template
2. Registrar em manifest.json
3. Implementar classe base
4. Criar CLAUDE.md com contexto do módulo
5. Testar com `/test-module`
