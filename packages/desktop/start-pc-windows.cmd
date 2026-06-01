@echo off
setlocal
title Lexio - Pasta local (PC)

REM ============================================================================
REM  Lexio - Atalho de 1 clique (Windows) para o agente local @lexio/desktop.
REM
REM  COMO USAR: basta dar DUPLO-CLIQUE neste arquivo. Ele instala o necessario
REM  na primeira vez e liga o programa. Deixe a janela ABERTA enquanto usar o
REM  chat; copie o token que aparecer e cole no Lexio em
REM  Configuracoes -> Pasta local (PC).
REM ============================================================================

REM ---- Configuracao (edite estas duas linhas se quiser) ----------------------
REM ROOT = a pasta que o Lexio podera ler/escrever (a "sandbox").
set "ROOT=%USERPROFILE%\Lexio"
REM PERMISSIONS = read,write (seguro). Acrescente ,execute para permitir rodar
REM comandos (run_shell). Ex.: read,write,execute
set "PERMISSIONS=read,write"
REM ----------------------------------------------------------------------------

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [X] Node.js nao encontrado neste computador.
  echo      1. Abra https://nodejs.org/
  echo      2. Baixe e instale a versao "LTS".
  echo      3. Feche e abra este atalho de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\ws\" (
  echo.
  echo  Preparando na primeira vez (baixando 1 componente, ~20s)...
  call npm install --silent
  if errorlevel 1 (
    echo.
    echo  [X] Nao consegui instalar o componente. Verifique sua internet e tente de novo.
    pause
    exit /b 1
  )
)

echo.
echo  ============================================================
echo   Lexio - agente local iniciando
echo  ============================================================
echo   Pasta de trabalho : %ROOT%
echo   Permissoes        : %PERMISSIONS%
echo.
echo   ^>^> DEIXE ESTA JANELA ABERTA enquanto usar o chat.
echo      Para revogar o acesso, feche a janela ou tecle Ctrl+C.
echo  ============================================================
echo.

node "bin\lexio-desktop.mjs" --root "%ROOT%" --permissions "%PERMISSIONS%"

echo.
echo  Agente encerrado. O Lexio nao tem mais acesso a este PC.
pause
endlocal
