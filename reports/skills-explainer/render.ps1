# Export every slide of a deck to PNG with the user's own PowerPoint, so QA sees what PowerPoint renders.
param([string]$Pptx, [string]$OutDir)
New-Item -ItemType Directory -Force $OutDir | Out-Null
Get-ChildItem $OutDir -Filter *.png | Remove-Item -Force
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($Pptx, $true, $false, $false)
$pres.Export($OutDir, "PNG", 1600, 900)
$pres.Close()
if ($app.Presentations.Count -eq 0) { $app.Quit() }
Get-ChildItem $OutDir -Filter *.png | ForEach-Object { $_.FullName }
