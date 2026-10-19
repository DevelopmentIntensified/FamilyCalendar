# Runs one full pass: capture -> encode -> audio -> build.
#   pwsh film/run-all.ps1 -Res 1    1080p proof, ~10 min, gives you a whole delivery set
#   pwsh film/run-all.ps1 -Res 2    4K master, ~40-60 min
# Stops on the first failure, so a chained "proof then 4K" run halts loudly rather than
# burning an hour rendering frames nobody will look at.
param([ValidateSet(1, 2)][int]$Res = 2)

$ErrorActionPreference = 'Stop'
$env:RES = "$Res"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step($name, [scriptblock]$body) {
  Write-Host "`n=== $name (RES=$Res) ==="
  & $body
  if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
}

Step 'capture' { node film/capture.mjs master 0 45 25 }
Step 'encode'  { node film/encode.mjs }
Step 'audio'   { node film/audio.mjs }

$master = if ($Res -eq 2) { 'film/out/master.video.mp4' } else { 'film/out/master.video-1080p.mp4' }
$env:MASTER = (Resolve-Path $master).Path
Step 'build'   { node film/build.mjs }

Write-Host "`n=== PASS COMPLETE (RES=$Res) — $master ==="
Get-ChildItem film/out/*.mp4 | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}
