<#
.SYNOPSIS
  Registers (or removes) one Windows scheduled task per bot folder that runs `npm run pass -- --execute`
  every 2 hours, all at the same minute.

.DESCRIPTION
  The human runs this once. Registering it is the human's decision to let each folder's pass be followed by
  the queue executor, which signs with the key that the human placed in that folder's .env (LIQUIDITY_SIGNER=key).
  No model ever runs `--yes`; the executor is a plain script.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -Unregister
#>
param(
  [Parameter(Mandatory = $true)] [string] $BotsRoot,
  [string[]] $Bots = @("fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"),
  [int] $EveryHours = 2,
  [string] $StartAt = "00:05",
  [switch] $Unregister
)

$ErrorActionPreference = "Stop"
foreach ($bot in $Bots) {
  $folder = Join-Path $BotsRoot $bot
  $task = "SeerBot-$bot"
  if ($Unregister) {
    schtasks /Delete /TN $task /F | Out-Null
    Write-Host "removed $task"
    continue
  }
  if (-not (Test-Path (Join-Path $folder ".env"))) { throw "$folder has no .env; set it up first (MODELS.md)" }
  $envText = Get-Content (Join-Path $folder ".env") -Raw
  if ($envText -notmatch "(?m)^PASS_COMMAND=.+") { throw "$folder/.env has no PASS_COMMAND: which CLI runs this model?" }
  if ($envText -notmatch "(?m)^LIQUIDITY_SIGNER=key") { Write-Warning "$bot: LIQUIDITY_SIGNER is not 'key'; the pass will run but the executor will refuse to send (browser wallet needs a human)." }
  $log = Join-Path $folder ".passes\scheduler.log"
  $action = "cmd /c cd /d `"$folder`" && npm run pass -- --execute >> `"$log`" 2>&1"
  schtasks /Create /F /SC HOURLY /MO $EveryHours /ST $StartAt /TN $task /TR $action | Out-Null
  Write-Host "registered $task : every $EveryHours h from $StartAt in $folder"
}
if (-not $Unregister) {
  Write-Host ""
  Write-Host "All bots fire at the same minute. Check with: schtasks /Query /TN SeerBot-fable-5.1 /V /FO LIST"
  Write-Host "Run one by hand now with:     schtasks /Run /TN SeerBot-fable-5.1"
}
