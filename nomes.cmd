@echo off
rem  Correr o detetive de nomes a partir de QUALQUER pasta.
rem
rem  Ele abriu uma janela nova do PowerShell, que arrancou em C:\WINDOWS\system32,
rem  e o `npm run` foi procurar o package.json ali. O erro que apareceu falava de
rem  ficheiros do npm e não dizia a única coisa que interessava: estás na pasta
rem  errada. Este atalho sabe onde vive e vai lá sozinho.
rem
rem      C:\Users\maico\tchubirs.github.io\nomes.cmd 76561198155380495 --ver
rem
cd /d "%~dp0anti-sniper" || exit /b 1
call npm run nomes -- %*
