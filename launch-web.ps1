param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$appUrl = 'http://127.0.0.1:4173'
function Test-WebReady {
    try {
        $health = Invoke-RestMethod -Uri "$appUrl/health" -TimeoutSec 2
        return $health.app -eq 'shici-notebook'
    } catch { return $false }
}
try {
    if (-not (Test-WebReady)) {
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $serverPath = Join-Path $PSScriptRoot 'server.cjs'
        Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-WebReady) { $ready = $true; break }
            Start-Sleep -Milliseconds 200
        }
        if (-not $ready) { throw 'Unable to start the reading and translation app. Check that port 4173 is available.' }
    }
    if ($CheckOnly) { Write-Output $appUrl }
    else { Start-Process $appUrl }
} catch {
    if ($CheckOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'English Reading and Paper Translation') | Out-Null
    exit 1
}
