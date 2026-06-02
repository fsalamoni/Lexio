@echo off
setlocal EnableExtensions
title Lexio - Ligar no inicio do Windows
cd /d "%~dp0"

REM ==========================================================================
REM  Faz o "Lexio - Pasta local (PC)" iniciar SOZINHO quando o Windows liga,
REM  em janela minimizada. So precisa rodar UMA vez (duplo-clique).
REM  Para desfazer, rode "Desligar-do-Inicio-do-Windows.cmd".
REM
REM  Observacao: as pastas que voce autorizou com "permitir sempre" continuam
REM  valendo entre reinicios (ficam salvas em %USERPROFILE%\.lexio).
REM ==========================================================================

set "HERE=%~dp0"
set "TARGET=%~dp0Iniciar-Lexio-PC.cmd"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Lexio - Pasta local (PC).lnk"

if not exist "%TARGET%" (
  echo.
  echo  [X] Nao encontrei "Iniciar-Lexio-PC.cmd" nesta pasta.
  echo      Mantenha este atalho na MESMA pasta do Lexio-PC e tente de novo.
  echo.
  pause
  goto end
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $l=$ws.CreateShortcut($env:LINK); $l.TargetPath=$env:TARGET; $l.WorkingDirectory=$env:HERE; $l.WindowStyle=7; $l.Description='Inicia o agente local do Lexio com o Windows'; $l.Save()"

echo.
if exist "%LINK%" (
  echo  [OK] Pronto! O Lexio - Pasta local (PC) vai iniciar sozinho com o Windows
  echo       ^(janela minimizada na barra de tarefas^).
  echo       Para desfazer, rode "Desligar-do-Inicio-do-Windows.cmd".
) else (
  echo  [X] Nao consegui criar o atalho de inicio automatico.
  echo      Tente rodar este arquivo com o SEU usuario do Windows.
)
echo.
pause

:end
endlocal
