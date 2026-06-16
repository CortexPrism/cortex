$ErrorActionPreference = 'Stop'

$packageName = 'cortex'
$installDir = Join-Path $env:USERPROFILE '.cortex'

$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"

Install-ChocolateyZipPackage `
  -PackageName $packageName `
  -Url "https://github.com/CortexPrism/cortex/archive/refs/tags/v${env:chocolateyPackageVersion}.tar.gz" `
  -UnzipLocation $installDir

$batPath = Join-Path $env:USERPROFILE '.deno\bin\cortex.bat'
New-Item -ItemType Directory -Force -Path (Split-Path $batPath) | Out-Null
Set-Content -Path $batPath -Value "@echo off`r`ndeno run --allow-all `"$installDir\src\main.ts`" %*"
