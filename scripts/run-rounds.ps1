<#
.SYNOPSIS
  Runs the same rounds as scripts\schedule-passes.ps1 without registering anything with Windows: one process
  per bot per slot, staggered, started from this process while it stays alive.

.DESCRIPTION
  Use this when Task Scheduler is not available. A security product can refuse `Register-ScheduledTask` with
  "Access is denied" and can delete existing tasks as unwanted persistence; on this machine Bitdefender did
  both in the middle of a trading day. Starting a child process is ordinary behaviour and is not blocked.

  What it does not give you: nothing runs after this process ends (no reboot survival), and a machine that
  sleeps through a slot misses it. Keep the window open, or run it with -WindowStyle Hidden through
  Start-Process, and check the log.

  A bot whose previous pass is still running is skipped for that slot, which is what the scheduled tasks did
  with MultipleInstances IgnoreNew.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\run-rounds.ps1 -BotsRoot C:\Users\12\Desktop\bots -At 16:00,18:00,20:00
#>
param(
  [Parameter(Mandatory = $true)] [string] $BotsRoot,
  [string[]] $Bots = @("fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"),
  # local times of day, one round each; each bot starts StaggerMinutes after the previous one
  [Parameter(Mandatory = $true)] [string[]] $At,
  [int] $StaggerMinutes = 20,
  [string] $LogFile = (Join-Path $env:TEMP "seerbot-rounds.log")
)

$ErrorActionPreference = "Stop"
$conhost = Join-Path $env:WINDIR "System32\conhost.exe"

function Write-Round([string] $msg) {
  $line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $msg
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$slots = @($At | ForEach-Object { $_ -split "," } | Where-Object { $_.Trim() } | ForEach-Object {
    [datetime]::Today.Add([datetime]::ParseExact($_.Trim(), "HH:mm", $null).TimeOfDay)
  })
Write-Round ("rounds: " + (($slots | ForEach-Object { $_.ToString("HH:mm") }) -join ", ") + "  bots: " + ($Bots -join ", ") + "  stagger " + $StaggerMinutes + " min")

foreach ($slot in $slots) {
  for ($i = 0; $i -lt $Bots.Count; $i++) {
    $bot = $Bots[$i]
    $folder = Join-Path $BotsRoot $bot
    $when = $slot.AddMinutes($i * $StaggerMinutes)
    $wait = ($when - (Get-Date)).TotalSeconds
    if ($wait -lt -600) { Write-Round ("skip $bot " + $when.ToString("HH:mm") + ": that slot is more than 10 min past"); continue }
    if ($wait -gt 0) { Start-Sleep -Seconds $wait }
    if (-not (Test-Path (Join-Path $folder "scripts\run-pass.cmd"))) { Write-Round "skip $bot : no scripts\run-pass.cmd in $folder"; continue }
    $busy = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($folder) }).Count
    if ($busy -gt 0) { Write-Round "skip $bot : its previous pass is still running ($busy processes)"; continue }
    Start-Process -FilePath $conhost -ArgumentList "--headless cmd.exe /d /c scripts\run-pass.cmd" -WorkingDirectory $folder -WindowStyle Hidden | Out-Null
    Write-Round ("started $bot (" + $folder + ")")
  }
}
Write-Round "all rounds started; this process is done."
