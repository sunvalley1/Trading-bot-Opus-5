<#
.SYNOPSIS
  Registers (or removes) one Windows scheduled task per bot folder that runs a pass followed by the queue
  executor at fixed times of day, the bots staggered a few minutes apart. Runs headless: no console window opens.

.DESCRIPTION
  The human runs this once. Registering it is the human's decision to let each folder's pass be followed by
  the queue executor, which signs with the key that the human placed in that folder's .env (LIQUIDITY_SIGNER=key).
  No model ever runs `--yes`; the executor is a plain script.

  Each task starts `conhost.exe --headless cmd.exe /c scripts\run-pass.cmd` in the bot's folder. Earlier versions
  ran a visible cmd window, and closing that window (or pressing Ctrl+C in it) killed the pass mid-run. The tasks
  also keep running on battery power, ignore a new start while the previous pass is still going, and give up after
  3 hours so a hung pass cannot block the next slots forever. A slot missed while the PC was off runs as soon as it is
  back on (StartWhenAvailable), so a reboot costs at most the pass that was live at the time, never the next slot too.

  -DailyAt lists the local times a pass starts, one task trigger each: the default is a run as soon as the
  schedule is registered and another at 21:00. With -TodayOnly each of those fires once and does not return,
  which is what a schedule tied to an event that ends the same day needs. Two runs a day suit a market whose news arrives in bursts;
  hourly cadences only pay off while there is something new to read. Re-running the script replaces the
  schedule, so changing the times means passing new ones, not editing the tasks by hand.

  -SelfTest registers a throwaway task with exactly the same settings but a harmless command, runs it once, checks
  that it ran with no visible window, and deletes it. It never touches the SeerBot-<bot> tasks and trades nothing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -DailyAt 09:00,21:00
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -SelfTest
  powershell -ExecutionPolicy Bypass -File scripts\schedule-passes.ps1 -BotsRoot C:\Users\12\Desktop\bots -Unregister
#>
param(
  [Parameter(Mandatory = $true)] [string] $BotsRoot,
  [string[]] $Bots = @("fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"),
  # local times of day, one pass each, every day. "now" means two minutes from now, so a freshly registered
  # schedule starts a round at once instead of waiting for tomorrow.
  [string[]] $DailyAt = @("now", "21:00"),
  # each bot starts this many minutes after the previous one, so they take turns reading each other's trades
  # instead of all hitting the pools at the same minute: 20 -> Fable 21:00, Opus 21:20, Astra 21:40, Sol 22:00
  [int] $StaggerMinutes = 20,
  # today only: each slot fires once and never comes back, for a schedule that should end with an event
  [switch] $TodayOnly,
  [switch] $Unregister,
  [switch] $SelfTest
)

$ErrorActionPreference = "Stop"
$conhost = Join-Path $env:WINDIR "System32\conhost.exe"
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-BotTask([string] $Name, [string] $Folder, [string] $Argument, [datetime[]] $Starts) {
  # Preferred route: one task with every slot as a trigger, and the settings that matter for a laptop that
  # may be unplugged or asleep (start on battery, keep running unplugged, catch up a missed slot, ignore a
  # second start, give up after 3 h).
  #
  # Fallback: plain schtasks.exe, one task per slot named SeerBot-<bot>-<HHmm>, on Windows defaults. It is
  # there because behaviour-blocking security software (Bitdefender here) can answer "Access is denied" to
  # the WMI route and to schtasks /xml while leaving the plain command line alone, and can delete tasks that
  # were made through WMI. run-pass.cmd cd's to its own folder, so the fallback needs no working directory.
  $triggers = @(foreach ($s in $Starts) { if ($TodayOnly) { New-ScheduledTaskTrigger -Once -At $s } else { New-ScheduledTaskTrigger -Daily -At $s } })
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $action = New-ScheduledTaskAction -Execute $conhost -Argument $Argument -WorkingDirectory $Folder
  try {
    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
    return
  } catch {
    Write-Warning ("$Name : Register-ScheduledTask was refused (" + $_.Exception.Message.Trim() + "); falling back to schtasks.exe with default settings.")
  }
  $target = Join-Path $Folder "scriptsun-pass.cmd"
  $tr = $conhost + " " + ($Argument -replace [regex]::Escape("scriptsun-pass.cmd"), ('"' + $target + '"'))
  foreach ($s in $Starts) {
    $slotName = $Name + "-" + $s.ToString("HHmm")
    $sched = if ($TodayOnly) { @("/sc", "once") } else { @("/sc", "daily") }
    $out = & schtasks /create /tn $slotName /tr $tr @sched /st $s.ToString("HH:mm") /f 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("schtasks refused to register " + $slotName + ": " + ($out -join " ")) }
  }
}

