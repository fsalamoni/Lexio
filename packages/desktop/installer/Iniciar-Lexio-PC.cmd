@echo off
setlocal EnableExtensions
title Lexio - Pasta local (PC)
cd /d "%~dp0"

REM ==========================================================================
REM  Lexio - Pasta local (PC). Tudo ja vem embutido (Node + programa).
REM  Nao precisa instalar nada nem ter internet. So dar DUPLO-CLIQUE.
REM  Deixe a janela ABERTA. Copie o token e cole no Lexio em
REM  Configuracoes -> Pasta local (PC). Para encerrar, feche a janela.
REM ==========================================================================

REM ---- Configuracao (so mexa se quiser) ------------------------------------
set "ROOT=%USERPROFILE%\Lexio"
REM read,write (seguro). Para permitir rodar comandos: read,write,execute
set "PERMISSIONS=read,write"
REM --------------------------------------------------------------------------

if not exist "%~dp0node.exe" goto nonode
if not exist "%~dp0app\bin\lexio-desktop.mjs" goto noapp
if not exist "%ROOT%" mkdir "%ROOT%" 2>nul

echo.
echo  ============================================================
echo   Lexio - agente local iniciando  (Node embutido)
echo  ============================================================
echo   Pasta de trabalho : %ROOT%
echo   Permissoes        : %PERMISSIONS%
echo.
echo   Deixe esta janela ABERTA enquanto usar o chat.
echo   Para revogar o acesso, basta fechar a janela.
echo  ============================================================
echo.

"%~dp0node.exe" "%~dp0app\bin\lexio-desktop.mjs" --root "%ROOT%" --permissions "%PERMISSIONS%"
set "RC=%ERRORLEVEL%"

echo.
echo  Agente encerrado (codigo %RC%). O Lexio nao tem mais acesso a este PC.
echo.
pause
goto end

:nonode
echo.
echo  [X] Nao encontrei o arquivo node.exe ao lado deste atalho.
echo.
echo      Quase sempre isso e porque o ZIP NAO foi extraido.
echo      Faca assim: feche isto, clique com o botao DIREITO no arquivo .zip,
echo      escolha "Extrair Tudo...", abra a pasta criada e rode o atalho
echo      DE DENTRO dela (nao de dentro do .zip).
echo.
pause
goto end

:noapp
echo.
echo  [X] Encontrei o node.exe, mas nao a pasta "app" ao lado dele.
echo      Extraia o ZIP INTEIRO e mantenha node.exe, a pasta app e este
echo      atalho sempre JUNTOS, na mesma pasta.
echo.
pause
goto end

:end
endlocal
