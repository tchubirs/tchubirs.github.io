@echo off
title Replay - varios angulos, um relogio
cd /d "%~dp0"
where node >nul 2>nul || (
  echo.
  echo   Falta o Node.js. Instala em https://nodejs.org e volta a abrir este ficheiro.
  echo.
  pause
  exit /b
)
node servir.js
pause
