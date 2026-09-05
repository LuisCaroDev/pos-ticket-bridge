$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nvmRoot = Join-Path $env:LOCALAPPDATA "nvm"
$node23 = Get-ChildItem -Path $nvmRoot -Directory -Filter "v23.*" |
  Sort-Object Name -Descending |
  Select-Object -First 1

if ($null -eq $node23) {
  throw "Para crear el instalador se requiere Node 23. Instala una versión 23 con: nvm install 23.10.0"
}

$nodePath = Join-Path $node23.FullName "node.exe"
$forgeCli = Join-Path $projectRoot "node_modules/@electron-forge/cli/dist/electron-forge.js"

& (Join-Path $PSScriptRoot "prepare-electron-zip.ps1")
& $nodePath $forgeCli package --platform=win32 --arch=x64

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$packagedApp = Join-Path $projectRoot "out\POS Ticket Bridge-win32-x64"
if (!(Test-Path $packagedApp)) {
  throw "No se encontro la aplicacion empaquetada: $packagedApp"
}

$electronBuilderCli = Join-Path $projectRoot "node_modules\electron-builder\cli.js"
& $nodePath $electronBuilderCli --win nsis --x64 --prepackaged $packagedApp

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
