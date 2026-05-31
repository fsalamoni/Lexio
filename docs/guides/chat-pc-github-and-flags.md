# Chat Orquestrador — ações no PC, git, conector GitHub, motor e UX (flags)

> Guia das capacidades adicionadas ao Chat Orquestrador, todas **atrás de feature
> flags desligadas por padrão**, e como fazer o rollout.

## Visão geral das flags

| Flag | Liga | Exige |
|------|------|-------|
| `FF_CHAT_PC_APPROVALS` | Aprovação **real** antes de escrever/executar/apagar/renomear no PC; auditoria de cada ação; status do sidecar ao vivo; skills `delete_file`/`rename_file` | Sidecar `@lexio/desktop` pareado |
| `FF_CHAT_PC_GIT` | Skills git no sidecar: `git_status`/`git_diff` (leitura), `git_commit`/`git_pull`/`git_push` (sob aprovação) | Sidecar + um repositório git na pasta de trabalho |
| `FF_CHAT_ENGINE_PLUS` | Teto de custo em USD por turno; crítico ciente de domínio + threshold por esforço; memória rolante entre turnos; resiliência de parsing (escalada de temperatura); **prompt caching** do system prompt (modelos `anthropic/*`) | — |
| `FF_CHAT_CONVO_TOOLS` | Exportar conversa (Markdown/JSON); busca e fixar conversas na lista | — |
| `FF_CHAT_GITHUB` | Conector GitHub: `github_list_repos`/`github_read_file` (leitura), `github_create_issue`/`github_open_pr`/`github_comment` (sob aprovação) | Token PAT em Configurações → Conector GitHub |

## Modelo de segurança das ações no PC

- **Leituras nunca são bloqueadas** (`read_file`, `list_directory`, `git_status`, `git_diff`, `github_read_file`, `github_list_repos`).
- **Ações que mudam o PC ou o remoto** (escrever, apagar, renomear, shell, commit/push/pull, criar issue/PR, comentar) **pausam o turno** pedindo confirmação explícita do usuário quando `FF_CHAT_PC_APPROVALS` está ligada. O usuário responde "aprovar", "rejeitar" ou "ajustar".
- Cada ação proposta/executada/rejeitada/falha é gravada na **auditoria** (`/users/{uid}/chat_conversations/{id}/audit`), visível no painel recolhível "Auditoria de ações no PC" no chat.
- O sidecar é um **sandbox**: tudo é confinado à pasta de trabalho escolhida; caminhos fora da raiz são recusados; comandos destrutivos (`rm -rf`, `mkfs`, fork bombs, `sudo`, `curl | sh`…) são bloqueados mesmo com permissão de execução; a raiz não pode ser apagada/renomeada.
- Sem backend: o token do GitHub é um **PAT fine-grained** salvo apenas nas configurações do usuário (mesmo padrão das chaves OpenRouter/DataJud). Conceda só os escopos necessários (Contents, Issues, Pull requests) nos repositórios desejados.

## Como ligar as flags (rollout)

Recomendado: **comece pela sua própria conta**, valide em produção, depois amplie.

### 1. Por conta (recomendado para começar)
`/settings` → **"Recursos beta do Chat — ligar/desligar por conta"**. Cada toggle persiste em
`settings/preferences.feature_flags` e é aplicado em runtime (`saveFeatureFlags` →
`setRuntimeFeatureFlags`). Afeta somente a sua conta.

### 2. Para todos os usuários (build)
Defina as variáveis no build/deploy (afetam todos):
```
VITE_FF_CHAT_PC_APPROVALS=true
VITE_FF_CHAT_PC_GIT=true
VITE_FF_CHAT_ENGINE_PLUS=true
VITE_FF_CHAT_CONVO_TOOLS=true
VITE_FF_CHAT_GITHUB=true
```
No GitHub Actions, acrescente-as ao step de build dos workflows de deploy
(`.github/workflows/deploy-pages.yml` e `firebase-deploy.yml`).

### 3. Ordem sugerida
1. `FF_CHAT_CONVO_TOOLS` e `FF_CHAT_ENGINE_PLUS` (sem dependência externa, baixo risco).
2. `FF_CHAT_PC_APPROVALS` (com o sidecar rodando) → valide o fluxo de aprovação e a auditoria.
3. `FF_CHAT_PC_GIT` (num repositório de teste).
4. `FF_CHAT_GITHUB` (com um PAT de teste; valide criar issue/PR num repo seu).

## Validação E2E rápida

1. Rode o sidecar: `npx @lexio/desktop --root "/caminho/de/teste" --permissions read,write,execute,delete,rename` e cole o token em `/settings` → "Pasta local (PC)".
2. No chat, peça para **escrever** um arquivo → confirme o pedido de aprovação → aprove → veja o arquivo e a entrada de auditoria; o badge do header fica verde.
3. `git_status`/`git_commit` num repositório de teste.
4. Com o PAT salvo, peça para **criar uma issue** num repo seu → aprove → verifique a URL retornada.

## Notas

- Prompt caching só tem efeito em modelos `anthropic/*` (o OpenRouter encaminha o `cache_control`); é no-op para os demais.
- O teto de custo em USD por esforço (0,15 / 0,5 / 1,5 / 3,5) interrompe o turno mesmo sob orquestração enxuta.
- O sidecar `@lexio/desktop` (em `packages/desktop`) precisa ser distribuído para `npx @lexio/desktop` funcionar — ver `packages/desktop/PUBLISHING.md`.
