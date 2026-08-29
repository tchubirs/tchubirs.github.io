# O mesmo atalho, para quem já está no PowerShell:
#     C:\Users\maico\tchubirs.github.io\nomes.ps1 76561198155380495 --ver
#
# Existe porque uma janela nova do PowerShell arranca em C:\WINDOWS\system32 e
# o `npm run` não encontra nada lá. O erro do npm fala de package.json e não
# diz a única coisa que interessava: estás na pasta errada.
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'anti-sniper')
npm run nomes -- @args
