# สำรอง MySQL (Aiven) เป็นไฟล์ .sql -- Aiven free ไม่มี backup อัตโนมัติ
# รันก่อนประชุมสำคัญ หรือก่อนแก้ schema
#
# ใช้ค่าเดียวกับตอน deploy: อ่าน $env:DATABASE_URL (mysql://user:pass@host:port/db?...)
# ต้องมี mysqldump ในเครื่อง (มากับ MySQL Client / MySQL Server 8)
#
# หมายเหตุ: ข้อความ output เป็นอังกฤษ เพราะ Windows PowerShell 5.1 อ่าน .ps1 เป็น ANSI
# ถ้าใส่ไทยใน string literal จะ parse พัง -- ไทยอยู่ได้เฉพาะใน comment
#
# วิธีใช้ (PowerShell):
#   $env:DATABASE_URL='mysql://avnadmin:PASS@host:PORT/defaultdb?ssl={"rejectUnauthorized":false}'
#   ./deploy/backup-db.ps1
#   ./deploy/backup-db.ps1 -OutDir C:\backups     # เลือกโฟลเดอร์เก็บ

param(
  [string]$OutDir = "."
)

$ErrorActionPreference = "Stop"

$url = $env:DATABASE_URL
if (-not $url) { throw "DATABASE_URL not set. Set it first: `$env:DATABASE_URL='mysql://...'" }

# แยกส่วนจาก URI -- ตัด query string (?ssl=...) ออกก่อน
$noQuery = ($url -split '\?')[0]
$m = [regex]::Match($noQuery, '^mysql://(?<user>[^:]+):(?<pass>.+)@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^/?]+)$')
if (-not $m.Success) { throw "Cannot parse DATABASE_URL. Expected mysql://user:pass@host:port/db" }

$user = $m.Groups['user'].Value
$pass = $m.Groups['pass'].Value
$dbHost = $m.Groups['host'].Value
$port = $m.Groups['port'].Value
$db   = $m.Groups['db'].Value

if (-not (Get-Command mysqldump -ErrorAction SilentlyContinue)) {
  throw "mysqldump not found. Install MySQL Client first (or add it to PATH)"
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "emeeting-backup-$stamp.sql"

# Aiven บังคับ SSL -- ส่งรหัสผ่านทาง env ไม่ให้โผล่ใน process list
$env:MYSQL_PWD = $pass
try {
  mysqldump --ssl-mode=REQUIRED -h $dbHost -P $port -u $user --single-transaction --routines --triggers $db |
    Out-File -FilePath $out -Encoding utf8
} finally {
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}

$size = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "OK backup -> $out ($size KB)"
