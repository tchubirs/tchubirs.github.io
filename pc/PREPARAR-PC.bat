@echo off
chcp 65001 >nul
title Preparar o PC para o Claude
echo.
echo  Preparando o PC. Pode demorar uns minutos. Nao feche esta janela.
echo.

rem 1. Git, Node.js, Python e Chrome pelo winget (vem com o Windows 10 e 11)
where git >nul 2>&1 || winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
where node >nul 2>&1 || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where python >nul 2>&1 || winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
if not exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" winget install -e --id Google.Chrome --accept-source-agreements --accept-package-agreements

rem O que acabou de ser instalado so entra no PATH numa janela nova
set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%APPDATA%\npm"

rem 2. Claude Code e Codex
call npm i -g @anthropic-ai/claude-code @openai/codex

rem 3. O projeto, na pasta Documentos
set "PASTA=%USERPROFILE%\Documents\tchubirs.github.io"
if exist "%PASTA%\.git" (
  git -C "%PASTA%" fetch origin claude/ai-revenue-automation-map-g00jks
  git -C "%PASTA%" checkout claude/ai-revenue-automation-map-g00jks
  git -C "%PASTA%" pull origin claude/ai-revenue-automation-map-g00jks
) else (
  git clone -b claude/ai-revenue-automation-map-g00jks https://github.com/tchubirs/tchubirs.github.io "%PASTA%"
)
cd /d "%PASTA%"

rem 4. Logins (abrem no navegador; so na primeira vez)
call codex login status >nul 2>&1 || call codex login

rem 5. Criar o atalho "Claude remoto" na area de trabalho, para as proximas vezes
copy /y "%PASTA%\pc\CLAUDE-REMOTO.bat" "%USERPROFILE%\Desktop\Claude remoto.bat" >nul

echo.
echo  Pronto. Agora vai abrir o Claude com acesso pelo celular.
echo  Se pedir login, entre com a sua conta do Claude.
echo  Deixe esta janela aberta enquanto usar pelo celular.
echo.
call claude remote-control
pause
