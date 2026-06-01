@echo off
setlocal EnableExtensions
title Lexio - Pasta local (PC)
cd /d "%~dp0"

REM ==========================================================================
REM  Lexio - Atalho de 1 clique (Windows) para o agente local @lexio/desktop.
REM  Requer Node.js instalado. Se a empresa bloqueia instalar o Node, use o
REM  pacote com Node EMBUTIDO em packages/desktop/installer/.
REM  Deixe a janela ABERTA; copie o token e cole no Lexio em
REM  Configuracoes -> Pasta local (PC).
REM ==========================================================================

set "ROOT=%USERPROFILE%\Lexio"
REM read,write (seguro). Para permitir rodar comandos: read,write,execute
set "PERMISSIONS=read,write"

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "node_modules\ws\" goto run
echo  Preparando na primeira vez (baixando 1 componente, ~20s)...
call npm install --silent
if not exist "node_modules\ws\" goto noinstall

:run
if not exist "%ROOT%" mkdir "%ROOT%" 2>nul

echo.
echo  ============================================================
echo   Lexio - agente local iniciando
echo  ============================================================
echo   Pasta de trabalho : %ROOT%
echo   Permissoes        : %PERMISSIONS%
echo.
echo   Deixe esta janela ABERTA enquanto usar o chat.
echo  ============================================================
echo.

node "bin\lexio-desktop.mjs" --root "%ROOT%" --permissions "%PERMISSIONS%"
set "RC=%ERRORLEVEL%"
echo.
echo  Agente encerrado (codigo %RC%). O Lexio nao tem mais acesso a este PC.
echo.
pause
goto end

:nonode
echo.
echo  [X] Node.js nao encontrado neste computador.
echo      Instale a versao LTS em https://nodejs.org/ e abra de novo,
echo      OU use o pacote com Node embutido (pasta installer).
echo.
pause
goto end

:noinstall
echo.
echo  [X] Nao consegui instalar o componente 'ws'. Verifique a internet.
echo.
pause
goto end

:end
endlocal
