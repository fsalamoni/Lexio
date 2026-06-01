# Instalador self-contained — Lexio Pasta local (PC)

Este diretório guarda um pacote **pronto para uso** do sidecar `@lexio/desktop`
para Windows, voltado a usuários **sem permissão para instalar o Node.js**
(ex.: máquinas corporativas com bloqueio).

## Arquivo

- **`Lexio-PC-Windows-x64.zip`** — contém tudo embutido:
  - `node.exe` — runtime **oficial** do Node.js **v22.22.3 (LTS)**, build
    `win-x64` assinado pela OpenJS Foundation (baixado de
    `https://nodejs.org/dist/v22.22.3/`);
  - `app/` — o código do sidecar (`bin/`, `src/`) com a dependência `ws` já
    instalada (JavaScript puro, sem binários nativos);
  - `Iniciar-Lexio-PC.cmd` — atalho de 1 clique (usa o `node.exe` embutido);
  - `LEIA-ME.txt` — passo a passo para leigo.

## Como o usuário usa

1. Baixa o ZIP, **extrai** a pasta `LexioPC`.
2. Duplo-clique em `Iniciar-Lexio-PC.cmd`.
3. Copia o token exibido e cola no Lexio em **Configurações → Pasta local (PC)**.

Não precisa instalar nada nem ter internet no PC de destino.

## Como reconstruir este pacote

```bash
# 1) baixar o Node oficial win-x64 e extrair só o node.exe
curl -fsSL -o node-win.zip https://nodejs.org/dist/v22.22.3/node-v22.22.3-win-x64.zip
unzip -j node-win.zip "node-v22.22.3-win-x64/node.exe" -d LexioPC/

# 2) montar o app (com a dependência ws já instalada)
cd packages/desktop && npm install
cp -r bin src package.json package-lock.json node_modules README.md /caminho/LexioPC/app/

# 3) adicionar Iniciar-Lexio-PC.cmd + LEIA-ME.txt e compactar
zip -r Lexio-PC-Windows-x64.zip LexioPC
```

> Observação: é um binário grande (~32 MB) versionado de propósito, para servir
> como download direto via GitHub. O ideal a longo prazo é publicá-lo como
> **GitHub Release** (não incha o histórico do git); ver instruções no PR/checklist.
> Build para Windows ARM64: trocar a URL para `node-v22.22.3-win-arm64.zip`.
