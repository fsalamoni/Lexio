# @lexio/desktop — Lexio Desktop Sidecar

Local agent que permite ao **orquestrador do chat Lexio** atuar no seu PC —
ler/escrever arquivos e executar comandos — **dentro de uma pasta de trabalho
que você escolhe** (sandbox). Nada fora dessa pasta é acessível.

É o mesmo padrão usado por plataformas como o Claude Desktop (servidor de
filesystem com diretórios permitidos), Manus e AionUI: um processo local,
autenticado por token, que a interface web aciona via WebSocket em
`127.0.0.1`.

## Como usar

```bash
# pasta padrão ~/Lexio, permissões read,write
npx @lexio/desktop

# escolhendo a pasta e as permissões
npx @lexio/desktop --root "/caminho/da/pasta" --permissions read,write,execute
```

Ao iniciar, o sidecar:

1. Cria/abre a pasta de trabalho.
2. Exibe um **token de pareamento**.
3. Sobe um servidor WebSocket **somente local** em `ws://127.0.0.1:9420`.

No Lexio: **Configurações → Pasta local (PC)** → cole o token → **Testar
conexão**. A partir daí, no `/chat`, o agente usa as ferramentas
`read_file`, `list_directory`, `write_file` e `run_shell` dentro da pasta.

## Segurança

- **Sandbox de caminho:** toda operação é resolvida e validada contra a raiz da
  pasta; tentativas de `../` ou caminhos absolutos fora da raiz são recusadas.
- **Permissões explícitas:** `write`/`execute` só funcionam se concedidas via
  `--permissions`.
- **Bloqueio de comandos destrutivos:** `rm -rf`, `sudo`, `curl|bash`, fork
  bombs, `mkfs`, `dd if=`, `shutdown`, etc. são recusados mesmo com `execute`.
- **Lista de bloqueio de arquivos:** `.env`, `*.key`, `*.pem`, `id_rsa*`,
  `*.crt` nunca são lidos/escritos.
- **Token de pareamento:** conexões sem o token correto são rejeitadas.
- **Somente loopback:** o servidor liga em `127.0.0.1` — não é exposto à rede.
- **Revogação:** encerre o processo (Ctrl+C) para revogar todo o acesso.

## Configuração

Persistida em `~/.lexio/desktop.json` (modo `600`). Variáveis de ambiente:

| Variável | Equivalente | Padrão |
|----------|-------------|--------|
| `LEXIO_DESKTOP_ROOT` | `--root` | `~/Lexio` |
| `LEXIO_DESKTOP_PERMISSIONS` | `--permissions` | `read,write` |

## Protocolo

WebSocket JSON, uma requisição por mensagem:

```
→ { "id": "...", "type": "fs"|"shell", "op": "read"|"list"|"write"|"exec"|"ping", "payload": {...} }
← { "id": "...", "ok": true, "result": ... }  |  { "id": "...", "ok": false, "error": "...", "code": "..." }
```

## Testes

```bash
cd packages/desktop && node --test
```
