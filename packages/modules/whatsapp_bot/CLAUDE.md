# WhatsApp Bot — Contexto IA

## Responsabilidade
Módulo de integração com WhatsApp via Evolution API.
Implementa uma state machine de conversação para solicitar documentos jurídicos por WhatsApp.

## Fluxo de Conversação

```
WELCOME → AWAITING_DOC_TYPE → AWAITING_CONTENT → PROCESSING → COMPLETE
                                                              ↘ ERROR
```

### Estados
- `welcome` — Boas-vindas, mostra menu principal
- `awaiting_doc_type` — Aguarda escolha do tipo de documento
- `awaiting_legal_area` — Aguarda escolha da área jurídica (opcional)
- `awaiting_content` — Aguarda o briefing/descrição do caso
- `processing` — Pipeline em execução, usuário aguarda
- `complete` — Documento gerado e enviado
- `error` — Erro irrecuperável, usuário notificado

## Palavras-chave de Reset
- `menu`, `início`, `recomeçar`, `reiniciar`, `cancelar` → volta ao WELCOME

## Tipos de Documento Suportados
- `parecer` — Parecer jurídico
- `peticao_inicial` — Petição inicial
- `contestacao` — Contestação
- `recurso` — Recurso
- `sentenca` — Sentença
- `acao_civil_publica` — Ação civil pública

## Regras
1. NUNCA armazenar dados sensíveis além do necessário para a sessão
2. Sessão expira após 24h de inatividade
3. Multi-tenant: cada sessão vinculada a uma organização
4. Respostas sempre em português, linguagem amigável mas profissional
