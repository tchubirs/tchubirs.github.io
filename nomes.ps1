# Duplo-clique com o botao direito > "Executar com PowerShell", ou:
#     C:\Users\maico\tchubirs.github.io\nomes.ps1 76561198155380495
#
# Faz o mesmo que nomes.cmd: vai para a pasta certa, le contas.txt (ou
# pergunta), corre com --ver e deixa a janela aberta no fim.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'anti-sniper')

$ids = @($args)
if (-not $ids) {
  $lista = Join-Path $PSScriptRoot 'contas.txt'
  if (Test-Path -LiteralPath $lista) {
    $ids = Get-Content -LiteralPath $lista |
      Where-Object { $_.Trim() -and -not $_.TrimStart().StartsWith('#') } |
      ForEach-Object { $_.Trim() }
  }
}
if (-not $ids) { $ids = @((Read-Host '  Cola o SteamID ou o link do perfil')) }
if (-not ($ids | Where-Object { $_ })) {
  Write-Host '  Sem SteamID nao ha nada a ler.'
  Read-Host '  Enter para fechar' | Out-Null
  exit 1
}

npm run nomes -- @ids --ver
Read-Host "`n  Enter para fechar" | Out-Null
