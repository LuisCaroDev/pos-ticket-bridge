$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronPackagePath = Join-Path $projectRoot "node_modules/electron/package.json"
$electronDistPath = Join-Path $projectRoot "node_modules/electron/dist"

if (!(Test-Path $electronPackagePath) -or !(Test-Path $electronDistPath)) {
  throw "No se encontro Electron instalado. Ejecuta npm install antes de generar el instalador."
}

$electronVersion = (Get-Content $electronPackagePath -Raw | ConvertFrom-Json).version
$cacheDirectory = Join-Path $projectRoot ".electron-cache"
$zipPath = Join-Path $cacheDirectory "electron-v$electronVersion-win32-x64.zip"

if (Test-Path $zipPath) {
  $entries = & tar.exe -tf $zipPath
  if ($LASTEXITCODE -eq 0 -and !($entries -contains "./")) {
    Write-Host "Usando runtime de Electron en cache: $zipPath"
    exit 0
  }

  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
Write-Host "Preparando runtime local de Electron $electronVersion..."
# Algunos binarios de Electron usan una fecha que Compress-Archive no puede
# representar en ZIP. bsdtar viene incluido con Windows y conserva el contenido.
Push-Location $electronDistPath
try {
  & tar.exe -a -c -f $zipPath *
} finally {
  Pop-Location
}

if ($LASTEXITCODE -ne 0) {
  throw "No se pudo comprimir el runtime local de Electron."
}

if (!(Test-Path $zipPath)) {
  throw "No se pudo crear el runtime de Electron requerido para empaquetar."
}

Write-Host "Runtime local preparado: $zipPath"
