<#
.SYNOPSIS
  Registers (or removes) one Windows scheduled task per bot folder that runs a pass followed by the queue
  executor every 2 hours, the bots staggered a few minutes apart. Runs headless: no console window opens.

.DESCRIPTION
  The human runs this once. Registering it is the human's decision to let each folder's pass be followed by
  the queue executor, which signs with the key that the human placed in that folder's .env (LIQUIDITY_SIGNER=key).
  No model ever runs `--yes`; the executor is a plain script.

  Each task starts `conhost.exe --headless cmd.exe /c scripts\run-pass.cmd` in the bot's folder. Earlier versions
  ran a visible cmd window, and closing that window (or pressing Ctrl+C in it) killed the pass mid-run. The tasks
  also keep running on battery power, ignore a new start while the previous pass is still going, and give up after
  3 hours so a hung pass cannot block the next slots forever. A slot missed while the PC was off runs as soon as it is
  back on (StartWhenAvailable), so a reboot costs at most the pass that was live at the time, never the next slot too.

  -SelfTest registers a throwaway task with exactly the same settings but a harmless command, runs it once, checks
  that it ran with no visible window, and deletes it. It never touches the SeerBot-<bot> tasks and trades nothing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -SelfTest
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -Unregister
#>
param(
  [Parameter(Mandatory = $true)] [string] $BotsRoot,
  [string[]] $Bots = @("fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"),
  [int] $EveryHours = 2,
  [string] $StartAt = "00:05",
  # each bot starts this many minutes after the previous one, so they take turns reading each other's trades
  # instead of all hitting the pools at the same minute: 20 -> Fable :05, Opus :25, Astra :45, Sol 1:05, ...
  [int] $StaggerMinutes = 20,
  [switch] $Unregister,
  [switch] $SelfTest
)

$ErrorActionPreference = "Stop"
$conhost = Join-Path $env:WINDIR "System32\conhost.exe"
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-BotTask([string] $Name, [string] $Folder, [string] $Argument, [datetime] $Start) {
  $action = New-ScheduledTaskAction -Execute $conhost -Argument $Argument -WorkingDirectory $Folder
  # a 10-year repetition window is "every N hours from now on" in a form every Windows build accepts
  $trigger = New-ScheduledTaskTrigger -Once -At $Start -RepetitionInterval (New-TimeSpan -Hours $EveryHours) -RepetitionDuration (New-TimeSpan -Days 3650)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
  # "run only when the user is logged on": no password is stored anywhere
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}

if ($SelfTest) {
  $dir = Join-Path $env:TEMP ("seerbot-selftest-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  $name = "SeerBot-selftest"
  $ran = $false
  $visible = @()
  try {
    New-Item -ItemType Directory -Force $dir | Out-Null
    Set-Content -Path (Join-Path $dir "selftest.cmd") -Encoding ASCII -Value "@echo off`r`nping -n 9 127.0.0.1 >nul`r`necho ran > ran.txt`r`n"
    Register-BotTask -Name $name -Folder $dir -Argument "--headless cmd.exe /d /c selftest.cmd" -Start (Get-Date).AddHours(1)
    $t0 = (Get-Date).AddSeconds(-1)
    Start-ScheduledTask -TaskName $name
    foreach ($wait in 3, 3) {
      Start-Sleep -Seconds $wait
      # reading StartTime of a console owned by another account (SYSTEM, elevated) throws "Access is denied";
      # under ErrorActionPreference=Stop that used to end the script before the cleanup below, leaving the task behind
      $visible += @(Get-Process cmd, conhost, OpenConsole, WindowsTerminal -ErrorAction SilentlyContinue | Where-Object {
          try { $_.MainWindowHandle -ne 0 -and $_.StartTime -gt $t0 } catch { $false }
        })
    }
    for ($k = 0; $k -lt 20 -and -not $ran; $k++) { Start-Sleep -Seconds 1; $ran = Test-Path (Join-Path $dir "ran.txt") }
    $t = Get-ScheduledTask -TaskName $name
    Write-Host ("ran the command:        " + $ran)
    Write-Host ("visible windows opened: " + @($visible | Select-Object -Unique).Count)
    Write-Host ("repeats every:          " + $t.Triggers[0].Repetition.Interval + " for " + $t.Triggers[0].Repetition.Duration)
    Write-Host ("runs on battery:        " + (-not $t.Settings.DisallowStartIfOnBatteries) + ", keeps running if unplugged: " + (-not $t.Settings.StopIfGoingOnBatteries))
    Write-Host ("overlapping starts:     " + $t.Settings.MultipleInstances + ", time limit " + $t.Settings.ExecutionTimeLimit)
    Write-Host ("missed slot runs at boot: " + $t.Settings.StartWhenAvailable)
  } finally {
    # the throwaway task and folder go away whatever happened above
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "self-test task removed."
  }
  if (-not $ran -or @($visible | Select-Object -Unique).Count -gt 0) { exit 1 }
  exit 0
}

$base = [datetime]::ParseExact($StartAt, "HH:mm", $null)
$i = 0
foreach ($bot in $Bots) {
  $folder = Join-Path $BotsRoot $bot
  $task = "SeerBot-$bot"
  $botStart = [datetime]::Today.Add($base.TimeOfDay).AddMinutes($i * $StaggerMinutes)
  $i++
  if ($Unregister) {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "removed $task"
    continue
  }
  if (-not (Test-Path (Join-Path $folder ".env"))) { throw "$folder has no .env; set it up first (MODELS.md)" }
  if (-not (Test-Path (Join-Path $folder "scripts\run-pass.cmd"))) { throw "$folder has no scripts\run-pass.cmd; run git pull in that folder first" }
  $envText = Get-Content (Join-Path $folder ".env") -Raw
  if ($envText -notmatch "(?m)^PASS_COMMAND=.+") { throw "$folder/.env has no PASS_COMMAND: which CLI runs this model?" }
  if ($envText -notmatch "(?m)^LIQUIDITY_SIGNER=key") { Write-Warning "${bot}: LIQUIDITY_SIGNER is not 'key'; the pass will run but the executor will refuse to send (browser wallet needs a human)." }
  Register-BotTask -Name $task -Folder $folder -Argument "--headless cmd.exe /d /c scripts\run-pass.cmd" -Start $botStart
  Write-Host ("registered $task : every $EveryHours h from " + $botStart.ToString("HH:mm") + " in $folder (headless)")
}
if (-not $Unregister) {
  Write-Host ""
  Write-Host "Bots fire $StaggerMinutes min apart, each every $EveryHours h, with no window. Output goes to <bot>\.passes\scheduler.log."
  Write-Host "Check with: Get-ScheduledTask SeerBot-* | Get-ScheduledTaskInfo"
}
