# dev-start.ps1 - run 3 together: MySQL80 (service) + backend :3001 + frontend :3005
# usage:  right-click > Run with PowerShell   OR   powershell -ExecutionPolicy Bypass -File .\dev-start.ps1
# MySQL80 needs admin to start - this script self-elevates only that step.

$root = $PSScriptRoot

# 1) MySQL80 - start if not running
$svc = Get-Service MySQL80 -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host "[MySQL80] service not found - skip (is MySQL installed?)" -ForegroundColor Yellow
} elseif ($svc.Status -ne 'Running') {
  Write-Host "[MySQL80] starting (needs admin / UAC)..." -ForegroundColor Cyan
  try { Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command','Start-Service MySQL80' -ErrorAction Stop }
  catch { Write-Host "[MySQL80] start failed (UAC declined?) - start the service manually" -ForegroundColor Red }
  Start-Sleep 2
  $st = (Get-Service MySQL80).Status
  Write-Host "[MySQL80] status: $st"
} else {
  Write-Host "[MySQL80] already Running" -ForegroundColor Green
}

# 2) backend :3001 - separate window
Write-Host "[backend] opening window on :3001" -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; npm --prefix backend run dev"

# 3) frontend :3005 - separate window
Write-Host "[frontend] opening window on :3005" -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; npx next dev --webpack -p 3005"

Write-Host ""
Write-Host "All launched - wait ~10s for compile, then open http://localhost:3005" -ForegroundColor Green
Write-Host "To stop: close the backend/frontend windows; to stop DB run 'Stop-Service MySQL80' in an admin shell"