function Remove-BotTasks([string] $Name) {
  foreach ($t in @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -eq $Name -or $_.TaskName -like ($Name + "-*") })) {
    & schtasks /delete /tn $t.TaskName /f 2>&1 | Out-Null
  }
}

# turns one "HH:mm" (or "now") into the datetime a daily trigger starts from
function Resolve-DailyTime([string] $spec) {
  if ($spec -match "^(now|asap)$") { return (Get-Date).AddMinutes(2) }
  $t = [datetime]::ParseExact($spec.Trim(), "HH:mm", $null)
  return [datetime]::Today.Add($t.TimeOfDay)
}

if ($SelfTest) {
  $dir = Join-Path $env:TEMP ("seerbot-selftest-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  $name = "SeerBot-selftest"
  $ran = $false
  $visible = @()
  try {
    New-Item -ItemType Directory -Force $dir | Out-Null
    Set-Content -Path (Join-Path $dir "selftest.cmd") -Encoding ASCII -Value "@echo off`r`nping -n 9 127.0.0.1 >nul`r`necho ran > ran.txt`r`n"
    Register-BotTask -Name $name -Folder $dir -Argument "--headless cmd.exe /d /c selftest.cmd" -Starts @((Get-Date).AddHours(1))
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
    Write-Host ("daily triggers:         " + ((@($t.Triggers) | ForEach-Object { ([datetime]$_.StartBoundary).ToString("HH:mm") }) -join ", "))
    Write-Host ("runs on battery:        " + (-not $t.Settings.DisallowStartIfOnBatteries) + ", keeps running if unplugged: " + (-not $t.Settings.StopIfGoingOnBatteries))
    Write-Host ("overlapping starts:     " + $t.Settings.MultipleInstances + ", time limit " + $t.Settings.ExecutionTimeLimit)
    Write-Host ("missed slot runs at boot: " + $t.Settings.StartWhenAvailable)
  } finally {
    # the throwaway task and folder go away whatever happened above
    Remove-BotTasks $name
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "self-test task removed."
  }
  if (-not $ran -or @($visible | Select-Object -Unique).Count -gt 0) { exit 1 }
  exit 0
}

# -File passes a list as one string ("-Bots a,b" / "-DailyAt now,21:00"), so split on commas before use
$Bots = @($Bots | ForEach-Object { $_ -split "," } | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
# same for the times
$slots = @($DailyAt | ForEach-Object { $_ -split "," } | Where-Object { $_.Trim() } | ForEach-Object { Resolve-DailyTime $_ })
$i = 0
foreach ($bot in $Bots) {
  $folder = Join-Path $BotsRoot $bot
  $task = "SeerBot-$bot"
  $botStarts = @($slots | ForEach-Object { $_.AddMinutes($i * $StaggerMinutes) })
  $i++
  if ($Unregister) {
    Remove-BotTasks $task
    Write-Host "removed $task"
    continue
  }
  if (-not (Test-Path (Join-Path $folder ".env"))) { throw "$folder has no .env; set it up first (MODELS.md)" }
  if (-not (Test-Path (Join-Path $folder "scripts\run-pass.cmd"))) { throw "$folder has no scripts\run-pass.cmd; run git pull in that folder first" }
  $envText = Get-Content (Join-Path $folder ".env") -Raw
  if ($envText -notmatch "(?m)^PASS_COMMAND=.+") { throw "$folder/.env has no PASS_COMMAND: which CLI runs this model?" }
  if ($envText -notmatch "(?m)^LIQUIDITY_SIGNER=key") { Write-Warning "${bot}: LIQUIDITY_SIGNER is not 'key'; the pass will run but the executor will refuse to send (browser wallet needs a human)." }
  Remove-BotTasks $task
  Register-BotTask -Name $task -Folder $folder -Argument "--headless cmd.exe /d /c scripts\run-pass.cmd" -Starts $botStarts
  Write-Host ("registered $task : " + $(if ($TodayOnly) { "once today at " } else { "daily at " }) + ((@($botStarts) | ForEach-Object { $_.ToString("HH:mm") }) -join ", ") + " in $folder (headless)")
}
if (-not $Unregister) {
  Write-Host ""
  Write-Host "Bots run at the times above, $StaggerMinutes min apart, with no window. Output goes to <bot>\.passes\scheduler.log."
  Write-Host "Check with: Get-ScheduledTask SeerBot-* | Get-ScheduledTaskInfo"
}
