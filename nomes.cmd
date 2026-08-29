@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

rem  DUPLO-CLIQUE NESTE FICHEIRO. Nao e preciso escrever comando nenhum.
rem
rem  Ele pediu-me para correr o comando na maquina dele. Nao consigo: eu corro
rem  num contentor na nuvem, e a maquina dele E a ferramenta — e o IP dele que
rem  passa o Cloudflare e a sessao dele que destranca o steamid.uk. Daqui levo
rem  403 em tudo.
rem
rem  O que consigo e tirar-lhe o comando das maos. Este ficheiro:
rem    1. vai sozinho para a pasta certa (a janela nova abre em system32)
rem    2. le os SteamID de contas.txt, se existir
rem    3. se nao existir, pergunta
rem    4. corre com --ver, para ele poder fazer login
rem    5. e NAO fecha a janela no fim, para ele conseguir ler o resultado

cd /d "%~dp0anti-sniper" || (echo   Nao encontrei a pasta anti-sniper. & pause & exit /b 1)

rem Argumentos na linha de comando ganham sempre.
if not "%~1"=="" (
  call npm run nomes -- %*
  echo.
  pause
  exit /b
)

set "IDS="
if exist "%~dp0contas.txt" (
  for /f "usebackq eol=# tokens=* delims=" %%L in ("%~dp0contas.txt") do (
    set "linha=%%L"
    if not "!linha!"=="" set "IDS=!IDS! !linha!"
  )
)

if "!IDS!"=="" (
  echo.
  set /p "IDS=  Cola o SteamID ou o link do perfil: "
)

if "!IDS!"=="" (
  echo.
  echo   Sem SteamID nao ha nada a ler.
  echo   Dica: poe os SteamID, um por linha, num ficheiro chamado contas.txt
  echo         ao lado deste, e da duplo-clique outra vez.
  echo.
  pause
  exit /b 1
)

call npm run nomes -- !IDS! --ver
echo.
pause
