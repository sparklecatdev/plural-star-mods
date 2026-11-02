$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Sparklecat-Discord-Companion'
$target = Join-Path $env:LOCALAPPDATA 'Programs\Sparklecat Discord Companion'
if (-not (Test-Path (Join-Path $source 'Sparklecat-Discord-Companion.exe'))) { throw 'Extract the release before running this installer.' }
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
$staging = Join-Path (Split-Path $target) ('.sparklecat-install-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    Copy-Item -Recurse $source (Join-Path $staging 'new')
    $exe = Join-Path $target 'Sparklecat-Discord-Companion.exe'
    Get-Process -Name 'Sparklecat-Discord-Companion' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | ForEach-Object {
        if (-not $_.CloseMainWindow() -or -not $_.WaitForExit(3000)) { Stop-Process -Id $_.Id -Force }
    }
    if (Test-Path $target) { Move-Item $target (Join-Path $staging 'old') }
    try { Move-Item (Join-Path $staging 'new') $target }
    catch {
        if (Test-Path (Join-Path $staging 'old')) { Move-Item (Join-Path $staging 'old') $target }
        throw
    }
} finally {
    if (-not (Test-Path (Join-Path $staging 'old')) -or (Test-Path $target)) { Remove-Item -Recurse -Force $staging }
}
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Sparklecat Discord Companion.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $target 'Sparklecat-Discord-Companion.exe'
$shortcut.WorkingDirectory = $target
$shortcut.Save()
Write-Host 'Installed. Search for Sparklecat Discord Companion in the Start menu.'
