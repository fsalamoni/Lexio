#!/bin/bash
# =============================================================================
#  Lexio — Atalho de 1 clique (macOS/Linux) para o agente local @lexio/desktop.
#
#  COMO USAR: dê duplo-clique neste arquivo (no macOS pode ser preciso clicar
#  com o botão direito → Abrir na primeira vez). Ele instala o necessário na
#  primeira vez e liga o programa. Deixe a janela ABERTA enquanto usar o chat;
#  copie o token que aparecer e cole no Lexio em
#  Configurações → Pasta local (PC).
# =============================================================================

# ---- Configuração (edite estas duas linhas se quiser) -----------------------
# ROOT = a pasta que o Lexio poderá ler/escrever (a "sandbox").
ROOT="${HOME}/Lexio"
# PERMISSIONS = read,write (seguro). Acrescente ,execute para permitir rodar
# comandos (run_shell). Ex.: read,write,execute
PERMISSIONS="read,write"
# -----------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "[X] Node.js não encontrado neste computador."
  echo "    1. Abra https://nodejs.org/"
  echo "    2. Baixe e instale a versão \"LTS\"."
  echo "    3. Feche e abra este atalho de novo."
  echo
  read -r -p "Pressione Enter para sair..." _
  exit 1
fi

if [ ! -d node_modules/ws ]; then
  echo
  echo "Preparando na primeira vez (baixando 1 componente, ~20s)..."
  npm install --silent || { echo "[X] Falha ao instalar. Verifique a internet."; read -r -p "Enter para sair..." _; exit 1; }
fi

echo
echo "============================================================"
echo " Lexio — agente local iniciando"
echo "============================================================"
echo " Pasta de trabalho : ${ROOT}"
echo " Permissões        : ${PERMISSIONS}"
echo
echo " >> DEIXE ESTA JANELA ABERTA enquanto usar o chat."
echo "    Para revogar o acesso, feche a janela ou tecle Ctrl+C."
echo "============================================================"
echo

node bin/lexio-desktop.mjs --root "${ROOT}" --permissions "${PERMISSIONS}"

echo
echo "Agente encerrado. O Lexio não tem mais acesso a este PC."
read -r -p "Pressione Enter para sair..." _
