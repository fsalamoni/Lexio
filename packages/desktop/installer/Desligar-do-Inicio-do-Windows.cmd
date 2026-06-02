@echo off
setlocal EnableExtensions
title Lexio - Desligar do inicio do Windows

REM ==========================================================================
REM  Desfaz o inicio automatico: o "Lexio - Pasta local (PC)" deixa de iniciar
REM  sozinho quando o Windows liga. Nao apaga o programa nem suas pastas.
REM ==========================================================================

set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Lexio - Pasta local (PC).lnk"

echo.
if exist "%LINK%" (
  del "%LINK%" >nul 2>nul
  if exist "%LINK%" (
    echo  [X] Nao consegui remover o atalho de inicio. Feche o Lexio e tente de novo.
  ) else (
    echo  [OK] Feito. O Lexio nao vai mais iniciar sozinho com o Windows.
  )
) else (
  echo  [i] Nada para remover - o inicio automatico nao estava ligado.
)
echo.
pause
endlocal
