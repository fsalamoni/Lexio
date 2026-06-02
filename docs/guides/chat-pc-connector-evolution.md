# Connector de PC — evolução (multi-PC, várias pastas, permitir uma vez/sempre)

Plano em ondas para evoluir o connector "Pasta local (PC)" (`@lexio/desktop` +
integração no chat) conforme pedido: **vários PCs** habilitados (ligar um por
vez), **mudar a pasta e atuar fora dela** com aprovação, **lista de
autorizações** (allowlist) persistente, botões **permitir desta vez / permitir
sempre / negar**, **organizar** arquivos entre pastas, e **iniciar com o
Windows**.

Tudo nasce **atrás de feature flags (default OFF)** e com travas de segurança.

## Princípios de segurança (valem para todas as ondas)

- O **sidecar** (no PC) é a fonte de verdade da sandbox: só atua dentro da
  **allowlist de pastas** que ele guarda. O frontend nunca "força" um caminho.
- **Nunca** se autoriza pasta de sistema/credenciais (`isForbiddenRoot`):
  raízes de disco (`/`, `C:\`), `C:\Windows`, `Program Files`, `/etc`, `/usr`,
  `~/.ssh`, `~/.aws`, `~/.lexio`, etc.
- Bloqueio de arquivos sensíveis (`.env`, `*.key`, `*.pem`, `id_rsa*`) continua
  valendo **mesmo dentro** de pastas autorizadas.
- Comandos destrutivos (`rm -rf`, `sudo`, `shutdown`, fork bombs…) continuam
  recusados mesmo com `execute`.
- "Permitir sempre" grava na allowlist; o usuário pode **ver e revogar** depois.

## Modelo de dados (frontend — `users/{uid}/settings/preferences`)

```ts
sidecar_devices?: Array<{
  id: string; label: string; token: string;
  host: string; port: number; created_at: string; last_connected_at?: string;
}>
active_sidecar_device_id?: string
sidecar_allowlist?: Array<{
  id: string; device_id: string; root: string;       // pasta autorizada
  ops: ChatSidecarPermission[] | 'all';               // o que "permitir sempre" cobre
  created_at: string;
}>
// `sidecar_connection` (single) é mantido e migrado para um device na 1ª carga.
```

No PC, o sidecar guarda a allowlist em `~/.lexio/desktop.json`:

```json
{ "roots": ["C:\\Users\\voce\\Lexio", "C:\\Casos"], "permissions": ["read","write"], "token": "…" }
```

## Protocolo do sidecar (novidades da Onda 1)

```
→ { type: "shell", op: "ping" }            ← agora retorna { root, roots[], permissions, platform }
→ { type: "grant", op: "list" }            ← { roots }
→ { type: "grant", op: "add",    payload: { path, persist? } }   // permitir (sessão/sempre)
→ { type: "grant", op: "remove", payload: { path, persist? } }   // revogar
→ { type: "fs",    op: "organize", payload: { moves:[{from,to}], conflict? } }  // mover em lote + backup
→ { type: "fs",    op: "undo",     payload: { journal? } }        // desfazer (a última, se vazio)
```

`add` recusa pastas proibidas (`FORBIDDEN_ROOT`); `persist:true` grava no
config (sobrevive a reinício); sem `persist`, vale só enquanto o processo roda.
`rename`/`move` aceitam origem e destino em **pastas diferentes** da allowlist.

## Ondas

| Onda | Escopo | Flag | Status |
|------|--------|------|--------|
| **1** | **Sidecar:** várias pastas (`roots`), `grant add/remove` (sessão/persistente), guarda de pastas de sistema, mover entre pastas, testes | — (base) | ✅ feito |
| **2** | **Frontend (dados):** tipos Firestore + `sidecar-devices.ts` (lista de PCs + ativo) + migração; store da allowlist (`sidecar-allowlist.ts`) | `FF_CHAT_PC_DEVICES` | ✅ feito |
| 3 | **UI Configurações:** gerir **PCs** (add/nomear/remover/ativar) e **pastas** por PC (ver/adicionar/revogar via `grant`) | `FF_CHAT_PC_DEVICES` | ⏳ |
| **4** | **Aprovação 3 botões + allowlist:** *permitir desta vez / permitir sempre / negar*; checar allowlist antes de pedir; autorizar **nova pasta** (`grant_folder`) pelo mesmo fluxo | `FF_CHAT_PC_APPROVALS` + `FF_CHAT_PC_DEVICES` | ✅ feito |
| **5** | **Organizar + segurança:** skills `organize_files` (mover em lote com **prévia do plano** + aprovação única + backup) e `undo_organize` (desfazer a última); sidecar `fs/organize` + `fs/undo` com journal persistido | `FF_CHAT_PC_APPROVALS` | ✅ feito |
| **6** | **Conveniência:** iniciar com o Windows (scripts opt-in `Ligar/Desligar-no-Inicio-do-Windows.cmd`) | — | ✅ feito |

## Uso (já disponível na Onda 1)

```bash
# várias pastas de uma vez (repita --root)
node bin/lexio-desktop.mjs --root "C:\Users\voce\Lexio" --root "C:\Casos" --permissions read,write
```

Em runtime, o chat (ondas 3–4) poderá autorizar novas pastas via `grant`, com
aprovação do usuário — sem reiniciar o sidecar.
