$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot 'out/https-validation/electron-smoke'
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
$bundle = Join-Path $testRoot 'smoke.cjs'
$entry = Join-Path $PSScriptRoot 'https-electron-smoke.ts'
$esbuild = Join-Path $projectRoot 'node_modules/esbuild/bin/esbuild'
$electron = Join-Path $projectRoot 'node_modules/electron/dist/electron.exe'
& node $esbuild $entry --bundle --platform=node --format=cjs --external:electron "--outfile=$bundle"
if ($LASTEXITCODE -ne 0) { throw 'HTTPS smoke bundle failed.' }
$profile = Join-Path $testRoot ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $profile | Out-Null
foreach ($phase in @('create', 'paused', 'active')) {
  $arguments = @(('"{0}"' -f $bundle), ('"{0}"' -f $profile), $phase)
  $process = Start-Process -FilePath $electron -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (!$process.WaitForExit(30000)) {
    Stop-Process -Id $process.Id
    throw "Electron HTTPS smoke timed out: $phase"
  }
  $result = Join-Path $profile "$phase.result.json"
  if (!(Test-Path -LiteralPath $result)) { throw "Missing Electron HTTPS result: $phase" }
  $value = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
  $value | ConvertTo-Json -Compress
  if (!$value.ok) { throw "Electron HTTPS smoke failed: $phase" }
}
