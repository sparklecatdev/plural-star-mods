$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Sparklecat-Discord-Companion'
$target = Join-Path $env:LOCALAPPDATA 'Programs\Sparklecat Discord Companion'
if (-not (Test-Path (Join-Path $source 'Sparklecat-Discord-Companion.exe'))) { throw 'Extract the release before running this installer.' }
if (Test-Path $target) { throw "Move the existing installation at $target before installing." }
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
Copy-Item -Recurse $source $target
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Sparklecat Discord Companion.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $target 'Sparklecat-Discord-Companion.exe'
$shortcut.WorkingDirectory = $target
$shortcut.Save()
Write-Host 'Installed. Search for Sparklecat Discord Companion in the Start menu.'
