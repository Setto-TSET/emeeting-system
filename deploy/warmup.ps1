# ปลุก Render/HF free tier ก่อนประชุม -- ยิง /health ซ้ำจนกว่าจะตื่น (200)
# Render free หลับหลังไม่มี request 15 นาที ตื่นครั้งแรก ~50 วิ
#
# หมายเหตุ: ข้อความ output เป็นอังกฤษ เพราะ Windows PowerShell 5.1 อ่าน .ps1 เป็น ANSI
# ถ้าใส่ไทยใน string literal จะ parse พัง -- ไทยอยู่ได้เฉพาะใน comment
#
# วิธีใช้ (PowerShell):
#   ./deploy/warmup.ps1                          # ปลุก backend อย่างเดียว
#   ./deploy/warmup.ps1 -Asr https://<user>-emeeting-asr.hf.space   # ปลุก ASR ด้วย

param(
  [string]$Backend = "https://emeeting-backend.onrender.com",
  [string]$Asr = "",
  [int]$TimeoutSec = 120
)

function Wake([string]$name, [string]$base) {
  $u = "$base/health"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  Write-Host "waking $name ... $u"
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $u -TimeoutSec 15 -UseBasicParsing
      if ($r.StatusCode -eq 200) { Write-Host "  OK $name awake ($($r.StatusCode))"; return $true }
    } catch { Start-Sleep -Seconds 3 }
  }
  Write-Host "  FAIL $name did not wake in $TimeoutSec s -- check Logs"
  return $false
}

$ok = Wake "backend" $Backend
if ($Asr) { $ok = (Wake "asr" $Asr) -and $ok }
if (-not $ok) { exit 1 }
Write-Host "ready for meeting"
