@echo off
chcp 65001 >nul
title Claude remoto
set "PASTA=%USERPROFILE%\Documents\tchubirs.github.io"
cd /d "%PASTA%"
git pull origin claude/ai-revenue-automation-map-g00jks
echo.
echo  Claude ligado. Abra o app Claude no celular, em Code.
echo  Deixe esta janela aberta enquanto usar pelo celular.
echo.
call claude remote-control
pause
